const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function fixAdminPassword() {
  console.log('🔐 Fixing admin password...');
  
  try {
    // Generate proper bcrypt hash for "Admin@Chronizer2024!"
    const password = 'Admin@Chronizer2024!';
    const hash = await bcrypt.hash(password, 10);
    console.log('✅ Generated bcrypt hash');

    // Update admin user password
    const result = await pool.query(
      `UPDATE brand_owners SET password_hash = $1 WHERE email = 'admin@chronizer.com' RETURNING id, email, is_admin`,
      [hash]
    );

    if (result.rowCount > 0) {
      console.log('✅ Admin password updated:', result.rows[0]);
    } else {
      console.log('❌ Admin user not found');
    }

    // Verify the password works
    const user = await pool.query(
      `SELECT id, email, password_hash, is_admin FROM brand_owners WHERE email = 'admin@chronizer.com'`
    );
    
    if (user.rows.length > 0) {
      const match = await bcrypt.compare(password, user.rows[0].password_hash);
      console.log('✅ Password verification:', match ? 'SUCCESS' : 'FAILED');
      console.log('✅ Is admin:', user.rows[0].is_admin);
    }

    console.log('\n🎉 Done! You can now login with:');
    console.log('📧 Email: admin@chronizer.com');
    console.log('🔑 Password: Admin@Chronizer2024!');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

fixAdminPassword();
