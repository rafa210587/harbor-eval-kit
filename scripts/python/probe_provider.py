"""Discovery never requests a completion. The paid probe requires an explicit model."""
import json
import sys

mode, provider, model = sys.argv[1:4]
result = {"ok": False, "testedModel": None, "discoveredModels": [], "error": None}
try:
    import litellm
    litellm.suppress_debug_info = True
    if mode == "discover":
        result["discoveredModels"] = list(litellm.get_valid_models(
            check_provider_endpoint=True, custom_llm_provider=provider))
    elif mode == "test" and model.startswith(provider + "/"):
        litellm.completion(model=model, messages=[{"role": "user", "content": "Reply OK"}],
                          max_tokens=8, timeout=20)
        result["testedModel"] = model
    else:
        raise ValueError("Explicit provider/model required for a paid probe")
    result["ok"] = True
except Exception as error:
    result["error"] = f"{type(error).__name__}: {error}"
print(json.dumps(result))
