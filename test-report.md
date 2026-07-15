# AI Designer — Smoke-test report

Date: 2026-07-15
Environment: Next.js 16.2.10 / Node.js / SQLite / Anthropic claude-fable-5

## Results

| Check | Status |
|-------|--------|
| `npm run lint` (eslint) | Pass |
| `npm run typecheck` (tsc --noEmit) | Pass |
| `npm run build` | Pass |
| Dev server starts on `localhost:3000` | Pass |
| User registration + free subscription | Pass |
| Landing page and navigation | Pass |
| Template selection | Pass |
| Niche brief form | Pass |
| AI concept proposals (4 variants) | Pass |
| Template data form | Pass |
| SVG generation (4 variants) + download buttons | Pass |
| Projects / history page | Pass |
| Pricing plans | Pass |
| Brand settings save/load | Pass |
| Admin stats + generation logs | Pass |

## Evidence

### 1. Landing page
![Landing](https://app.devin.ai/attachments/4728dca1-5635-4588-b0af-8fb02cefaa1f/ss_9dbd202a.png)

### 2. Registration redirects to admin dashboard
![Register → Admin](https://app.devin.ai/attachments/77011b74-71d8-4518-92a2-0481a9c31ca7/ss_42ad5934.png)

### 3. AI concept proposals
![Concepts](https://app.devin.ai/attachments/5df5bb3f-1500-447c-b976-422343c7c452/ss_243ecd60.png)

### 4. Generated SVG results with PNG/JPG/SVG download
![Results](https://app.devin.ai/attachments/c96ef734-e736-46f9-ad42-0561d3d18037/ss_d6472d13.png)

### 5. Personal account / history
![Projects](https://app.devin.ai/attachments/5e647fda-fdef-47a4-bfc1-85ba59fcace2/ss_2d432256.png)

### 6. Pricing
![Pricing](https://app.devin.ai/attachments/3655ec8a-fd52-4c98-ac99-d95e08e20526/ss_ce1dc571.png)

### 7. Admin generation logs
![Admin logs](https://app.devin.ai/attachments/ba9ffc57-4346-465d-936f-f613976913f4/ss_239f83d0.png)

### 8. Brand settings
![Brand settings](https://app.devin.ai/attachments/54c2f958-f235-48e9-a3eb-99d1a0f7bedf/ss_d82ae93c.png)

## Recording

[ai-designer-demo.mp4](https://app.devin.ai/attachments/7204a5f2-3f22-4cca-8291-fb9c63c67dbe/ai-designer-demo-edited.mp4)

## Notes

- Only Anthropic `claude-fable-5` is used for concept and SVG generation; no OpenAI services are used.
- Generated SVGs are stored in `public/generated/` and served as static assets.
- Subscription limits are enforced; payments are not wired to a real provider.
- The code is committed locally but not yet pushed to a remote (no remote configured).
