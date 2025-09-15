const path = require('path');
const { createRequire } = require('module');

// Resolve modules from evidence-service to avoid needing a root package.json
const servicePkg = path.resolve(__dirname, 'microservices/evidence-service/package.json');
const requireFromService = createRequire(servicePkg);
const jwt = requireFromService('jsonwebtoken');
const dotenv = requireFromService('dotenv');

// Load root .env explicitly
dotenv.config({ path: path.resolve(__dirname, '.env') });

// JWT token generator for testing (claims must match backend expectations)
const payload = {
  id: 'admin-001',
  email: 'admin@forensic-system.local',
  role: 'admin',
  organization: 'Forensic Department',
};

const secret = process.env.JWT_SECRET;
if (!secret) {
  console.error('JWT_SECRET not set in environment. Please set it in .env.');
  process.exit(1);
}

const token = jwt.sign(payload, secret, {
  expiresIn: process.env.JWT_EXPIRY || '24h',
  issuer: 'forensic-evidence-system',
  audience: 'evidence-service',
});

console.log(token);
