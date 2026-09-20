# RecordShield frontend

RecordShield is a Next.js foundation for a reviewable clinical data exchange product. The home route is intentionally a small placeholder while the shared visual system is being shaped; the component preview is available at `/design-system`.

## Run locally

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

The Axios client and mock adapter are ready for the first contract-backed feature. Leave `NEXT_PUBLIC_API_URL` empty while developing locally; set it in `.env.local` when the service is available so feature queries can use the same client without a UI rewrite.

## Project conventions

- `app/page.tsx` and `app/design-system/page.tsx` are thin route exports.
- Feature pages and their colocated browser tests live in `features/*/index.tsx` and `features/*/index.test.tsx`.
- `e2e/` contains Playwright flows that exercise the running application.
- Shared visual primitives live in `components/`; API clients, contract schemas, and mock transport live in `lib/`.
- `docs/RecordShield_API_Contract.md` and `docs/RecordShield_OpenAPI.json` remain the source of truth for every future API-backed feature.

## Verification

```bash
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
CI=1 pnpm test:e2e
```
