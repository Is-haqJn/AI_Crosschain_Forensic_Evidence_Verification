# Project Structure and File Placement Guide

## 📁 Complete Directory Structure

This guide shows you exactly where each file should be placed in your forensic evidence system project.

```
D:\AI_CROSSCHAIN_PROJECT\forensic-evidence-system\
│
├── 📄 README.md                    # Main project documentation
├── 📄 .env.example                 # Environment variables template
├── 📄 .env                        # Your actual environment variables (DO NOT COMMIT)
├── 📄 .gitignore                  # Git ignore file
├── 📄 docker-compose.yml          # Docker services configuration
├── 📄 setup.bat                   # Windows setup script
├── 📄 setup.sh                    # Linux/Mac setup script
│
├── 📁 microservices/              # All microservices
│   │
│   ├── 📁 evidence-service/       # Evidence management service
│   │   ├── 📄 package.json       # Node.js dependencies
│   │   ├── 📄 tsconfig.json      # TypeScript configuration
│   │   ├── 📄 Dockerfile         # Docker container definition
│   │   ├── 📄 .env.service       # Service-specific environment
│   │   │
│   │   └── 📁 src/               # Source code
│   │       ├── 📄 index.ts       # Entry point
│   │       ├── 📄 app.ts         # Main application class
│   │       │
│   │       ├── 📁 config/        # Configuration management
│   │       │   ├── 📄 ConfigManager.ts
│   │       │   └── 📄 index.ts
│   │       │
│   │       ├── 📁 interfaces/    # TypeScript interfaces
│   │       │   ├── 📄 IConfig.ts
│   │       │   ├── 📄 IEvidence.ts
│   │       │   ├── 📄 IUser.ts
│   │       │   └── 📄 IRepository.ts
│   │       │
│   │       ├── 📁 models/        # Data models
│   │       │   ├── 📄 Evidence.model.ts
│   │       │   ├── 📄 User.model.ts
│   │       │   └── 📄 ChainOfCustody.model.ts
│   │       │
│   │       ├── 📁 repositories/  # Data access layer
│   │       │   ├── 📄 EvidenceRepository.ts
│   │       │   ├── 📄 UserRepository.ts
│   │       │   └── 📄 BaseRepository.ts
│   │       │
│   │       ├── 📁 services/      # Business logic
│   │       │   ├── 📄 DatabaseManager.ts
│   │       │   ├── 📄 MessageQueueManager.ts
│   │       │   ├── 📄 IPFSManager.ts
│   │       │   ├── 📄 EvidenceService.ts
│   │       │   ├── 📄 HashService.ts
│   │       │   └── 📄 ValidationService.ts
│   │       │
│   │       ├── 📁 controllers/   # Request handlers
│   │       │   ├── 📄 EvidenceController.ts
│   │       │   ├── 📄 AuthController.ts
│   │       │   └── 📄 BaseController.ts
│   │       │
│   │       ├── 📁 routes/        # API routes
│   │       │   ├── 📄 EvidenceRouter.ts
│   │       │   ├── 📄 AuthRouter.ts
│   │       │   ├── 📄 HealthRouter.ts
│   │       │   └── 📄 index.ts
│   │       │
│   │       ├── 📁 middleware/    # Express middleware
│   │       │   ├── 📄 AuthMiddleware.ts
│   │       │   ├── 📄 ErrorHandler.ts
│   │       │   ├── 📄 RequestValidator.ts
│   │       │   └── 📄 RateLimiter.ts
│   │       │
│   │       └── 📁 utils/         # Utility functions
│   │           ├── 📄 Logger.ts
│   │           ├── 📄 Encryption.ts
│   │           ├── 📄 FileHandler.ts
│   │           └── 📄 Constants.ts
│   │
│   ├── 📁 ai-analysis-service/    # AI/ML service
│   │   ├── 📄 requirements.txt   # Python dependencies
│   │   ├── 📄 Dockerfile
│   │   ├── 📄 main.py            # Entry point
│   │   │
│   │   └── 📁 src/
│   │       ├── 📁 models/        # ML models
│   │       ├── 📁 services/      # AI services
│   │       ├── 📁 controllers/   # API controllers
│   │       └── 📁 utils/         # Utilities
│   │
│   ├── 📁 blockchain-service/     # Blockchain interaction
│   │   └── [Similar structure to evidence-service]
│   │
│   ├── 📁 crosschain-service/     # Cross-chain bridge
│   │   └── [Similar structure to evidence-service]
│   │
│   ├── 📁 auth-service/           # Authentication service
│   │   └── [Similar structure to evidence-service]
│   │
│   └── 📁 notification-service/   # Real-time notifications
│       └── [Similar structure to evidence-service]
│
├── 📁 smart-contracts/            # Blockchain contracts
│   ├── 📄 package.json
│   ├── 📄 hardhat.config.js     # Hardhat configuration
│   │
│   ├── 📁 contracts/             # Solidity contracts
│   │   ├── 📄 ForensicEvidenceRegistry.sol
│   │   ├── 📄 CrossChainBridge.sol
│   │   └── 📄 AccessControl.sol
│   │
│   ├── 📁 scripts/               # Deployment scripts
│   │   ├── 📄 deploy.js
│   │   ├── 📄 verify.js
│   │   └── 📄 interact.js
│   │
│   └── 📁 test/                  # Contract tests
│       ├── 📄 EvidenceRegistry.test.js
│       └── 📄 Bridge.test.js
│
├── 📁 frontend/                   # Next.js frontend
│   ├── 📄 package.json
│   ├── 📄 next.config.js
│   ├── 📄 tailwind.config.js
│   │
│   ├── 📁 app/                   # App directory (Next.js 14)
│   │   ├── 📄 layout.tsx
│   │   ├── 📄 page.tsx
│   │   └── 📁 evidence/
│   │       └── 📄 page.tsx
│   │
│   ├── 📁 components/            # React components
│   │   ├── 📁 evidence/
│   │   ├── 📁 blockchain/
│   │   └── 📁 ui/
│   │
│   └── 📁 lib/                   # Libraries and utilities
│       ├── 📁 hooks/
│       ├── 📁 utils/
│       └── 📁 web3/
│
├── 📁 kubernetes/                 # K8s configurations
│   ├── 📄 namespace.yaml
│   │
│   ├── 📁 deployments/
│   │   ├── 📄 evidence-service.yaml
│   │   ├── 📄 ai-service.yaml
│   │   └── 📄 databases.yaml
│   │
│   ├── 📁 services/
│   │   └── 📄 services.yaml
│   │
│   ├── 📁 configmaps/
│   │   └── 📄 app-config.yaml
│   │
│   ├── 📁 secrets/
│   │   └── 📄 app-secrets.yaml
│   │
│   └── 📁 ingress/
│       └── 📄 ingress.yaml
│
├── 📁 scripts/                    # Utility scripts
│   ├── 📄 deploy.sh
│   ├── 📄 backup.sh
│   └── 📄 test.sh
│
├── 📁 docs/                       # Documentation
│   ├── 📄 API.md
│   ├── 📄 ARCHITECTURE.md
│   └── 📄 DEPLOYMENT.md
│
└── 📁 tests/                      # Integration tests
    ├── 📁 unit/
    ├── 📁 integration/
    └── 📁 e2e/

```

## 🔧 Environment Variables Setup

### Required Environment Variables (YOU need to provide):
```env
# Blockchain Configuration (YOU MUST PROVIDE THESE)
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_KEY
AMOY_RPC_URL=https://rpc-amoy.polygon.technology/
WALLET_PRIVATE_KEY=YOUR_METAMASK_PRIVATE_KEY
CONTRACT_ADDRESS_SEPOLIA=0x... (after deployment)
CONTRACT_ADDRESS_AMOY=0x... (after deployment)

# Optional API Keys
ETHERSCAN_API_KEY=your_etherscan_api_key
POLYGONSCAN_API_KEY=your_polygonscan_api_key
```

### Auto-generated Environment Variables (We provide):
```env
# JWT Secrets (auto-generated for security)
JWT_SECRET=<auto-generated-secure-key>
JWT_REFRESH_SECRET=<auto-generated-secure-key>

# Database Credentials (for local development)
DATABASE_URL=postgresql://forensic_user:forensic_pass@localhost:5432/forensic_db
MONGODB_URI=mongodb://mongo_user:mongo_pass@localhost:27017/evidence_db
REDIS_URL=redis://:redis_pass@localhost:6379
RABBITMQ_URL=amqp://rabbitmq_user:rabbitmq_pass@localhost:5672
```

## 🚀 Quick Start Commands

### 1. Initial Setup (Run once)
```bash
# Windows
D:\AI_CROSSCHAIN_PROJECT\forensic-evidence-system> setup.bat

# Linux/Mac
$ ./setup.sh
```

### 2. Install Dependencies
```bash
# Install Evidence Service dependencies
cd microservices/evidence-service
npm install

# Install Smart Contract dependencies
cd ../../smart-contracts
npm install
```

### 3. Start Infrastructure Services
```bash
# Start Docker services (databases, IPFS, RabbitMQ)
docker-compose up -d
```

### 4. Deploy Smart Contracts
```bash
cd smart-contracts
npx hardhat compile
npx hardhat run scripts/deploy.js --network sepolia
npx hardhat run scripts/deploy.js --network amoy
```

### 5. Start Microservices
```bash
# Start Evidence Service
cd microservices/evidence-service
npm run dev

# In another terminal - Start AI Service
cd microservices/ai-analysis-service
python main.py

# In another terminal - Start Blockchain Service
cd microservices/blockchain-service
npm run dev
```

## 📝 Important Notes

1. **Security**: Never commit `.env` files to version control
2. **Private Keys**: Keep your wallet private keys secure
3. **Test Networks**: Always use test networks (Sepolia/Amoy) for development
4. **Dependencies**: Run `npm install` in each service directory
5. **Docker**: Ensure Docker Desktop is running before starting services
6. **Ports**: Default ports are configured in docker-compose.yml

## 🔍 Service URLs

- **Frontend**: http://localhost:3000
- **Evidence Service API**: http://localhost:3001
- **AI Analysis Service**: http://localhost:8001
- **Blockchain Service**: http://localhost:3002
- **RabbitMQ Management**: http://localhost:15672
- **IPFS WebUI**: http://localhost:5001/webui
- **Grafana**: http://localhost:3006
- **Prometheus**: http://localhost:9090

## 💡 Development Tips

1. **Check Service Health**: `GET http://localhost:3001/health`
2. **View Logs**: `docker-compose logs -f [service-name]`
3. **Reset Databases**: `docker-compose down -v` (removes volumes)
4. **Rebuild Services**: `docker-compose build --no-cache`
5. **Test Smart Contracts**: `npx hardhat test`

## 🐛 Troubleshooting

### Common Issues:

1. **Port Already in Use**:
   - Change port in `.env` file
   - Or stop conflicting service

2. **Database Connection Failed**:
   - Check if Docker is running
   - Verify credentials in `.env`

3. **Smart Contract Deployment Failed**:
   - Ensure you have test ETH/MATIC
   - Check RPC URL is correct

4. **IPFS Connection Failed**:
   - Ensure IPFS container is running
   - Check port 5001 is not blocked

## 📧 Support

For issues or questions about the project structure:
- Check the `/docs` folder for detailed documentation
- Review the README.md files in each service directory
- Ensure all environment variables are properly set
