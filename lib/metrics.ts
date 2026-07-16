import { Counter, Histogram, register } from "prom-client";

export const chatRequestsTotal = new Counter({
  name: "chat_requests_total",
  help: "Total number of requests to /api/chat",
  labelNames: ["model", "status", "error_type"],
});

export const chatResponseDurationMs = new Histogram({
  name: "chat_response_duration_ms",
  help: "Response duration of /api/chat in milliseconds",
  labelNames: ["model"],
  buckets: [100, 500, 1000, 5000, 10000, 30000, 60000, 120000, 300000],
});

export const chatTokensTotal = new Counter({
  name: "chat_tokens_total",
  help: "Total tokens used by /api/chat",
  labelNames: ["model"],
});

register.registerMetric(chatRequestsTotal);
register.registerMetric(chatResponseDurationMs);
register.registerMetric(chatTokensTotal);

export function recordChatMetrics(props: {
  model: string;
  status: number;
  errorType?: string;
  durationMs: number;
  tokens?: number;
}) {
  const { model, status, errorType, durationMs, tokens } = props;
  const statusLabel = String(status);
  const errorLabel = errorType || (status >= 500 ? "server_error" : "none");
  chatRequestsTotal.inc({ model: model || "unknown", status: statusLabel, error_type: errorLabel });
  chatResponseDurationMs.observe({ model: model || "unknown" }, durationMs);
  if (tokens) {
    chatTokensTotal.inc({ model: model || "unknown" }, tokens);
  }
}

export { register };
