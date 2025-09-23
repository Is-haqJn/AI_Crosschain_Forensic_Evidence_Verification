## Docker-Only Test Matrix (Black/Grey/White Box) with Reproducibility

All commands below use Docker or Docker Compose only and target `docker-compose.dev.yml`.

### 0) Bring-up (dev stack)

```bash
docker compose -f docker-compose.dev.yml up -d --build
docker compose ps
```

Confirm containers are healthy (frontend, evidence-service, ai-analysis-service, postgres, mongodb, redis, rabbitmq, ipfs).

### 1) Common setup (inside evidence-service container)

Install curl/jq once and generate a JWT for API calls.

```bash
docker compose exec evidence-service sh -lc "apk add --no-cache curl jq >/dev/null"

# Save a JWT to a file on the container (valid 24h by default)
docker compose exec evidence-service sh -lc "node generate-token.cjs > /tmp/token.txt && head -c 16 /tmp/token.txt && echo '... (token saved)'"

# Helper env exports for the following inline commands
docker compose exec evidence-service sh -lc 'export TOKEN=$(cat /tmp/token.txt) && echo ${#TOKEN} > /tmp/token.len && cat /tmp/token.len'
```

Copy a sample evidence file into the container.

```bash
docker compose cp test_document.txt evidence-service:/tmp/test_document.txt
```

---

### 2) Black-box tests (external API behavior only)

Health checks and core flows via HTTP to `evidence-service` inside the container.

```bash
# Health
docker compose exec evidence-service sh -lc 'curl -s http://localhost:3001/health | tee /tmp/health.json'

# Upload evidence (DOCUMENT)
docker compose exec evidence-service sh -lc 'TOKEN=$(cat /tmp/token.txt); \
  curl -s -H "Authorization: Bearer $TOKEN" \
    -F "evidence=@/tmp/test_document.txt" -F "type=DOCUMENT" -F "description=BlackBox Upload" \
    http://localhost:3001/api/v1/evidence/upload | tee /tmp/upload.json && \
  jq -r .data.evidenceId /tmp/upload.json > /tmp/evid.txt && cat /tmp/evid.txt'

# Duplicate upload should be rejected or flagged (idempotency/dedup)
docker compose exec evidence-service sh -lc 'TOKEN=$(cat /tmp/token.txt); \
  curl -s -o /tmp/upload_dup.json -w "HTTP %{http_code}\n" -H "Authorization: Bearer $TOKEN" \
    -F "evidence=@/tmp/test_document.txt" -F "type=DOCUMENT" -F "description=Duplicate" \
    http://localhost:3001/api/v1/evidence/upload && cat /tmp/upload_dup.json'

# Fetch evidence metadata
docker compose exec evidence-service sh -lc 'TOKEN=$(cat /tmp/token.txt); EVID=$(cat /tmp/evid.txt); \
  curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/v1/evidence/$EVID | tee /tmp/get.json'

# Verify chain-of-custody (should be valid initially)
docker compose exec evidence-service sh -lc 'TOKEN=$(cat /tmp/token.txt); EVID=$(cat /tmp/evid.txt); \
  curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/v1/evidence/$EVID/custody/verify | tee /tmp/coc_before.json'

# Optional: Submit to blockchain (requires wallets/RPC in .env)
docker compose exec evidence-service sh -lc 'TOKEN=$(cat /tmp/token.txt); EVID=$(cat /tmp/evid.txt); \
  curl -s -X POST -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/v1/evidence/$EVID/blockchain | tee /tmp/submit_chain.json'

# Optional: Verify on blockchain
docker compose exec evidence-service sh -lc 'TOKEN=$(cat /tmp/token.txt); EVID=$(cat /tmp/evid.txt); \
  curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/v1/evidence/$EVID/verify | tee /tmp/verify_chain.json'
```

Expected:
- Health returns status object.
- Upload returns `data.evidenceId` and `dataHash` in the record (see GET response).
- Duplicate upload should not create a new record (check status/response).
- CoC verify valid before corruption.

---

### 3) Evidence corruption test (tamper detection)

Simulate database tampering by altering the stored `dataHash` for the uploaded evidence and re-run verification.

```bash
# Show current values (Mongo shell inside container)
docker compose exec mongodb sh -lc 'mongosh -u ${MONGO_INITDB_ROOT_USERNAME:-mongo_user} -p ${MONGO_INITDB_ROOT_PASSWORD:-mongo_pass} --quiet --eval \
  "db=getSiblingDB(\"evidence_db\");printjson(db.evidences.findOne({evidenceId: \"$(docker compose exec -T evidence-service sh -lc \"cat /tmp/evid.txt\")\"},{evidenceId:1,dataHash:1,ipfsHash:1}))"'

# Corrupt the dataHash
docker compose exec mongodb sh -lc 'mongosh -u ${MONGO_INITDB_ROOT_USERNAME:-mongo_user} -p ${MONGO_INITDB_ROOT_PASSWORD:-mongo_pass} --quiet --eval \
  "db=getSiblingDB(\"evidence_db\");db.evidences.updateOne({evidenceId: \"$(docker compose exec -T evidence-service sh -lc \"cat /tmp/evid.txt\")\"},{$set:{dataHash:\"deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef\"}});printjson(db.evidences.findOne({evidenceId: \"$(docker compose exec -T evidence-service sh -lc \"cat /tmp/evid.txt\")\"},{evidenceId:1,dataHash:1}))"'

# Re-run CoC verification (should be invalid and list issues)
docker compose exec evidence-service sh -lc 'TOKEN=$(cat /tmp/token.txt); EVID=$(cat /tmp/evid.txt); \
  curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/v1/evidence/$EVID/custody/verify | tee /tmp/coc_after.json'
```

Expected:
- `coc_after.json` shows `valid: false` with integrity issues reported.

---

### 4) Grey-box tests (introspection via Docker)

Inspect logs, service health, and DB connections without changing code.

```bash
# Evidence service logs
docker compose logs --tail=200 evidence-service

# AI service health (note: AI processing may be degraded as documented)
docker compose exec ai-analysis-service sh -lc 'apk add --no-cache curl >/dev/null; curl -s http://localhost:8001/health | tee /tmp/ai_health.json'

# Postgres reachable
docker compose exec postgres sh -lc 'apk add --no-cache postgresql-client >/dev/null; psql -U ${POSTGRES_USER:-forensic_user} -d ${POSTGRES_DB:-forensic_db} -c "select now();"'

# Mongo collections overview
docker compose exec mongodb sh -lc 'mongosh -u ${MONGO_INITDB_ROOT_USERNAME:-mongo_user} -p ${MONGO_INITDB_ROOT_PASSWORD:-mongo_pass} --quiet --eval \
  "db=getSiblingDB(\"evidence_db\");printjson(db.getCollectionNames())"'

# IPFS id
docker compose exec ipfs sh -lc 'ipfs id'
```

---

### 5) White-box tests (inside containers)

Run service-level test suites or diagnostics from within the containers.

```bash
# Evidence service unit/integration tests (Jest)
docker compose exec evidence-service sh -lc 'npm test -- --ci --coverage'

# Smart contracts (Hardhat tests)
docker compose exec smart-contracts sh -lc 'npm ci && npx hardhat test'
```

Note: The AI analysis service currently has no packaged tests in the repo; run its health endpoints and review logs as part of grey-box.

---

### 6) Load testing with Dockerized k6 (optional)

```bash
# Save token to host for convenience (optional)
docker compose exec -T evidence-service sh -lc 'cat /tmp/token.txt' > token.txt

# Run k6 in a container on the compose network
docker run --rm --network forensic-evidence-system_forensic-network \
  -v "$PWD":/work -w /work \
  -e BASE_URL=http://evidence-service:3001 \
  -e TOKEN="$(cat token.txt)" \
  -e FILE_PATH=/work/test_document.txt \
  grafana/k6:0.51.0 run tests/perf/evidence_upload_test.js
```

Adjust VUs/duration via `--vus`/`--duration` flags.

---

### 7) Reproducibility artefacts and exports

```bash
# Export result JSONs from container (example)
docker compose cp evidence-service:/tmp/upload.json docs/evaluation/upload.json
docker compose cp evidence-service:/tmp/coc_before.json docs/evaluation/coc_before.json
docker compose cp evidence-service:/tmp/coc_after.json docs/evaluation/coc_after.json
docker compose cp evidence-service:/tmp/verify_chain.json docs/evaluation/verify_chain.json || true
```

These exported artefacts can be cited directly in Chapter 4 and re-generated with the exact commands above.


