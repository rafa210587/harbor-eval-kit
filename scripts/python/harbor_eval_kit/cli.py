"""Process-local Harbor analyze bootstrap for the managed Podman environment."""
import sys
from importlib.metadata import version

EXPECTED_HARBOR = "0.22.0"
EXPECTED_MODULE = "harbor.environments.docker.docker"
EXPECTED_CLASS = "DockerEnvironment"
MANAGED_MODULE = "harbor_eval_kit.managed"
MANAGED_CLASS = "ManagedPodmanEnvironment"


def _validate_argv(argv):
    if not argv or argv[0] != "analyze":
        raise ValueError("Managed Harbor bootstrap accepts only the analyze command")
    for index, argument in enumerate(argv[1:], 1):
        if argument in ("-e", "--env", "--environment"):
            if index + 1 >= len(argv):
                raise ValueError(f"{argument} requires docker")
            environment = argv[index + 1]
        elif argument.startswith("-e") and not argument.startswith("--"):
            environment = argument[2:].removeprefix("=")
        elif argument.startswith("--env=") or argument.startswith("--environment="):
            environment = argument.split("=", 1)[1]
        else:
            continue
        if environment != "docker":
            raise ValueError("Analyze requires the managed Podman environment (docker alias)")


def dispatch_analyze(argv, registry, docker_key, app, harbor_version):
    """Validate, patch one registry entry in memory, dispatch, then always restore it."""
    _validate_argv(argv)
    if harbor_version != EXPECTED_HARBOR:
        raise RuntimeError(f"Managed analyze requires Harbor {EXPECTED_HARBOR}")
    original = registry.get(docker_key)
    if original is None:
        raise RuntimeError("Harbor Docker environment registry entry is missing")
    if (original.module != EXPECTED_MODULE or original.class_name != EXPECTED_CLASS
            or original.pip_extra is not None):
        raise RuntimeError("Harbor Docker environment registry contract changed")
    registry[docker_key] = original._replace(module=MANAGED_MODULE, class_name=MANAGED_CLASS)
    try:
        return app()
    finally:
        registry[docker_key] = original


def main():
    harbor_version = version("harbor")
    if harbor_version != EXPECTED_HARBOR:
        raise RuntimeError(f"Managed analyze requires Harbor {EXPECTED_HARBOR}")
    from harbor.cli.main import app
    from harbor.environments.factory import _ENVIRONMENT_REGISTRY
    from harbor.models.environment_type import EnvironmentType

    return dispatch_analyze(
        sys.argv[1:], _ENVIRONMENT_REGISTRY, EnvironmentType.DOCKER, app, harbor_version
    )


if __name__ == "__main__":
    main()
