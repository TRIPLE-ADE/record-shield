# RecordShield

RecordShield helps hospitals share the right patient information at the right time without losing control of access.

## The problem

Patient information is often split between hospital systems. Clinicians need useful context during care, patients need a say in routine sharing, and emergency access must be limited, explainable, and reviewable. Facilities without a full EMR also need a safe way to participate.

## The solution

RecordShield provides a contract-first clinical workspace that connects local records with authorized cross-hospital exchange. It keeps authorization on the server, uses patient consent for routine sharing, provides bounded emergency access, and records access decisions for security review. A lightweight local record path supports facilities without an integrated EMR.

The repository contains a Next.js frontend and a FastAPI backend.

## Features

- Role-aware sign-in and server-derived organization, shift, and permission context.
- Scoped patient directory with search, pagination, patient context, and local records.
- Local demographics, nursing notes, vitals, encounter selection, and correction workflows.
- Consent-based record requests, grants, expiry, revocation, and read-only remote records.
- Bounded emergency summaries, justified expansion, expiry, and security review.
- Patient portal notifications, consent decisions, access history, and emergency notices.
- Security event review, tamper-evident audit verification, administration, and downtime reconciliation.
- Contract validation, CSRF protection, idempotent mutations, Axios mock transport, Vitest Browser Mode, and Playwright coverage.

The current dataset is fictional and intended for development and evaluation. Production identity infrastructure and vendor adapters remain separate deployment responsibilities.

## Repository layout

```text
frontend/   Next.js application, feature modules, mock gateway, and browser tests
backend/    FastAPI application, database migrations, audit service, and mock EMR
docs/       API contract, OpenAPI document, and product architecture material
```

## Run locally

For the frontend mock workflow:

```bash
cd frontend
pnpm install
pnpm dev
```

Open <http://localhost:3000>. The frontend uses the mock transport when `NEXT_PUBLIC_API_URL` and `RECORDSHIELD_BACKEND_URL` are empty. See [frontend/README.md](frontend/README.md) for configuration and verification commands.

To run the FastAPI service and its seeded database, follow [backend/README.md](backend/README.md). The API contract is maintained in [docs/RecordShield_API_Contract.md](docs/RecordShield_API_Contract.md) and [docs/RecordShield_OpenAPI.json](docs/RecordShield_OpenAPI.json).

## Synthetic test accounts

Every account uses the password `synthetic-example-password`.

| Username | Context |
| --- | --- |
| `amina.unity` | Unity Medical emergency doctor; on shift and assigned to Musa in the Emergency Department |
| `grace.unity` | Unity Medical nurse; on shift and assigned to Musa in the Emergency Department |
| `kunle.mercy` | Mercy General visiting doctor; on shift and assigned to Musa on the Medical Ward |
| `john.mercy` | Mercy General clerk with an organization-wide administration assignment |
| `multi.staff` | Staff member with multiple memberships; login requires a valid `membership_id` |
| `musa.patient` | Patient portal account for the synthetic Musa record |
| `trust.operator` | Unity trust operator; can review the exchange audit stream |
| `sarah.unity` | Unity Medical security administrator; reviews the Unity audit stream and emergency sessions |
| `sarah.mercy` | Mercy General security administrator; reviews the Mercy audit stream and emergency sessions |

These accounts and their data are for local development and evaluation only. Seed the backend dataset before using backend-backed flows; account context, shifts, and assignments are loaded from the backend on each request.

## Verification

Frontend checks:

```bash
cd frontend
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test:browser
pnpm doctor
CI=1 pnpm test:e2e
```

Backend checks and service setup are documented in [backend/README.md](backend/README.md).
