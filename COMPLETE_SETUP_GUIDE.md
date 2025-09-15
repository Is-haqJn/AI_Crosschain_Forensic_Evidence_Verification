# 🚀 COMPLETE SETUP & RUN GUIDE
## AI Cross-Chain Forensic Evidence Verification System

---

## 📋 Table of Contents
1. [Prerequisites Check](#prerequisites-check)
2. [Initial Setup](#initial-setup)
3. [Environment Configuration](#environment-configuration)
4. [Install Dependencies](#install-dependencies)
5. [Start Infrastructure](#start-infrastructure)
6. [Deploy Smart Contracts](#deploy-smart-contracts)
7. [Start Microservices](#start-microservices)
8. [Testing](#testing)
9. [Kubernetes Deployment](#kubernetes-deployment)
10. [Troubleshooting](#troubleshooting)

---

## 1️⃣ Prerequisites Check

### Required Software
- ✅ Docker Desktop (with Kubernetes enabled)
- ✅ Node.js v18+ and npm
- ✅ Python 3.9+
- ✅ Git
- ✅ MetaMask Browser Extension

### Check Installations:
```bash
# Check Docker
docker --version
docker-compose --version

# Check Node.js
node --version
npm --version

# Check Python
python --version
pip --version

# Check Git
git --version
```

---

## 2️⃣ Initial Setup

### Step 1: Navigate to Project
```bash
cd D:\AI_CROSSCHAIN_PROJECT\forensic-evidence-system
```

### Step 2: Run Setup Script
```bash
# Windows
setup.bat

# Linux/Mac
chmod +x setup.sh
./setup.sh
```

---

## 3️⃣ Environment Configuration

### Step 1: Copy Environment Template
```bash
copy .env.example .env
```

### Step 2: Edit .env File
Open `.env` in your editor and add YOUR values:

```env
# ⚠️ REQUIRED - Your Blockchain Configuration
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_PROJECT_ID
AMOY_RPC_URL=https://rpc-amoy.polygon.technology/
WALLET_PRIVATE_KEY=your_metamask_private_key_here

# These will be auto-generated if not provided
JWT_SECRET=<leave_empty_for_auto_generation>
JWT_REFRESH_SECRET=<leave_empty_for_auto_generation>

# Database credentials (for local development)
DATABASE_URL=postgresql://forensic_user:forensic_pass@localhost:5432/forensic_db
MONGODB_URI=mongodb://mongo_user:mongo_pass@localhost:27017/evidence_db
REDIS_URL=redis://:redis_pass@localhost:6379
RABBITMQ_URL=amqp://rabbitmq_user:rabbitmq_pass@localhost:5672

# IPFS Configuration
IPFS_HOST=localhost
IPFS_PORT=5001
IPFS_PROTOCOL=http

# Service Ports
EVIDENCE_SERVICE_PORT=3001
AI_ANALYSIS_SERVICE_PORT=8001
BLOCKCHAIN_SERVICE_PORT=3002
```

### How to Get Required Values:

#### Get Infura API Key:
1. Go to https://infura.io/
2. Sign up for free
3. Create new project
4. Copy Project ID

#### Get MetaMask Private Key:
1. Open MetaMask
2. Click account menu (3 dots)
3. Account details → Export Private Key
4. ⚠️ NEVER share this key!

---

## 4️⃣ Install Dependencies

### Evidence Service (Node.js/TypeScript)
```bash
cd microservices\evidence-service
npm install
npm run build
cd ..\..
```

### AI Analysis Service (Python)
```bash
cd microservices\ai-analysis-service
python -m venv venv
venv\Scripts\activate  # Windows
# source venv/bin/activate  # Linux/Mac
pip install -r requirements.txt
cd ..\..
```

### Smart Contracts
```bash
cd smart-contracts
npm install
cd ..
```

---

## 5️⃣ Start Infrastructure Services

### Start All Docker Services
```bash
docker-compose up -d
```

### Verify Services are Running
```bash
docker-compose ps
```

You should see:
- ✅ postgres (5432)
- ✅ mongodb (27017)  
- ✅ redis (6379)
- ✅ rabbitmq (5672/15672)
- ✅ ipfs (5001/8080)

### Access Service UIs:
- RabbitMQ: http://localhost:15672 (rabbitmq_user/rabbitmq_pass)
- IPFS: http://localhost:5001/webui

---

## 6️⃣ Deploy Smart Contracts

### Step 1: Get Test Tokens
#### Sepolia ETH:
1. Go to https://sepoliafaucet.com/
2. Enter your wallet address
3. Request 0.5 ETH

#### Polygon Amoy MATIC:
1. Go to https://faucet.polygon.technology/
2. Select Amoy testnet
3. Enter wallet address
4. Request MATIC

### Step 2: Compile Contracts
```bash
cd smart-contracts
npx hardhat compile
```

### Step 3: Deploy to Sepolia
```bash
npx hardhat run scripts/deploy.js --network sepolia
```

Save the output:
```
Evidence Registry deployed to: 0x...
Bridge Contract deployed to: 0x...
```

### Step 4: Deploy to Amoy
```bash
npx hardhat run scripts/deploy.js --network amoy
```

### Step 5: Update .env with Contract Addresses
```env
CONTRACT_ADDRESS_SEPOLIA=0x... (your deployed address)
CONTRACT_ADDRESS_AMOY=0x... (your deployed address)
BRIDGE_ADDRESS_SEPOLIA=0x... (your bridge address)
BRIDGE_ADDRESS_AMOY=0x... (your bridge address)
```

---

## 7️⃣ Start Microservices

### Terminal 1: Evidence Service
```bash
cd microservices\evidence-service
npm run dev
```
✅ Running on: http://localhost:3001

### Terminal 2: AI Analysis Service
```bash
cd microservices\ai-analysis-service
python main.py
```
✅ Running on: http://localhost:8001

### Terminal 3: Blockchain Service (Optional)
```bash
cd microservices\blockchain-service
npm run dev
```
✅ Running on: http://localhost:3002

---

## 8️⃣ Testing the System

### Test 1: Health Check
```bash
# Evidence Service
curl http://localhost:3001/health

# AI Service
curl http://localhost:8001/health
```

### Test 2: Upload Evidence (with Postman or curl)
```bash
curl -X POST http://localhost:3001/api/v1/evidence/upload \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "evidence=@test-image.jpg" \
  -F "type=IMAGE" \
  -F "description=Test evidence"
```

### Test 3: Check Smart Contract
```bash
cd smart-contracts
npx hardhat console --network sepolia

> const Registry = await ethers.getContractFactory("ForensicEvidenceRegistry")
> const registry = await Registry.attach("YOUR_CONTRACT_ADDRESS")
> await registry.DEFAULT_ADMIN_ROLE()
```

---

## 9️⃣ Kubernetes Deployment (Optional)

### Deploy to Kubernetes
```bash
# Create namespace
kubectl create namespace forensic-system

# Apply configurations
kubectl apply -f kubernetes/

# Check deployments
kubectl get all -n forensic-system

# Get service URLs
kubectl get ingress -n forensic-system
```

### Port Forwarding for Local Access
```bash
# Evidence Service
kubectl port-forward -n forensic-system svc/evidence-service 3001:3001

# AI Service
kubectl port-forward -n forensic-system svc/ai-analysis-service 8001:8001
```

---

## 🔟 Troubleshooting

### Issue: "Cannot connect to Docker"
**Solution:**
```bash
# Restart Docker Desktop
# Ensure Docker is running
docker info
```

### Issue: "Port already in use"
**Solution:**
```bash
# Windows - Find process using port
netstat -ano | findstr :3001
taskkill /PID <PID> /F

# Change port in docker-compose.yml if needed
```

### Issue: "Smart contract deployment failed"
**Checklist:**
- ✅ Have test ETH/MATIC?
- ✅ Correct RPC URL?
- ✅ Valid private key?
- ✅ Network connection stable?

### Issue: "TypeScript compilation errors"
**Solution:**
```bash
cd microservices\evidence-service
rm -rf node_modules dist
npm install
npm run build
```

### Issue: "Python module not found"
**Solution:**
```bash
cd microservices\ai-analysis-service
pip install -r requirements.txt --upgrade
```

### Issue: "IPFS connection failed"
**Solution:**
```bash
# Restart IPFS container
docker-compose restart ipfs

# Check IPFS logs
docker-compose logs ipfs
```

---

## 📊 Monitoring & Logs

### View Docker Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f postgres
docker-compose logs -f ipfs
```

### View Microservice Logs
```bash
# Evidence Service logs are in console
# AI Service logs are in console and logs/ai-analysis-service.log
```

---

## 🛑 Stopping Services

### Stop Microservices
Press `Ctrl+C` in each terminal

### Stop Docker Services
```bash
docker-compose down

# To remove volumes (reset databases)
docker-compose down -v
```

---

## 📝 Important Security Notes

1. **NEVER commit .env to Git**
2. **Keep private keys secure**
3. **Use test networks only for development**
4. **Rotate JWT secrets in production**
5. **Enable HTTPS in production**
6. **Implement rate limiting**
7. **Use secure passwords**

---

## 🎉 Success Checklist

When everything is working, you should be able to:

- ✅ Access Evidence Service API at http://localhost:3001
- ✅ Access AI Analysis Service at http://localhost:8001
- ✅ View RabbitMQ management at http://localhost:15672
- ✅ Access IPFS WebUI at http://localhost:5001/webui
- ✅ See deployed contracts on Etherscan/Polygonscan
- ✅ Upload evidence through the API
- ✅ Get AI analysis results
- ✅ Submit evidence to blockchain
- ✅ Verify evidence on-chain

---

## 📚 Additional Resources

- [Project Structure Guide](PROJECT_STRUCTURE_GUIDE.md)
- [API Documentation](http://localhost:3001/api-docs)
- [Smart Contract Documentation](smart-contracts/README.md)
- [Ethereum Sepolia Explorer](https://sepolia.etherscan.io/)
- [Polygon Amoy Explorer](https://amoy.polygonscan.com/)

---

## 🆘 Need Help?

1. Check the logs first
2. Verify all services are running
3. Ensure environment variables are set
4. Check network connectivity
5. Verify wallet has test tokens

---

**Congratulations! Your AI Cross-Chain Forensic Evidence System is now running! 🚀**
