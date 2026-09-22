# RecordShield frontend

RecordShield is a Next.js foundation for a reviewable clinical data exchange product. The root route introduces the product; the component reference is available at `/design-system` during development only.

## Run locally

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

Copy `.env.example` to `.env.local` to connect the deployed backend. The browser calls `/api/v1` on this frontend; the server forwards supported requests to `RECORDSHIELD_BACKEND_URL`. This keeps HttpOnly session cookies same-origin. Use HTTPS for the deployed frontend. Restart/rebuild after changing configuration.

For the local mock service, set **both** `NEXT_PUBLIC_API_URL` and `RECORDSHIELD_BACKEND_URL` to empty. Live failures never fall back to mock data. See [the integration status and missing endpoint contract](PRODUCT_PLAN.md#live-backend-integration) before testing workflows.

## Project conventions

- The root route renders the public product landing page. Other route files stay thin and compose feature pages from the design-system, auth, workspace, patient-directory, patient-records, exchange, emergency, portal, security, administration, and downtime modules.
- Each feature `index.tsx` is page composition only. Component functions live one-per-file under that feature's `components/` directory; feature data, schemas, types, and pure helpers live in their own modules.
- Each feature API lives in `features/<feature>/api/index.ts`, with its API contract tests colocated in `features/<feature>/api/index.test.ts`.
- React Query queries and mutations live in the global `hooks/` folder, grouped by domain (`auth.ts`, `patients.ts`, `patient-records.ts`, `exchange.ts`, `emergency.ts`, `security.ts`, `admin.ts`, and `downtime.ts`). They call feature API functions and own cache policy.
- Feature pages and their colocated browser tests live in `features/*/index.tsx` and `features/*/index.test.tsx`.
- `e2e/` contains Playwright flows that exercise the running application.
- The design-system route is a self-contained development-only reference page; protected workspace chrome lives under the workspace route group.
- Shared visual primitives live in `components/`; API clients, contract schemas, and mock transport live in `lib/`; shared domain helpers live in `utils/`.
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

`npm run test:gateway` checks the server gateway (Node 24). `npm run test:e2e` builds and tests a separate mock server on port 3101 with both API variables explicitly empty. It never reuses the live development server.

`npm run test:live` is an opt-in check against the live-configured frontend already running on port 3000. It uses only documented synthetic accounts and performs sign-in, authorized reads, and sign-out; it does not create clinical records, grant consent, or change policy. Screenshots and traces are disabled. Empty backend collections are valid results, not substituted fixtures.
