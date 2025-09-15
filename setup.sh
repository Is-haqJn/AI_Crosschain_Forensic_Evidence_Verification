#!/bin/bash

# ==================== setup.sh ====================
# Complete setup script for AI Cross-Chain Forensic Evidence System

set -e  # Exit on error

echo "🚀 AI Cross-Chain Forensic Evidence System - Setup Script"
echo "========================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# Check prerequisites
check_prerequisites() {
    echo "Checking prerequisites..."
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed"
        echo "Please install Docker Desktop from: https://www.docker.com/products/docker-desktop"
        exit 1
    fi
    print_success "Docker found"
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed"
        echo "Please install Node.js from: https://nodejs.org/"
        exit 1
    fi
    print_success "Node.js found: $(node -v)"
    
    # Check npm
    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed"
        exit 1
    fi
    print_success "npm found: $(npm -v)"
}

# Install dependencies for Evidence Service
install_evidence_service() {
    echo -e "\n📦 Installing Evidence Service dependencies..."
    cd microservices/evidence-service
    npm install
    cd ../..
    print_success "Evidence Service dependencies installed"
}

# Setup smart contracts
setup_smart_contracts() {
    echo -e "\n📜 Setting up smart contracts..."
    cd smart-contracts
    npm init -y
    npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox @openzeppelin/contracts
    cd ..
    print_success "Smart contracts setup complete"
}

# Create .env file
create_env_file() {
    echo -e "\n📝 Creating environment configuration..."
    if [ ! -f .env ]; then
        cp .env.example .env
        print_success "Created .env file from .env.example"
        print_warning "Please update .env with your actual configuration values"
    else
        print_warning ".env file already exists"
    fi
}

# Main execution
main() {
    echo -e "\n🎯 Starting setup process...\n"
    
    check_prerequisites
    create_env_file
    install_evidence_service
    setup_smart_contracts
    
    echo -e "\n${GREEN}========================================${NC}"
    echo -e "${GREEN}✨ Initial setup complete!${NC}"
    echo -e "${GREEN}========================================${NC}"
    
    echo -e "\n📋 Next steps:"
    echo "1. Update .env file with your configuration:"
    echo "   - Add your Infura API key for Sepolia RPC"
    echo "   - Add your MetaMask wallet private key"
    echo "2. Start the infrastructure services:"
    echo "   docker-compose up -d"
    echo "3. Deploy smart contracts:"
    echo "   cd smart-contracts"
    echo "   npx hardhat compile"
    echo "   npx hardhat run scripts/deploy.js --network sepolia"
    echo "4. Access RabbitMQ management: http://localhost:15672"
    echo "   Username: rabbitmq_user"
    echo "   Password: rabbitmq_pass"
    
    echo -e "\n${YELLOW}Important Security Notes:${NC}"
    echo "- Never commit your .env file to version control"
    echo "- Keep your private keys secure"
    echo "- Use test networks (Sepolia/Amoy) for development"
    
    # Ask if user wants to start services
    read -p "Do you want to start the Docker services now? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        docker-compose up -d
        print_success "Docker services started!"
        echo "You can check the status with: docker-compose ps"
    fi
}

# Run main function
main
