# RecordShield Frontend UI Implementation Plan

Status: Gate 1 implemented; Gate 2 pending

This plan turns the RecordShield product and architecture specification into a frontend build sequence. It is deliberately written for the current Next.js app, which will use a contract-faithful mock API until the real services are available.

## 1. Authority and boundaries

There are three different kinds of input:

1. **Current user request** - create a frontend UI implementation plan that starts with the design system, uses a mock API for now, follows the documented API contract, works through complete user journeys, and proves quality with behavior-focused tests.
2. **Product source** - the attached `RecordShield_PRD_and_Architecture.pdf` is the source of product requirements, security invariants, API routes, two-hospital demo, and acceptance criteria. Its backend architecture is a product boundary for the future implementation; it is not an instruction to add FastAPI or PostgreSQL to this Next.js frontend task.
3. **Current repository** - Next.js App Router, TypeScript, Tailwind v4, shadcn/ui Radix Nova primitives, React Query, Axios, Zod, Axios Mock Adapter, Vitest Browser Mode, and Playwright are already installed. Route files in `app/` re-export feature modules, and feature tests are colocated with the implementation.

The frontend must preserve the specification's hard boundaries:

- All data is synthetic and visibly labeled as demonstration data.
- The client never treats a role, hospital, ward, shift, patient link, grant, or emergency flag supplied by the browser as authoritative.
- The UI renders the server decision; it does not turn a hidden button into an authorization control.
- The mock API uses the same `/api/v1` paths, status codes, response shapes, headers, expiry rules, and safe error behavior as the future service.
- No remote clinical payload is persisted in localStorage, URLs, general logs, audit bodies, or React Query persistence.
- Existing EMR data is read through a source adapter. Unity Lite data is local to Unity. Remote exchange is read-only.

## 2. Product outcome for the frontend

The finished prototype should let a reviewer observe, through real browser interactions and the network boundary:

1. A staff member logs in with an individual synthetic account and sees the current hospital, role, ward, shift, and mode.
2. Mercy General presents an existing mock EMR source; Unity Medical presents RecordShield Lite EMR. The workspaces use separate data and visibly identify their source mode.
3. A clinician opens a known local encounter and reads only records allowed by current role, assignment, ward, purpose, sensitivity, and source policy.
4. A Unity clinician requests selected Mercy domains. The patient portal shows the named practitioner, source, recipient, purpose, exact domains, read-only scope, and duration.
5. The patient approves a subset, and the clinician sees source-attributed remote records only after the grant is active.
6. Revocation, expiry, assignment changes, shift changes, source outages, and audit outages change the visible UI and the next server response.
7. An eligible clinician can open a time-limited Emergency Health Summary, see the countdown and review obligation, and request a separately justified Level 2 expansion.
8. A security user can review alerts, inspect metadata-only events, verify each audit stream, and see an integrity failure after a copied chain is tampered with.
9. A downtime form can be reconciled once with both the original occurrence time and later recording time.

The demo is successful when these decisions and evidence are visible. A page that merely renders is not a completion criterion.

## 3. Information architecture

The App Router remains a thin route composition layer. Feature modules own page behavior, API calls, view models, and colocated browser tests.

```text
app/
  page.tsx                              # re-export only
  design-system/page.tsx                # re-export features/design-system
  (auth)/login/page.tsx                 # re-export features/auth
  (workspace)/workspace/page.tsx        # re-export features/workspace
  (workspace)/patients/[id]/page.tsx    # re-export features/patient-records
  (workspace)/patients/[id]/exchange/page.tsx
  (portal)/portal/page.tsx              # re-export features/portal
  (security)/security/page.tsx          # re-export features/security
  (admin)/admin/page.tsx                # re-export features/admin
  api/v1/[...path]/route.ts             # mock transport only, demo mode

features/
  design-system/
  auth/
  workspace/
  patient-records/
  exchange/
  consent/
  emergency/
  portal/
  security/
  admin/
  downtime/

components/
  theme-provider.tsx
  ui/                                   # shadcn primitives only

lib/
  api/
  mock-api/
  query/
  formatters/
  security/

e2e/                                    # Playwright only
```

Each feature follows the same shape:

```text
features/<feature>/
  index.tsx                              # route-level composition
  components/
  api.ts                                 # query and mutation functions
  schemas.ts                             # Zod request/response schemas
  view-models.ts                         # server data to display model
  index.test.tsx                         # colocated Vitest Browser Mode tests
```

`components/ui` stays limited to generated or lightly customized shadcn primitives. Product-specific pieces belong in the owning feature so their behavior and tests stay together.

The design-system route is one self-contained reference page. It does not depend on an app shell, a route layout, or an API response. Protected workspace chrome is owned by the workspace route group.

While the design-system review is in progress, `app/page.tsx` renders the small home placeholder from `features/home/index.tsx`. The visual preview at `/design-system` is static by design and does not require an API contract or mock response.

## 4. Gate 0: design system before product features

No product feature work starts until this gate is reviewed in the browser. The existing Radix Nova shadcn foundation is the starting point, not the finished design system.

### 4.1 Foundations

Define semantic tokens in `app/globals.css` for:

- background, foreground, card, popover, primary, secondary, muted, accent, border, input, ring, destructive;
- success, warning, info, and emergency states with light and dark values;
- clinical sensitivity labels: standard, sensitive, restricted;
- alert severity: high and critical;
- typography, spacing, radius, focus ring, and density tokens.

Do not encode product meaning through color alone. Every state also gets readable text, an icon where useful, and an accessible status relationship.

### 4.2 Required composition components

Use the installed shadcn primitives to create and test these shared compositions:

- `WorkspaceHeader` - hospital mode, role, ward, shift countdown/status, and context refresh state;
- `PageHeader` - title, purpose, breadcrumbs, and primary action slot;
- `StatusBadge` - authorization, grant, emergency, alert, and integrity states;
- `DataState` - loading, empty, denied, unavailable, expired, and integrity-unknown variants;
- `SourceProvenance` - source hospital, local record ID, source version, observed time, and retrieved time;
- `SensitivityBadge` - standard/sensitive/restricted without revealing protected content;
- `ClinicalRecordCard` - domain heading, safe projection, timestamps, source, and version;
- `ScopeSelector` - domain checkboxes with restricted-domain dependency explanation;
- `ExpiryTimer` - server-derived expiry, refresh state, and expired treatment;
- `EmergencyBanner` - patient, source, scope, expiry, justification deadline, and review obligation;
- `AuditTimeline` - correlation ID, event type, decision, reason code, stream, and timestamp;
- `IntegrityIndicator` - valid, invalid, unknown, last checked, and first failing sequence;
- `AlertReviewPanel` - severity, rule, actor, organization, evidence reference, status, and reviewer action;
- `ConfirmDisclosureDialog` - plain-language irreversible-disclosure warning for consent and expansion actions.

### 4.3 Design-system exit criteria

- Keyboard navigation works for dialogs, menus, selects, tabs, and scope selection.
- Every form control has a programmatic label and validation message.
- Focus is visible and not removed by overlays or loading states.
- Status text remains understandable without color or animation.
- Loading and error states do not briefly render protected data before authorization completes.
- Remote data is not animated into view until the authorized response is available.
- Browser-mode tests cover each shared composition's primary state and one failure state.
- A demo-only design-system review surface can be enabled during development and is unavailable outside demo mode.

## 5. Mock API and contract layer

The mock is a temporary implementation of the future HTTP contract. Components must never import fixture objects or call Axios directly.

### 5.1 Transport design

Use two complementary seams:

1. **Next route handler** - `app/api/v1/[...path]/route.ts` dispatches real HTTP requests to a deterministic in-memory mock store in demo mode. This gives Playwright a complete browser-to-HTTP path.
2. **Axios Mock Adapter** - feature tests install the same route handlers against the shared Axios instance for fast browser-mode tests of success, denial, expiry, race, and outage states. It must use the same schemas and store transitions as the route handler rather than a second set of ad hoc responses.

The real API base URL remains configurable through the Axios client. Switching from mock to the future service must not change feature components or query hooks.

```text
feature component
  -> React Query hook
    -> feature api function
      -> lib/api/client.ts
        -> /api/v1 (mock route now, real service later)
```

### 5.2 Contract models

Create Zod schemas and inferred TypeScript types for:

- `User`, `Organization`, `Membership`, `Shift`, `Ward`, `CareAssignment`, and safe `Context`;
- `PatientIdentity`, `PatientLink`, `LocalPatient`, and privacy-safe source metadata;
- `ClinicalRecord`, domain, sensitivity, restricted tags, provenance, version, and typed payloads;
- `ConsentRequest`, `ConsentGrant`, status transitions, duration, and exact actor/source/recipient binding;
- `BreakGlassSession`, summary, expansion, justification, expiry, and review status;
- `ExchangeTransaction`, correlation ID, completeness notice, and source availability;
- `SecurityAlert`, `AuditEventMetadata`, `AuditVerification`, and `Notification`;
- `ApiError`, safe reason codes, collection envelopes, cursors, and mutation receipts.

Unknown keys must fail validation. Clinical payloads must never be accepted as arbitrary `Record<string, unknown>` values. Do not expose vendor-specific Mercy fields outside the adapter normalization boundary.

### 5.3 Axios client rules

`lib/api/client.ts` owns:

- same-origin credentials and CSRF handling for mutations;
- `Idempotency-Key` on every POST action;
- `If-Match` on corrections and versioned state changes;
- `Cache-Control: no-store` for remote clinical reads;
- response schema validation before data reaches React Query;
- conversion of HTTP errors into a stable `ApiError` with `code`, safe `message`, and `correlation_id`;
- cancellation on route change, logout, expiry, and revalidation;
- no clinical payload logging.

The client maps statuses exactly as specified:

| HTTP | UI meaning                                              | Required behavior                                                               |
| ---- | ------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 401  | Authentication required                                 | Clear protected data and route to login.                                        |
| 403  | Known context or policy denial                          | Show safe reason text; do not reveal hidden record counts or content.           |
| 404  | Unknown or unauthorized identity                        | Use privacy-safe not-found state.                                               |
| 409  | Version/idempotency conflict                            | Preserve current data and ask the user to reload/review.                        |
| 422  | Invalid request                                         | Show field-level validation without retrying.                                   |
| 429  | Throttled                                               | Show retry timing without repeating automatically.                              |
| 503  | Source, consent, audit, or required service unavailable | Show the named dependency as unavailable and never use stale clinical fallback. |

### 5.4 React Query policy

Create one `QueryClient` in the client provider. Query keys use stable IDs and scopes, for example:

```text
['me']
['patient', patientId]
['local-records', patientId, domain, cursor]
['sources', patientId]
['portal']
['consent-request', requestId]
['remote-records', patientId, sourceId, grantId, domains]
['emergency-session', sessionId]
['security-alerts', filters]
['security-events', filters]
['audit-chain', streamId]
```

Remote clinical queries are memory-only, `no-store`, revalidated on window focus and every five seconds while visible, and cleared on logout, expiry, revocation, failed final authorization, or lost connectivity. Do not enable persisted queries, browser storage, or offline cache for clinical payloads.

Mutations invalidate only the affected metadata queries and refetch the protected clinical query after the server confirms the new authorization state. A mutation retry reuses its idempotency key and never invents a second grant, encounter, session, or record.

### 5.5 Deterministic mock state

The mock store seeds the exact two-hospital fixture from the specification:

- Mercy General: source-specific mock EMR, local patient `PAT-00291`.
- Unity Medical: Lite EMR, local patient `HSP-99210`.
- Musa Ibrahim: one verified RecordShield Health ID mapped to both local IDs.
- A similar-name patient with a different Health ID and no link.
- Amina, Grace, Kunle, John, Musa, Sarah, and the synthetic trust operator in separate sessions.
- Recent and old investigations, ordinary allergies and medication, restricted HIV/mental-health/genetic records, and one restricted medication.
- Separate Unity clinical records, including a deliberately different observation for provenance comparison.

The store also exposes test-only clock advancement, source disconnect, audit outage, membership suspension, shift ending, grant revocation, and copied-chain tampering. These controls are disabled outside demo mode and do not appear as ordinary production controls.

## 6. Feature implementation sequence

### Gate 1 - Authentication and context

Status: implemented in the current frontend; the routes and mock transport below are live and covered by colocated browser tests plus Playwright flows.

Build:

- Login screen with seeded identity choices that still perform a real login mutation.
- Session loading, logout, inactivity/absolute expiry handling, and safe generic login failures.
- `WorkspaceHeader` fed by `GET /me` rather than a client-selected role.
- Hospital switch only by logging out and logging into the other seeded session; no role picker that changes permissions.

Routes and contracts:

- `GET /api/v1/auth/csrf`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `GET /api/v1/me`

Quality gate:

- A session cannot access protected UI or API data before `GET /me` succeeds.
- Logout clears all clinical query data.
- A suspended membership changes the next request to a safe denial without requiring a new login.

### Gate 2 - Local workspace and records

Build:

- Hospital workspace with Mercy/Unity mode label.
- Exact known-patient discovery from a current local encounter; no fuzzy or global name search.
- Patient overview with safe demographics, local administrative context, local records, and source provenance.
- Domain tabs/cards for demographics, administration, billing, history, vitals, diagnoses, medications, allergies, investigations, nursing notes, medication administration, physiotherapy notes, and restricted domains where authorized.
- Local record creation for Unity encounters, vitals, and notes; correction UI with version and correction reason.
- Safe empty, denied, unavailable, stale, and partial-completeness states.

Routes and contracts:

- `POST /api/v1/encounters`
- `GET /api/v1/patients/{id}/records/{domain}`
- `POST /api/v1/patients/{id}/records/{domain}`
- `PATCH /api/v1/records/{id}`

Quality gate:

- Grace can read/write permitted Unity nursing data but cannot create physician notes.
- John can read allowed Mercy demographics/billing but receives no clinical payload, counts, or hidden HTML for clinical requests.
- A stale `If-Match` correction shows a conflict and creates no duplicate version.

### Gate 3 - Exchange discovery, consent, and portal

Build:

- Source discovery panel showing only verified linked facilities after local eligibility checks.
- Cross-hospital request form bound to patient, source, recipient hospital, named practitioner, receiving encounter, purpose, selected domains, and reason.
- Patient portal with connected facilities, pending requests, domain checkboxes initially empty, duration options of one hour/24 hours/seven days, active grants, revoke action, access history, and durable notifications.
- Remote read panel with source, local/source record IDs, source version, observed/retrieved times, completeness notice, and read-only label.
- Revalidation behavior that clears remote panels after revocation or expiry.
- Restricted-domain dependency explanation; selecting medications or investigations never silently selects HIV, mental health, genetic, or other restricted content.

Routes and contracts:

- `GET /api/v1/exchange/patients/{id}/sources`
- `POST /api/v1/consent/requests`
- `GET /api/v1/consent/requests`
- `POST /api/v1/consent/requests/{id}/approve`
- `POST /api/v1/consent/requests/{id}/deny`
- `POST /api/v1/consent/requests/{id}/cancel`
- `POST /api/v1/consent/grants/{id}/revoke`
- `GET /api/v1/exchange/patients/{id}/records`
- `GET /api/v1/portal`

Quality gate:

- Musa can approve only a subset for one named practitioner and duration.
- A second practitioner, another patient, or staff account cannot approve/revoke by guessing an ID.
- A grant never broadens when role or source policy changes.
- Revoke-before-release discards the remote payload and leaves the prior disclosure evidence visible.
- Unity cannot write to Mercy or reach the private Mercy adapter directly.

### Gate 4 - Emergency progressive disclosure

Build:

- Emergency activation control available only to server-approved eligible memberships.
- Activation dialog with exact known patient, source, emergency reason code, receiving encounter, and explicit emergency-treatment context.
- Level 1 summary view containing only summary-eligible identity, blood group, allergies, active medications, critical conditions, major diagnoses/procedures, and relevant recent investigations.
- Emergency banner with source, scope, 15-minute expiry, countdown, review obligation, and clear statement that absence is not proof of absence.
- Level 2 expansion dialog requiring exact domains and a 20-1000 character necessity narrative before disclosure.
- Justification submission, overdue state, patient notification, security review state, and admin revocation.
- No full-record button, wildcard domain, billing/administration expansion, or hidden bearer bypass.

Routes and contracts:

- `POST /api/v1/emergency/sessions`
- `GET /api/v1/emergency/sessions/{id}`
- `GET /api/v1/emergency/sessions/{id}/records`
- `POST /api/v1/emergency/sessions/{id}/expand`
- `POST /api/v1/emergency/sessions/{id}/justify`
- `POST /api/v1/emergency/sessions/{id}/revoke`

Quality gate:

- Amina receives a bounded Level 1 summary without a second administrator approval.
- John or a disabled membership receives no summary and no sensitive existence disclosure.
- Amina cannot expand without narrative or beyond the source policy.
- Missing narrative blocks expansion after five minutes but does not extend the original summary expiry.
- Expiry/revocation immediately clears the next protected read and remote panel.

### Gate 5 - Security, audit, and administration

Build:

- Security dashboard with safe metadata filters for events and alerts.
- Alert queue with deterministic rule, severity, actor, organization, pseudonymous patient reference, time, status, reviewer, and explanation.
- Separate Mercy, Unity, and exchange stream views with correlation IDs and sequence heads.
- Audit verification action showing valid/invalid/unknown, checked range, first failing sequence, reason, checkpoint comparison, and persistent critical state.
- Review workflow that prevents the initiating practitioner from reviewing their own event and never deletes the original alert.
- Local admin context assignment, hospital emergency-policy configuration, membership suspension, and trust-operator organization suspension screens.
- Demo-only checkpoint export/tamper verification surface that operates on a copied chain.

Routes and contracts:

- `GET /api/v1/security/events`
- `GET /api/v1/security/alerts`
- `POST /api/v1/security/alerts/{id}/review`
- `POST /api/v1/security/chains/{id}/verify`
- `POST /api/v1/admin/context-assignments`
- `GET /api/v1/admin/context-assignments`
- `PATCH /api/v1/admin/hospital-policy`
- `GET /api/v1/admin/hospital-policy`
- `POST /api/v1/admin/suspensions`

Quality gate:

- The dashboard never renders clinical payloads or raw justifications.
- Fifth denial in the rolling five-minute window creates one HIGH alert even if an audit retry occurs.
- Hash, sequence, reorder, and checkpoint failures produce a persistent CRITICAL state.
- Sarah cannot browse clinical records merely because she can administer security settings.

### Gate 6 - Downtime and demo hardening

Build:

- Downtime status and source/audit dependency banners.
- Serialized paper-form metadata entry and one-time reconciliation workflow.
- Explicit source-offline, consent-service-offline, audit-unavailable, malformed-source, and unresolved-transaction states.
- Demo reset and fault controls gated by demo mode, with a run ID and fresh seed.
- A rehearsal surface that guides the fifteen-step two-hospital demonstration without exposing test controls in normal workspaces.

Route and contract:

- `POST /api/v1/downtime/reconciliations`

Quality gate:

- Offline remote retrieval is unavailable, never silently served from a stale cache.
- Audit-unavailable blocks protected reads and emergency release; a committed local write can show saved/audit-pending.
- Reconciliation preserves original `occurred_at`, later `recorded_at`, form serial, reviewer, and duplicate protection.
- A fresh seed reproduces the same named actors and expected outcomes.

## 7. High-value user stories

1. As a synthetic staff member, I want to log in with my own account so that every action is attributable.
2. As a staff member, I want to see my current hospital, role, ward, and shift so that I understand the context being applied.
3. As a clinician, I want to open a known local patient encounter so that I can work within an active care relationship.
4. As an administrative clerk, I want to view permitted demographics and billing status so that I can complete local administrative work without seeing clinical data.
5. As a nurse, I want to record vitals and nursing notes so that my local clinical work is preserved in the Lite hospital.
6. As a clinician, I want remote source facilities listed only after eligibility checks so that discovery does not reveal restricted record existence.
7. As a Unity clinician, I want to request exact Mercy domains for a named purpose so that the patient can understand the disclosure.
8. As Musa, I want to approve a selected subset for a selected duration so that I control normal exchange scope.
9. As Musa, I want to deny or revoke a grant so that future access stops while prior access evidence remains.
10. As a receiving clinician, I want source-attributed remote records so that I can distinguish a source observation from a local assessment.
11. As a receiving clinician, I want incomplete or conflicting records presented separately so that the interface does not silently choose clinical truth.
12. As an eligible emergency clinician, I want an immediate bounded summary so that urgent care does not wait for a second approval workflow.
13. As an eligible emergency doctor, I want to request exact additional domains with a necessity narrative so that exceptional access is narrow and reviewable.
14. As a patient, I want emergency activation and expansion notifications so that exceptional access is visible to me.
15. As a security admin, I want to review deterministic alerts so that suspicious access has an accountable workflow.
16. As a security admin, I want to verify an audit stream so that tampering is visible without automatic repair.
17. As a local admin, I want context changes to take effect on the next request so that ended shifts and removed assignments cannot leave stale access.
18. As a trust operator, I want to suspend an organization so that subsequent normal and emergency exchange requests stop.
19. As an authorized operator, I want to reconcile a serialized downtime form once so that paper continuity becomes attributable metadata after recovery.
20. As a judge, I want the two hospitals to show different source systems and separate records so that the hybrid architecture is demonstrable.
21. As a tester, I want a reproducible seed and test clock so that expiry, revocation, and shift boundaries can be proven without waiting.
22. As a keyboard or assistive-technology user, I want labeled controls and readable status text so that the safety-critical workflow is usable without color or pointer input.

## 8. Quality strategy

The goal is evidence for the highest-risk behavior, not a large test count. Every test should state the user-visible or contract-level failure it protects.

### 8.1 Test layers

| Layer                 | What belongs there                                                         | Examples                                                                                                                           |
| --------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Pure contract/schema  | Stable transformations and invariants                                      | Zod parsing, safe error normalization, domain/sensitivity projection, query-key construction, duration/expiry formatting.          |
| Vitest Browser Mode   | Feature behavior with a shared Axios Mock Adapter and accessible locators  | Scope selection, restricted-domain explanation, denial states, timers, remote panel clearing, alert review form, integrity states. |
| Mock HTTP contract    | Request/response and state transitions at `/api/v1`                        | Status mapping, idempotency, `If-Match`, actor binding, privacy-safe 404, no clinical payload on deny, 503 dependency failures.    |
| Playwright E2E        | A few complete journeys through Next, browser, mock HTTP, and seeded state | Consent/revocation, emergency summary/expansion, security verification, fresh demo seed.                                           |
| Performance/rehearsal | Measured acceptance behavior                                               | Ten sessions/100 fixtures, p95 targets, alerts visible within five seconds, source timeout at five seconds.                        |

Do not duplicate every assertion in every layer. Keep security invariants at the mock HTTP seam and prove their observable user journeys in Playwright.

### 8.2 Test matrix mapped to product risk

| Risk                                  | Required evidence                                                   | Acceptance coverage   |
| ------------------------------------- | ------------------------------------------------------------------- | --------------------- |
| Context and tenant enforcement        | Direct mock HTTP request plus one UI denial                         | AC01-AC08, AC34       |
| Consent scope and races               | Approve subset, revoke before release, expiry, wrong actor          | AC09-AC12, AC29, AC33 |
| Emergency safety                      | Level 1, Level 2, overdue narrative, expiry, ineligible role        | AC13-AC17, AC28       |
| Source custody and read-only exchange | Source provenance, direct adapter denial, remote write rejection    | AC18-AC20, AC27       |
| Audit evidence                        | Correlated streams, no clinical payload in events, verifier failure | AC20-AC24             |
| Downtime continuity                   | Single reconciliation, duplicate form, occurred/recorded timestamps | AC26                  |
| Input and privacy                     | Unknown keys, XSS text, SQL-like IDs, no hidden unauthorized counts | AC06, AC31            |
| Repeatability                         | Fresh seed and full demonstration script                            | AC30                  |
| Performance                           | Measured report, not an unverified claim                            | AC32                  |

### 8.3 Browser-mode test conventions

- Tests live beside the feature: `features/<feature>/*.test.tsx`.
- Use `render` from `vitest-browser-react`, locators from `vitest/browser`, and `expect.element` assertions.
- Prefer role, label, and text locators that reflect the accessible UI.
- Install a fresh mock store per test or reset through a test-only store fixture; do not depend on test order.
- Assert absence of protected content in the DOM and response body, not just visual hiding.
- Exercise pending, success, denial, unavailable, expired, and conflict states for every mutation that can affect clinical access.
- Use a fake clock for expiry and a deterministic polling control for alerts/notifications.
- Avoid snapshots for clinical data and security state; assert the meaningful fields and transitions.

### 8.4 Playwright journeys

Keep E2E in `e2e/` and use separate browser contexts for Amina, Musa, John, Kunle, Grace, and Sarah.

1. **Normal exchange journey** - Amina requests allergies/medications, Musa approves a subset, Amina reads provenance-labeled Mercy records, HIV and restricted medication remain absent, Musa revokes, and the panel clears on revalidation.
2. **Emergency journey** - Amina activates unconscious-patient access, sees Level 1 summary and countdown, expands one exact restricted domain with a narrative, and Sarah reviews the resulting alert while the patient notification appears.
3. **Security/evidence journey** - John is denied clinical access, the denial threshold creates an alert, the copied chain is tampered with, and Sarah sees the first failing sequence and persistent CRITICAL integrity state.
4. **Resilience journey** - Mercy is disconnected, remote access shows unavailable rather than empty, one Unity local write continues only when its local dependencies are available, and a serialized downtime form reconciles once.

## 9. Delivery order and working rules

Implement in this order:

1. Design tokens, shared compositions, accessibility checks, and demo-only design-system review.
2. Contract schemas, Axios client, error normalization, React Query provider, mock store, and mock HTTP dispatcher.
3. Authentication and trusted context.
4. Local workspace and record projections.
5. Exchange discovery, consent, patient portal, and remote read-only panels.
6. Emergency summary, expansion, justification, expiry, and notifications.
7. Security dashboard, alert review, audit verification, admin context, and suspension.
8. Downtime reconciliation, fault controls, demo rehearsal, performance evidence, and hardening.

Each gate must leave a runnable vertical slice and its tests. Do not build a large set of static screens and defer contract integration. Do not add more shadcn primitives simply to fill out a catalog; add one when a feature needs a real interaction.

## 10. Definition of done

The frontend implementation is ready for handoff when:

- the design-system gate has been reviewed and all shared safety states are reusable;
- every screen reads through the API/query layer and no feature imports fixture data directly;
- the mock transport implements every UI-used `/api/v1` route with the documented status and error semantics;
- all clinical remote panels are memory-only, source-attributed, revalidated, and cleared when authorization changes;
- route files remain thin re-exports into `features/`;
- feature tests are colocated and use Vitest Browser Mode; E2E remains only in `e2e/`;
- the high-risk matrix has meaningful tests at the highest public seam;
- direct API denial tests accompany UI evidence for tenant, role, assignment, sensitivity, consent, emergency, and read-only boundaries;
- the full two-hospital demo runs from a fresh seed without manual database edits;
- lint, format, typecheck, Browser Mode tests, contract tests, E2E tests, and the production build pass;
- any incomplete acceptance criterion is recorded explicitly instead of being implied complete by rendered pages.

## 11. Explicitly out of scope for this frontend milestone

- Real patient data, public registration, NIN/biometric identity, production practitioner verification, and automatic patient matching.
- Real EMR, FHIR conformance, SMART authorization, laboratory/imaging integration, prescribing, billing workflows, payments, insurance, research, or mobile apps.
- Offline remote clinical cache, offline emergency tokens, remote write-back, automatic record merging, and clinical conflict adjudication.
- Guardian/proxy workflows, minors, deceased-patient exceptions, assisted consent, account recovery, and production retention/deletion policy.
- ML abuse detection, blockchain, WORM storage, independent audit custody, or a claim of regulatory certification.

These exclusions are part of the implementation contract. If the team later changes one, update this plan and the API/UX acceptance matrix before coding it.
