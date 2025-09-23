## Evaluation & Reproducibility

This folder contains scripts and instructions to reproduce Chapter 4 experiments for the Forensic Evidence System.

### Prerequisites
- Node.js 22+ and npm
- Python 3.10+ (for HAR analysis)
- Docker Desktop (optional but recommended)
- k6 (`https://k6.io/`) for load testing

### 1) Minimal Local Bring-up (Windows)
Use the provided helper to start PostgreSQL and the Evidence Service only:

```bash
scripts\start-for-testing.bat
```

Verify health:

```bash
curl http://localhost:3001/health
```

Generate a JWT for authenticated endpoints (in `microservices/evidence-service`):

```bash
set JWT_SECRET=test-secret-for-development-only
node generate-token.cjs > token.txt
```

### 2) Functional API Checks
- Upload evidence (requires Bearer token): `/api/v1/evidence/upload`
- List evidence: `/api/v1/evidence`
- Health endpoints: `/health`

### 3) Performance Test (k6)
Run a short upload test against the evidence upload endpoint:

```bash
k6 run --vus 5 --duration 30s tests/perf/evidence_upload_test.js \
  -e BASE_URL=http://localhost:3001 \
  -e TOKEN="$(type token.txt)" \
  -e FILE_PATH=./test_document.txt
```

Adjust VUs/duration as needed. Thresholds are defined inside the script.

### 4) HAR Analysis
Parse the provided HAR files to compute endpoint-level metrics:

```bash
cd docs/evaluation
python har_analysis.py --har ../HARS/test\ doc.\ analysis\ results.HAR \
  --filter /api/v1/evidence --out results.json --md results.md
```

Outputs:
- `results.json`: machine-readable summary (overall + per-endpoint)
- `results.md`: human-readable table for inclusion in Chapter 4

You can repeat this for other HARs (audio/video verification, blockchain ops) to compare workflows.

### 5) Full Stack (Optional)
For end-to-end, bring up all infra and both microservices via Docker Compose, then rerun the above tests:

```bash
docker-compose -f docker-compose.infrastructure.yml up -d
cd microservices/ai-analysis-service && python main.py  # if configured
cd microservices/evidence-service && npm run dev
```

Notes:
- The AI service currently has known startup issues as documented in Chapter 4; the evaluation focuses on operational components and API-level performance.


