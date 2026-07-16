import { test } from "node:test";
import assert from "node:assert";
import { recordChatMetrics, register } from "@/lib/metrics";

test("recordChatMetrics updates Prometheus counters", async () => {
  const before = await register.metrics();
  assert.ok(before.includes("chat_requests_total"), "chat_requests_total metric missing");
  assert.ok(before.includes("chat_response_duration_ms"), "chat_response_duration_ms metric missing");
  assert.ok(before.includes("chat_tokens_total"), "chat_tokens_total metric missing");

  recordChatMetrics({
    model: "claude-fable-5",
    status: 200,
    errorType: "none",
    durationMs: 1234,
    tokens: 1500,
  });

  const after = await register.metrics();
  assert.ok(
    /chat_requests_total\{[^}]*model="claude-fable-5"[^}]*status="200"[^}]*error_type="none"\} 1/.test(after),
    "request counter did not increment"
  );
  assert.ok(
    /chat_tokens_total\{[^}]*model="claude-fable-5"\} 1500/.test(after),
    "token counter did not increment"
  );
  assert.ok(
    after.includes("chat_response_duration_ms_sum") && after.includes("chat_response_duration_ms_count"),
    "duration histogram missing"
  );
});
