import postgres from 'postgres';
import crypto from 'crypto';
import { config } from 'dotenv';

config({ path: '.env' });

const connectionString = process.env.DATABASE_URL ||
  'postgres://woke_user:woke_password_2024@localhost:5432/woke_portal';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const key = process.env.PORTAL_ENCRYPTION_KEY;
  if (!key) {
    throw new Error('PORTAL_ENCRYPTION_KEY environment variable is required. Set it in .env');
  }
  return crypto.scryptSync(key, 'chronizer-salt', 32);
}

function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

function isEncrypted(value: string): boolean {
  const parts = value.split(':');
  if (parts.length !== 3) return false;
  return parts.every(p => /^[0-9a-f]+$/i.test(p));
}

async function migratePasswords() {
  console.log('=== Encrypt Portal Passwords Migration ===\n');

  const sql = postgres(connectionString, { max: 1 });

  try {
    // Check if table exists
    const tableCheck = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'store_portal_creds'
      ) AS exists
    `;

    if (!tableCheck[0].exists) {
      console.log('store_portal_creds table does not exist yet. Nothing to migrate.');
      await sql.end();
      process.exit(0);
    }

    // Get all credentials
    const creds = await sql`SELECT id, group_name, portal_password FROM store_portal_creds`;

    if (creds.length === 0) {
      console.log('No portal credentials found. Nothing to migrate.');
      await sql.end();
      process.exit(0);
    }

    console.log(`Found ${creds.length} credential(s) to check.\n`);

    let encrypted = 0;
    let skipped = 0;

    for (const cred of creds) {
      if (isEncrypted(cred.portal_password)) {
        console.log(`  [SKIP] ${cred.group_name} (id: ${cred.id}) — already encrypted`);
        skipped++;
        continue;
      }

      const encryptedPassword = encrypt(cred.portal_password);
      await sql`
        UPDATE store_portal_creds 
        SET portal_password = ${encryptedPassword}, updated_at = NOW()
        WHERE id = ${cred.id}
      `;
      console.log(`  [DONE] ${cred.group_name} (id: ${cred.id}) — password encrypted`);
      encrypted++;
    }

    console.log(`\n=== Migration complete ===`);
    console.log(`  Encrypted: ${encrypted}`);
    console.log(`  Skipped (already encrypted): ${skipped}`);
    console.log(`  Total: ${creds.length}\n`);

    await sql.end();
    process.exit(0);
  } catch (error: any) {
    console.error('Migration failed:', error.message || error);
    await sql.end();
    process.exit(1);
  }
}

migratePasswords();
