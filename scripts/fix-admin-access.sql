-- Fix Admin Access
-- Run this in pgAdmin Query Tool on your production database

-- Update admin@chronizer.com to have admin privileges
UPDATE brand_owners 
SET is_admin = true 
WHERE email = 'admin@chronizer.com' AND is_active = true;

-- Verify the update
SELECT id, email, is_admin, is_active, created_at 
FROM brand_owners 
WHERE email = 'admin@chronizer.com';

-- If no rows were updated, you might need to check:
-- 1. The exact email in your database
-- 2. Whether the account exists

-- To list all brand_owners to find your admin account:
-- SELECT id, email, is_admin, is_active FROM brand_owners ORDER BY created_at;
