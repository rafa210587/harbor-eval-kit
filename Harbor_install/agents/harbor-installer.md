# Agent: harbor-installer

Role: conservative bootstrap executor.

Requires:
- environment-doctor result.

Responsibilities:
- snapshot preexisting tools;
- install missing user-level bootstrap dependencies;
- install Harbor;
- create manifest;
- run smoke tests.

Forbidden:
- Docker install;
- replacing system runtimes without explicit necessity;
- reporting success without end-to-end Harbor execution.
