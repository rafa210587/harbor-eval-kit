import test from "node:test";
import assert from "node:assert/strict";
import { gatewayModelChoices } from "../../gui/app/litellm-domain.js";

test("gateway aliases preserve provider-looking slashes under the OpenAI transport", () => {
  assert.deepEqual(gatewayModelChoices(["fast", "anthropic/sonnet", "openai/custom", "fast", "", null]), [
    { alias: "fast", value: "openai/fast" },
    { alias: "anthropic/sonnet", value: "openai/anthropic/sonnet" },
    { alias: "openai/custom", value: "openai/openai/custom" },
  ]);
  assert.deepEqual(gatewayModelChoices(null), []);
});
