# RecordShield frontend

RecordShield is a Next.js foundation for a reviewable clinical data exchange product. The root route sends users to sign in; the component reference is available at `/design-system` during development only.

## Run locally

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

The login and workspace slice uses the documented `/api/v1` contract end to end. Leave `NEXT_PUBLIC_API_URL` empty while developing locally; set it in `.env.local` when the service is available so feature queries can use the same client without a UI rewrite.

## Project conventions

- `next.config.ts` redirects the root path to sign in. Other route files stay thin and compose the feature pages from `app/design-system/page.tsx`, `app/(auth)/login/page.tsx`, and `app/(workspace)/workspace/page.tsx`.
- Feature pages and their colocated browser tests live in `features/*/index.tsx` and `features/*/index.test.tsx`.
- `e2e/` contains Playwright flows that exercise the running application.
- The design-system route is a self-contained development-only reference page; protected workspace chrome lives under the workspace route group.
- Shared visual primitives live in `components/`; API clients, contract schemas, and mock transport live in `lib/`.
- `docs/RecordShield_API_Contract.md` and `docs/RecordShield_OpenAPI.json` remain the source of truth for every future API-backed feature.

## Verification

```bash
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm doctor
CI=1 pnpm test:e2e
```
