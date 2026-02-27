-- Quick Admin Fix
-- Run this in pgAdmin Query Tool

-- Just update the existing admin account
UPDATE brand_owners 
SET is_admin = true 
WHERE email = 'admin@chronizer.com';

-- Check if it worked
SELECT email, is_admin, is_active FROM brand_owners WHERE email = 'admin@chronizer.com';
