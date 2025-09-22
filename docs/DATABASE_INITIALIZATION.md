# Database Initialization Documentation

## Overview
This document explains how the database schemas are created and initialized in the Forensic Evidence System.

## Database Architecture

### MongoDB Collections
The system uses MongoDB for the following collections:

1. **users** - User management and authentication
2. **evidences** - Evidence records and metadata
3. **cases** - Case management and organization

### PostgreSQL Database
The system uses PostgreSQL for:
- Relational data storage
- ACID compliance for critical operations
- Complex queries and reporting

## Schema Creation Process

### Issue Identified
**Problem**: Database schemas were not being created automatically when the evidence service started.

**Root Cause**: Mongoose models are only created when they are first used (lazy initialization). The database collections and schemas are not created until the first document is inserted.

### Solution Implemented

#### 1. Database Initialization Script
Created `init-db.js` script that:
- Connects to MongoDB using Docker service name
- Defines the User schema with all required fields
- Creates an admin user if it doesn't exist
- Lists all collections to verify creation

#### 2. Required User Schema Fields
Based on the User model analysis, the following fields are required:

```javascript
{
  userId: String (required, unique),
  email: String (required, unique),
  name: String (required),
  organization: String (required),
  role: String (enum: ['investigator', 'validator', 'admin']),
  passwordHash: String (required),
  tokenVersion: Number (default: 0),
  createdAt: Date (auto-generated),
  updatedAt: Date (auto-generated)
}
```

#### 3. Admin User Creation
The system creates a default admin user with:
- **Email**: admin@forensic-system.local
- **Password**: ForensicAdmin2025!
- **Role**: admin
- **Organization**: Forensic Evidence System
- **Name**: System Administrator

## Database Initialization Steps

### 1. Manual Initialization (Current Method)
```bash
# Copy initialization script to evidence service container
docker cp init-db.js forensic-evidence-system-evidence-service-1:/app/init-db.js

# Run initialization script
docker exec forensic-evidence-system-evidence-service-1 node init-db.js
```

### 2. Verification
After initialization, verify the setup:
```bash
# Check MongoDB collections
docker exec forensic-evidence-system-mongodb-1 mongosh --eval "use evidence_db; show collections;"

# Test admin login
curl -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@forensic-system.local", "password": "ForensicAdmin2025!"}'
```

## Database Connection Details

### MongoDB Configuration
- **Host**: mongodb (Docker service name)
- **Port**: 27017
- **Database**: evidence_db
- **Username**: forensic_admin
- **Password**: forensic_mongo_secure_2025
- **Auth Source**: admin

### PostgreSQL Configuration
- **Host**: postgres (Docker service name)
- **Port**: 5432
- **Database**: forensic_db
- **Username**: forensic_user
- **Password**: forensic_postgres_secure_2025

## Schema Validation

### User Registration Requirements
The evidence service requires the following fields for user registration:
- **email** (required, unique)
- **password** (required)
- **name** (required)
- **organization** (required)
- **role** (optional, defaults to 'investigator')

### Evidence Schema Requirements
The evidence service requires:
- **evidenceId** (required, unique)
- **ipfsHash** (required)
- **dataHash** (required, unique)
- **type** (required, enum)
- **submitter** (required, includes userId, name, organization, role)

## Troubleshooting

### Common Issues

1. **"relation does not exist" errors**
   - Cause: PostgreSQL tables not created
   - Solution: Ensure evidence service has run its database migrations

2. **"collection does not exist" errors**
   - Cause: MongoDB collections not created
   - Solution: Run the database initialization script

3. **Authentication failures**
   - Cause: Admin user not created
   - Solution: Run the initialization script to create admin user

### Verification Commands

```bash
# Check PostgreSQL tables
docker exec forensic-evidence-system-postgres-1 psql -U forensic_user -d forensic_db -c "\dt"

# Check MongoDB collections
docker exec forensic-evidence-system-mongodb-1 mongosh --eval "use evidence_db; show collections;"

# Test API endpoints
curl http://localhost:3001/health
curl http://localhost:3001/api/v1/auth/login -X POST -H "Content-Type: application/json" -d '{"email":"admin@forensic-system.local","password":"ForensicAdmin2025!"}'
```

## Future Improvements

### Automated Initialization
Consider implementing:
1. Database migration scripts that run on service startup
2. Health checks that verify database schema existence
3. Automatic admin user creation on first startup
4. Database seeding scripts for development environments

### Schema Management
1. Version-controlled database migrations
2. Schema validation on startup
3. Automatic index creation
4. Database backup and restore procedures

## Security Considerations

1. **Admin Credentials**: The default admin password should be changed in production
2. **Database Access**: Ensure proper authentication and authorization
3. **Connection Security**: Use SSL/TLS for database connections in production
4. **Password Hashing**: All passwords are properly hashed using bcrypt

## Related Files

- `microservices/evidence-service/src/models/User.model.ts` - User schema definition
- `microservices/evidence-service/src/models/Evidence.model.ts` - Evidence schema definition
- `microservices/evidence-service/src/models/Case.model.ts` - Case schema definition
- `init-db.js` - Database initialization script
- `docker-compose.dev.yml` - Database service configuration
- `.env` - Database connection environment variables
