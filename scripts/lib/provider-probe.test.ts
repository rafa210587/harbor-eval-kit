import { test } from "node:test";
import assert from "node:assert/strict";
import { validateProviderTestModel } from "./provider-probe.ts";

test("paid provider probes require an explicit model of the chosen provider", () => {
  assert.equal(validateProviderTestModel("deepseek", "deepseek/deepseek-v4-flash"), "deepseek/deepseek-v4-flash");
  for (const model of [undefined, "", "deepseek-chat", "other/model", "deepseek/model\nflag"])
    assert.throws(() => validateProviderTestModel("deepseek", model), /explicitamente/);
});
