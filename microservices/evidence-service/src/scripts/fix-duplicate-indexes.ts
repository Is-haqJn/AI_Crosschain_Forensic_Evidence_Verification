import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function fixDuplicateIndexes() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://forensic_user:password@localhost:27017/forensic_evidence';
    
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Get the users collection
    const db = mongoose.connection.db;
    if (!db) {
      throw new Error('Database connection not established');
    }

    const usersCollection = db.collection('users');
    
    // List all indexes
    console.log('\n📋 Current indexes on users collection:');
    const indexes = await usersCollection.indexes();
    indexes.forEach((index, i) => {
      console.log(`  ${i + 1}. Name: ${index.name}`);
      console.log(`     Key: ${JSON.stringify(index.key)}`);
      console.log(`     Unique: ${index.unique || false}`);
      console.log('');
    });

    // Look for duplicate email indexes
    const emailIndexes = indexes.filter(index => 
      index.key.email !== undefined && index.name !== '_id_'
    );

    if (emailIndexes.length > 1) {
      console.log(`⚠️  Found ${emailIndexes.length} indexes on email field:`);
      emailIndexes.forEach((index, i) => {
        console.log(`  ${i + 1}. ${index.name} (unique: ${index.unique || false})`);
      });

      // Keep the unique index, drop the others
      const uniqueIndex = emailIndexes.find(idx => idx.unique === true);
      const indexesToDrop = emailIndexes.filter(idx => idx !== uniqueIndex && idx.name !== 'email_1');

      if (indexesToDrop.length > 0) {
        console.log('\n🗑️  Dropping duplicate indexes:');
        for (const index of indexesToDrop) {
          try {
            if (index.name) {
              await usersCollection.dropIndex(index.name);
              console.log(`  ✅ Dropped index: ${index.name}`);
            }
          } catch (error) {
            console.error(`  ❌ Failed to drop index ${index.name}:`, error);
          }
        }
      }

      // If there's a non-unique 'email_1' index and we have a unique constraint, drop it
      const simpleEmailIndex = emailIndexes.find(idx => idx.name === 'email_1' && !idx.unique);
      if (simpleEmailIndex && uniqueIndex) {
        try {
          await usersCollection.dropIndex('email_1');
          console.log(`  ✅ Dropped redundant index: email_1`);
        } catch (error) {
          console.error(`  ❌ Failed to drop index email_1:`, error);
        }
      }
    } else {
      console.log('✅ No duplicate email indexes found');
    }

    // Check userId indexes too
    const userIdIndexes = indexes.filter(index => 
      index.key.userId !== undefined && index.name !== '_id_'
    );

    if (userIdIndexes.length > 1) {
      console.log(`\n⚠️  Found ${userIdIndexes.length} indexes on userId field`);
      // Similar logic for userId if needed
    }

    // List indexes after cleanup
    console.log('\n📋 Indexes after cleanup:');
    const finalIndexes = await usersCollection.indexes();
    finalIndexes.forEach((index, i) => {
      console.log(`  ${i + 1}. Name: ${index.name}`);
      console.log(`     Key: ${JSON.stringify(index.key)}`);
      console.log(`     Unique: ${index.unique || false}`);
      console.log('');
    });

    console.log('✅ Index cleanup completed');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the script
fixDuplicateIndexes().catch(console.error);
