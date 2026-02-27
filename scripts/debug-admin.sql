-- Debug Admin Account
-- Run this in pgAdmin Query Tool on your production database

-- Check if admin account exists and its details
SELECT 
    bo.id,
    bo.email,
    bo.is_admin,
    bo.is_active,
    bo.brand_id,
    b.name as brand_name,
    b.subdomain
FROM brand_owners bo
LEFT JOIN brands b ON b.id = bo.brand_id
WHERE bo.email = 'admin@chronizer.com';

-- List all accounts to find the correct one
SELECT 
    id,
    email,
    is_admin,
    is_active,
    brand_id,
    created_at
FROM brand_owners 
ORDER BY created_at;

-- Check if admin brand exists
SELECT * FROM brands WHERE subdomain = 'admin';
