import crypto from 'crypto';

// Generate a secure 256-bit (32-byte) secret for JWT
const jwtSecret = crypto.randomBytes(32).toString('hex');

console.log('Generated JWT Secret:');
console.log('');
console.log('JWT_SECRET=' + jwtSecret);
console.log('');
console.log('Copy this secret to your .env file immediately!');
console.log('Store it securely in your secrets manager for production.');
