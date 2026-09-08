"""Managed single-container Podman adapter for Harbor 0.22.0.

Harbor still owns agents, verification, mounts, transfers and trial lifecycle. This
extension only controls runtime commands and resource ownership. Unsupported task
topologies are rejected before creating resources instead of weakening their policy.
"""
import asyncio
import json
import os
import shutil
import subprocess
import tempfile
from importlib.metadata import version
from pathlib import Path
from uuid import uuid4

from harbor.environments.base import ExecResult
from harbor.environments.capabilities import EnvironmentCapabilities
from harbor.environments.docker.docker import DockerEnvironment
from .ownership import LABEL, PREFIX, base_images, prove, read_manifest, reconcile_reserved, remember, reserve


def redact(text, env=None):
    for key, value in {**os.environ, **(env or {})}.items():
        if value and any(word in key.upper() for word in ("KEY", "SECRET", "TOKEN", "PASSWORD")):
            text = text.replace(value, "[REDACTED]")
    return text


class ManagedPodmanEnvironment(DockerEnvironment):
    @classmethod
    def preflight(cls):
        if version("harbor") != "0.22.0":
            raise RuntimeError("Adaptador Podman gerenciado requer Harbor 0.22.0")
        if not shutil.which("podman"):
            raise RuntimeError("Podman não encontrado; execute o doctor do kit")
        for command in (["podman", "info", "--format", "json"], ["podman", "compose", "version"]):
            result = subprocess.run(command, capture_output=True, text=True, timeout=30)
            if result.returncode:
                raise RuntimeError("Podman/API Compose indisponível; execute doctor. " + redact(result.stderr))
        read_manifest(os.environ["HARBOR_EVAL_MANIFEST"])

    def __init__(self, *args, **kwargs):
        # Reject before DockerEnvironment can run its own unowned egress probe.
        config = kwargs["task_env_config"]
        environment_dir = Path(kwargs["environment_dir"])
        policies = [kwargs.get("network_policy"), *(kwargs.get("phase_network_policies") or [])]
        if str(config.os) not in ("linux", "TaskOS.LINUX"):
            raise ValueError("Adaptador gerenciado suporta containers Linux")
        if any(p and p.network_mode.value != "public" for p in policies):
            raise ValueError("Política de rede restrita requer adaptador gerenciado com suporte verificado")
        if (environment_dir / "docker-compose.yaml").exists() or kwargs.get("extra_docker_compose"):
            raise ValueError("Task Compose/multisserviço ainda não suportada pelo adaptador gerenciado")
        self._namespace = PREFIX + uuid4().hex[:24]
        kwargs["session_id"] = self._namespace
        super().__init__(*args, **kwargs)
        self._manifest = os.environ["HARBOR_EVAL_MANIFEST"]
        self._names = {"containers": self._namespace + "-main", "images": self._namespace + "-image", "networks": self._namespace + "-network"}
        self._env_vars.main_image_name = self._names["images"]
        self._owned_overlay = self.trial_paths.trial_dir / "managed-compose.json"
        self._reserved = False
        self._managed_startup_env = {}

    @property
    def capabilities(self):
        return EnvironmentCapabilities(mounted=True)

    @staticmethod
    def _requires_egress_control(**kwargs):
        return False

    @staticmethod
    def _detect_daemon_os():
        result = subprocess.run(["podman", "info", "--format", "{{.Host.OS}}"], capture_output=True, text=True, timeout=15)
        if result.returncode:
            raise RuntimeError("API Podman indisponível")
        return result.stdout.strip().lower()

    async def _is_rootless_docker(self):
        result = await self._podman(["info", "--format", "{{.Host.Security.Rootless}}"])
        return (result.stdout or "").strip().lower() == "true"

    async def _validate_image_os(self, image_name):
        image = await self._inspect("images", image_name)
        if not image or image.get("Os") != "linux":
            raise ValueError("Imagem Linux local obrigatória; nenhum pull implícito é permitido")
        if image.get("Config", {}).get("Volumes"):
            raise ValueError("Imagem com volumes anônimos não suportada; nenhuma execução iniciada")

    def _write_env_compose_file(self):
        self._cleanup_env_compose_file()
        self._env_compose_temp_dir = tempfile.TemporaryDirectory()
        path = Path(self._env_compose_temp_dir.name) / "environment.json"
        self._managed_startup_env = self._startup_env()
        # Only references go to disk; values remain in the child environment.
        path.write_text(json.dumps({"services": {"main": {"environment": {
            key: "${" + key + "}" for key in self._managed_startup_env
        }}}}), encoding="utf-8")
        return path

    @property
    def _docker_compose_paths(self):
        image = self.task_env_config.docker_image if self._use_prebuilt else self._names["images"]
        self._owned_overlay.parent.mkdir(parents=True, exist_ok=True)
        self._owned_overlay.write_text(json.dumps({
            "services": {"main": {"image": image, "pull_policy": "never",
                "container_name": self._names["containers"], "labels": {LABEL: "true"}}},
            "networks": {"default": {"name": self._names["networks"], "labels": {LABEL: "true"}}},
        }), encoding="utf-8")
        return [*super()._docker_compose_paths, self._owned_overlay]

    async def _podman(self, args, *, env=None, check=True, timeout_sec=None, stdin_data=None, on_output=None):
        effective_env = env if env is not None else os.environ.copy()
        process = await asyncio.create_subprocess_exec("podman", *args,
            env=effective_env, stdin=asyncio.subprocess.PIPE if stdin_data is not None else asyncio.subprocess.DEVNULL,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)

        async def drain(stream, channel):
            chunks = []
            # Complete lines prevent a credential split across pipe chunks from escaping
            # redaction. The raw text is never sent to the callback or written to disk.
            while line := await stream.readline():
                text = redact(line.decode(errors="replace"), effective_env)
                chunks.append(text)
                if on_output:
                    await on_output(text, channel)
            return "".join(chunks)

        async def communicate():
            if stdin_data is not None:
                process.stdin.write(stdin_data)
                await process.stdin.drain()
                process.stdin.close()
            stdout, stderr = await asyncio.gather(drain(process.stdout, "stdout"), drain(process.stderr, "stderr"))
            await process.wait()
            return stdout, stderr

        try:
            stdout, stderr = await asyncio.wait_for(communicate(), timeout=timeout_sec)
        except BaseException:
            await self._terminate_process(process)
            raise
        result = ExecResult(stdout=stdout, stderr=stderr, return_code=process.returncode or 0)
        if check and result.return_code:
            raise RuntimeError("Podman falhou: " + (result.stderr or result.stdout or str(result.return_code)))
        return result

    async def _inspect(self, kind, name):
        resource = {"images": "image", "containers": "container", "networks": "network"}[kind]
        found = await self._podman([resource, "exists", name], check=False)
        if found.return_code == 1:
            return None
        if found.return_code:
            raise RuntimeError("Não foi possível inspecionar recursos Podman")
        result = await self._podman([resource, "inspect", name])
        items = json.loads(result.stdout)
        if not isinstance(items, list) or len(items) != 1:
            raise ValueError("Resposta de inspeção ambígua")
        return items[0]

    async def _record(self, kind):
        name = self._names[kind]
        item = await self._inspect(kind, name)
        if item is None:
            raise ValueError("Recurso criado não está observável")
        identity = item.get("Id") or item.get("ID") or item.get("id") or item.get("Name")
        remember(self._manifest, kind, name, identity)
        prove(self._manifest, kind, name, item)

    async def start(self, force_build):
        for kind, name in self._names.items():
            if await self._inspect(kind, name):
                raise ValueError("Colisão com recurso preexistente; execução recusada")
        if self.task_env_config.docker_image and not force_build:
            await self._validate_image_os(self.task_env_config.docker_image)
        else:
            for image in base_images(self._dockerfile_path.read_text(encoding="utf-8")):
                if not await self._inspect("images", image):
                    raise ValueError(f"Imagem base local ausente: {image}. Prepare-a explicitamente antes da avaliação; pull implícito bloqueado")
                await self._validate_image_os(image)
        reserve(self._manifest, self._names, self.trial_paths.trial_dir.parent)
        self._reserved = True
        await super().start(force_build)

    async def _remove_owned(self, include_image=False, stop_only=False):
        if not self._reserved:
            return
        kinds = ["containers"] if stop_only else ["containers", "networks"] + (["images"] if include_image else [])
        inspected = []
        # Validate every target before the first removal.
        for kind in kinds:
            name = self._names[kind]
            item = await self._inspect(kind, name)
            if item:
                identity = reconcile_reserved(self._manifest, kind, name, item)
                prove(self._manifest, kind, name, item)
                inspected.append((kind, name, identity))
        for kind, name, identity in inspected:
            args = ["stop", "-t", "2", identity] if stop_only else {
                "containers": ["rm", "-f", identity], "networks": ["network", "rm", identity], "images": ["rmi", identity],
            }[kind]
            await self._podman(args)
            remaining = await self._inspect(kind, name)
            if (not stop_only and remaining) or (stop_only and remaining and remaining.get("State", {}).get("Running")):
                raise RuntimeError("Podman não confirmou o efeito da parada/remoção")

    async def _run_docker_compose_command(self, command, check=True, timeout_sec=None, stdin_data=None, on_output=None):
        if command[0] in ("down", "stop"):
            await self._remove_owned(include_image="--rmi" in command, stop_only=command[0] == "stop")
            return ExecResult(return_code=0)
        if command[0] == "build":
            result = await self._podman(["build", "--pull=never", "--layers=false", "--force-rm",
                "--label", LABEL + "=true", "-t", self._names["images"], "-f", str(self._dockerfile_path), str(self.environment_dir)],
                timeout_sec=self.task_env_config.build_timeout_sec, on_output=self._output_callback())
            await self._record("images")
            return result
        if command[0] not in ("up", "exec", "cp", "ps", "logs"):
            raise ValueError("Operação Compose não suportada pelo adaptador gerenciado")
        args = ["compose", "--project-name", self._namespace, "--project-directory", str(self.environment_dir)]
        for path in self._docker_compose_paths:
            args += ["-f", str(path)]
        env = {**self._compose_env_vars(), **self._managed_startup_env}
        safe_command = []
        for index, value in enumerate(command):
            if index and command[index - 1] in ("-e", "--env") and "=" in value:
                key, val = value.split("=", 1)
                env[key] = val
                safe_command.append(key)
            else:
                safe_command.append(value)
        if command[0] == "up":
            safe_command += ["--no-build", "--pull", "never"]
        result = await self._podman(args + safe_command, env=env, check=check, timeout_sec=timeout_sec,
                                    stdin_data=stdin_data, on_output=on_output)
        if command[0] == "up":
            await self._record("containers")
            await self._record("networks")
        return result
