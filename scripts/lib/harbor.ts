// Harbor Eval Kit - shared helpers for compare-matrix.ts and gui-server.ts.
//
// This file is the library's PUBLIC SURFACE: it re-exports every module in lib/ so callers keep
// a single import, and holds what is left of the domain that has not been split out yet
// (process execution, skill/rubric materialization, result parsing, provider key testing).
//
// Node built-ins only (no external dependencies), imported with explicit .ts extensions as
// required by Node's native type-stripping module resolution.
//
// Split out so far -- import from these directly when writing something new, and prefer growing
// them over growing this file (see AGENTS.md, "Small files"):
//   types.ts    shared interfaces, dependency-free
//   catalog.ts  the fixed lists: PROVIDERS, JUDGE_MODELS, HARBOR_AGENTS
//   paths.ts    state dir, id generation, safeJoinUnderDir
//   naming.ts   sanitize/jobName/buildHarborRunArgs
//   secrets.ts  secrets.env read/write
//   joblogs.ts  live tail of harbor's own log files
//   tasks.ts    task files on disk, discovery, judge/rubric pinning
//   litellm.ts  the disabled LiteLLM gateway seam
//   exec.ts     spawning harbor/podman and building their environment
//   materialize.ts  writing GUI-authored skills/rubrics/prompts to disk for Harbor


export * from "./types.ts";
export * from "./catalog.ts";
export * from "./paths.ts";
export * from "./naming.ts";
export * from "./secrets.ts";
export * from "./joblogs.ts";
export * from "./tasks.ts";
export * from "./litellm.ts";
export * from "./cost.ts";
export * from "./exec.ts";
export * from "./bundle.ts";
export * from "./materialize.ts";
export * from "./httpguard.ts";
export * from "./results.ts";


// ---------- Secrets ----------
// Local KEY=VALUE file in the state dir, never returned by value over the API,


export * from "./harbor-python.ts";
export * from "./provider-probe.ts";
