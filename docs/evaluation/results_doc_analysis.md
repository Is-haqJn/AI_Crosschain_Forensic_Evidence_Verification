### HAR Summary

- Total requests: 581
- Success rate: 87.61%
- Mean: 56687.57 ms, Median: 427.89 ms, P95: 38468.90 ms, P99: 994170.51 ms

### Per-endpoint Metrics

| Endpoint | Count | Success % | Mean (ms) | P95 (ms) | P99 (ms) | 2xx | 4xx | 5xx |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| http://localhost:3000/api/v1/activity | 16 | 100.0 | 1884.3 | 6370.1 | 8242.2 | 16 | 0 | 0 |
| http://localhost:3000/api/v1/auth/login | 10 | 100.0 | 1342.0 | 4166.4 | 4421.7 | 10 | 0 | 0 |
| http://localhost:3000/api/v1/auth/logout | 9 | 11.1 | 1765.1 | 3674.1 | 3942.9 | 1 | 4 | 0 |
| http://localhost:3000/api/v1/auth/me | 3 | 66.7 | 996.7 | 1697.0 | 1780.9 | 2 | 1 | 0 |
| http://localhost:3000/api/v1/cases | 47 | 100.0 | 851.0 | 4382.8 | 7288.4 | 47 | 0 | 0 |
| http://localhost:3000/api/v1/evidence | 76 | 100.0 | 4953.4 | 14692.8 | 30876.0 | 76 | 0 | 0 |
| http://localhost:3000/api/v1/evidence/0a8348d0-c945-4095-a695-bd32f87a3b88 | 13 | 84.6 | 2512.9 | 8616.0 | 9321.1 | 11 | 2 | 0 |
| http://localhost:3000/api/v1/evidence/0a8348d0-c945-4095-a695-bd32f87a3b88/ai-analysis | 6 | 100.0 | 12659.1 | 36823.5 | 38205.7 | 6 | 0 | 0 |
| http://localhost:3000/api/v1/evidence/0a8348d0-c945-4095-a695-bd32f87a3b88/ai-analysis/results | 8 | 25.0 | 302.6 | 881.6 | 1006.2 | 2 | 6 | 0 |
| http://localhost:3000/api/v1/evidence/0a8348d0-c945-4095-a695-bd32f87a3b88/ai-analysis/status | 17 | 100.0 | 12846.6 | 87061.9 | 112564.4 | 17 | 0 | 0 |
| http://localhost:3000/api/v1/evidence/0a8348d0-c945-4095-a695-bd32f87a3b88/blockchain | 1 | 100.0 | 32585.6 | 32585.6 | 32585.6 | 1 | 0 | 0 |
| http://localhost:3000/api/v1/evidence/0a8348d0-c945-4095-a695-bd32f87a3b88/verify | 2 | 50.0 | 718.0 | 1196.2 | 1238.7 | 1 | 1 | 0 |
| http://localhost:3000/api/v1/evidence/0f7f1e8d-4275-435c-9071-1965ef27ee10 | 5 | 60.0 | 4952.4 | 12763.1 | 14201.4 | 3 | 2 | 0 |
| http://localhost:3000/api/v1/evidence/0f7f1e8d-4275-435c-9071-1965ef27ee10/ai-analysis | 1 | 100.0 | 1766.8 | 1766.8 | 1766.8 | 1 | 0 | 0 |
| http://localhost:3000/api/v1/evidence/0f7f1e8d-4275-435c-9071-1965ef27ee10/ai-analysis/results | 4 | 50.0 | 4366.4 | 12666.0 | 14043.2 | 2 | 2 | 0 |
| http://localhost:3000/api/v1/evidence/0f7f1e8d-4275-435c-9071-1965ef27ee10/ai-analysis/status | 5 | 100.0 | 571.1 | 1753.2 | 2016.0 | 5 | 0 | 0 |
| http://localhost:3000/api/v1/evidence/crosschain/health | 13 | 100.0 | 3562.1 | 10243.6 | 10264.7 | 13 | 0 | 0 |
| http://localhost:3000/api/v1/evidence/f7ad2296-c11c-4bf3-8a90-7c0aafa143f7 | 12 | 83.3 | 11582.8 | 34800.9 | 43911.8 | 10 | 2 | 0 |
| http://localhost:3000/api/v1/evidence/f7ad2296-c11c-4bf3-8a90-7c0aafa143f7/ai-analysis | 5 | 100.0 | 918.0 | 2197.1 | 2423.5 | 5 | 0 | 0 |
| http://localhost:3000/api/v1/evidence/f7ad2296-c11c-4bf3-8a90-7c0aafa143f7/ai-analysis/results | 7 | 71.4 | 3183.7 | 9091.2 | 10248.7 | 5 | 2 | 0 |
| http://localhost:3000/api/v1/evidence/f7ad2296-c11c-4bf3-8a90-7c0aafa143f7/ai-analysis/status | 11 | 100.0 | 629.7 | 2143.0 | 3268.0 | 11 | 0 | 0 |
| http://localhost:3000/api/v1/evidence/f7ad2296-c11c-4bf3-8a90-7c0aafa143f7/blockchain | 1 | 100.0 | 18686.7 | 18686.7 | 18686.7 | 1 | 0 | 0 |
| http://localhost:3000/api/v1/evidence/f7ad2296-c11c-4bf3-8a90-7c0aafa143f7/verify | 1 | 100.0 | 8219.2 | 8219.2 | 8219.2 | 1 | 0 | 0 |
| http://localhost:3000/api/v1/evidence/feef93a3-e300-405c-85ca-a04e9cc88bb0 | 1 | 100.0 | 26329.1 | 26329.1 | 26329.1 | 1 | 0 | 0 |
| http://localhost:3000/api/v1/evidence/feef93a3-e300-405c-85ca-a04e9cc88bb0/ai-analysis/results | 1 | 100.0 | 2481.5 | 2481.5 | 2481.5 | 1 | 0 | 0 |
| http://localhost:3000/api/v1/evidence/upload | 3 | 100.0 | 8246.1 | 8856.6 | 8927.7 | 3 | 0 | 0 |
| http://localhost:3001/api/v1/auth/users | 8 | 100.0 | 930.9 | 2259.6 | 2373.1 | 8 | 0 | 0 |
