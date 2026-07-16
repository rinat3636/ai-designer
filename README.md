This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## AI Model & Limits

The app uses an OpenAI-compatible proxy at `ANTHROPIC_BASE_URL`.

- `ANTHROPIC_MODEL` — default model used for generation and edits.
- `claude-sonnet-4-6` is used as the automatic fallback when the primary model returns 524/timeouts.
- `max_output_tokens` is sent alongside `max_tokens` to maximize compatibility.
- Default token budgets:
  - New generation: 16000 tokens
  - Design edits: 24000 tokens (uploaded images often need more room for faithful recreation)
- Request timeout is scaled with token budget (max 5 minutes).
- To manually switch models, set `ANTHROPIC_MODEL` in `.env` and restart the server.

## Monitoring

The app exposes operational endpoints and Prometheus metrics for production observability.

- `GET /api/health` — liveness probe, returns `{ "status": "ok", "uptime_ms": <ms>, "timestamp": "..." }`.
- `GET /api/metrics` — Prometheus exposition format with the following metrics:
  - `chat_requests_total{model, status, error_type}` — total `/api/chat` requests.
  - `chat_response_duration_ms{model}` — response duration histogram.
  - `chat_tokens_total{model}` — total LLM tokens consumed.
- Each `/api/chat` request is logged as JSON with `type: "chat-api"`, `status`, `duration_ms`, `hasFiles`, `messageLength` and `error`.

To wire into Prometheus, add a scrape job:

```yaml
scrape_configs:
  - job_name: "ai-designer"
    static_configs:
      - targets: ["localhost:3000"]
    metrics_path: "/api/metrics"
```

Suggested alert: trigger when the percentage of `chat_requests_total{error_type="524"}` over the last 5 minutes exceeds 5% of all `chat_requests_total`.
