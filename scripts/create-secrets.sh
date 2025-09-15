#!/bin/bash

# Forensic Evidence System - Secret Management Script
# This script creates Kubernetes secrets from environment variables

set -e

echo "🔐 Creating Kubernetes secrets from environment variables..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if .env file exists
if [ ! -f ".env" ]; then
    print_error ".env file not found. Please create one with your environment variables."
    exit 1
fi

# Load environment variables
export $(cat .env | grep -v '^#' | xargs)

print_status "Creating evidence service secrets..."
kubectl create secret generic evidence-secrets \
  --from-literal=DATABASE_URL="$DATABASE_URL" \
  --from-literal=MONGODB_URI="$MONGODB_URI" \
  --from-literal=REDIS_URL="$REDIS_URL" \
  --from-literal=RABBITMQ_URL="$RABBITMQ_URL" \
  --from-literal=JWT_SECRET="$JWT_SECRET" \
  --from-literal=JWT_REFRESH_SECRET="$JWT_REFRESH_SECRET" \
  --from-literal=ENCRYPTION_KEY="$ENCRYPTION_KEY" \
  --namespace=forensic-system \
  --dry-run=client -o yaml | kubectl apply -f -

print_status "Creating blockchain secrets..."
kubectl create secret generic blockchain-secrets \
  --from-literal=SEPOLIA_RPC_URL="$SEPOLIA_RPC_URL" \
  --from-literal=AMOY_RPC_URL="$AMOY_RPC_URL" \
  --from-literal=PRIVATE_KEY="$PRIVATE_KEY" \
  --from-literal=ETHERSCAN_API_KEY="$ETHERSCAN_API_KEY" \
  --from-literal=POLYGONSCAN_API_KEY="$POLYGONSCAN_API_KEY" \
  --namespace=forensic-system \
  --dry-run=client -o yaml | kubectl apply -f -

print_status "Creating AI service secrets..."
kubectl create secret generic ai-secrets \
  --from-literal=OPENAI_API_KEY="$OPENAI_API_KEY" \
  --namespace=forensic-system \
  --dry-run=client -o yaml | kubectl apply -f -

print_status "Updating contract addresses configmap..."
kubectl create configmap contract-addresses \
  --from-literal=CONTRACT_ADDRESS_SEPOLIA="$CONTRACT_ADDRESS_SEPOLIA" \
  --from-literal=CONTRACT_ADDRESS_AMOY="$CONTRACT_ADDRESS_AMOY" \
  --from-literal=BRIDGE_CONTRACT_SEPOLIA="$BRIDGE_CONTRACT_SEPOLIA" \
  --from-literal=BRIDGE_CONTRACT_AMOY="$BRIDGE_CONTRACT_AMOY" \
  --namespace=forensic-system \
  --dry-run=client -o yaml | kubectl apply -f -

print_status "Updating service configuration configmap..."
kubectl create configmap service-config \
  --from-literal=NEXT_PUBLIC_SEPOLIA_RPC="$NEXT_PUBLIC_SEPOLIA_RPC" \
  --from-literal=NEXT_PUBLIC_AMOY_RPC="$NEXT_PUBLIC_AMOY_RPC" \
  --namespace=forensic-system \
  --dry-run=client -o yaml | kubectl apply -f -

print_success "All secrets and configmaps created successfully!"

echo ""
echo "📊 Current secrets:"
kubectl get secrets -n forensic-system
echo ""
echo "📊 Current configmaps:"
kubectl get configmaps -n forensic-system
echo ""
print_success "Secret management complete! 🎉"
