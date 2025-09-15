@echo off
REM Windows batch script for starting forensic evidence system for testing
REM Handles dependencies and provides proper startup sequence

echo.
echo ========================================
echo  Forensic Evidence System - Test Setup
echo ========================================
echo.

REM Check if Docker is running
echo [1/5] Checking Docker status...
docker version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Docker is not running. Please start Docker Desktop first.
    echo    Then run this script again.
    pause
    exit /b 1
)
echo ✅ Docker is running

REM Start minimal infrastructure for testing (just PostgreSQL for simplicity)
echo.
echo [2/5] Starting minimal infrastructure...
echo Starting PostgreSQL for testing...

REM Create a simple docker run for PostgreSQL
docker stop forensic-postgres-test 2>nul
docker rm forensic-postgres-test 2>nul

docker run -d ^
  --name forensic-postgres-test ^
  -e POSTGRES_DB=forensic_db ^
  -e POSTGRES_USER=forensic_user ^
  -e POSTGRES_PASSWORD=test_password ^
  -p 5432:5432 ^
  postgres:15-alpine

if %errorlevel% neq 0 (
    echo ❌ Failed to start PostgreSQL container
    pause
    exit /b 1
)

echo ✅ PostgreSQL container started

REM Wait for PostgreSQL to be ready
echo.
echo [3/5] Waiting for PostgreSQL to be ready...
timeout /t 10 /nobreak > nul
echo ✅ PostgreSQL should be ready

REM Set minimal environment variables for testing
echo.
echo [4/5] Setting test environment variables...
set DATABASE_URL=postgresql://forensic_user:test_password@localhost:5432/forensic_db
set NODE_ENV=development
set PORT=3001
set JWT_SECRET=test-secret-for-development-only
set JWT_REFRESH_SECRET=test-refresh-secret-for-development-only
set IPFS_HOST=localhost
set IPFS_PORT=5001

echo ✅ Environment configured for testing

REM Build and start the evidence service
echo.
echo [5/5] Building and starting Evidence Service...
cd microservices\evidence-service

echo Building TypeScript...
call npm run build
if %errorlevel% neq 0 (
    echo ❌ Build failed. Check for TypeScript errors.
    pause
    exit /b 1
)

echo ✅ Build successful
echo.
echo Starting Evidence Service in development mode...
echo Access the API at: http://localhost:3001
echo Health check: http://localhost:3001/health
echo.
echo ⚠️  This is a MINIMAL setup for testing only!
echo ⚠️  For full functionality, start all Docker services.
echo.
echo Press Ctrl+C to stop the service when done testing.
echo.

REM Start the service
call npm start

REM Cleanup on exit
echo.
echo Cleaning up test containers...
docker stop forensic-postgres-test
docker rm forensic-postgres-test
echo ✅ Cleanup complete

pause