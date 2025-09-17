# Frontend Integration Fix Log

- Date: 2025-09-11 (Updated: 2025-09-14)
- Author: Codex CLI Assistant  
- Scope: Frontend integration with Evidence Service, OOP/microservice cleanup

## Latest Update: Evidence, AI, and Cases integrated ✅

### 2025-09-18
- Restored the evidence-service container mount for smart-contract artifacts by re-adding `./smart-contracts:/smart-contracts:ro` in `docker-compose.dev.yml` and recreating the service so the ABI lookup succeeds inside the container.
- Rebuilt/restarted `evidence-service` and verified the smart-contract artifacts are available via `ls /smart-contracts/artifacts/contracts`.
- Generated a fresh admin JWT (`node generate-token.js`) and used it to call `GET /api/v1/evidence/:id/verify?network=sepolia`, confirming `{ verified: true, onChain: true }` is returned.
- UI note: log out/in (or clear `auth_token`) before verifying so the frontend uses the fresh token; the “Failed to verify on blockchain” toast was caused by the missing ABI and expired JWT.
### 2025-09-17
- Fixed frontend login `ERR_EMPTY_RESPONSE` by wrapping all auth route handlers with centralized async error handling.
- Note: Webpack Dev Server websocket `ws://localhost:3000/ws` warnings are benign in dev; they do not affect app behavior.
- Fixed smart-contracts Docker build failure (ERESOLVE) by aligning back to the previously working baseline: Hardhat v2.26 with toolbox v5. Removed explicit duplicate plugin pins to avoid peer conflicts during Docker `npm install` without a lockfile.

Changes:
- `microservices/evidence-service/src/routes/AuthRouter.ts`
  - Wrapped `register`, `login`, `refresh`, `logout`, `me`, and `users` handlers with `ErrorHandler.asyncHandler`.
- `smart-contracts/package.json`
  - Kept `hardhat` on `^2.26.0` to match plugin peer ranges.
  - Retained `@nomicfoundation/hardhat-toolbox@5.0.0`; removed explicit `@nomicfoundation/hardhat-ethers` and `@nomicfoundation/hardhat-chai-matchers` duplicate pins.

Verification:
- Restart evidence-service or let nodemon reload.
- `POST http://localhost:3001/api/v1/auth/login` now returns JSON errors (e.g., invalid credentials) instead of closing the connection.
- CRA websocket warnings can be ignored; HMR still works. If noisy, ensure env: `WDS_SOCKET_HOST=localhost`, `WDS_SOCKET_PORT=3000`, `WDS_SOCKET_PROTOCOL=ws`.
- Rebuild contracts image: `docker compose -f docker-compose.dev.yml build smart-contracts`

### Service Status (September 15, 2025)
- **Evidence Service**: ✅ RUNNING on port 3001 (full app, no minimal server)
- **AI Analysis Service**: ✅ RUNNING on port 8001 (`/health` 200; added PyJWT)
- **Cases API**: ✅ Mounted at `/api/v1/cases` (MongoDB via Mongoose)
- **Databases**: ✅ PostgreSQL, MongoDB, Redis connected (retries resilient)
- **External**: ✅ IPFS, RabbitMQ connected; contracts optional in dev

### Issues Resolved
1. **Cookie-parser TS2307 Error**: Fixed by using Docker-based development (dependencies in container)
2. **Redis Connection**: Fixed by using `REDIS_URL` instead of host/port configuration  
3. **Service Startup Hanging**: Made resilient by starting server before connecting to external services
4. **ES Module `__dirname` Error**: Fixed with `fileURLToPath(import.meta.url)` solution
5. **TypeScript ES2022 Configuration**: Updated tsconfig.json target/module to ES2022 for top-level await
6. **Environment Variables**: Created secure .env with real encryption keys and admin credentials
7. **Docker Compose**: Removed deprecated version field and added env_file support

### Current Status
- ✅ Full app class stable (ESM issues resolved, graceful shutdown guarded)
- ✅ Auth routes live; admin seeded with secure passwordHash
- ✅ Frontend health queries stable; token-gated data queries post-login
- ✅ Cases list returns 200 (empty by default) from MongoDB

### Normal Development Warnings  
- **PostgreSQL timeout on first attempt**: Expected - service retries and connects successfully
- **Blockchain contract loading errors**: Expected - contracts not deployed in development environment
- **fs.Stats deprecation warning**: From dependency, harmless in development

## Summary
- Fixed backend route middleware duplication and import/export mismatches that prevented clean startup.
- Standardized frontend service base URLs and JWT handling to unblock authenticated calls.
 - Mounted missing routers (`AuthRouter`, `CaseRouter`) and fixed corrupted import.
- Added env-based configuration for CRA frontend and improved the token generator.
- Implemented service-to-service JWT for AI integration and replaced frontend upload placeholder with real API calls.

## Issues Observed
- evidence-service `initializeRoutes()` declared `authMiddleware` twice and wrapped the evidence router with `authenticate` while routes already authenticate — causing duplication and confusion.
- evidence-service exported a singleton instance from `app.ts`, but `src/index.ts` imported it with an ambiguous name, risking misuse.
- Frontend `authService` used a hardcoded JWT with mismatched claims (e.g., `userId`, `username`) relative to backend expectations (`id`, `email`, `role`, `organization`).
- Frontend services mixed env vars: `REACT_APP_API_URL` vs `REACT_APP_EVIDENCE_SERVICE_URL`.
- `generate-token.js` used a placeholder secret instead of `.env`'s `JWT_SECRET`.
- AI Analysis requests from evidence-service used a non-JWT opaque token; AI service expects a valid JWT signed with `JWT_SECRET`.
- `EvidenceUpload` page simulated progress and never called the backend upload endpoint.
- Some frontend direct AI endpoints (`apiService.ts`) don’t match AI service routes (`/api/v1/*`) and are currently unused.
 - Cases 404s were due to unmounted router; fixed by wiring `/api/v1/cases` in `app.ts`.

## Changes Made
- microservices/evidence-service/src/app.ts
  - Removed duplicate wrapper auth on `/api/v1/evidence`; router handles auth per-route.
  - Added `cookie-parser` to support token extraction from cookies in `AuthMiddleware`.
  - Mounted `AuthRouter` at `/api/v1/auth` and `CaseRouter` at `/api/v1/cases`.
  - Left other middleware intact; ensured error handler remains last.

- microservices/evidence-service/src/index.ts
  - Import default instance as `app` and start it directly for clarity.

- frontend/src/services/evidenceService.ts
  - Standardized to use `REACT_APP_EVIDENCE_SERVICE_URL` and removed double `/api/v1` concatenation.

- frontend/src/services/authService.ts
  - Replaced hardcoded token logic with:
    - Optional backend login via `REACT_APP_AUTH_LOGIN_URL` (POST with credentials returning `{ token, user }`).
    - Fallback to env-provided `REACT_APP_TEST_JWT` for local dev. Validates presence and stores in `localStorage`.
  - Ensures claims align with backend expectations (`id`, `email`, `role`, `organization`).

- frontend/src/services/apiService.ts
  - Unwraps Evidence Service health envelope: `getAIServiceHealth()` now returns `response.data.data` so Dashboard shows actual status.

- frontend/src/services/evidenceService.ts
  - Added `submitToBlockchain()` and `verifyOnBlockchain()` methods to integrate cross-chain features.
  - Confirmed AI health helper also unwraps `{ success, data }` envelope.

- frontend/src/pages/Dashboard.tsx
  - Reduced refetch frequency and disabled `refetchOnWindowFocus` to stop constant refresh/flicker.
  - Displays AI health as `aiHealth.status` after response unwrapping.
  - Uses `useAuth()` to enable queries only when token exists (prevents initial 401s).

- frontend/src/pages/EvidenceList.tsx
  - Implemented real list rendering with actions to Submit/Verify on blockchain (Sepolia default).
  - Uses `react-query` with `useMutation` and toasts for UX feedback.

- frontend/src/pages/EvidenceDetail.tsx
  - Implemented detail view with blockchain status and actions to Submit/Verify.

- microservices/evidence-service/src/services/AIAnalysisIntegrationService.ts
  - Now signs a short-lived JWT (5m) using `JWT_SECRET` for service-to-service auth, including `userId` claim expected by the AI service.

- microservices/evidence-service/generate-token.cjs
  - Replaced hardcoded secret and mismatched claims with `.env`-driven `JWT_SECRET` and claims aligned to `AuthMiddleware` (`id`, `email`, `role`, `organization`).

- frontend/src/pages/EvidenceUpload.tsx
  - Removed simulated upload placeholder. Now performs real multipart uploads to `/api/v1/evidence/upload` with per-file progress.

- microservices/evidence-service/src/controllers/EvidenceController.ts
  - Standardized error propagation: all handlers accept `NextFunction` and call `next(error)` instead of `throw error`.
  - Fixes empty responses when exceptions occurred inside async handlers.

- microservices/evidence-service/src/routes/EvidenceRouter.ts
  - Wrapped all controller handlers with centralized async error wrapper from `ErrorHandler.asyncHandler`.
  - Guarantees thrown async errors reach the JSON error middleware.

- docker-compose.dev.yml
  - Added `frontend` and `ai-analysis-service` services.
  - Set `IPFS_PROFILE=server` on the `ipfs` service to improve container health.
  - Evidence service now uses Docker hostnames for infra services (postgres/mongodb/redis/rabbitmq) to avoid localhost resolution inside containers.

## Fixes: AI Analysis Docker build on Debian trixie
- Issue: `libatlas-base-dev` not available on Debian trixie (python:3.13-slim base).
- Change: Replaced with `libopenblas-dev` + `libatlas3-base` and kept `gfortran`.
- File: `microservices/ai-analysis-service/Dockerfile`
- Command to rebuild: `docker compose -f docker-compose.dev.yml build ai-analysis-service`

- Chain of Custody (backend)
  - Enhanced model with signed, hashed events and chain linking (eventHash, previousEventHash, HMAC signature).
  - Added `CustodyUtils` for canonical hashing and verification.
  - Added creation, status updates, AI requested/added, and transfer custody to emit linked events.
  - New endpoint: `GET /api/v1/evidence/:id/custody/verify` to verify entire chain integrity.
  - Added optional fields to custody transfer: `location`, `purpose`, `method`, `packaging`.
  - Config: `COC_SIGNING_SECRET`, `COC_HASH_ALGO`.
  - Doc: `docs/COC_DESIGN.md` with standards references and test plan.

- Cases (backend + frontend)
  - Backend: `CaseModel`, `CaseService`, `CaseController`, `CaseRouter` with endpoints:
    - `POST /api/v1/cases`, `GET /api/v1/cases`, `GET /api/v1/cases/:id`, `POST /api/v1/cases/:id/evidence`
  - App wired route: `/api/v1/cases`
  - Frontend: `caseService.ts`, `CasesList.tsx`, `CaseDetail.tsx`, nav link added in `Layout.tsx`, routes in `App.tsx`.
  - Docs: `docs/CASES_API.md` created.

- generate-token.js
  - Reads `JWT_SECRET` from `.env` via `dotenv`.
  - Emits raw JWT (no prefix), with claims matching backend (`id`, `email`, `role`, `organization`).

- .env
  - Added CRA frontend vars:
    - `REACT_APP_EVIDENCE_SERVICE_URL=http://localhost:3001/api/v1`
    - `REACT_APP_AI_SERVICE_URL=http://localhost:8001`
    - `REACT_APP_AUTH_LOGIN_URL=` (optional)
    - `REACT_APP_TEST_JWT=` (optional)

## Commands Run
- Repo scan and file reads:
  - `Get-Content .cursor/rules/rule1.mdc`
  - `Get-Content frontend/package.json`
  - `Get-Content frontend/src/services/*.ts`
  - `Get-Content microservices/evidence-service/src/*.ts`
- Node version check: `node -v`
- Token generation attempt: `node generate-token.js` (failed due to missing `jsonwebtoken` at project root)
- Patched AI integration and upload page via Codex CLI apply_patch
 - Rebuilt AI service: `docker compose -f docker-compose.dev.yml build ai-analysis-service`
 - Restarted services as needed; used in-container curl/fetch for verification

## What Worked
- Removing duplicate route authentication and standardizing imports resolved backend routing setup.
- Aligning frontend env variables and JWT handling unblocks authenticated API calls against `/api/v1/evidence/*`.

## What Didn’t
- Token generation at the repository root failed because `jsonwebtoken` is not installed at the root. Either install it at root for the script or run a one-off token generator elsewhere.

## Next Steps (Recommended)
- Authentication Service:
  - Introduce a dedicated `auth-service` microservice or add an `AuthRouter` in evidence-service temporarily with proper user storage and password hashing.
  - Standardize JWT claims to include `sub` (subject) while keeping `email`, `role`, and `organization`. Update `AuthMiddleware` and docs accordingly.
- Frontend
  - Switch to real login flow by setting `REACT_APP_AUTH_LOGIN_URL` and removing the test token fallback in production builds.
- CI/CD & Validation
  - Add type-check and lint steps for both frontend and evidence-service in CI.
- Documentation
  - Update `API_DOCUMENTATION.md` to include authentication endpoints once implemented.
  - Add a frontend Deployment/Ingress manifest and set `REACT_APP_*` envs via ConfigMap for Kind.
  - Optionally remove unused direct AI calls from `frontend/src/services/apiService.ts` or align them to `/api/v1/*` to avoid confusion.

## Kind/Docker Notes
- Frontend envs for Kind:
  - `REACT_APP_EVIDENCE_SERVICE_URL` → `http(s)://<ingress-host>/api/v1`
  - `REACT_APP_AI_SERVICE_URL` → `http(s)://<ingress-host-ai>` or internal DNS via server-side proxy
- CORS:
  - Ensure `CORS_ORIGIN` in Evidence Service includes the frontend host used by Ingress.
- Ingress
  - Expose Evidence Service (port 3001) and AI Analysis (port 8001) via Ingress; map paths `/api/v1` and `/ai` as needed.

## Verification Checklist
- Evidence routes available under `http://localhost:3001/api/v1/evidence`.
- Frontend uses `REACT_APP_EVIDENCE_SERVICE_URL` and includes the `Authorization: Bearer <token>` header from `authService`.
- JWT payload keys match backend expectations: `id`, `email`, `role`, `organization`.
- AI Analysis requests from evidence-service include a valid JWT; AI service `verify_token` accepts it.
- Upload from `EvidenceUpload` page reaches backend and returns created evidence.

## How to Generate a Test JWT
1. Ensure `.env` contains `JWT_SECRET`.
2. Install deps at repo root or run elsewhere:
   - `npm i jsonwebtoken dotenv -D` (root, optional)
3. Run: `node generate-token.js`
4. Copy the printed token to `.env` as `REACT_APP_TEST_JWT` for local dev.

## Current State
- Backend routes and frontend service configuration aligned.
- Frontend login supports a proper backend endpoint when available; otherwise uses an env-provided test token only for local development.
 - .gitignore hardened to exclude secrets, uploads, logs, tmp files, and tests.

