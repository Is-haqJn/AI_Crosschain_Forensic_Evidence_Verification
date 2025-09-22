#!/usr/bin/env node
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

// MongoDB connection
const MONGODB_URI = 'mongodb://forensic_admin:forensic_mongo_secure_2025@mongodb:27017/evidence_db?authSource=admin';

// User Schema
const userSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  organization: { type: String, required: true },
  role: { type: String, enum: ['investigator', 'validator', 'admin'], default: 'investigator' },
  passwordHash: { type: String, required: true },
  tokenVersion: { type: Number, default: 0 }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

async function initDatabase() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Check if admin user exists
    const existingAdmin = await User.findOne({ email: 'admin@forensic-system.local' });
    
    if (existingAdmin) {
      console.log('👤 Admin user already exists');
      console.log(`Email: ${existingAdmin.email}`);
      console.log(`Role: ${existingAdmin.role}`);
    } else {
      console.log('👤 Creating admin user...');
      
      // Hash password
      const password = 'ForensicAdmin2025!';
      const passwordHash = await bcrypt.hash(password, 12);
      
      // Create admin user
      const adminUser = new User({
        userId: 'admin-001',
        email: 'admin@forensic-system.local',
        name: 'System Administrator',
        organization: 'Forensic Evidence System',
        role: 'admin',
        passwordHash: passwordHash
      });
      
      await adminUser.save();
      console.log('✅ Admin user created successfully');
      console.log(`Email: ${adminUser.email}`);
      console.log(`Password: ${password}`);
      console.log(`Role: ${adminUser.role}`);
    }

    // Check collections
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('\n📊 Database Collections:');
    collections.forEach(col => console.log(`- ${col.name}`));

    await mongoose.disconnect();
    console.log('\n✅ Database initialization complete');
    
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    process.exit(1);
  }
}

initDatabase();
