# Kind Deployment Guide (Frontend + Microservices)

## Prerequisites
- Docker Desktop (or Docker Engine)
- kind (Kubernetes in Docker)
- kubectl
- NGINX Ingress for kind

## 1) Create kind cluster with Ingress

- Use the repo `kind-config.yaml`:

```
kind create cluster --name forensic --config kind-config.yaml
```

- Install NGINX Ingress:
```
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
kubectl wait --namespace ingress-nginx \
  --for=condition=Ready pods \
  --selector=app.kubernetes.io/component=controller \
  --timeout=180s
```

## 2) Build images locally and load into kind

- Evidence Service:
```
cd microservices/evidence-service
npm ci && npm run build
docker build -t evidence-service:latest .
kind load docker-image evidence-service:latest --name forensic
```

- AI Analysis Service (build your Python image if available):
```
cd microservices/ai-analysis-service
# docker build -t ai-analysis-service:latest .
# kind load docker-image ai-analysis-service:latest --name forensic
```

- Frontend:
```
cd frontend
# Ensure REACT_APP_* envs are set before build
REACT_APP_EVIDENCE_SERVICE_URL=http://evidence.forensic-evidence.local/api/v1 \
REACT_APP_AI_SERVICE_URL=http://ai-analysis.forensic-evidence.local \
  npm run build
# Use a simple nginx or node base for static serving (example Dockerfile expected)
# docker build -t forensic-frontend:latest .
# kind load docker-image forensic-frontend:latest --name forensic
```

Note: CRA reads REACT_APP_* at build-time. If you want runtime-configurable envs, introduce a config endpoint or window-injected config.

## 3) Apply Kubernetes manifests

- Namespaces/Config:
```
kubectl apply -f microservices/evidence-service/k8s/namespace.yaml
kubectl apply -f microservices/evidence-service/k8s/configmap.yaml
kubectl apply -f microservices/evidence-service/k8s/secret.yaml
kubectl apply -f microservices/ai-analysis-service/k8s/namespace.yaml
kubectl apply -f microservices/ai-analysis-service/k8s/configmap.yaml
kubectl apply -f microservices/ai-analysis-service/k8s/secret.yaml
kubectl apply -f frontend/k8s/namespace.yaml
kubectl apply -f frontend/k8s/configmap.yaml
```

- Deployments/Services:
```
kubectl apply -f microservices/evidence-service/k8s/deployment.yaml
kubectl apply -f microservices/evidence-service/k8s/service.yaml
kubectl apply -f microservices/ai-analysis-service/k8s/deployment.yaml
kubectl apply -f microservices/ai-analysis-service/k8s/service.yaml
kubectl apply -f frontend/k8s/deployment.yaml
kubectl apply -f frontend/k8s/service.yaml
```

- Ingress (dev, no TLS):
```
kubectl apply -f microservices/evidence-service/k8s/ingress.yaml   # If TLS removed; otherwise create a /dev variant
kubectl apply -f microservices/ai-analysis-service/k8s/ingress.yaml # If TLS removed; otherwise create a /dev variant
kubectl apply -f frontend/k8s/ingress.dev.yaml
```

Add hosts entries:
```
127.0.0.1  frontend.forensic-evidence.local evidence.forensic-evidence.local ai-analysis.forensic-evidence.local
```

## 4) Validate

- Pods ready:
```
kubectl get pods -n forensic-evidence
```

- Evidence Service:
```
curl http://evidence.forensic-evidence.local/health
curl http://evidence.forensic-evidence.local/api/v1/evidence -H "Authorization: Bearer <token>"
```

- AI Analysis Service:
```
curl http://ai-analysis.forensic-evidence.local/health
```

- Frontend:
```
open http://frontend.forensic-evidence.local
```

Troubleshooting tips are in docs/INTEGRATION_LOG.md.

