import assert from "node:assert/strict"
import { test } from "node:test"
import { build } from "esbuild"

// Exercise the production generation/client path without a server or a model.
globalThis.window = { location: { protocol: "http:", host: "ava.test" } }
globalThis.localStorage = { getItem: () => null, setItem: () => {} }

const { outputFiles } = await build({
  entryPoints: ["src/app/_hooks/useGenerate.ts"],
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
})
const { generate, selectedModel } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString("base64")}`)
selectedModel.value = "fixture.gguf"

for (const [name, input] of [
  ["playground", { prompt: "Hello", sampling: { temperature: 0, top_k: 1, top_p: 0.9 } }],
  ["chat", { messages: [{ role: "user", content: "Hello" }], sampling: { temperature: 1.2, top_k: 12, top_p: 0.8 } }],
  ["quick tool", { prompt: "Summarize this text" }],
]) {
  test(`${name} sends completion parameters and reads the result`, async () => {
    let request
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (url, init) => {
      request = { url, method: init.method, body: JSON.parse(init.body) }
      return new Response('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n', {
        headers: { "Content-Type": "text/event-stream" },
      })
    }
    try {
      const result = { value: "" }
      const status = { value: null }
      assert.equal(await generate(input, result, status), "Hello")
      assert.equal(status.value, null)
      const { sampling, ...data } = input
      assert.deepEqual(request, {
        url: "http://ava.test/api/chat/completions",
        method: "POST",
        body: { model: "fixture.gguf", stream: true, ...data, ...sampling },
      })
    } finally {
      globalThis.fetch = originalFetch
    }
  })
}
