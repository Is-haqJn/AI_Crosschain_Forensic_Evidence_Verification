@echo off
REM ==========================================
REM Quick Start Script for Forensic Evidence System
REM ==========================================

echo ============================================
echo AI CROSS-CHAIN FORENSIC EVIDENCE SYSTEM
echo QUICK START SCRIPT
echo ============================================
echo.

REM Check if .env exists
if not exist .env (
    echo [WARNING] .env file not found!
    echo Creating .env from template...
    copy .env.example .env
    echo.
    echo [ACTION REQUIRED] Please edit .env file and add:
    echo   - SEPOLIA_RPC_URL (Your Infura key)
    echo   - WALLET_PRIVATE_KEY (Your MetaMask private key)
    echo.
    pause
    exit /b 1
)

echo [1/6] Starting Docker services...
docker-compose up -d
if %errorlevel% neq 0 (
    echo [ERROR] Failed to start Docker services
    echo Make sure Docker Desktop is running!
    pause
    exit /b 1
)

echo.
echo [2/6] Waiting for services to initialize (30 seconds)...
timeout /t 30 /nobreak > nul

echo.
echo [3/6] Installing Evidence Service dependencies...
cd microservices\evidence-service
call npm install --silent
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install Evidence Service dependencies
    pause
    exit /b 1
)

echo.
echo [4/6] Building Evidence Service...
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Failed to build Evidence Service
    pause
    exit /b 1
)

echo.
echo [5/6] Installing Smart Contract dependencies...
cd ..\..\smart-contracts
call npm install --silent
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install Smart Contract dependencies
    pause
    exit /b 1
)

echo.
echo [6/6] Compiling Smart Contracts...
call npx hardhat compile
if %errorlevel% neq 0 (
    echo [ERROR] Failed to compile Smart Contracts
    pause
    exit /b 1
)

cd ..

echo.
echo ============================================
echo SETUP COMPLETE!
echo ============================================
echo.
echo Services Running:
echo   - PostgreSQL:    localhost:5432
echo   - MongoDB:       localhost:27017
echo   - Redis:         localhost:6379
echo   - RabbitMQ:      localhost:15672 (UI)
echo   - IPFS:          localhost:5001 (API)
echo.
echo Next Steps:
echo   1. Deploy smart contracts:
echo      cd smart-contracts
echo      npx hardhat run scripts/deploy.js --network sepolia
echo.
echo   2. Start Evidence Service:
echo      cd microservices\evidence-service
echo      npm run dev
echo.
echo   3. Start AI Service (optional):
echo      cd microservices\ai-analysis-service
echo      python main.py
echo.
echo Access Points:
echo   - RabbitMQ UI: http://localhost:15672
echo     Username: rabbitmq_user
echo     Password: rabbitmq_pass
echo   - IPFS WebUI: http://localhost:5001/webui
echo.
echo ============================================
pause
