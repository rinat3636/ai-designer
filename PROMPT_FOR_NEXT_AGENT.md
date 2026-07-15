# Handoff prompt for the next Devin agent

## Project

`rinat3636/ai-designer` — AI-powered SVG design generator for Telegram/web.
Branch: `devin/fix-llm-proxy`
Open PR: https://github.com/rinat3636/ai-designer/pull/1
Public test URL: https://buyer-paste-bread-apt.trycloudflare.com/create

## Tech stack

- Next.js 16.2.10, React 19.2.4, Tailwind CSS 4, TypeScript 5, Turbopack dev.
- Prisma 6.19.3 + SQLite.
- AI proxy: `https://api.cheat-ai.shop/v1/chat/completions` (OpenAI-compatible), configured in `.env`.
- Model: `ANTHROPIC_MODEL="claude-sonnet-4-6"`, `max_tokens=12000`.
- Image-prompt mode (pxpipe/Fable): renders the prompt to a PNG and sends it as `image_url`; controlled by `USE_IMAGE_PROMPT` (default enabled unless set to `false`).

## What already works

1. **First screen — two paths**
   - `/create` opens with two primary actions: "Редактировать свой макет" (upload & edit) and "Сгенерировать новый дизайн" (template grid).
2. **Upload & edit**
   - `/api/upload` returns `url`, `width`, `height`.
   - `/api/generate` supports virtual `templateId: "upload"` and uses the image dimensions as `viewBox`.
   - Uploaded image is analyzed via `analyzeImage` in `lib/llm.ts` to extract visible text/elements before generation, so logos and certificates are preserved.
3. **Generated result editing**
   - The selected variant is always the source for subsequent edits.
   - "Редактировать" is the first quick action and focuses the chat.
   - `POST /api/projects/[id]` passes the full edit conversation history to `editDesigns` so the model can resolve replies like "3" / "третий вариант".
   - `parseEditInstruction` now prefers to proceed rather than ask clarification questions.
4. **Prompt-as-image (pxpipe)**
   - Enabled by default for `generateDesigns` when there is no source SVG and no reference images.
   - Disabled for edits and upload-edit to avoid confusing the model.
5. **Quality gates**
   - `npm run lint && npm run typecheck && npm run build` pass.
   - `npm run test:e2e` exists; it may still time out when the proxy returns 520, but the code paths work.

## Key files

- `components/create-wizard.tsx` — main wizard UI, two-path entry, upload/edit/generate/result flows.
- `lib/llm.ts` — `generateDesigns`, `editDesigns`, `analyzeImage`, `buildDesignPrompt`, `buildEditPrompt`, `promptToPngDataUrl`.
- `lib/prompt-image.ts` — renders text prompt to PNG for pxpipe-style generation.
- `app/api/generate/route.ts` — generation endpoint, image analysis, virtual upload template.
- `app/api/projects/[id]/route.ts` — edit endpoint, receives `messages` and `referenceImageUrls`.
- `app/api/upload/route.ts` — file upload + dimensions.
- `lib/storage.ts` — `readLocalSvg` for local SVG/image resolution.
- `scripts/e2e-smoke.mjs`, `scripts/e2e-image-edit.mjs` — Playwright mobile smoke tests.

## Known issues / constraints

- The proxy `cheat-ai.shop` occasionally returns `520` or times out after ~100 s. `generateOneSvg` already does one retry, but the e2e test `waitFor` can still fail if the API is slow.
- `USE_IMAGE_PROMPT` is on by default (`process.env.USE_IMAGE_PROMPT !== "false"`). For edits/uploads it is automatically skipped.
- The virtual upload template is created on demand in `/api/generate/route.ts` via `prisma.template.upsert`.

## Remaining work (prioritized)

### 1. Embed design-quality rules into the generation system prompt
**Goal:** All generated SVGs must follow the Telegram TZ quality rules from msg 325.
**Where:** `lib/llm.ts` `buildDesignPrompt` and the `system` prompt in `generateOneSvg`.
**Acceptance:** Generate 5 different templates and manually verify: no overlapping text, readable contrast, safe margins, balanced composition, proper hierarchy, modern fonts, no empty large areas.
**Rules to embed:**
- Correct composition: logical, balanced, no chaotic placement, no big empty zones, no overlaps.
- Visual hierarchy: headline → image/offer → CTA/button → contacts → logo.
- Automatic alignment: consistent spacing, centering, grid.
- Safe zones: all text/important elements inside safe area, not close to edges.
- Balance between text, images, whitespace.
- Typography: modern fonts, readable sizes, line height, letter spacing.
- Color harmony: use the provided palette or a niche-appropriate auto-palette.
- Contrast: text must be readable, no light-on-light or dark-on-dark.
- Correct element sizes for logo, phone, website, QR code, buttons, images.
- Contacts placed logically, not distracting.
- Per-format composition rules (logo clean, banner big headline, product card product-first, etc.).
- Modern principles: minimalism, modular grid, quality typography, clear hierarchy.
- Self-check: before output, mentally verify alignment, readability, no overlaps, safe zones, professional look; fix if needed.

### 2. Deep reference analysis
**Goal:** When a user uploads a reference image (not an edit source), the AI explicitly extracts style, palette, composition, typography, and uses them in generation.
**Where:** `analyzeImage` in `lib/llm.ts` and `buildDesignPrompt`.
**Acceptance:** Upload a reference poster and generate a design in the same style without copying the exact layout; the output should use the reference's palette and mood.
**Implementation hint:** Extend `analyzeImage` to return `style`, `palette`, `composition`, `typography` fields; merge them into `brief`/`concept` in `/api/generate`.

### 3. Natural-language template selection
**Goal:** User can type "сделай Stories для кофейни" and the wizard picks the right template without requiring a category click.
**Where:** `app/api/interview/route.ts` and `components/create-wizard.tsx`.
**Acceptance:** Input "Stories 1080x1920 для кофейни" selects `social-stories` and starts generation or concepts.
**Implementation hint:** Add a `/api/resolve-template` endpoint or enhance the interview route to detect template/size/style from the first message and return `selectedTemplateId`/`size` directly.

### 4. Stabilize proxy timeouts
**Goal:** Reduce 520/fallback failures in production.
**Where:** `lib/llm.ts` `callChatCompletionRaw`.
**Acceptance:** 3 retries with exponential backoff, and a graceful "попробуйте ещё раз" message instead of placeholder fallback.
**Be careful:** Do not expose API keys or proxy internals in client.

### 5. Finish and harden e2e tests
**Goal:** `npm run test:e2e` passes reliably.
**Where:** `scripts/e2e-smoke.mjs`, `scripts/e2e-image-edit.mjs`.
**Acceptance:** Run 3 times in a row successfully (allowing for occasional proxy flakiness by adding retries or longer timeouts).

### 6. Mobile UX polish
**Goal:** Fully responsive one-workspace experience.
**Where:** `components/create-wizard.tsx`.
**Acceptance:** On 390x844 viewport, the chat is usable, preview opens full-screen, all buttons reachable by thumb, no horizontal scroll.

## Commands

```bash
cd /home/ubuntu/repos/ai-designer
npm install
npm run lint && npm run typecheck && npm run build
npm run test:e2e
npm run dev
```

## Before committing

- Run `npm run lint && npm run typecheck && npm run build`.
- Run `npm run test:e2e` and fix regressions.
- Do not commit `.env`, test artifacts, or generated files.
- Keep PR description updated.

## Contact / context

- Telegram feedback comes from bot `ererer (service account)` and user `Bashirov1111`.
- User values: free-form dialog, minimal clicks, mobile-first, exact preservation of uploaded designs, correct edits (not redesign), pxpipe-style cost saving, professional design quality.
