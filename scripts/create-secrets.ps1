# Forensic Evidence System - Secret Management Script for PowerShell
# This script creates Kubernetes secrets from environment variables

Write-Host "🔐 Creating Kubernetes secrets from environment variables..." -ForegroundColor Blue

# Check if .env file exists
if (-not (Test-Path ".env")) {
    Write-Host "[ERROR] .env file not found. Please create one with your environment variables." -ForegroundColor Red
    exit 1
}

Write-Host "[INFO] Loading environment variables from .env file..." -ForegroundColor Yellow

# Load environment variables from .env file
$envVars = @{}
Get-Content ".env" | ForEach-Object {
    if ($_ -match "^([^#][^=]+)=(.*)$") {
        $key = $matches[1].Trim()
        $value = $matches[2].Trim()
        $envVars[$key] = $value
        # Set environment variable for current session
        [Environment]::SetEnvironmentVariable($key, $value, "Process")
    }
}

# Check if required variables are set
$requiredVars = @("DATABASE_URL", "MONGODB_URI", "REDIS_URL", "RABBITMQ_URL", "JWT_SECRET", "JWT_REFRESH_SECRET", "ENCRYPTION_KEY")
foreach ($var in $requiredVars) {
    if (-not $envVars.ContainsKey($var) -or [string]::IsNullOrEmpty($envVars[$var])) {
        Write-Host "[ERROR] $var not found in .env file" -ForegroundColor Red
        exit 1
    }
}

Write-Host "[INFO] Creating evidence service secrets..." -ForegroundColor Yellow
kubectl create secret generic evidence-secrets `
  --from-literal=DATABASE_URL="$($envVars['DATABASE_URL'])" `
  --from-literal=MONGODB_URI="$($envVars['MONGODB_URI'])" `
  --from-literal=REDIS_URL="$($envVars['REDIS_URL'])" `
  --from-literal=RABBITMQ_URL="$($envVars['RABBITMQ_URL'])" `
  --from-literal=JWT_SECRET="$($envVars['JWT_SECRET'])" `
  --from-literal=JWT_REFRESH_SECRET="$($envVars['JWT_REFRESH_SECRET'])" `
  --from-literal=ENCRYPTION_KEY="$($envVars['ENCRYPTION_KEY'])" `
  --namespace=forensic-system `
  --dry-run=client -o yaml | kubectl apply -f -

Write-Host "[INFO] Creating blockchain secrets..." -ForegroundColor Yellow
kubectl create secret generic blockchain-secrets `
  --from-literal=SEPOLIA_RPC_URL="$($envVars['SEPOLIA_RPC_URL'])" `
  --from-literal=AMOY_RPC_URL="$($envVars['AMOY_RPC_URL'])" `
  --from-literal=PRIVATE_KEY="$($envVars['PRIVATE_KEY'])" `
  --from-literal=ETHERSCAN_API_KEY="$($envVars['ETHERSCAN_API_KEY'])" `
  --from-literal=POLYGONSCAN_API_KEY="$($envVars['POLYGONSCAN_API_KEY'])" `
  --namespace=forensic-system `
  --dry-run=client -o yaml | kubectl apply -f -

Write-Host "[INFO] Creating AI service secrets..." -ForegroundColor Yellow
kubectl create secret generic ai-secrets `
  --from-literal=OPENAI_API_KEY="$($envVars['OPENAI_API_KEY'])" `
  --namespace=forensic-system `
  --dry-run=client -o yaml | kubectl apply -f -

Write-Host "[INFO] Updating contract addresses configmap..." -ForegroundColor Yellow
kubectl create configmap contract-addresses `
  --from-literal=CONTRACT_ADDRESS_SEPOLIA="$($envVars['CONTRACT_ADDRESS_SEPOLIA'])" `
  --from-literal=CONTRACT_ADDRESS_AMOY="$($envVars['CONTRACT_ADDRESS_AMOY'])" `
  --from-literal=BRIDGE_CONTRACT_SEPOLIA="$($envVars['BRIDGE_CONTRACT_SEPOLIA'])" `
  --from-literal=BRIDGE_CONTRACT_AMOY="$($envVars['BRIDGE_CONTRACT_AMOY'])" `
  --namespace=forensic-system `
  --dry-run=client -o yaml | kubectl apply -f -

Write-Host "[INFO] Updating service configuration configmap..." -ForegroundColor Yellow
kubectl create configmap service-config `
  --from-literal=NEXT_PUBLIC_SEPOLIA_RPC="$($envVars['NEXT_PUBLIC_SEPOLIA_RPC'])" `
  --from-literal=NEXT_PUBLIC_AMOY_RPC="$($envVars['NEXT_PUBLIC_AMOY_RPC'])" `
  --namespace=forensic-system `
  --dry-run=client -o yaml | kubectl apply -f -

Write-Host "[SUCCESS] All secrets and configmaps created successfully!" -ForegroundColor Green

Write-Host ""
Write-Host "📊 Current secrets:" -ForegroundColor Cyan
kubectl get secrets -n forensic-system

Write-Host ""
Write-Host "📊 Current configmaps:" -ForegroundColor Cyan
kubectl get configmaps -n forensic-system

Write-Host ""
Write-Host "[SUCCESS] Secret management complete! 🎉" -ForegroundColor Green
Write-Host "[INFO] All secrets have been loaded from your .env file" -ForegroundColor Blue
