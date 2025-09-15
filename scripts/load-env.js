#!/usr/bin/env node

/**
 * Cross-platform environment variable loader
 * This script loads environment variables from .env file and creates Kubernetes secrets
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Colors for console output
const colors = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    reset: '\x1b[0m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function loadEnvFile(envPath = '.env') {
    if (!fs.existsSync(envPath)) {
        log(`[ERROR] ${envPath} file not found`, 'red');
        process.exit(1);
    }

    const envVars = {};
    const content = fs.readFileSync(envPath, 'utf8');
    
    content.split('\n').forEach(line => {
        line = line.trim();
        if (line && !line.startsWith('#')) {
            const [key, ...valueParts] = line.split('=');
            if (key && valueParts.length > 0) {
                envVars[key.trim()] = valueParts.join('=').trim();
            }
        }
    });

    return envVars;
}

function createKubernetesSecret(secretName, data, namespace = 'forensic-system') {
    const args = [
        'create', 'secret', 'generic', secretName,
        '--namespace', namespace,
        '--dry-run=client', '-o', 'yaml'
    ];

    Object.entries(data).forEach(([key, value]) => {
        args.push(`--from-literal=${key}=${value}`);
    });

    try {
        const result = execSync(`kubectl ${args.join(' ')} | kubectl apply -f -`, { 
            encoding: 'utf8',
            stdio: 'pipe'
        });
        log(`[SUCCESS] Created secret: ${secretName}`, 'green');
        return true;
    } catch (error) {
        log(`[ERROR] Failed to create secret: ${secretName}`, 'red');
        log(error.message, 'red');
        return false;
    }
}

function createKubernetesConfigMap(configMapName, data, namespace = 'forensic-system') {
    const args = [
        'create', 'configmap', configMapName,
        '--namespace', namespace,
        '--dry-run=client', '-o', 'yaml'
    ];

    Object.entries(data).forEach(([key, value]) => {
        args.push(`--from-literal=${key}=${value}`);
    });

    try {
        const result = execSync(`kubectl ${args.join(' ')} | kubectl apply -f -`, { 
            encoding: 'utf8',
            stdio: 'pipe'
        });
        log(`[SUCCESS] Created configmap: ${configMapName}`, 'green');
        return true;
    } catch (error) {
        log(`[ERROR] Failed to create configmap: ${configMapName}`, 'red');
        log(error.message, 'red');
        return false;
    }
}

function main() {
    log('🔐 Creating Kubernetes secrets from environment variables...', 'blue');

    // Load environment variables
    const envVars = loadEnvFile();
    log(`[INFO] Loaded ${Object.keys(envVars).length} environment variables`, 'yellow');

    // Required variables check
    const requiredVars = [
        'DATABASE_URL', 'MONGODB_URI', 'REDIS_URL', 'RABBITMQ_URL',
        'JWT_SECRET', 'JWT_REFRESH_SECRET', 'ENCRYPTION_KEY',
        'SEPOLIA_RPC_URL', 'AMOY_RPC_URL', 'PRIVATE_KEY',
        'ETHERSCAN_API_KEY', 'POLYGONSCAN_API_KEY', 'OPENAI_API_KEY'
    ];

    const missingVars = requiredVars.filter(varName => !envVars[varName]);
    if (missingVars.length > 0) {
        log(`[ERROR] Missing required environment variables: ${missingVars.join(', ')}`, 'red');
        process.exit(1);
    }

    // Create evidence service secrets
    log('[INFO] Creating evidence service secrets...', 'yellow');
    createKubernetesSecret('evidence-secrets', {
        DATABASE_URL: envVars.DATABASE_URL,
        MONGODB_URI: envVars.MONGODB_URI,
        REDIS_URL: envVars.REDIS_URL,
        RABBITMQ_URL: envVars.RABBITMQ_URL,
        JWT_SECRET: envVars.JWT_SECRET,
        JWT_REFRESH_SECRET: envVars.JWT_REFRESH_SECRET,
        ENCRYPTION_KEY: envVars.ENCRYPTION_KEY
    });

    // Create blockchain secrets
    log('[INFO] Creating blockchain secrets...', 'yellow');
    createKubernetesSecret('blockchain-secrets', {
        SEPOLIA_RPC_URL: envVars.SEPOLIA_RPC_URL,
        AMOY_RPC_URL: envVars.AMOY_RPC_URL,
        PRIVATE_KEY: envVars.PRIVATE_KEY,
        ETHERSCAN_API_KEY: envVars.ETHERSCAN_API_KEY,
        POLYGONSCAN_API_KEY: envVars.POLYGONSCAN_API_KEY
    });

    // Create AI service secrets
    log('[INFO] Creating AI service secrets...', 'yellow');
    createKubernetesSecret('ai-secrets', {
        OPENAI_API_KEY: envVars.OPENAI_API_KEY
    });

    // Create contract addresses configmap
    log('[INFO] Creating contract addresses configmap...', 'yellow');
    createKubernetesConfigMap('contract-addresses', {
        CONTRACT_ADDRESS_SEPOLIA: envVars.CONTRACT_ADDRESS_SEPOLIA,
        CONTRACT_ADDRESS_AMOY: envVars.CONTRACT_ADDRESS_AMOY,
        BRIDGE_CONTRACT_SEPOLIA: envVars.BRIDGE_CONTRACT_SEPOLIA,
        BRIDGE_CONTRACT_AMOY: envVars.BRIDGE_CONTRACT_AMOY
    });

    // Create service configuration configmap
    log('[INFO] Creating service configuration configmap...', 'yellow');
    createKubernetesConfigMap('service-config', {
        NEXT_PUBLIC_SEPOLIA_RPC: envVars.NEXT_PUBLIC_SEPOLIA_RPC,
        NEXT_PUBLIC_AMOY_RPC: envVars.NEXT_PUBLIC_AMOY_RPC
    });

    // Show current status
    log('\n📊 Current secrets:', 'cyan');
    try {
        execSync('kubectl get secrets -n forensic-system', { stdio: 'inherit' });
    } catch (error) {
        log('[WARNING] Could not list secrets', 'yellow');
    }

    log('\n📊 Current configmaps:', 'cyan');
    try {
        execSync('kubectl get configmaps -n forensic-system', { stdio: 'inherit' });
    } catch (error) {
        log('[WARNING] Could not list configmaps', 'yellow');
    }

    log('\n[SUCCESS] Secret management complete! 🎉', 'green');
    log('[INFO] All secrets have been loaded from your .env file', 'blue');
}

if (require.main === module) {
    main();
}

module.exports = { loadEnvFile, createKubernetesSecret, createKubernetesConfigMap };
