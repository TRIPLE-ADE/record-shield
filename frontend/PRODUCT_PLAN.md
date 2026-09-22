# RecordShield frontend product plan

Status: active. This is the single frontend implementation plan, replacing the former UI implementation plan and frontend revamp handoff.

## Product and scope

RecordShield supports daily patient care and protects access within and between hospitals. Facilities with an EMR connect through an adapter; facilities without one use a lightweight EMR. Patients control routine sharing and see access history. Eligible clinicians have bounded emergency access. Security teams review allowed/denied access and tamper-evident evidence.

This work implements the frontend and synthetic mock API only. The existing Markdown API contract and OpenAPI in `../docs/` remain the interface authority. Keep the API client switchable through `NEXT_PUBLIC_API_URL`. Do not claim a production backend, verified real identities, regulatory readiness, or resilient offline exchange.

## Existing foundation to retain

- Individual sign-in, role-aware navigation, authorized patient search and directory.
- Local record categories, nursing notes, vitals and correction flow.
- Patient context and open visits; consent requests, read-only remote records, expiry/revocation.
- Emergency summary, justified expansion and outstanding review queue.
- Patient portal, notifications, acknowledgement and access history.
- Security review, administration and downtime reconciliation.
- Contract parsing, CSRF, idempotency, protected query cleanup, responsive layout and automated browser checks.

The remaining product work is workflow depth, not another cosmetic rewrite. Existing limitations include incomplete local clinical authoring, missing registration/visit lifecycle UI, technical administrative identifiers, and mock authorization based partly on organization-level synthetic fixtures.

## Build order and acceptance

### 1. Reliable patient care screen — completed

Use server-returned open visits for new clinical entries, never the visit attached to an old demographics record. Let staff choose the visit; show when no visit is available. Describe history separately from the visit receiving new entries. Distinguish the local lightweight EMR from a connected hospital system without showing implementation jargon. Protect unsaved notes when switching record category or visit. Retain drafts in memory only.

Acceptance: a note saves to the selected authorized visit; changing selection cannot silently discard a draft; a missing/unavailable visit blocks new entries; linked EMR records do not expose local authoring. Confirm existing care, consent and emergency journeys still pass.

### 2. Registration and visit lifecycle — next

Build patient lookup before registration, identity confirmation, duplicate handling, and start/resume/close visit workflows. Use human-readable authorized ward and staff choices. Separate registration from linking a cross-hospital identity; do not pretend demographic matching proves identity. Closing a visit must stop further writes against it.

API work: agree registration and duplicate-resolution semantics; expose authorized ward/staff choices and visit creation capabilities; add visit close with version conflict handling. Reuse existing encounter creation where applicable, fixing its single-patient assumptions. Document exact closed schemas before implementation.

Acceptance: reception can register or find a patient, clinical staff can begin/resume care, and another patient’s visit is rejected. Retry, duplicate and closed-visit behavior are tested.

### 3. Useful lightweight clinical documentation

Add structured visit summary, observations, clinician assessment, diagnoses, medication documentation and care notes only for supported roles. Group entries by visit with author, source, timestamps and correction history. Provide safe save/retry, pending audit feedback, validation, and navigation draft protection. Do not imply prescribing, dispensing or clinical decision support until explicitly scoped.

API work: role-specific writable categories/capabilities, paginated visit history, supported record payloads and correction rules. Existing nursing/vital forms remain usable while expanding.

Acceptance: a realistic outpatient or emergency documentation journey completes with provenance and no cross-facility editing. Wrong role, closed visit and concurrent correction fail safely.

### 4. Complete sharing and patient journeys

Make request purpose, requested records, receiving hospital, practitioner, duration and current status clear. Handle unavailable patient consent accounts, disconnected sources, multiple facilities, revoked/expired grants and identity-link problems. Show actionable notification destinations and history. Preserve bounded emergency disclosure and post-access accountability.

Acceptance: routine consent and emergency exceptions remain distinct; failed authorization never leaves remote records visible; portal lists cannot cross patient accounts.

### 5. Usable administration and stronger mock policy

Replace raw identifiers with authorized staff, ward and patient labels. Model actual shifts, care/ward/task assignments and hospital emergency policy in the mock; check context on every protected operation. Add clear suspension, review, resolution and integrity-unknown states. Explain a denial without revealing protected data.

API work: authorized reference collections, capability metadata, contextual policy rules and versioned updates. No frontend flag grants permission.

Acceptance: changing a staff member’s assignment, shift or suspension changes the next request. Reviewers can understand and resolve an alert without inspecting IDs or raw objects.

### 6. Release hardening and backend handoff

Review mobile and keyboard workflows, contrast, loading/empty/error states, retry/idempotency, stale data, pagination, logout/session expiry, unsaved changes and double submission. Audit copy and sample-account exposure. Produce one backend contract delta summary here, without creating another competing plan.

Acceptance: lint, formatting, TypeScript, focused contract/component tests, full browser journeys against a fresh production build and reviewed React Doctor findings. Verify the real API separately when it is available; a URL switch alone is not integration acceptance.

## Delivery rules

Implement and verify one complete workflow at a time. Update this file with actual completion and remaining work. Maintain the thin routes → feature components → hooks → API functions → closed contracts boundary. Keep fixtures in the mock service, clinical data out of URLs/storage/logs, and remote records read-only. Avoid new libraries unless the existing components cannot meet the need.

## Progress

- Planning consolidated; former planning documents removed at the user’s request.
- Milestone 1 completed: current visits come from the patient-context API; new notes/vitals use the selected open visit, rather than the demographics record’s visit. A lost selection cannot silently fall back to another visit.
- Added local-versus-connected documentation guidance, separate history wording, visit loading/failure/empty states, and explicit retry.
- Unsaved category/visit switches offer Keep editing or Discard draft. Saving locks editing and visit/category controls. Browser reload/close warns while a draft exists; full internal route-navigation protection remains in milestones 3/6. Drafts are not persisted.
- No additional API contract change was required for this milestone; it uses the existing patient-context and record-write contracts.
- Verified: lint, formatting, TypeScript, 55 component/API tests, all 14 Playwright journeys and fresh production build. React Doctor 92/100; three existing screen-complexity warnings reviewed, no suppressions.
- Next implementation milestone: registration and start/resume/close visit flows, with authorized ward/staff choices and contract-first API additions.

## Public product introduction

Added a public homepage at `/` with the two deployment paths, everyday care, patient consent, emergency safeguards, FAQs and links to the existing sign-in flow. The preview uses fictional data and is identified as such; no customer, compliance, pricing or deployment claims are invented. No API change required.

Landing-page verification: visually reviewed the desktop preview; all 15 browser journeys passed, including mobile layout, FAQ disclosure and sign-in navigation, against a fresh production build. Lint, formatting and TypeScript passed. React Doctor remains 92/100 with no new findings.

## Live backend integration

Updated 22 September 2026 against the deployed [OpenAPI specification](https://34-237-67-194.sslip.io/openapi.json) and the backend source in this repository. The deployed schema contains 32 paths / 36 operations; one operation is the internal infrastructure probe and is intentionally excluded from the frontend gateway. This section supersedes earlier statements that all mock-backed workflows are available live.

### Connection and compatibility

- The browser uses `/api/v1`; the Next server forwards to `https://34-237-67-194.sslip.io/api/v1`. Configure both values from `.env.example` on the deployment platform and rebuild. The local `.env.local` is configured but intentionally untracked.
- Session/pre-auth cookies remain HttpOnly, same-origin and SameSite=Strict. They are Secure when the frontend URL is HTTPS; local HTTP development omits Secure. Upstream cookie domains are removed. CSRF, idempotency and version headers are preserved; only the two authentication cookies are forwarded.
- Only documented product routes are forwarded. No `/demo/*` or internal infrastructure probe reaches the backend. Unknown routes return an explicit unavailable response. Network failures and backend denials never return mock successes. Responses are not cached, redirects are rejected, and network requests have a timeout.
- The live session omits `security_stream_id`. The gateway temporarily derives this resource address using the backend's UUIDv5 algorithm from the returned organization and security role. The backend still authorizes stream access. **Backend request:** return nullable `security_stream_id` from login and `/me`, so the frontend does not depend on the stream-ID algorithm.
- The emergency expansion response omits `view`. The gateway adds `view: "expanded"` only for that successful response. **Backend request:** add this discriminator to the documented response. Existing strict frontend response validation remains in place.

### Available endpoint coverage

Paths below are relative to `/api/v1`. “Connected” describes transport/UI wiring; it does not mean every mutation has been executed on the deployed service.

| Feature           | Available operations                                                                                                                                                                                      | Current frontend behavior                                                                                                                                      |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Session           | GET `/auth/csrf`, POST `/auth/login`, GET `/me`, POST `/auth/logout`                                                                                                                                      | Connected through same-origin cookies and CSRF.                                                                                                                |
| Patient directory | GET `/patients`                                                                                                                                                                                           | Uses live authorized search and pagination. No fixture substitution.                                                                                           |
| Local history     | GET `/patients/{id}/records/{domain}`                                                                                                                                                                     | Connected, including honest empty/error states.                                                                                                                |
| Clinical writes   | POST `/encounters`, POST `/patients/{id}/records/{domain}`, PATCH `/records/{id}`                                                                                                                         | Gateway supports these operations; creating entries is blocked without verified visit context. The visit-opening product flow remains a planned milestone.     |
| Sharing           | GET `/exchange/patients/{id}/sources`, GET/POST `/consent/requests`, POST `/consent/requests/{id}/approve`, `/deny`, `/cancel`, POST `/consent/grants/{id}/revoke`, GET `/exchange/patients/{id}/records` | Existing requests, patient decisions and approved record reads connected. New requests/source discovery require verified receiving visits.                     |
| Patient portal    | GET `/portal`                                                                                                                                                                                             | Uses returned requests, grants, history, emergency notices and notifications. Mark-read is unavailable.                                                        |
| Emergency         | POST `/emergency/sessions`, GET `/emergency/sessions/{id}`, GET `/emergency/sessions/{id}/records`, POST `/emergency/sessions/{id}/expand`, `/justify`, `/revoke`                                         | Transport connected; starting new emergency access requires missing visit context. A resumable practitioner emergency list also requires the missing worklist. |
| Security          | GET `/security/events`, GET `/security/alerts`, POST `/security/alerts/{id}/review`, POST `/security/chains/{id}/verify`                                                                                  | Connected with backend-scoped stream identifiers and existing review forms.                                                                                    |
| Administration    | GET/POST `/admin/context-assignments`, GET/PATCH `/admin/hospital-policy`, POST `/admin/suspensions`                                                                                                      | Existing forms connected. User-friendly staff/ward reference collections are still future API work.                                                            |
| Downtime          | POST `/downtime/reconciliations`                                                                                                                                                                          | Existing form connected. Browser connectivity does not prove source/consent/audit health; unverified dependencies say “Not verified”.                          |
| Health            | GET `/health`                                                                                                                                                                                             | Gateway forwards basic service health; this is not a dependency-health contract.                                                                               |

### Missing endpoints and required behavior

| Missing endpoint                       | Product impact                                                                                                                                                                            | Required contract                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET `/patients/{id}/context`           | Blocks selecting verified open visits, new clinical entries, new sharing requests and new emergency sessions. Historical demographic entries cannot establish that a visit is still open. | Return the existing frontend PatientContext shape: minimal authorized patient identity, current encounters and server-derived `can_request_records` / `can_activate_emergency` capabilities. Scope by current staff assignment, organization, shift and patient; return safe denial for unauthorized callers. See `lib/api/contracts/patients.ts`. |
| GET `/worklist`                        | Home can show existing consent requests, but cannot show a complete emergency justification/resume queue.                                                                                 | Implement the existing worklist schema with authorized request/emergency references, expiry and due-state data. See `lib/api/contracts/worklist.ts`. Until available, Home uses GET `/consent/requests`.                                                                                                                                           |
| POST `/portal/notifications/{id}/read` | Notifications display, but cannot be marked read.                                                                                                                                         | Patient-owned, cookie/CSRF-protected acknowledgement, existing idempotency and notification response contract; invalidate/refetch portal on success. See `features/exchange/api/index.ts` and `lib/api/contracts/exchange.ts`. The UI hides the unsupported action.                                                                                |

These three endpoints already exist in the frontend mock contract but are absent from the deployed OpenAPI. Enable the matching flags in `lib/api/capabilities.ts` only after backend implementation and contract verification. Patient registration, visit closing and staff/ward reference collections are future product milestones; they should not be confused with regressions in this integration. The `/demo/*` controls are deliberately mock-only.

### Verification and deployment limits

Live API checks have confirmed health, synthetic staff login, patient directory and local demographics/request reads. The tested staff directory returned one patient and that patient's demographics collection was empty; the frontend must not imply that missing records exist. Live browser checks passed for clinician sign-in/directory/records, patient portal, security event/alert reads and sign-out. Live checks avoid clinical, consent, emergency, policy and suspension mutations; those require a coordinated synthetic-data acceptance run before hospital deployment. Backend authorization and persistence readiness remain backend responsibilities, not properties established by a frontend build.

Verification: 55 Vitest component/API tests, 7 gateway tests and all 15 isolated mock browser journeys pass. The three opt-in live browser journeys pass. Lint, formatting, TypeScript and the production build with live configuration pass. React Doctor scores 92/100 with four screen-complexity warnings (three existing, one in the Home capability branch); no correctness or accessibility diagnostics were reported. These maintainability warnings do not change backend acceptance requirements.
