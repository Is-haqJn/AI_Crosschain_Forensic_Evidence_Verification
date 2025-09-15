#!/bin/bash

# Forensic Evidence System - Kind Setup Script
# This script sets up a local Kubernetes cluster using kind for development

set -e

echo "🚀 Setting up Forensic Evidence System with Kind..."

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

# Check if kind is installed
if ! command -v kind &> /dev/null; then
    print_error "Kind is not installed. Please install it first:"
    echo "  - macOS: brew install kind"
    echo "  - Linux: go install sigs.k8s.io/kind@v0.20.0"
    echo "  - Windows: choco install kind"
    exit 1
fi

# Check if kubectl is installed
if ! command -v kubectl &> /dev/null; then
    print_error "kubectl is not installed. Please install it first."
    exit 1
fi

# Check if Docker is running
if ! docker info &> /dev/null; then
    print_error "Docker is not running. Please start Docker first."
    exit 1
fi

print_status "Creating Kind cluster..."
kind create cluster --config=kind-config.yaml

print_status "Waiting for cluster to be ready..."
kubectl wait --for=condition=Ready nodes --all --timeout=300s

print_status "Creating namespace..."
kubectl apply -f kubernetes/secrets-configmaps.yaml

print_status "Creating secrets from .env file..."
if [ -f "scripts/create-secrets.sh" ]; then
    ./scripts/create-secrets.sh
else
    print_warning "create-secrets.sh not found. Please run it manually."
fi

print_status "Building Docker images..."
docker build -t evidence-service:latest ./microservices/evidence-service
docker build -t forensic-contracts:latest ./smart-contracts

print_status "Loading images into Kind cluster..."
kind load docker-image evidence-service:latest
kind load docker-image forensic-contracts:latest

print_status "Deploying database services..."
# Note: In a real setup, you'd deploy actual database services
# For now, we'll just create the namespace and secrets

print_status "Deploying Evidence Service..."
kubectl apply -f kubernetes/evidence-service-deployment.yaml

print_status "Deploying Smart Contracts Job..."
kubectl apply -f kubernetes/smart-contracts-job.yaml

print_status "Waiting for deployments to be ready..."
kubectl wait --for=condition=available deployment/evidence-service -n forensic-system --timeout=300s

print_success "Forensic Evidence System deployed successfully!"

echo ""
echo "📊 Cluster Status:"
kubectl get pods -n forensic-system
echo ""
echo "🌐 Services:"
kubectl get services -n forensic-system
echo ""
echo "🔗 Access URLs:"
echo "  - Evidence Service: http://localhost:3001"
echo "  - Smart Contracts: http://localhost:8545"
echo ""
echo "📝 Useful Commands:"
echo "  - View logs: kubectl logs -f deployment/evidence-service -n forensic-system"
echo "  - Port forward: kubectl port-forward service/evidence-service 3001:3001 -n forensic-system"
echo "  - Delete cluster: kind delete cluster"
echo ""
print_success "Setup complete! 🎉"
