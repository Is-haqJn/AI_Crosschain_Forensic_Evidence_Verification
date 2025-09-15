@echo off
REM ==================== setup.bat ====================
REM Setup script for Windows - AI Cross-Chain Forensic Evidence System

echo ========================================================
echo AI Cross-Chain Forensic Evidence System - Windows Setup
echo ========================================================
echo.

REM Check prerequisites
echo Checking prerequisites...

REM Check Docker
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Docker is not installed or not in PATH
    echo Please install Docker Desktop from: https://www.docker.com/products/docker-desktop
    pause
    exit /b 1
)
echo [OK] Docker found

REM Check Node.js
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH
    echo Please install Node.js from: https://nodejs.org/
    pause
    exit /b 1
)
echo [OK] Node.js found

REM Check npm
npm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] npm is not installed
    pause
    exit /b 1
)
echo [OK] npm found

echo.
echo Creating environment file...
if not exist .env (
    copy .env.example .env
    echo [OK] Created .env file from .env.example
    echo [WARNING] Please update .env with your actual configuration values
) else (
    echo [WARNING] .env file already exists
)

echo.
echo Installing Evidence Service dependencies...
cd microservices\evidence-service
call npm install
cd ..\..
echo [OK] Evidence Service dependencies installed

echo.
echo Setting up smart contracts...
cd smart-contracts
call npm init -y
call npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox @openzeppelin/contracts
cd ..
echo [OK] Smart contracts setup complete

echo.
echo ========================================
echo Initial setup complete!
echo ========================================
echo.
echo Next steps:
echo 1. Update .env file with your configuration:
echo    - Add your Infura API key for Sepolia RPC
echo    - Add your MetaMask wallet private key
echo 2. Start the infrastructure services:
echo    docker-compose up -d
echo 3. Deploy smart contracts:
echo    cd smart-contracts
echo    npx hardhat compile
echo    npx hardhat run scripts/deploy.js --network sepolia
echo 4. Access services:
echo    - RabbitMQ: http://localhost:15672 (rabbitmq_user/rabbitmq_pass)
echo    - IPFS: http://localhost:5001/webui
echo.
echo Important Security Notes:
echo - Never commit your .env file to version control
echo - Keep your private keys secure
echo - Use test networks (Sepolia/Amoy) for development
echo.

set /p start_docker="Do you want to start the Docker services now? (y/n): "
if /i "%start_docker%"=="y" (
    docker-compose up -d
    echo [OK] Docker services started!
    echo You can check the status with: docker-compose ps
)

pause
