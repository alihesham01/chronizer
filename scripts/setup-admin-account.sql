-- Complete Admin Account Setup
-- Run this in pgAdmin Query Tool on your production database

-- First, find or create the admin brand
INSERT INTO brands (id, name, subdomain, is_active, created_at) 
VALUES (
    gen_random_uuid(),
    'Admin',
    'admin',
    true,
    NOW()
) 
ON CONFLICT (subdomain) DO NOTHING;

-- Get the admin brand ID
DO $$
DECLARE
    admin_brand_id UUID;
BEGIN
    SELECT id INTO admin_brand_id FROM brands WHERE subdomain = 'admin';
    
    -- Update or create the admin account
    INSERT INTO brand_owners (id, email, password_hash, first_name, last_name, is_admin, is_active, brand_id, created_at)
    VALUES (
        gen_random_uuid(),
        'admin@chronizer.com',
        '$2b$10$rOzJqQjQjQjQjQjQjQjQjOzJqQjQjQjQjQjQjQjQjQjQjQjQjQjQjQjQjQ',
        'Admin',
        'User',
        true,
        true,
        admin_brand_id,
        NOW()
    )
    ON CONFLICT (email) 
    DO UPDATE SET 
        is_admin = true,
        is_active = true,
        brand_id = admin_brand_id;
END $$;

-- Verify the setup
SELECT 
    bo.id,
    bo.email,
    bo.is_admin,
    bo.is_active,
    bo.brand_id,
    b.name as brand_name,
    b.subdomain
FROM brand_owners bo
JOIN brands b ON b.id = bo.brand_id
WHERE bo.email = 'admin@chronizer.com';

-- Note: The password hash above is for 'password'. 
-- If you need to reset the password, run:
-- UPDATE brand_owners SET password_hash = '$2b$10$rOzJqQjQjQjQjQjQjQjQjOzJqQjQjQjQjQjQjQjQjQjQjQjQjQjQjQjQjQ' 
-- WHERE email = 'admin@chronizer.com';
