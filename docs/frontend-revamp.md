# Frontend revamp — implementation handoff

Scope: frontend and synthetic mock HTTP API only. The existing API client remains the integration boundary; `NEXT_PUBLIC_API_URL` selects the future backend.

## Delivered

- Role-aware Home page with assigned patients and own access requests; security roles receive relevant administrative actions.
- Desktop and mobile navigation, active-page indicators, compact patient lists, and a mobile record-category selector.
- Access-request inbox with patient names when returned by the authorised directory, loaded-request filters, pagination and links to the patient sharing flow. No fabricated totals or clinical summaries.
- Patient search through the API, applied before pagination. The list labels its displayed count as “shown”.
- Compact patient record header and clearer record-sharing steps, selectable approved access, visible expiry, and removal of records after failed consent-status refresh or loss of the selected approval.
- Patient sign-in routes directly to the portal. Sample accounts are inside a collapsed disclosure; sign-in fields start empty.
- Product copy uses Home, patient record, record categories, sharing permissions, and additional emergency records. Technical route and schema names are unchanged.
- Development-only rehearsal tools are separated from the paper-form recovery workflow.

## API handoff

The only new public request field is optional `search` on `GET /api/v1/patients`: at most 100 characters; trimmed, case-insensitive substring of name, health ID, or local patient ID; evaluated only within the existing authorised collection before pagination. Empty search means unfiltered authorised results. Cursors must bind actor, scope, normalized search and limit. Invalid, expired or mismatched cursors return 422. No hidden counts.

The Markdown contract and OpenAPI document define this extension. The mock implements opaque server-stored cursors with a five-minute lifetime. It also now implements the already documented cursor pagination on `GET /api/v1/consent/requests`; no endpoint or response schema was added for Home or the inbox. Request filters in the inbox explicitly apply to loaded requests.

Backend integration must preserve cookie/CSRF behaviour, strict response shapes, idempotency, per-request authorisation and cache clearing. Changing the API URL still requires integration verification; matching URLs alone is insufficient.

## Boundaries retained

- A general patient/encounter-context API, server-generated worklist, emergency-justification queue, notification acknowledgement, and account lifecycle were not added in this pass.
- Cross-hospital and emergency actions retain the existing session-linked patient eligibility rules. This pass does not broaden clinical access.
- No durable backend, real patient data, global search, offline clinical cache or regulatory-readiness claim is included.

## Verification

Validated after the final copy and mobile changes: lint, TypeScript, formatting, 50 Vitest browser/API tests, and all 13 Playwright journeys against a fresh production build. React Doctor: 93/100, with two non-blocking control-flow complexity warnings in the request list and directory result-state components. These components handle loading, failure, empty, filtering and pagination states; the warnings were reviewed without suppressing them.
