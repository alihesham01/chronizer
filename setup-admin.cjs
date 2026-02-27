const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

async function setup() {
  const pool = new Pool({
    connectionString: 'postgres://chronizer_user:9b2bf7e48b4aa7da@localhost:5432/chronizer'
  });

  // Set admin password to: Admin@Chronizer2024!
  const password = 'Admin@Chronizer2024!';
  const hash = await bcrypt.hash(password, 12);

  await pool.query(
    'UPDATE brand_owners SET password_hash = $1 WHERE id = $2',
    [hash, '00000000-0000-0000-0000-000000000002']
  );

  // Verify
  const r = await pool.query(
    'SELECT email, is_admin, first_name FROM brand_owners WHERE id = $1',
    ['00000000-0000-0000-0000-000000000002']
  );
  console.log('Admin account:', r.rows[0]);

  const valid = await bcrypt.compare(password, hash);
  console.log('Password valid:', valid);
  console.log('Login with: admin@chronizer.com / Admin@Chronizer2024!');

  await pool.end();
}

setup().catch(console.error);
