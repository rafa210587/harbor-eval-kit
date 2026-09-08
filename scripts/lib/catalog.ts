// Reference catalogues: the fixed lists this kit is configured by. Pure data plus the one
// predicate that reads them -- extending any of these must never require a new branch
// elsewhere (see AGENTS.md, "Decoupling").

/**
 * Curated, fixed judge-model allowlist for `harbor analyze`. Harbor's own CLI default
 * (claude-haiku-4-5) is a cost-friendly choice, not a considered "good enough to judge
 * trajectories" one -- the whole point of the judge step is to catch what the cheap
 * deterministic test.sh reward missed, so the judge itself should not be a cheap model.
 * Update this list by hand as new high-tier models ship; never accept a judge model that
 * isn't in it (see isJudgeModelAllowed).
 */
// ---------- Harbor compatibility contract ----------
/**
 * The Harbor release every version-sensitive assumption in this kit was validated against.
 *
 * This is not decoration: a surprising amount of this code is a mirror of one Harbor version's
 * behaviour, and all of it fails *silently* rather than loudly when Harbor changes underneath
 * it. The list below is what breaks, and each entry was verified by hand against 0.22.0:
 *
 * - HARBOR_AGENTS (below) mirrors the registered `AgentFactory` values in Harbor 0.22.0.
 * - resolveAnalysisArtifact() selects the canonical `analysis.json` from the explicit input
 *   and deterministic analysis job, and normalizes the `{results: [...]}` job-level shape.
 * - parseResult() reads result.json's field names.
 * - materialize.ts writes a rubric TOML matching harbor/analyze/prompts/analyze-rubric.toml,
 *   and a judge prompt using harbor's {trial_path}/{task_section}/{criteria_guidance} markers.
 * - the /api/tasks/init route knows `harbor init --task` prompts for "Organization:" on stdin.
 *
 * Installers pin this exact version (scripts/harbor-eval.sh / .ps1). The GUI compares it to
 * the Harbor actually installed and warns on a mismatch instead of blocking: a newer Harbor
 * usually still works, it just stops being something this kit has verified.
 */
export const TESTED_HARBOR_VERSION = "0.22.0";

/** Whether the installed Harbor is the one this kit's assumptions were validated against.
 *  `null` version means Harbor was not detected at all -- caller decides what to say. */
export function isTestedHarborVersion(installed: string | null | undefined): boolean {
  return Boolean(installed) && installed === TESTED_HARBOR_VERSION;
}

export const JUDGE_MODELS: { label: string; value: string }[] = [
  { label: "Claude Opus 5", value: "anthropic/claude-opus-5" },
  { label: "Claude Fable 5.1", value: "anthropic/claude-fable-5-1" },
  { label: "GPT-5.1", value: "openai/gpt-5.1" },
  { label: "Gemini 3 Pro", value: "gemini/gemini-3-pro" },
];

export function isJudgeModelAllowed(value: string): boolean {
  return JUDGE_MODELS.some((m) => m.value === value);
}

// ---------- Providers (canonical list, shared by Secrets/Models UI and the key-test route)
// ----------
// `id` doubles as LiteLLM's `custom_llm_provider` string (confirmed against the installed
// litellm package's provider config manager) -- it's what /api/secrets/test passes to
// `litellm.get_valid_models`/`litellm.completion`. `prefixes` is the "provider/model" prefix
// convention used everywhere else in this kit (model registry values, guessProviderKey in the
// GUI). `envKey: null` marks providers with no simple API-key env var (local runtimes,
// cloud-credential-based auth) -- these never get a "Test key" button.
export interface ProviderEntry {
  id: string;
  label: string;
  prefixes: string[];
  envKey: string | null;
}

export const PROVIDERS: ProviderEntry[] = [
  { id: "anthropic", label: "Anthropic", prefixes: ["anthropic/"], envKey: "ANTHROPIC_API_KEY" },
  { id: "openai", label: "OpenAI", prefixes: ["openai/"], envKey: "OPENAI_API_KEY" },
  { id: "azure", label: "Azure OpenAI", prefixes: ["azure/"], envKey: "AZURE_API_KEY" },
  { id: "deepseek", label: "DeepSeek", prefixes: ["deepseek/"], envKey: "DEEPSEEK_API_KEY" },
  { id: "gemini", label: "Google Gemini", prefixes: ["gemini/", "google/"], envKey: "GEMINI_API_KEY" },
  { id: "vertex_ai", label: "Google Vertex AI", prefixes: ["vertex_ai/"], envKey: "VERTEXAI_API_KEY" },
  { id: "openrouter", label: "OpenRouter", prefixes: ["openrouter/"], envKey: "OPENROUTER_API_KEY" },
  { id: "groq", label: "Groq", prefixes: ["groq/"], envKey: "GROQ_API_KEY" },
  { id: "mistral", label: "Mistral", prefixes: ["mistral/"], envKey: "MISTRAL_API_KEY" },
  { id: "cohere", label: "Cohere", prefixes: ["cohere/"], envKey: "COHERE_API_KEY" },
  { id: "xai", label: "xAI (Grok)", prefixes: ["xai/"], envKey: "XAI_API_KEY" },
  { id: "together_ai", label: "Together AI", prefixes: ["together_ai/"], envKey: "TOGETHERAI_API_KEY" },
  { id: "fireworks_ai", label: "Fireworks AI", prefixes: ["fireworks_ai/"], envKey: "FIREWORKS_AI_API_KEY" },
  { id: "ollama", label: "Ollama (local, sem key)", prefixes: ["ollama/"], envKey: null },
  { id: "bedrock", label: "AWS Bedrock (credenciais AWS, não API key simples)", prefixes: ["bedrock/"], envKey: null },
];

// ---------- Harbor agent adapters ----------
/**
 * The `--agent` values registered by the installed Harbor 0.22.0 AgentFactory.
 * The GUI used to only hint at four of these in prose, which made the most useful question
 * unanswerable from the UI: *which adapter can drive a non-Anthropic model?* Not every adapter
 * is model-agnostic -- a vendor CLI adapter (claude-code, codex, gemini-cli, ...) speaks its
 * own vendor's API, so pairing it with an arbitrary `--model` is not something this kit can
 * promise. `modelAgnostic: true` marks the LiteLLM-backed adapters that take any
 * `provider/model` string; those are the ones to pick when comparing across providers.
 *
 * Validated end-to-end on 2026-09-06: `mini-swe-agent` + `deepseek/deepseek-chat` scored
 * reward 1.0 on a real task for $0.0017.
 *
 * This is a hand-maintained mirror of Harbor's factory map, not something Harbor exposes
 * machine-readably (`harbor agent list` does not exist). Re-check it against the installed
 * `harbor/agents/factory.py` when upgrading Harbor. The Agents field remains free text so
 * custom import paths and ACP registry shorthands remain usable even when absent here.
 */
export const HARBOR_AGENTS: { value: string; modelAgnostic: boolean }[] = [
  { value: "acp", modelAgnostic: false },
  { value: "aider", modelAgnostic: true },
  { value: "antigravity-cli", modelAgnostic: false },
  { value: "antigravity-sdk", modelAgnostic: false },
  { value: "claude-code", modelAgnostic: false },
  { value: "cline-cli", modelAgnostic: true },
  { value: "codex", modelAgnostic: false },
  { value: "computer-1", modelAgnostic: false },
  { value: "copilot-cli", modelAgnostic: false },
  { value: "cortex-code", modelAgnostic: false },
  { value: "cursor-cli", modelAgnostic: false },
  { value: "deerflow", modelAgnostic: true },
  { value: "devin", modelAgnostic: false },
  { value: "dspy-rlm", modelAgnostic: true },
  { value: "eve", modelAgnostic: false },
  { value: "fx", modelAgnostic: false },
  { value: "gemini-cli", modelAgnostic: false },
  { value: "goose", modelAgnostic: true },
  { value: "grok-build", modelAgnostic: false },
  { value: "hermes", modelAgnostic: false },
  { value: "junie", modelAgnostic: false },
  { value: "kimi-cli", modelAgnostic: false },
  { value: "kimi-code", modelAgnostic: false },
  { value: "langgraph", modelAgnostic: true },
  { value: "mcode", modelAgnostic: false },
  { value: "mimo", modelAgnostic: false },
  { value: "mini-swe-agent", modelAgnostic: true },
  { value: "nemo-agent", modelAgnostic: false },
  { value: "nop", modelAgnostic: false },
  { value: "openclaw", modelAgnostic: false },
  { value: "opencode", modelAgnostic: true },
  { value: "openhands", modelAgnostic: true },
  { value: "openhands-sdk", modelAgnostic: true },
  { value: "oracle", modelAgnostic: false },
  { value: "pi", modelAgnostic: false },
  { value: "qwen-coder", modelAgnostic: false },
  { value: "rovodev-cli", modelAgnostic: false },
  { value: "swe-agent", modelAgnostic: true },
  { value: "terminus-2", modelAgnostic: true },
  { value: "trae-agent", modelAgnostic: true },
  { value: "vibe", modelAgnostic: false },
];

/** `oracle` (applies the task's own solution/solve.sh) and `nop` (does nothing) call no LLM at
 *  all -- the zero-cost way to check a task's test.sh rewards correctly before spending API. */
export const FREE_AGENTS = ["oracle", "nop"];
