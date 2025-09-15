const jwt = require('jsonwebtoken');
require('dotenv').config();

const secret = process.env.JWT_SECRET;
if (!secret) {
  console.error('JWT_SECRET not set. Please define it in the environment before running this script.');
  process.exit(1);
}

// Claims aligned with AuthMiddleware expectations
const payload = {
  id: 'admin-001',
  email: 'admin@forensic-system.local',
  role: 'admin',
  organization: 'Forensic Department'
};

const token = jwt.sign(payload, secret, {
  expiresIn: '24h',
  issuer: 'forensic-evidence-system',
  audience: 'evidence-service'
});

console.log(token);

