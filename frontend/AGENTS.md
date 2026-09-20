# RecordShield frontend agent guide

This file is the working agreement for AI agents changing the frontend. Keep the implementation simple, modular, readable, and easy to replace when the real API is available.

## Scope and sources of truth

- Work in `frontend/` for the Next.js application. The repository root also contains backend and product documents; do not change those while implementing frontend work unless the user explicitly asks.
- `../docs/RecordShield_API_Contract.md` and `../docs/RecordShield_OpenAPI.json` are the API authority. Match their paths, status codes, headers, cookies, closed response shapes, expiry rules, and safe error behavior.
- `../docs/ui-implementation-plan.md` is the internal implementation plan. Leave it unchanged when implementing code unless the user explicitly asks for a plan update.
- All current data is synthetic. Never introduce real patient data, credentials, or clinical payloads into fixtures, logs, URLs, local storage, screenshots, or tests.

## Architecture

The frontend uses Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4, shadcn/Radix primitives, React Query, Axios, Zod, React Hook Form, Vitest Browser Mode, and Playwright.

Routes are composition boundaries. Keep route files in `app/` thin and export the feature page from `features/`:

```text
next.config.ts                       -> redirect / to /login
app/design-system/page.tsx           -> features/design-system
app/(auth)/login/page.tsx            -> features/auth
app/(workspace)/workspace/page.tsx   -> features/workspace
app/api/v1/[...path]/route.ts        -> demo HTTP transport only
```

Feature folders own page composition, feature components, API functions, schemas/view models when needed, and colocated tests:

```text
features/<feature>/
  index.tsx
  components/
  api.ts
  schemas.ts
  view-models.ts
  index.test.tsx
```

Use `index.tsx` for feature pages. Do not create `features/<feature>/page.tsx`. The only separate test location is `e2e/`, which contains Playwright flows against the running application.

The design-system route is a single, self-contained reference page available in development only. It has no API, no route layout, and no application shell. Do not reintroduce `app/design-system/layout.tsx` or `components/app-shell.tsx`, and do not link it from product surfaces. The protected workspace has its own scoped `WorkspaceShell` under `components/` and the `(workspace)` route group.

`app/layout.tsx` owns global CSS, theme handling, and the Sonner toaster. The `(auth)` and `(workspace)` route groups each provide the QueryClient boundary required by their client features.

## Data and state boundaries

Keep the request path explicit:

```text
feature component
  -> React Query hook
  -> feature api function
  -> lib/api/client.ts
  -> /api/v1 mock route now, real service later
```

- `lib/api/contracts/` contains closed Zod schemas and inferred types. Parse every API response before it reaches a component or query cache.
- `lib/api/client.ts` owns credentials, CSRF, idempotency keys, response normalization, and safe `ApiError` conversion. Components must not call Axios directly.
- `lib/mock-api/` is the contract-faithful demo backend. The browser uses the Next catch-all route; Vitest installs Axios Mock Adapter against the same service behavior. Do not create ad-hoc fixture responses inside components or tests.
- `NEXT_PUBLIC_API_URL` switches the Axios client to the real service. Feature components and query hooks must not need a rewrite when that value changes.
- React Query owns server state and protected cache lifetime. Clear protected query data on logout, authentication failure, expiry, denial, revocation, or a failed final authorization decision. Do not persist clinical queries to browser storage.
- React Hook Form owns form state and Zod resolvers own validation. Keep field errors close to their fields.
- Prefer local component state, feature hooks, and composition. Avoid prop drilling by placing behavior beside the feature that owns it. Do not add Zustand, Context, or another global store unless a real cross-route client-state requirement is demonstrated.

## Authentication and security decisions

- The server-derived `SessionContext` is authoritative for user, membership, role, organization, patient link, shift, permissions, CSRF token, and expiry. Browser-selected identity cards are only demo convenience; they never grant authority.
- Do not add a client-side role picker or hospital switcher. Switching context means logging out and signing in as another seeded identity.
- Mutations use the contract’s CSRF and `Idempotency-Key` rules. A retry must reuse the caller’s idempotency key rather than creating a second action.
- The session is cookie-backed (`rs_session`, HttpOnly, SameSite=Strict, Path `/`). Never move session authority or clinical payloads into localStorage, query strings, general logs, or client-controlled authorization flags.
- Login failures remain generic. Do not reveal whether a username, membership, patient, record count, or hidden source exists when the contract says the result is private.
- A suspended membership or expired session must change the next server response. The UI must show a safe denial state and must not retain protected data while the decision is unresolved.
- Keep mock identities, credentials, and payloads inside development fixtures and tests. Do not add environment labels or demo disclaimers to product surfaces unless the user needs that information to make a decision.

## UI and interaction conventions

- Use the existing semantic tokens in `app/globals.css`, shadcn primitives, and CVA variants. Avoid one-off color literals and duplicated component behavior.
- Use `@phosphor-icons/react` with the `*Icon` exports, such as `WarningIcon`; do not use Lucide React or deprecated Phosphor aliases.
- Keep the visual language premium, quiet, and clinical: clear hierarchy, restrained motion, meaningful whitespace, and direct copy. Avoid generic AI imagery, decorative noise, or icons that do not communicate a real action or state.
- Every meaningful state needs readable text and an accessible relationship, not color alone. Cover loading, empty, denied, unavailable, expired, and integrity-unknown states where a feature can reach them.
- Preserve keyboard access, visible focus, programmatic labels, and safe dialog behavior. Do not animate protected content into view before the authorized response is available.

## Testing conventions

- Vitest runs in Browser Mode. Use `render` from `vitest-browser-react`, `page` and `userEvent` from `vitest/browser`, and `expect.element()` assertions. Do not reintroduce Testing Library or `jest-dom` dependencies.
- Colocated tests should prove behavior at the feature boundary: contract success, safe failure, state transitions, and meaningful UI outcomes. Prefer a few end-to-end scenarios over implementation-detail tests.
- Playwright tests belong only in `e2e/` and should exercise the real browser-to-route-handler path.
- When a test selector matches repeated text, scope it to the relevant landmark or use an accessible role/name. Avoid brittle CSS selectors unless the component has no semantic alternative.

## Decision log

These decisions are accepted unless the user explicitly changes them:

1. **Feature-first modules:** route files compose; feature folders own behavior and tests. This keeps product slices replaceable and prevents page files from becoming service containers.
2. **Contract-first transport:** Zod schemas, Axios, the Next mock route, and Axios Mock Adapter share the same contract seam. The real API is selected by environment configuration, not a component rewrite.
3. **Server state over global state:** React Query is the only default server-state boundary; React Hook Form handles forms; global client state is added only for a proven cross-route need.
4. **Server-derived authorization:** the client renders `SessionContext` and protected responses. UI selection, hidden controls, and route assumptions never authorize an action.
5. **Scoped chrome:** workspace navigation belongs to the workspace route group. The design-system page remains a development-only standalone component reference with no shared app shell, layout wrapper, or product navigation link.
6. **Colocated verification:** feature tests live beside their feature; Playwright remains separate because it needs a running server.
7. **Quality gates are repository conventions:** use Oxlint, Oxfmt, `tsgo`, Vitest Browser Mode, Playwright, and React Doctor before presenting a frontend change as complete.

## Required checks

From `frontend/`, run the checks appropriate to the change:

```bash
pnpm lint
pnpm format:check
pnpm typecheck       # runs tsgo --noEmit
pnpm test
pnpm doctor          # runs npx react-doctor@latest --verbose
CI=1 pnpm test:e2e
pnpm build
```

Read the relevant Next.js guide under `node_modules/next/dist/docs/` before using a Next API whose behavior may differ in Next 16. Keep generated Next guidance below intact.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
