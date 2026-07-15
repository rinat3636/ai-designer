import { test, mock } from "node:test";
import assert from "node:assert";
import { callChatCompletionRaw } from "@/lib/llm";

process.env.ANTHROPIC_API_KEY = "test-api-key";
process.env.ANTHROPIC_BASE_URL = "http://localhost:9999";
process.env.ANTHROPIC_MODEL = "claude-fable-5";

type FetchCall = { url: string; body: any };

function makeJsonResponse(content: string, finishReason = "stop") {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content }, finish_reason: finishReason }],
      usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
    }),
    text: async () => "",
  } as unknown as Response;
}

function make524Response() {
  return {
    ok: false,
    status: 524,
    text: async () => "A timeout occurred",
  } as unknown as Response;
}

test("passes max_tokens and max_output_tokens", async () => {
  const calls: FetchCall[] = [];
  mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push({ url, body: JSON.parse(init?.body as string) });
    return makeJsonResponse("hello");
  });

  const result = await callChatCompletionRaw("system", [{ role: "user", content: "hi" }], 12000);
  assert.strictEqual(result, "hello");
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].body.max_tokens, 12000);
  assert.strictEqual(calls[0].body.max_output_tokens, 12000);

  (globalThis.fetch as any).mock.restore();
});

test("falls back to claude-sonnet-4-6 after 524 errors", async () => {
  const calls: FetchCall[] = [];
  let callCount = 0;
  mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push({ url, body: JSON.parse(init?.body as string) });
    callCount++;
    // Primary model gets 524 on all 3 attempts, fallback succeeds on first try.
    if (callCount <= 3) return make524Response();
    return makeJsonResponse("fallback ok");
  });

  const result = await callChatCompletionRaw("system", [{ role: "user", content: "hi" }], 12000);
  assert.strictEqual(result, "fallback ok");
  assert.ok(calls.length >= 4, `expected at least 4 calls, got ${calls.length}`);
  const fallbackCalls = calls.filter((c) => c.body.model === "claude-sonnet-4-6");
  assert.ok(fallbackCalls.length > 0, "fallback model was not called");
  assert.ok(fallbackCalls.some((c) => c.body.max_output_tokens === 12000), "fallback used correct token limit");

  (globalThis.fetch as any).mock.restore();
});
