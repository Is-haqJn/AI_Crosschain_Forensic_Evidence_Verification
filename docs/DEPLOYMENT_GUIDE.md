# Forensic Evidence System - Deployment Guide

## 📋 Overview

This guide provides comprehensive instructions for deploying the Forensic Evidence System in various environments, from local development to production Kubernetes clusters.

## 🎯 Deployment Options

### 1. Local Development
- **Purpose**: Development and testing
- **Services**: Docker Compose
- **Databases**: Local containers

### 2. Staging Environment
- **Purpose**: Pre-production testing
- **Services**: Kubernetes (local or cloud)
- **Databases**: Managed services

### 3. Production Environment
- **Purpose**: Live system
- **Services**: Kubernetes cluster
- **Databases**: High-availability managed services

---

## 🚀 Quick Start (Local Development)

### Prerequisites
- Docker Desktop
- Docker Compose
- Node.js 22+ (for development)
- Python 3.13+ (for AI service development)

### Step 1: Clone Repository
```bash
git clone <repository-url>
cd forensic-evidence-system
```

### Step 2: Start Infrastructure Services
```bash
# Start databases and message queues
docker-compose -f docker-compose.infrastructure.yml up -d

# Verify services are running
docker-compose -f docker-compose.infrastructure.yml ps
```

### Step 3: Start AI Analysis Service
```bash
cd microservices/ai-analysis-service

# Install dependencies
pip install -r requirements.txt

# Start service
python main.py
```

### Step 4: Start Evidence Service
```bash
cd microservices/evidence-service

# Install dependencies
npm install

# Build application
npm run build

# Start service
npm start
```

### Step 5: Verify Deployment
```bash
# Check Evidence Service
curl http://localhost:3001/health

# Check AI Analysis Service
curl http://localhost:8001/health

# Check AI Analysis Types
curl http://localhost:8001/api/v1/types
```

---

## 🐳 Docker Deployment

### Building Images

#### Evidence Service
```bash
cd microservices/evidence-service

# Build image
docker build -t evidence-service:latest .

# Tag for registry
docker tag evidence-service:latest your-registry/evidence-service:latest

# Push to registry
docker push your-registry/evidence-service:latest
```

#### AI Analysis Service
```bash
cd microservices/ai-analysis-service

# Build image
docker build -t ai-analysis-service:latest .

# Tag for registry
docker tag ai-analysis-service:latest your-registry/ai-analysis-service:latest

# Push to registry
docker push your-registry/ai-analysis-service:latest
```

Note: The Dockerfile installs `tesseract-ocr` and `tesseract-ocr-eng` for OCR. To enable OCR in runtime, set `IMAGE_ENABLE_OCR=true` (default) and `OCR_LANGUAGE` as needed. Object detection is disabled by default; enable with `IMAGE_ENABLE_OBJECT_DETECTION=true` only when real model weights are mounted under `MODEL_PATH`.

### Running with Docker Compose

#### Complete Stack
```yaml
# docker-compose.yml
version: '3.8'

services:
  # Infrastructure Services
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: forensic_db
      POSTGRES_USER: forensic_user
      POSTGRES_PASSWORD: forensic_pass
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  mongodb:
    image: mongo:7
    environment:
      MONGO_INITDB_ROOT_USERNAME: mongo_user
      MONGO_INITDB_ROOT_PASSWORD: mongo_pass
    volumes:
      - mongodb_data:/data/db
    ports:
      - "27017:27017"

  redis:
    image: redis:7-alpine
    command: redis-server --requirepass redis_pass
    volumes:
      - redis_data:/data
    ports:
      - "6379:6379"

  rabbitmq:
    image: rabbitmq:3-management-alpine
    environment:
      RABBITMQ_DEFAULT_USER: rabbitmq_user
      RABBITMQ_DEFAULT_PASS: rabbitmq_pass
    volumes:
      - rabbitmq_data:/var/lib/rabbitmq
    ports:
      - "5672:5672"
      - "15672:15672"

  # Application Services
  ai-analysis-service:
    image: ai-analysis-service:latest
    environment:
      - DATABASE_URL=postgresql://forensic_user:forensic_pass@postgres:5432/forensic_db
      - MONGODB_URI=mongodb://mongo_user:mongo_pass@mongodb:27017/evidence_db
      - REDIS_URL=redis://:redis_pass@redis:6379
      - RABBITMQ_URL=amqp://rabbitmq_user:rabbitmq_pass@rabbitmq:5672
    ports:
      - "8001:8001"
    depends_on:
      - postgres
      - mongodb
      - redis
      - rabbitmq

  evidence-service:
    image: evidence-service:latest
    environment:
      - DATABASE_URL=postgresql://forensic_user:forensic_pass@postgres:5432/forensic_db
      - MONGODB_URI=mongodb://mongo_user:mongo_pass@mongodb:27017/evidence_db
      - REDIS_URL=redis://:redis_pass@redis:6379
      - RABBITMQ_URL=amqp://rabbitmq_user:rabbitmq_pass@rabbitmq:5672
      - AI_SERVICE_URL=http://ai-analysis-service:8001
    ports:
      - "3001:3001"
    depends_on:
      - postgres
      - mongodb
      - redis
      - rabbitmq
      - ai-analysis-service

volumes:
  postgres_data:
  mongodb_data:
  redis_data:
  rabbitmq_data:
```

#### Start Complete Stack
```bash
# Start all services
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f evidence-service
docker-compose logs -f ai-analysis-service
```

---

## ☸️ Kubernetes Deployment

### Prerequisites
- Kubernetes cluster (v1.24+)
- kubectl configured
- Docker registry access
- Helm (optional, for advanced deployments)

### Step 1: Create Namespace
```bash
kubectl apply -f microservices/evidence-service/k8s/namespace.yaml
kubectl apply -f microservices/ai-analysis-service/k8s/namespace.yaml
```

### Step 2: Deploy Infrastructure Services

#### PostgreSQL
```yaml
# k8s/postgres.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: postgres
  namespace: forensic-evidence
spec:
  replicas: 1
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
      - name: postgres
        image: postgres:15-alpine
        env:
        - name: POSTGRES_DB
          value: "forensic_db"
        - name: POSTGRES_USER
          value: "forensic_user"
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: postgres-secret
              key: password
        ports:
        - containerPort: 5432
        volumeMounts:
        - name: postgres-storage
          mountPath: /var/lib/postgresql/data
      volumes:
      - name: postgres-storage
        persistentVolumeClaim:
          claimName: postgres-pvc
---
apiVersion: v1
kind: Service
metadata:
  name: postgres
  namespace: forensic-evidence
spec:
  selector:
    app: postgres
  ports:
  - port: 5432
    targetPort: 5432
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: postgres-pvc
  namespace: forensic-evidence
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 10Gi
```

### Step 3: Deploy Application Services

#### Evidence Service
```bash
# Apply all manifests
kubectl apply -f microservices/evidence-service/k8s/

# Check deployment status
kubectl get pods -n forensic-evidence -l app=evidence-service

# Check service
kubectl get svc -n forensic-evidence evidence-service
```

#### AI Analysis Service
```bash
# Apply all manifests
kubectl apply -f microservices/ai-analysis-service/k8s/

# Check deployment status
kubectl get pods -n forensic-evidence -l app=ai-analysis-service

# Check service
kubectl get svc -n forensic-evidence ai-analysis-service
```

### Step 4: Configure Ingress

#### NGINX Ingress Controller
```bash
# Install NGINX Ingress Controller
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.8.2/deploy/static/provider/cloud/deploy.yaml

# Wait for controller to be ready
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=120s
```

#### Ingress Configuration
```yaml
# k8s/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: forensic-evidence-ingress
  namespace: forensic-evidence
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/force-ssl-redirect: "true"
    nginx.ingress.kubernetes.io/proxy-body-size: "500m"
spec:
  tls:
  - hosts:
    - evidence.forensic-evidence.local
    - ai.forensic-evidence.local
    secretName: forensic-evidence-tls
  rules:
  - host: evidence.forensic-evidence.local
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: evidence-service
            port:
              number: 3001
  - host: ai.forensic-evidence.local
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: ai-analysis-service
            port:
              number: 8001
```

### Step 5: Verify Deployment
```bash
# Check all pods
kubectl get pods -n forensic-evidence

# Check services
kubectl get svc -n forensic-evidence

# Check ingress
kubectl get ingress -n forensic-evidence

# Test services
curl http://evidence.forensic-evidence.local/health
curl http://ai.forensic-evidence.local/health
```

---

## 🔧 Configuration Management

### Environment Variables

#### Evidence Service
```bash
# Database Configuration
DATABASE_URL=postgresql://user:pass@host:5432/db
MONGODB_URI=mongodb://user:pass@host:27017/db

# Cache and Message Queue
REDIS_URL=redis://:pass@host:6379
RABBITMQ_URL=amqp://user:pass@host:5672

# AI Service Integration
AI_SERVICE_URL=http://ai-analysis-service:8001
AI_SERVICE_SECRET=your-secret-key

# Security
JWT_SECRET=your-jwt-secret
JWT_REFRESH_SECRET=your-refresh-secret

# File Upload
MAX_FILE_SIZE=104857600
ALLOWED_FILE_TYPES=image/jpeg,image/png,video/mp4,application/pdf

# IPFS Configuration
IPFS_HOST=localhost
IPFS_PORT=5001
IPFS_GATEWAY_URL=https://ipfs.io/ipfs/

# Blockchain Configuration
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/your-key
AMOY_RPC_URL=https://rpc-amoy.polygon.technology
WALLET_PRIVATE_KEY=your-private-key
```

#### AI Analysis Service
```bash
# Database Configuration
DATABASE_URL=postgresql://user:pass@host:5432/db
MONGODB_URI=mongodb://user:pass@host:27017/db

# Cache and Message Queue
REDIS_URL=redis://:pass@host:6379
RABBITMQ_URL=amqp://user:pass@host:5672

# Security
JWT_SECRET=your-jwt-secret

# AI Model Configuration
MODEL_CACHE_SIZE=1000
MODEL_LOAD_TIMEOUT=300
ENABLE_GPU=true
GPU_MEMORY_LIMIT=4096

# Processing Configuration
MAX_CONCURRENT_ANALYSES=5
ANALYSIS_TIMEOUT=300
QUEUE_PRIORITY_LEVELS=10
```

### ConfigMaps and Secrets

#### ConfigMap Example
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: evidence-service-config
  namespace: forensic-evidence
data:
  NODE_ENV: "production"
  PORT: "3001"
  LOG_LEVEL: "info"
  MAX_FILE_SIZE: "104857600"
  AI_SERVICE_URL: "http://ai-analysis-service:8001"
```

#### Secret Example
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: evidence-service-secrets
  namespace: forensic-evidence
type: Opaque
data:
  JWT_SECRET: <base64-encoded-secret>
  DATABASE_URL: <base64-encoded-url>
  MONGODB_URI: <base64-encoded-uri>
  REDIS_URL: <base64-encoded-url>
  RABBITMQ_URL: <base64-encoded-url>
```

---

## 📊 Monitoring and Observability

### Health Checks

#### Application Health Endpoints
- **Evidence Service**: `GET /health`
- **AI Analysis Service**: `GET /health`

#### Kubernetes Health Checks
```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 3001
  initialDelaySeconds: 30
  periodSeconds: 10
  timeoutSeconds: 5
  failureThreshold: 3

readinessProbe:
  httpGet:
    path: /health/ready
    port: 3001
  initialDelaySeconds: 10
  periodSeconds: 5
  timeoutSeconds: 3
  failureThreshold: 3
```

### Prometheus Monitoring

#### Service Monitor
```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: evidence-service-monitor
  namespace: forensic-evidence
spec:
  selector:
    matchLabels:
      app: evidence-service
  endpoints:
  - port: metrics
    path: /metrics
    interval: 30s
```

#### Grafana Dashboard
```json
{
  "dashboard": {
    "title": "Forensic Evidence System",
    "panels": [
      {
        "title": "Request Rate",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(http_requests_total[5m])",
            "legendFormat": "{{service}}"
          }
        ]
      },
      {
        "title": "Response Time",
        "type": "graph",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))",
            "legendFormat": "95th percentile"
          }
        ]
      }
    ]
  }
}
```

### Logging

#### Centralized Logging with ELK Stack
```yaml
# elasticsearch.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: elasticsearch
  namespace: logging
spec:
  replicas: 1
  selector:
    matchLabels:
      app: elasticsearch
  template:
    metadata:
      labels:
        app: elasticsearch
    spec:
      containers:
      - name: elasticsearch
        image: elasticsearch:8.8.0
        env:
        - name: discovery.type
          value: single-node
        - name: xpack.security.enabled
          value: "false"
        ports:
        - containerPort: 9200
        resources:
          requests:
            memory: "2Gi"
            cpu: "1000m"
          limits:
            memory: "4Gi"
            cpu: "2000m"
```

---

## 🔒 Security Configuration

### Network Policies

#### Evidence Service Network Policy
```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: evidence-service-netpol
  namespace: forensic-evidence
spec:
  podSelector:
    matchLabels:
      app: evidence-service
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: ingress-nginx
    ports:
    - protocol: TCP
      port: 3001
  egress:
  - to:
    - podSelector:
        matchLabels:
          app: postgres
    ports:
    - protocol: TCP
      port: 5432
  - to:
    - podSelector:
        matchLabels:
          app: redis
    ports:
    - protocol: TCP
      port: 6379
```

### Pod Security Standards
```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: forensic-evidence
  labels:
    pod-security.kubernetes.io/enforce: restricted
    pod-security.kubernetes.io/audit: restricted
    pod-security.kubernetes.io/warn: restricted
```

### RBAC Configuration
```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  namespace: forensic-evidence
  name: evidence-service-role
rules:
- apiGroups: [""]
  resources: ["secrets", "configmaps"]
  verbs: ["get", "list"]
- apiGroups: ["apps"]
  resources: ["deployments"]
  verbs: ["get", "list", "watch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: evidence-service-rolebinding
  namespace: forensic-evidence
subjects:
- kind: ServiceAccount
  name: evidence-service
  namespace: forensic-evidence
roleRef:
  kind: Role
  name: evidence-service-role
  apiGroup: rbac.authorization.k8s.io
```

---

## 🚀 Production Deployment Checklist

### Pre-Deployment
- [ ] **Infrastructure**: Kubernetes cluster ready
- [ ] **Storage**: Persistent volumes configured
- [ ] **Networking**: Ingress controller installed
- [ ] **Security**: RBAC policies configured
- [ ] **Monitoring**: Prometheus and Grafana deployed
- [ ] **Logging**: Centralized logging configured
- [ ] **Backup**: Database backup strategy implemented
- [ ] **SSL/TLS**: Certificates configured

### Deployment
- [ ] **Images**: Docker images built and pushed
- [ ] **Secrets**: Sensitive data encrypted
- [ ] **ConfigMaps**: Configuration applied
- [ ] **Services**: All services deployed
- [ ] **Ingress**: External access configured
- [ ] **Health Checks**: All endpoints responding
- [ ] **Monitoring**: Metrics collection working
- [ ] **Logging**: Log aggregation working

### Post-Deployment
- [ ] **Testing**: End-to-end tests passing
- [ ] **Performance**: Load testing completed
- [ ] **Security**: Security scan completed
- [ ] **Documentation**: Deployment documented
- [ ] **Training**: Team trained on new deployment
- [ ] **Monitoring**: Alerts configured
- [ ] **Backup**: Backup verification completed

---

## 🔧 Troubleshooting

### Common Issues

#### Pod Not Starting
```bash
# Check pod status
kubectl describe pod <pod-name> -n forensic-evidence

# Check logs
kubectl logs <pod-name> -n forensic-evidence

# Check events
kubectl get events -n forensic-evidence --sort-by='.lastTimestamp'
```

#### Service Not Accessible
```bash
# Check service endpoints
kubectl get endpoints -n forensic-evidence

# Check ingress status
kubectl describe ingress -n forensic-evidence

# Test service connectivity
kubectl exec -it <pod-name> -n forensic-evidence -- curl http://service-name:port/health
```

#### Database Connection Issues
```bash
# Check database pod
kubectl get pods -n forensic-evidence -l app=postgres

# Check database logs
kubectl logs <postgres-pod> -n forensic-evidence

# Test database connectivity
kubectl exec -it <app-pod> -n forensic-evidence -- psql $DATABASE_URL -c "SELECT 1;"
```

### Performance Issues

#### High Memory Usage
```bash
# Check resource usage
kubectl top pods -n forensic-evidence

# Check memory limits
kubectl describe pod <pod-name> -n forensic-evidence

# Scale up if needed
kubectl scale deployment evidence-service --replicas=3 -n forensic-evidence
```

#### Slow Response Times
```bash
# Check service metrics
curl http://evidence.forensic-evidence.local/metrics

# Check database performance
kubectl exec -it <postgres-pod> -n forensic-evidence -- psql $DATABASE_URL -c "SELECT * FROM pg_stat_activity;"
```

---

## 📚 Additional Resources

### Documentation
- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [Docker Documentation](https://docs.docker.com/)
- [NGINX Ingress Controller](https://kubernetes.github.io/ingress-nginx/)
- [Prometheus Documentation](https://prometheus.io/docs/)

### Tools
- [kubectl](https://kubernetes.io/docs/tasks/tools/)
- [Helm](https://helm.sh/docs/)
- [k9s](https://k9scli.io/)
- [Lens](https://k8slens.dev/)

### Monitoring
- [Grafana Dashboards](https://grafana.com/grafana/dashboards/)
- [Prometheus Exporters](https://prometheus.io/docs/instrumenting/exporters/)
- [ELK Stack](https://www.elastic.co/elastic-stack/)

---

**Version**: 1.0.0  
**Last Updated**: September 2025  
**Maintainer**: Forensic Evidence System Team
