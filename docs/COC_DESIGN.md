# Chain of Custody (CoC) Design

This service implements a signed, hashed Chain of Custody aligned with digital forensics guidance (e.g., ISO/IEC 27037/27041/27042/27043, SWGDE Best Practices, NIST publications). Key design goals are integrity, traceability, and verifiability.

## Event Model

Every custody operation creates an immutable event with linked integrity:

- eventId: UUID
- eventType: COLLECTION | TRANSFER | ANALYSIS | STORAGE | RELEASE | BLOCKCHAIN_SUBMISSION | OTHER
- from: { userId, name, organization } (when applicable)
- to: { userId, name, organization } (when applicable)
- timestamp: ISO 8601 date
- location: { name, address, latitude, longitude } (optional)
- purpose, method (optional)
- packaging: { sealId, condition, tamperEvident } (optional)
- integrity:
  - dataHash: SHA-256 of the evidence content
  - previousEventHash: hash of the previous event (creates a chain)
  - eventHash: SHA-256 over canonicalized event material
  - algorithm: 'sha256'
  - signature: HMAC-SHA256 over eventHash using `COC_SIGNING_SECRET`
- notes: free-text

Backward compatibility fields are retained (handler, action, signature) but are deprecated.

## Canonical Hashing

We compute `eventHash` by hashing a canonical JSON of:
- evidenceId, eventId, eventType, from, to, timestamp, dataHash, previousEventHash

Canonicalization sorts keys recursively to ensure consistent hashing.

## Signature

We produce an HMAC-SHA256 signature of `eventHash` using `COC_SIGNING_SECRET` configured in environment.

## Verification

`GET /api/v1/evidence/:id/custody/verify` recomputes each event's expected hash and signature (including the chain via `previousEventHash`), returning:
- `valid`: boolean
- `issues`: array of any mismatches found

## API Changes

- Added
  - `GET /api/v1/evidence/:id/custody/verify` → verifies chain integrity
- Enhanced
  - `POST /api/v1/evidence/:id/custody` accepts additional optional body fields:
    - `location`, `purpose`, `method`, `packaging`

## Config

`.env` / K8s ConfigMap additions:
- `COC_SIGNING_SECRET` (recommended)
- `COC_HASH_ALGO` (default: sha256)

## Implementation Notes

- Creation (`COLLECTION`) event added after initial evidence save.
- Status updates, AI requests/results, transfers create linked events.
- Access control is enforced before returning custody data or adding events.

## Testing

1. Upload evidence → verify `COLLECTION` event exists
2. Transfer custody → verify `TRANSFER` event and chain links
3. Request AI analysis → verify `ANALYSIS` event
4. `GET /api/v1/evidence/:id/custody/verify` returns `valid: true`
5. Manually mutate an event in DB → verify endpoint reports hash/signature mismatch

## Future Enhancements

- User public-key signatures (per user), not just HMAC
- Tamper-evident storage (WORM), append-only ledger, or blockchain anchoring of `eventHash`
- Case-level CoC aggregation and reporting

