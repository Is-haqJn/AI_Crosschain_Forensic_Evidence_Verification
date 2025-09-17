#!/usr/bin/env node
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { ConfigManager } from '../config/ConfigManager.js';
import { Logger } from '../utils/Logger.js';

/**
 * Admin User Seeding Script
 * Creates an admin user for testing authenticated endpoints
 */

interface AdminUser {
  id: string;
  username: string;
  email: string;
  role: string;
  name: string;
  organization: string;
  permissions: string[];
  createdAt: Date;
  isActive: boolean;
}

class AdminSeeder {
  private config: ConfigManager;
  private logger: Logger;

  constructor() {
    this.config = ConfigManager.getInstance();
    this.logger = Logger.getInstance();
  }

  async seed(): Promise<{ user: AdminUser; token: string }> {
    try {
      // Connect to MongoDB
      const mongoConfig = this.config.get<any>('database.mongodb');
      await mongoose.connect(mongoConfig.uri, mongoConfig.options);

      // Define admin user
      const adminUser: AdminUser = {
        id: 'admin-001',
        username: 'admin',
        email: 'admin@forensic-system.local',
        role: 'SUPER_ADMIN',
        name: 'System Administrator',
        organization: 'Forensic Evidence System',
        permissions: [
          'evidence:read',
          'evidence:write',
          'evidence:delete',
          'users:manage',
          'system:admin',
          'blockchain:manage',
          'ai:analyze'
        ],
        createdAt: new Date(),
        isActive: true
      };

      // Hash password
      const password = 'ForensicAdmin2025!';
      const hashedPassword = await bcrypt.hash(password, 12);

      // Create user document for MongoDB
      const userDoc = {
        ...adminUser,
        passwordHash: hashedPassword,
        lastLogin: null,
        loginAttempts: 0,
        accountLocked: false,
        passwordChangedAt: new Date(),
        twoFactorEnabled: false
      };

      // Check if admin exists in MongoDB
      const userCollection = mongoose.connection.db?.collection('users');
      if (!userCollection) {
        throw new Error('Users collection not available');
      }

      const existingUser = await userCollection.findOne({ username: 'admin' });
      
      if (existingUser) {
        this.logger.info('Admin user already exists, updating...');
        await userCollection.updateOne(
          { username: 'admin' },
          { $set: userDoc }
        );
      } else {
        this.logger.info('Creating new admin user...');
        await userCollection.insertOne(userDoc);
      }

      // Generate JWT token using configured JWT settings
      const jwtCfg = this.config.get<any>('security.jwt');
      const token = jwt.sign(
        {
          userId: adminUser.id,
          username: adminUser.username,
          role: adminUser.role,
          name: adminUser.name,
          organization: adminUser.organization,
          permissions: adminUser.permissions
        },
        jwtCfg.secret,
        { 
          expiresIn: '24h',
          issuer: 'forensic-evidence-system',
          audience: 'evidence-service'
        }
      );

      this.logger.info('✅ Admin user seeded successfully');
      this.logger.info(`Username: ${adminUser.username}`);
      this.logger.info(`Password: ${password}`);
      this.logger.info(`JWT Token: ${token}`);

      await mongoose.disconnect();

      return { user: adminUser, token };

    } catch (error) {
      this.logger.error('Failed to seed admin user:', error);
      throw error;
    }
  }
}

// Export for programmatic use
export { AdminSeeder };

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const seeder = new AdminSeeder();
  
  seeder.seed()
    .then(({ user, token }) => {
      console.log('\n🎯 Admin User Created Successfully!');
      console.log('================================');
      console.log(`Username: ${user.username}`);
      console.log(`Email: ${user.email}`);
      console.log(`Role: ${user.role}`);
      console.log(`Password: ForensicAdmin2025!`);
      console.log('\n🔑 JWT Token (valid for 24h):');
      console.log(`Bearer ${token}`);
      console.log('\n📝 Test endpoints with:');
      console.log(`curl -H "Authorization: Bearer ${token}" http://localhost:3001/api/v1/evidence`);
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Failed to seed admin user:', error);
      process.exit(1);
    });
}