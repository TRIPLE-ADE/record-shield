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
