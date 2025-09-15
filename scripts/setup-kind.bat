@echo off
REM Forensic Evidence System - Kind Setup Script for Windows
REM This script sets up a local Kubernetes cluster using kind for development

echo 🚀 Setting up Forensic Evidence System with Kind...

REM Check if kind is installed
where kind >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Kind is not installed. Please install it first:
    echo   - Windows: choco install kind
    echo   - Or download from: https://kind.sigs.k8s.io/docs/user/quick-start/
    exit /b 1
)

REM Check if kubectl is installed
where kubectl >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] kubectl is not installed. Please install it first.
    exit /b 1
)

REM Check if Docker is running
docker info >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Docker is not running. Please start Docker first.
    exit /b 1
)

echo [INFO] Creating Kind cluster...
kind create cluster --config=kind-config.yaml

echo [INFO] Waiting for cluster to be ready...
kubectl wait --for=condition=Ready nodes --all --timeout=300s

echo [INFO] Creating namespace...
kubectl apply -f kubernetes/secrets-configmaps.yaml

echo [INFO] Creating secrets from .env file...
if exist "scripts\create-secrets.bat" (
    call scripts\create-secrets.bat
) else (
    echo [WARNING] create-secrets.bat not found. Please run it manually.
)

echo [INFO] Building Docker images...
docker build -t evidence-service:latest ./microservices/evidence-service
docker build -t forensic-contracts:latest ./smart-contracts

echo [INFO] Loading images into Kind cluster...
kind load docker-image evidence-service:latest
kind load docker-image forensic-contracts:latest

echo [INFO] Deploying Evidence Service...
kubectl apply -f kubernetes/evidence-service-deployment.yaml

echo [INFO] Deploying Smart Contracts Job...
kubectl apply -f kubernetes/smart-contracts-job.yaml

echo [INFO] Waiting for deployments to be ready...
kubectl wait --for=condition=available deployment/evidence-service -n forensic-system --timeout=300s

echo [SUCCESS] Forensic Evidence System deployed successfully!

echo.
echo 📊 Cluster Status:
kubectl get pods -n forensic-system
echo.
echo 🌐 Services:
kubectl get services -n forensic-system
echo.
echo 🔗 Access URLs:
echo   - Evidence Service: http://localhost:3001
echo   - Smart Contracts: http://localhost:8545
echo.
echo 📝 Useful Commands:
echo   - View logs: kubectl logs -f deployment/evidence-service -n forensic-system
echo   - Port forward: kubectl port-forward service/evidence-service 3001:3001 -n forensic-system
echo   - Delete cluster: kind delete cluster
echo.
echo [SUCCESS] Setup complete! 🎉
