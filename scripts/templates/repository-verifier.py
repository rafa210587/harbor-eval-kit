"""Trusted coordinator for a separate Harbor verifier container (Linux only)."""
import json
import os
from pathlib import Path
import pwd
import signal
import stat
import subprocess
import xml.etree.ElementTree as ET


def safe_path(root, name):
    path = root
    for part in Path(name).parts:
        if part in ("", "."):
            continue
        if part == ".." or Path(part).is_absolute():
            raise ValueError("path escape")
        path = path / part
        if path.is_symlink():
            raise ValueError("symlink forbidden")
    if not path.resolve().is_relative_to(root.resolve()):
        raise ValueError("path escape")
    return path


def junit_passed(path):
    if path.stat().st_size > 4 * 1024 * 1024:
        raise ValueError("report too large")
    text = path.read_text(encoding="utf8")
    if "<!DOCTYPE" in text.upper() or "<!ENTITY" in text.upper():
        raise ValueError("XML entities forbidden")
    tree = ET.fromstring(text)
    cases = list(tree.iter("testcase"))
    # A zero-test or all-skipped report never proves successful validation.
    return bool(cases) and any(c.find("skipped") is None for c in cases) and not any(
        c.find("failure") is not None or c.find("error") is not None for c in cases
    ) and not any(int(s.get("failures", "0")) or int(s.get("errors", "0")) for s in tree.iter("testsuite"))


def kill_check_processes(proc, uid):
    try:
        os.killpg(proc.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    # The dedicated verifier reserves nobody for checks. Also terminate descendants
    # that detached into another session, before reading reports or starting a check.
    for entry in Path("/proc").iterdir():
        if entry.name.isdigit():
            try:
                if entry.stat().st_uid == uid:
                    os.kill(int(entry.name), signal.SIGKILL)
            except (ProcessLookupError, FileNotFoundError, PermissionError):
                pass
    proc.wait()


def run_check(check, workspace, logs, uid, gid):
    result = {"id": check["id"], "status": "infrastructure-error"}
    proc = None
    try:
        cwd = safe_path(workspace, check["cwd"])
        if not cwd.is_dir():
            raise ValueError("cwd missing")
        report = safe_path(workspace, check["reportPath"]) if check.get("parser") == "junit" else None
        if report and report.exists():
            report.unlink()  # Reject a report preloaded by the candidate.

        def demote():
            os.setgroups([])
            os.setgid(gid)
            os.setuid(uid)
            os.umask(0o022)

        env = {"PATH": "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin", "HOME": str(workspace), "LANG": "C.UTF-8", "TMPDIR": "/tmp"}
        with (logs / (check["id"] + ".log")).open("wb") as output:
            proc = subprocess.Popen(check["argv"], cwd=cwd, env=env, stdin=subprocess.DEVNULL,
                                    stdout=output, stderr=subprocess.STDOUT,
                                    start_new_session=True, preexec_fn=demote)
            try:
                code = proc.wait(timeout=check["timeoutSec"])
            except subprocess.TimeoutExpired:
                result["status"] = "timeout"
                return result
        result["exitCode"] = code
        kill_check_processes(proc, uid)
        passed = code in check["acceptedExitCodes"]
        if passed and report:
            report = safe_path(workspace, check["reportPath"])
            passed = junit_passed(report)
        result["status"] = "passed" if passed else "failed"
    except (OSError, ValueError, ET.ParseError, KeyError):
        result["status"] = "infrastructure-error"
    finally:
        if proc:
            kill_check_processes(proc, uid)
    return result


def verdict(checks, results, threshold=1):
    if not isinstance(threshold, (int, float)) or isinstance(threshold, bool) or not 0 <= threshold <= 1:
        raise ValueError("invalid threshold")
    by_id = {r["id"]: r["status"] for r in results}
    ids = {c["id"] for c in checks}
    weight = sum(c["weight"] for c in checks)
    score = sum(c["weight"] for c in checks if by_id.get(c["id"]) == "passed") / weight if weight else 0
    complete = bool(checks) and len(ids) == len(checks) and len(by_id) == len(results) and ids == set(by_id)
    healthy = all(r["status"] in ("passed", "failed") for r in results)
    required = all(by_id.get(c["id"]) == "passed" for c in checks if c["required"])
    return {"results": results, "score": score, "approved": complete and healthy and required and score >= threshold}


def main():
    if os.geteuid() != 0:
        raise RuntimeError("trusted verifier must start as root")
    workspace, logs = Path("/workspace"), Path("/logs/verifier")
    if workspace.is_symlink() or logs.is_symlink():
        raise RuntimeError("unsafe verifier paths")
    logs.mkdir(parents=True, exist_ok=True)
    os.chown(logs.parent, 0, 0)
    logs.parent.chmod(0o755)
    os.chown(logs, 0, 0)
    logs.chmod(0o755)
    profile = json.loads(Path("/tests/checks.json").read_text(encoding="utf8"))
    checks = profile if isinstance(profile, list) else profile["checks"]
    threshold = 1 if isinstance(profile, list) else profile.get("threshold", 1)
    user = pwd.getpwnam("nobody")
    try:
        # Reject special files and links before handing code to the unprivileged child.
        paths = [workspace, *workspace.rglob("*")]
        for path in paths:
            mode = path.lstat().st_mode
            if not (stat.S_ISREG(mode) or stat.S_ISDIR(mode)):
                raise ValueError("unsupported artifact")
        for path in paths:
            os.chown(path, user.pw_uid, user.pw_gid)
            path.chmod((path.stat().st_mode & 0o777) | (0o700 if path.is_dir() else 0o600))
        results = [run_check(check, workspace, logs, user.pw_uid, user.pw_gid) for check in checks]
    except (OSError, ValueError):
        results = [{"id": c["id"], "status": "infrastructure-error"} for c in checks]
    summary = verdict(checks, results, threshold)
    (logs / "checks.json").write_text(json.dumps(summary), encoding="utf8")
    (logs / "reward.txt").write_text("1\n" if summary["approved"] else "0\n", encoding="utf8")


if __name__ == "__main__":
    main()
