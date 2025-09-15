# 🚀 AI Cross-Chain Forensic Evidence System - Setup Instructions

## Prerequisites

Before starting, ensure you have the following installed:

1. **Docker Desktop** (with Kubernetes enabled)
   - Download: https://www.docker.com/products/docker-desktop
   
2. **Node.js 18+** and **npm**
   - Download: https://nodejs.org/
   
3. **Git**
   - Download: https://git-scm.com/
   
4. **MetaMask Wallet**
   - Browser extension: https://metamask.io/
   
5. **Visual Studio Code** (recommended)
   - Download: https://code.visualstudio.com/

## Step 1: Environment Setup

### 1.1 Navigate to Project Directory
```bash
cd D:\AI_CROSSCHAIN_PROJECT\forensic-evidence-system
```

### 1.2 Create Environment File
```bash
# Copy the example environment file
copy .env.example .env
```

### 1.3 Configure Your Environment Variables

Open `.env` in a text editor and add YOUR values for these critical variables:

```env
# ⚠️ REQUIRED - Add your Infura API Key
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_PROJECT_ID_HERE

# ⚠️ REQUIRED - Add your MetaMask wallet private key (NEVER share this!)
WALLET_PRIVATE_KEY=your_metamask_private_key_here

# Optional - Add if you have these API keys
ETHERSCAN_API_KEY=your_etherscan_api_key
POLYGONSCAN_API_KEY=your_polygonscan_api_key
```

**How to get these values:**

1. **Infura API Key**:
   - Go to https://infura.io/
   - Sign up for free account
   - Create a new project
   - Copy the Project ID

2. **MetaMask Private Key**:
   - Open MetaMask
   - Click on the three dots menu
   - Account details → Export Private Key
   - ⚠️ NEVER share this key!

## Step 2: Run Initial Setup

### For Windows:
```bash
# Run the setup script
setup.bat
```

### For Linux/Mac:
```bash
# Make script executable
chmod +x setup.sh

# Run the setup script
./setup.sh
```

This script will:
- Check prerequisites
- Install dependencies
- Create necessary directories
- Set up initial configuration

## Step 3: Start Infrastructure Services

```bash
# Start all Docker services (databases, IPFS, RabbitMQ)
docker-compose up -d

# Verify services are running
docker-compose ps
```

You should see these services running:
- PostgreSQL (port 5432)
- MongoDB (port 27017)
- Redis (port 6379)
- RabbitMQ (port 5672, management UI on 15672)
- IPFS (port 5001)

## Step 4: Install Service Dependencies

### 4.1 Evidence Service
```bash
cd microservices\evidence-service
npm install
```

### 4.2 Smart Contracts
```bash
cd ..\..\smart-contracts
npm install
```

## Step 5: Compile and Deploy Smart Contracts

### 5.1 Get Test ETH
1. Go to https://sepoliafaucet.com/
2. Enter your MetaMask wallet address
3. Request test ETH (you need at least 0.1 ETH)

### 5.2 Get Test MATIC for Polygon Amoy
1. Go to https://faucet.polygon.technology/
2. Select Mumbai/Amoy testnet
3. Enter your wallet address
4. Request test MATIC

### 5.3 Compile Contracts
```bash
cd smart-contracts
npx hardhat compile
```

### 5.4 Deploy to Sepolia
```bash
npx hardhat run scripts/deploy.js --network sepolia
```

Save the deployed contract addresses!

### 5.5 Deploy to Amoy
```bash
npx hardhat run scripts/deploy.js --network amoy
```

### 5.6 Update Contract Addresses in .env
```env
CONTRACT_ADDRESS_SEPOLIA=0x... (your deployed address)
CONTRACT_ADDRESS_AMOY=0x... (your deployed address)
```

## Step 6: Start Microservices

### Terminal 1: Evidence Service
```bash
cd microservices\evidence-service
npm run dev
```

### Terminal 2: Build TypeScript
```bash
cd microservices\evidence-service
npm run build
```

## Step 7: Verify Everything is Working

### 7.1 Check Service Health
```bash
# Check Evidence Service
curl http://localhost:3001/health
```

### 7.2 Access Service UIs
- **RabbitMQ Management**: http://localhost:15672
  - Username: `rabbitmq_user`
  - Password: `rabbitmq_pass`
  
- **IPFS WebUI**: http://localhost:5001/webui

### 7.3 Check Docker Logs
```bash
# View all logs
docker-compose logs

# View specific service logs
docker-compose logs postgres
docker-compose logs ipfs
```

## Step 8: Test the System

### 8.1 Test Database Connections
The Evidence Service will automatically connect to all databases on startup. Check the console logs for:
- ✅ PostgreSQL connected successfully
- ✅ MongoDB connected successfully
- ✅ Redis connected successfully

### 8.2 Test IPFS
```bash
# Upload a test file to IPFS
curl -X POST -F file=@test.txt "http://localhost:5001/api/v0/add"
```

## Common Issues and Solutions

### Issue 1: Port Already in Use
**Error**: "bind: address already in use"
**Solution**: 
```bash
# Stop conflicting service or change port in docker-compose.yml
netstat -ano | findstr :5432  # Find what's using the port
```

### Issue 2: Docker Services Won't Start
**Solution**:
```bash
# Reset Docker services
docker-compose down -v
docker-compose up -d
```

### Issue 3: Cannot Connect to Database
**Solution**:
```bash
# Check if services are running
docker-compose ps

# Restart specific service
docker-compose restart postgres
```

### Issue 4: TypeScript Compilation Errors
**Solution**:
```bash
cd microservices\evidence-service
npm install --save-dev @types/node @types/express
npm run build
```

### Issue 5: Smart Contract Deployment Fails
**Checklist**:
- ✅ Have test ETH/MATIC in wallet?
- ✅ Correct RPC URL in .env?
- ✅ Valid private key in .env?
- ✅ Network connection stable?

## Next Steps

Once everything is running:

1. **Deploy Other Microservices**:
   - AI Analysis Service
   - Blockchain Service
   - Cross-chain Service
   - Auth Service

2. **Set Up Frontend**:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

3. **Configure Kubernetes** (Optional):
   ```bash
   kubectl apply -f kubernetes/
   ```

## Security Reminders

⚠️ **IMPORTANT**:
- NEVER commit `.env` file to Git
- NEVER share your private keys
- Use test networks for development
- Keep your MetaMask wallet secure
- Regularly update dependencies

## Support

If you encounter issues:
1. Check the logs: `docker-compose logs [service-name]`
2. Verify environment variables are set correctly
3. Ensure all prerequisites are installed
4. Check that Docker Desktop is running

## Project Structure Reference

See `PROJECT_STRUCTURE_GUIDE.md` for complete file organization.

---

**Ready to build the future of forensic evidence management! 🚀**
