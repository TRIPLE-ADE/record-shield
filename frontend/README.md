# RecordShield frontend

RecordShield is a Next.js workspace for reviewable clinical data exchange. The product surface is under `features/home`; the internal component preview is available at `/design-system`.

## Run locally

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

The browser uses the Axios mock adapter when `NEXT_PUBLIC_API_URL` is empty. Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_API_URL` when the service is available; the feature query and response validation remain unchanged.

## Project conventions

- `app/page.tsx` and `app/design-system/page.tsx` are thin route exports.
- Product code, colocated browser tests, and API query definitions live in `features/`.
- `e2e/` contains Playwright flows that exercise the running application.
- Shared visual primitives live in `components/`; API clients, contracts, and mock transport live in `lib/`.

## Verification

```bash
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
CI=1 pnpm test:e2e
```
