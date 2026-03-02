import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const key = process.env.PORTAL_ENCRYPTION_KEY;
  if (!key) {
    throw new Error('PORTAL_ENCRYPTION_KEY environment variable is required');
  }
  // Derive a 32-byte key from the provided secret
  return crypto.scryptSync(key, 'chronizer-salt', 32);
}

export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:ciphertext (all hex)
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

export function decrypt(encryptedString: string): string {
  const key = getEncryptionKey();
  const parts = encryptedString.split(':');

  if (parts.length !== 3) {
    // Not encrypted (legacy plain-text) — return as-is
    return encryptedString;
  }

  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const ciphertext = parts[2];

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

export function isEncrypted(value: string): boolean {
  const parts = value.split(':');
  if (parts.length !== 3) return false;
  // Check if all parts are valid hex
  return parts.every(p => /^[0-9a-f]+$/i.test(p));
}
