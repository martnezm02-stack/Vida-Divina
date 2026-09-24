// generationProvider.test.ts — MI-5: GenerationProvider es provider-
// agnostic (Claude/OpenAI/local/etc. son intercambiables) y ningún camino
// de MI-5 depende de un LLM real para funcionar.
import { test } from "node:test";
import assert from "node:assert/strict";
import { deterministicGenerationProvider } from "../../../src/lib/intelligence";
import type { GenerationProvider } from "../../../src/lib/intelligence";

test("deterministicGenerationProvider: produce interpretation/recommendation sin red ni IA", () => {
  const context = { evidence: { scope: "market", pattern_type: "creative_hook_repetition" }, finding: { frequency_pct: 66.7 } };
  const interpretation = deterministicGenerationProvider.generate({
    prompt: "interpreta",
    context,
    options: { kind: "interpretation" },
  });
  assert.ok(!(interpretation instanceof Promise));
  assert.ok((interpretation as { text: string }).text.length > 0);

  const recommendation = deterministicGenerationProvider.generate({
    prompt: "recomienda",
    context,
    options: { kind: "recommendation" },
  });
  assert.ok((recommendation as { text: string }).text.toLowerCase().includes("puede"));
});

test("GenerationProvider abstraction: cualquier implementación con la forma correcta es intercambiable", async () => {
  const mockClaudeLikeProvider: GenerationProvider = {
    name: "mock-claude",
    async generate(request) {
      return { text: `[mock synthesis] ${request.prompt}`, model: "mock-claude-x" };
    },
  };
  const result = await mockClaudeLikeProvider.generate({ prompt: "resume esto" });
  assert.ok(result.text.startsWith("[mock synthesis]"));
  assert.equal(result.model, "mock-claude-x");
});
