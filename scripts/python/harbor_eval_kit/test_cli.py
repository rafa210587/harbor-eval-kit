import unittest
from collections import namedtuple

from harbor_eval_kit.cli import dispatch_analyze


Entry = namedtuple("Entry", "module class_name pip_extra")
ORIGINAL = Entry("harbor.environments.docker.docker", "DockerEnvironment", None)


class ManagedAnalyzeBootstrapTest(unittest.TestCase):
    def test_patches_only_during_dispatch_and_restores_after_return(self):
        registry = {"docker": ORIGINAL, "cloud": object()}
        observed = []

        def app():
            observed.append(registry["docker"])
            return 17

        result = dispatch_analyze(
            ["analyze", "jobs/trial", "--env=docker"], registry, "docker", app, "0.22.0"
        )
        self.assertEqual(result, 17)
        self.assertEqual(observed[0].module, "harbor_eval_kit.managed")
        self.assertEqual(observed[0].class_name, "ManagedPodmanEnvironment")
        self.assertIs(registry["docker"], ORIGINAL)
        self.assertIn("cloud", registry)

    def test_restores_registry_when_app_raises(self):
        registry = {"docker": ORIGINAL}

        def app():
            raise RuntimeError("synthetic failure")

        with self.assertRaisesRegex(RuntimeError, "synthetic failure"):
            dispatch_analyze(["analyze"], registry, "docker", app, "0.22.0")
        self.assertIs(registry["docker"], ORIGINAL)

    def test_accepts_compact_short_docker_environment(self):
        registry = {"docker": ORIGINAL}
        dispatch_analyze(["analyze", "path", "-edocker"], registry, "docker", lambda: None, "0.22.0")
        self.assertIs(registry["docker"], ORIGINAL)

    def test_refuses_other_commands_and_non_docker_environment(self):
        for argv in (["run"], ["analyze", "path", "--env", "modal"],
                     ["analyze", "path", "--environment=daytona"],
                     ["analyze", "path", "-edaytona"], ["analyze", "path", "-e=modal"]):
            with self.subTest(argv=argv), self.assertRaises(ValueError):
                dispatch_analyze(argv, {"docker": ORIGINAL}, "docker", lambda: None, "0.22.0")

    def test_refuses_version_or_registry_contract_drift(self):
        with self.assertRaisesRegex(RuntimeError, "Harbor 0.22.0"):
            dispatch_analyze(["analyze"], {"docker": ORIGINAL}, "docker", lambda: None, "0.23.0")
        changed = ORIGINAL._replace(class_name="DifferentEnvironment")
        with self.assertRaisesRegex(RuntimeError, "contract changed"):
            dispatch_analyze(["analyze"], {"docker": changed}, "docker", lambda: None, "0.22.0")
        changed_extra = ORIGINAL._replace(pip_extra="docker")
        with self.assertRaisesRegex(RuntimeError, "contract changed"):
            dispatch_analyze(["analyze"], {"docker": changed_extra}, "docker", lambda: None, "0.22.0")


if __name__ == "__main__":
    unittest.main()
