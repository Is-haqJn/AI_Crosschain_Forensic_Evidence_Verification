# Environment Variables Documentation

This document describes all environment variables used in the Forensic Evidence System.

## 🔐 Secret Variables (Kubernetes Secrets)

These variables contain sensitive information and should be stored in Kubernetes secrets.

### Evidence Service Secrets
- `DATABASE_URL` - PostgreSQL connection string
- `MONGODB_URI` - MongoDB connection string  
- `REDIS_URL` - Redis connection string
- `RABBITMQ_URL` - RabbitMQ connection string
- `JWT_SECRET` - JWT signing secret
- `JWT_REFRESH_SECRET` - JWT refresh token secret
- `ENCRYPTION_KEY` - Data encryption key

### Blockchain Secrets
- `SEPOLIA_RPC_URL` - Ethereum Sepolia testnet RPC URL
- `AMOY_RPC_URL` - Polygon Amoy testnet RPC URL
- `PRIVATE_KEY` - Wallet private key for transactions
- `ETHERSCAN_API_KEY` - Etherscan API key for contract verification
- `POLYGONSCAN_API_KEY` - Polygonscan API key for contract verification

### AI Service Secrets
- `OPENAI_API_KEY` - OpenAI API key for AI analysis

## ⚙️ Configuration Variables (Kubernetes ConfigMaps)

These variables contain non-sensitive configuration and can be stored in ConfigMaps.

### Service Configuration
- `NODE_ENV` - Node.js environment (development/production)
- `PORT` - Service port number
- `IPFS_HOST` - IPFS host address (for external gateway access)
- `IPFS_PORT` - IPFS port number (for external gateway access)
- `IPFS_PROTOCOL` - IPFS protocol (http/https)
- `IPFS_HELIA_ENABLED` - Enable Helia local IPFS node (default: true)
- `IPFS_GATEWAY_URL` - External IPFS gateway URL (default: https://ipfs.io/ipfs/)
- `IPFS_PINNING_ENABLED` - Enable IPFS pinning (default: true)
- `AI_SERVICE_URL` - AI analysis service URL
- `MODEL_PATH` - Path to AI models
- `CORS_ORIGIN` - CORS allowed origins
- `MAX_FILE_SIZE` - Maximum file upload size
- `ALLOWED_MIME_TYPES` - Allowed file types for upload
- `JWT_EXPIRY` - JWT token expiry time
- `JWT_REFRESH_EXPIRY` - JWT refresh token expiry time

### Contract Addresses
- `CONTRACT_ADDRESS_SEPOLIA` - Sepolia registry contract address
- `CONTRACT_ADDRESS_AMOY` - Amoy registry contract address
- `BRIDGE_CONTRACT_SEPOLIA` - Sepolia bridge contract address
- `BRIDGE_CONTRACT_AMOY` - Amoy bridge contract address

### Frontend Configuration
- `NEXT_PUBLIC_API_URL` - Public API URL for frontend
- `NEXT_PUBLIC_WS_URL` - WebSocket URL for real-time updates
- `NEXT_PUBLIC_SEPOLIA_RPC` - Public Sepolia RPC URL
- `NEXT_PUBLIC_AMOY_RPC` - Public Amoy RPC URL

### Service Ports
- `EVIDENCE_SERVICE_PORT` - Evidence service port
- `BLOCKCHAIN_SERVICE_PORT` - Blockchain service port
- `CROSSCHAIN_SERVICE_PORT` - Cross-chain service port
- `AUTH_SERVICE_PORT` - Authentication service port
- `NOTIFICATION_SERVICE_PORT` - Notification service port
- `AI_ANALYSIS_SERVICE_PORT` - AI analysis service port

### Monitoring
- `PROMETHEUS_PORT` - Prometheus metrics port
- `GRAFANA_PORT` - Grafana dashboard port

## 🚀 Usage

### Docker Compose
```bash
# Copy .env file and update values
cp .env.example .env

# Start services
docker-compose -f docker-compose.dev.yml up
```

### Kubernetes
```bash
# Create secrets from .env file
./scripts/create-secrets.sh

# Deploy to Kubernetes
kubectl apply -f kubernetes/
```

## 🔒 Security Best Practices

1. **Never commit secrets to version control**
2. **Use Kubernetes secrets for sensitive data**
3. **Use ConfigMaps for non-sensitive configuration**
4. **Rotate secrets regularly**
5. **Use different secrets for different environments**
6. **Encrypt secrets at rest and in transit**

## 📝 Example .env File

```env
# Node Environment
NODE_ENV=development

# Database Configuration
DATABASE_URL=postgresql://forensic_user:forensic_pass@localhost:5432/forensic_db
MONGODB_URI=mongodb://mongo_user:mongo_pass@localhost:27017/evidence_db
REDIS_URL=redis://:redis_pass@localhost:6379

# Message Queue
RABBITMQ_URL=amqp://rabbitmq_user:rabbitmq_pass@localhost:5672

# IPFS Configuration
IPFS_HOST=localhost
IPFS_PORT=5001
IPFS_PROTOCOL=http

# Blockchain Configuration
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_PROJECT_ID
AMOY_RPC_URL=https://rpc-amoy.polygon.technology/
PRIVATE_KEY=your_private_key_here
CONTRACT_ADDRESS_SEPOLIA=0x316988454D4f101f9399DFC00779c3B5825af2B3
CONTRACT_ADDRESS_AMOY=0xf13c14B48BBc7a466739650c0f83f9BFaefc7B9F
BRIDGE_CONTRACT_SEPOLIA=0x708acdeE14D0Daf6F9270077b28660706A1B5e8F
BRIDGE_CONTRACT_AMOY=0xBb4C38c350Da3B3654ad20F0f3f3015Cd0F3Bcd5

# API Keys
ETHERSCAN_API_KEY=your_etherscan_api_key_here
POLYGONSCAN_API_KEY=your_polygonscan_api_key_here

# JWT Configuration
JWT_SECRET=your_jwt_secret_here
JWT_REFRESH_SECRET=your_jwt_refresh_secret_here
JWT_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# AI Service
AI_SERVICE_URL=http://localhost:8001
MODEL_PATH=/models
# OCR
IMAGE_ENABLE_OCR=true
OCR_LANGUAGE=eng
# Optional object detection (requires real model files under MODEL_PATH)
IMAGE_ENABLE_OBJECT_DETECTION=false
OPENAI_API_KEY=your_openai_api_key_here

# Frontend Configuration
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=ws://localhost:8888
NEXT_PUBLIC_SEPOLIA_RPC=https://eth-sepolia.g.alchemy.com/v2/YOUR_PROJECT_ID
NEXT_PUBLIC_AMOY_RPC=https://rpc-amoy.polygon.technology/

# Service Ports
EVIDENCE_SERVICE_PORT=3001
BLOCKCHAIN_SERVICE_PORT=3002
CROSSCHAIN_SERVICE_PORT=3003
AUTH_SERVICE_PORT=3004
NOTIFICATION_SERVICE_PORT=3005
AI_ANALYSIS_SERVICE_PORT=8001

# CORS
CORS_ORIGIN=http://localhost:3000,http://localhost:3001

# File Upload
MAX_FILE_SIZE=104857600
ALLOWED_MIME_TYPES=image/jpeg,image/png,video/mp4,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document

# Monitoring
PROMETHEUS_PORT=9090
GRAFANA_PORT=3006
```
