#!/usr/bin/env node

import http from 'http';
import { ConfigManager } from './config/ConfigManager.js';

/**
 * Health Check Script for Docker/Kubernetes
 * This script performs comprehensive health checks for the evidence service
 */

interface HealthCheckResult {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  checks: {
    server: boolean;
    database: boolean;
    redis: boolean;
    messageQueue: boolean;
    ipfs: boolean;
    blockchain: boolean;
  };
  uptime: number;
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
}

class HealthChecker {
  private config = ConfigManager.getInstance().getConfig();
  private startTime = Date.now();

  async performHealthCheck(): Promise<HealthCheckResult> {
    const checks = await this.runAllChecks();
    const isHealthy = Object.values(checks).every(check => check === true);

    return {
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      checks,
      uptime: Date.now() - this.startTime,
      memory: this.getMemoryUsage()
    };
  }

  private async runAllChecks(): Promise<HealthCheckResult['checks']> {
    const [server, database, redis, messageQueue, ipfs, blockchain] = await Promise.allSettled([
      this.checkServer(),
      this.checkDatabase(),
      this.checkRedis(),
      this.checkMessageQueue(),
      this.checkIPFS(),
      this.checkBlockchain()
    ]);

    return {
      server: server.status === 'fulfilled' && server.value,
      database: database.status === 'fulfilled' && database.value,
      redis: redis.status === 'fulfilled' && redis.value,
      messageQueue: messageQueue.status === 'fulfilled' && messageQueue.value,
      ipfs: ipfs.status === 'fulfilled' && ipfs.value,
      blockchain: blockchain.status === 'fulfilled' && blockchain.value
    };
  }

  private async checkServer(): Promise<boolean> {
    try {
      const port = this.config.app.port;
      return new Promise((resolve) => {
        const req = http.get(`http://localhost:${port}/health`, (res) => {
          resolve(res.statusCode === 200);
        });
        
        req.on('error', () => resolve(false));
        req.setTimeout(5000, () => {
          req.destroy();
          resolve(false);
        });
      });
    } catch (error) {
      return false;
    }
  }

  private async checkDatabase(): Promise<boolean> {
    try {
      // Check PostgreSQL connection
      const { Client } = require('pg');
      const client = new Client({
        connectionString: this.config.database.postgres.url
      });
      
      await client.connect();
      await client.query('SELECT 1');
      await client.end();
      return true;
    } catch (error) {
      return false;
    }
  }

  private async checkRedis(): Promise<boolean> {
    try {
      const redis = require('redis');
      const client = redis.createClient({
        url: this.config.database.redis.url
      });
      
      await client.connect();
      await client.ping();
      await client.quit();
      return true;
    } catch (error) {
      return false;
    }
  }

  private async checkMessageQueue(): Promise<boolean> {
    try {
      const amqp = require('amqplib');
      const connection = await amqp.connect(this.config.messageQueue.rabbitmq.url);
      await connection.close();
      return true;
    } catch (error) {
      return false;
    }
  }

  private async checkIPFS(): Promise<boolean> {
    try {
      // Check if IPFS is accessible
      const response = await fetch(`${this.config.storage.ipfs.protocol}://${this.config.storage.ipfs.host}:${this.config.storage.ipfs.port}/api/v0/version`);
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  private async checkBlockchain(): Promise<boolean> {
    try {
      // Check if we can connect to at least one blockchain network
      const { ethers } = require('ethers');
      
      const sepoliaProvider = new ethers.JsonRpcProvider(this.config.blockchain.networks.sepolia.rpcUrl);
      await sepoliaProvider.getBlockNumber();
      return true;
    } catch (error) {
      return false;
    }
  }

  private getMemoryUsage() {
    const usage = process.memoryUsage();
    const total = usage.heapTotal;
    const used = usage.heapUsed;
    
    return {
      used: Math.round(used / 1024 / 1024), // MB
      total: Math.round(total / 1024 / 1024), // MB
      percentage: Math.round((used / total) * 100)
    };
  }
}

// Main execution
async function main() {
  const healthChecker = new HealthChecker();
  
  try {
    const result = await healthChecker.performHealthCheck();
    
    console.log(JSON.stringify(result, null, 2));
    
    // Exit with appropriate code for Docker/Kubernetes
    process.exit(result.status === 'healthy' ? 0 : 1);
  } catch (error) {
    console.error('Health check failed:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('Health check received SIGTERM, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Health check received SIGINT, shutting down gracefully');
  process.exit(0);
});

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default HealthChecker;
