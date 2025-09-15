@echo off
REM Forensic Evidence System - Secret Management Script for Windows
REM This script creates Kubernetes secrets from environment variables

echo 🔐 Creating Kubernetes secrets from environment variables...

REM Check if .env file exists
if not exist ".env" (
    echo [ERROR] .env file not found. Please create one with your environment variables.
    exit /b 1
)

echo [INFO] Loading environment variables from .env file...

REM Load environment variables from .env file
for /f "usebackq tokens=1,2 delims==" %%a in (".env") do (
    if not "%%a"=="" if not "%%a:~0,1%"=="#" (
        set "%%a=%%b"
    )
)

REM Check if required variables are set
if "%DATABASE_URL%"=="" (
    echo [ERROR] DATABASE_URL not found in .env file
    exit /b 1
)

echo [INFO] Creating evidence service secrets...
kubectl create secret generic evidence-secrets ^
  --from-literal=DATABASE_URL="%DATABASE_URL%" ^
  --from-literal=MONGODB_URI="%MONGODB_URI%" ^
  --from-literal=REDIS_URL="%REDIS_URL%" ^
  --from-literal=RABBITMQ_URL="%RABBITMQ_URL%" ^
  --from-literal=JWT_SECRET="%JWT_SECRET%" ^
  --from-literal=JWT_REFRESH_SECRET="%JWT_REFRESH_SECRET%" ^
  --from-literal=ENCRYPTION_KEY="%ENCRYPTION_KEY%" ^
  --namespace=forensic-system ^
  --dry-run=client -o yaml | kubectl apply -f -

echo [INFO] Creating blockchain secrets...
kubectl create secret generic blockchain-secrets ^
  --from-literal=SEPOLIA_RPC_URL="%SEPOLIA_RPC_URL%" ^
  --from-literal=AMOY_RPC_URL="%AMOY_RPC_URL%" ^
  --from-literal=PRIVATE_KEY="%PRIVATE_KEY%" ^
  --from-literal=ETHERSCAN_API_KEY="%ETHERSCAN_API_KEY%" ^
  --from-literal=POLYGONSCAN_API_KEY="%POLYGONSCAN_API_KEY%" ^
  --namespace=forensic-system ^
  --dry-run=client -o yaml | kubectl apply -f -

echo [INFO] Creating AI service secrets...
kubectl create secret generic ai-secrets ^
  --from-literal=OPENAI_API_KEY="%OPENAI_API_KEY%" ^
  --namespace=forensic-system ^
  --dry-run=client -o yaml | kubectl apply -f -

echo [INFO] Updating contract addresses configmap...
kubectl create configmap contract-addresses ^
  --from-literal=CONTRACT_ADDRESS_SEPOLIA="%CONTRACT_ADDRESS_SEPOLIA%" ^
  --from-literal=CONTRACT_ADDRESS_AMOY="%CONTRACT_ADDRESS_AMOY%" ^
  --from-literal=BRIDGE_CONTRACT_SEPOLIA="%BRIDGE_CONTRACT_SEPOLIA%" ^
  --from-literal=BRIDGE_CONTRACT_AMOY="%BRIDGE_CONTRACT_AMOY%" ^
  --namespace=forensic-system ^
  --dry-run=client -o yaml | kubectl apply -f -

echo [INFO] Updating service configuration configmap...
kubectl create configmap service-config ^
  --from-literal=NEXT_PUBLIC_SEPOLIA_RPC="%NEXT_PUBLIC_SEPOLIA_RPC%" ^
  --from-literal=NEXT_PUBLIC_AMOY_RPC="%NEXT_PUBLIC_AMOY_RPC%" ^
  --namespace=forensic-system ^
  --dry-run=client -o yaml | kubectl apply -f -

echo [SUCCESS] All secrets and configmaps created successfully!

echo.
echo 📊 Current secrets:
kubectl get secrets -n forensic-system
echo.
echo 📊 Current configmaps:
kubectl get configmaps -n forensic-system
echo.
echo [SUCCESS] Secret management complete! 🎉
echo [INFO] All secrets have been loaded from your .env file
