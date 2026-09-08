"""Offline tests: XML/path parsing everywhere; privilege checks need Linux root."""
import importlib.util
import sys
import tempfile
import types
import unittest
from pathlib import Path

if sys.platform == "win32":
    sys.modules.setdefault("pwd", types.ModuleType("pwd"))
spec = importlib.util.spec_from_file_location("verifier", Path(__file__).with_name("repository-verifier.py"))
verifier = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verifier)


class VerifierTest(unittest.TestCase):
    def test_junit_requires_real_successful_cases(self):
        with tempfile.TemporaryDirectory() as directory:
            report = Path(directory) / "report.xml"
            for xml, expected in [
                ('<testsuite tests="1"><testcase name="a"/></testsuite>', True),
                ('<testsuite tests="1"><testcase><failure/></testcase></testsuite>', False),
                ('<testsuite><testcase><skipped/></testcase></testsuite>', False),
                ('<testsuite tests="100"/>', False),
                ('<testsuite errors="1"><testcase/></testsuite>', False),
            ]:
                report.write_text(xml)
                self.assertEqual(verifier.junit_passed(report), expected)
            report.write_text('<!DOCTYPE x><testsuite/>')
            with self.assertRaises(ValueError):
                verifier.junit_passed(report)

    def test_weighted_approval_never_hides_required_or_infrastructure_failure(self):
        checks = [{"id": "required", "weight": 4, "required": True}, {"id": "optional", "weight": 1, "required": False}]
        results = [{"id": "required", "status": "passed"}, {"id": "optional", "status": "failed"}]
        self.assertTrue(verifier.verdict(checks, results, 0.8)["approved"])
        self.assertFalse(verifier.verdict(checks, results)["approved"])
        self.assertEqual(verifier.verdict(checks, results, 0.8)["score"], 0.8)
        for status in ["timeout", "infrastructure-error", "not-run"]:
            self.assertFalse(verifier.verdict(checks, [results[0], {"id": "optional", "status": status}], 0)["approved"])
        self.assertFalse(verifier.verdict(checks, [{"id": "required", "status": "failed"}, {"id": "optional", "status": "passed"}], 0)["approved"])
        self.assertFalse(verifier.verdict(checks, results[:1], 0)["approved"])
        self.assertFalse(verifier.verdict(checks, results + results[:1], 0)["approved"])
        for threshold in [-1, 2, float("nan"), True]:
            with self.assertRaises(ValueError):
                verifier.verdict(checks, results, threshold)

    def test_paths_cannot_escape(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.assertEqual(verifier.safe_path(root, "."), root)
            with self.assertRaises(ValueError):
                verifier.safe_path(root, "../outside")
            with self.assertRaises(ValueError):
                verifier.safe_path(root, str(root.parent))


if __name__ == "__main__":
    unittest.main()
