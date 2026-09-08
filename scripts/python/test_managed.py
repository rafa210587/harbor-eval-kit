"""Offline tests; run with the Python interpreter from Harbor's existing uv environment."""
import asyncio
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch
from types import SimpleNamespace

from harbor.environments.base import ExecResult
from harbor.models.task.config import EnvironmentConfig, NetworkPolicy
from harbor.models.trial.paths import TrialPaths
from harbor_eval_kit.managed import ManagedPodmanEnvironment
from harbor_eval_kit.ownership import LABEL, base_images, prove, read_manifest, remember, reserve


class OwnershipTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.manifest = self.root / "manifest.json"
        self.manifest.write_text(json.dumps({"schema_version": 1, "preexisting": {}, "installed_by_kit": {},
            "managed_resources": {k: [] for k in ("containers", "images", "networks", "volumes")}}))

    def tearDown(self):
        self.temp.cleanup()

    def test_reservation_and_identity_before_removal(self):
        name = "harbor-eval-kit-test"
        reserve(self.manifest, {"containers": name}, self.root / "job")
        item = {"Id": "123", "Name": name, "Config": {"Labels": {LABEL: "true"}}}
        with self.assertRaises(ValueError):
            prove(self.manifest, "containers", name, item)
        remember(self.manifest, "containers", name, "123")
        self.assertEqual(prove(self.manifest, "containers", name, item), "123")
        with self.assertRaises(ValueError):
            prove(self.manifest, "containers", name, {**item, "Id": "other"})
        with self.assertRaises(ValueError):
            reserve(self.manifest, {"containers": name}, self.root)
        self.assertEqual(len(read_manifest(self.manifest)["managed_resources"]["containers"]), 1)

    def test_missing_manifest_and_unowned_names_refused(self):
        with self.assertRaises(FileNotFoundError):
            reserve(self.root / "missing.json", {"containers": "harbor-eval-kit-test"}, self.root)
        with self.assertRaises(ValueError):
            reserve(self.manifest, {"containers": "foreign"}, self.root)

    def test_build_cannot_hide_a_pull(self):
        self.assertEqual(base_images("FROM python:3.13 AS build\nFROM build\nCOPY --from=build /a /b"), ["python:3.13"])
        for content in ("ARG BASE\nFROM ${BASE}", "FROM alpine\nCOPY --from=other/image /a /b", "FROM alpine\nVOLUME /data", "RUN echo incomplete"):
            with self.assertRaises(ValueError):
                base_images(content)


class RuntimeTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / "Dockerfile").write_text("FROM scratch")
        with patch.dict(os.environ, {"HARBOR_EVAL_MANIFEST": str(self.root / "manifest.json")}):
            self.environment = ManagedPodmanEnvironment(environment_dir=self.root, environment_name="task",
                session_id="trial", trial_paths=TrialPaths(self.root / "trial"), task_env_config=EnvironmentConfig(),
                network_policy=NetworkPolicy(network_mode="public"))

    async def asyncTearDown(self):
        self.temp.cleanup()

    async def test_build_never_pulls_and_labels_the_image(self):
        self.environment._podman = AsyncMock(return_value=ExecResult(return_code=0))
        self.environment._record = AsyncMock()
        await self.environment._run_docker_compose_command(["build"])
        argv = self.environment._podman.call_args.args[0]
        self.assertIn("--pull=never", argv)
        self.assertIn(LABEL + "=true", argv)
        self.assertTrue(argv[argv.index("-t") + 1].startswith("harbor-eval-kit-"))
        self.environment._record.assert_awaited_once_with("images")

    async def test_exec_secret_is_env_only(self):
        self.environment._podman = AsyncMock(return_value=ExecResult(return_code=0))
        await self.environment._run_docker_compose_command(["exec", "-e", "TEST_KEY=synthetic-value", "main", "true"])
        call = self.environment._podman.call_args
        self.assertNotIn("TEST_KEY=synthetic-value", call.args[0])
        self.assertIn("TEST_KEY", call.args[0])
        self.assertEqual(call.kwargs["env"]["TEST_KEY"], "synthetic-value")

    async def test_refuses_unsupported_topology_before_probe(self):
        (self.root / "docker-compose.yaml").write_text("services: {}")
        with self.assertRaisesRegex(ValueError, "multisserviço"):
            ManagedPodmanEnvironment(environment_dir=self.root, environment_name="task", session_id="trial",
                trial_paths=TrialPaths(self.root / "trial"), task_env_config=EnvironmentConfig())

    async def test_streams_redacted_child_env_before_completion(self):
        stdout, stderr = asyncio.StreamReader(), asyncio.StreamReader()
        stdout.feed_data(b"progress synthetic-child-value\n")
        stdout.feed_eof()
        stderr.feed_eof()
        process = SimpleNamespace(stdout=stdout, stderr=stderr, returncode=0, wait=AsyncMock())
        output = []
        async def on_output(text, channel):
            process.wait.assert_not_awaited()
            output.append((text, channel))
        with patch("asyncio.create_subprocess_exec", AsyncMock(return_value=process)):
            result = await self.environment._podman(["build"], env={"TEST_KEY": "synthetic-child-value"}, on_output=on_output)
        self.assertEqual(result.stdout, "progress [REDACTED]\n")
        self.assertEqual(output, [(result.stdout, "stdout")])

    async def test_cleanup_checks_whole_set_before_mutation(self):
        self.environment._reserved = True
        self.environment._inspect = AsyncMock(return_value={"Id": "owned-id"})
        self.environment._podman = AsyncMock()
        with patch("harbor_eval_kit.managed.prove", side_effect=["owned-id", ValueError("foreign")]):
            with self.assertRaisesRegex(ValueError, "foreign"):
                await self.environment._remove_owned(include_image=True)
        self.environment._podman.assert_not_awaited()

    async def test_inherited_anonymous_volumes_are_refused(self):
        self.environment._inspect = AsyncMock(return_value={"Os": "linux", "Config": {"Volumes": {"/data": {}}}})
        with self.assertRaisesRegex(ValueError, "volumes anônimos"):
            await self.environment._validate_image_os("existing-base")


if __name__ == "__main__":
    unittest.main()
