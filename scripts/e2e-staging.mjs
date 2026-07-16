const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function getHealth() {
  const res = await fetch(`${BASE_URL}/api/health`);
  assert(res.status === 200, `Health returned ${res.status}`);
  const body = await res.json();
  assert(body.status === "ok", `Unexpected health body: ${JSON.stringify(body)}`);
  console.log("  /api/health ok");
}

async function getMetrics() {
  const res = await fetch(`${BASE_URL}/api/metrics`);
  assert(res.status === 200, `Metrics returned ${res.status}`);
  const text = await res.text();
  assert(text.includes("chat_requests_total"), "chat_requests_total missing");
  assert(text.includes("chat_tokens_total"), "chat_tokens_total missing");
  assert(text.includes("chat_response_duration_ms"), "chat_response_duration_ms missing");
  console.log("  /api/metrics ok");
  return text;
}

function parseMetricValue(text, name, labels) {
  const regex = new RegExp(`${name}\\{([^}]+)\\}\\s+(\\d+(?:\\.\\d+)?)`);
  const lines = text.split("\n");
  for (const line of lines) {
    const match = line.match(regex);
    if (!match) continue;
    if (labels.every((l) => line.includes(l))) {
      return Number(match[2]);
    }
  }
  return 0;
}

async function smokeChat() {
  // A cheap request that does not trigger a full generation: it asks for template
  // clarification and exercises /api/chat, metrics and the LLM path.
  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "What's the weather like today?" }),
  });
  assert(res.status === 200, `Chat returned ${res.status}`);
  const body = await res.json();
  assert(typeof body.message === "string", `Unexpected chat body: ${JSON.stringify(body)}`);
  assert(!body.error, `Chat returned error: ${body.error}`);
  console.log("  /api/chat ok:", body.message.slice(0, 100));
}

async function run() {
  console.log(`Staging smoke test against ${BASE_URL}`);

  await getHealth();
  const before = await getMetrics();
  const requestsBefore = parseMetricValue(before, "chat_requests_total", ['status="200"', 'error_type="none"']);

  await smokeChat();

  const after = await getMetrics();
  const requestsAfter = parseMetricValue(after, "chat_requests_total", ['status="200"', 'error_type="none"']);
  assert(requestsAfter > requestsBefore, `chat_requests_total did not increment: ${requestsBefore} -> ${requestsAfter}`);

  // Ensure the new request did not add to 524 error counter.
  const errors524 = parseMetricValue(after, "chat_requests_total", ['error_type="524"']);
  assert(errors524 === 0, `Found ${errors524} 524 errors in metrics`);

  console.log("Staging smoke test passed.");
}

run().catch((e) => {
  console.error("Staging smoke test failed:", e.message);
  process.exitCode = 1;
});
