-- Migration: Create a unified users table

-- First, create the new unified users table
CREATE TABLE IF NOT EXISTS app_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    auth_id UUID UNIQUE, -- Link to Supabase Auth user
    email VARCHAR NOT NULL UNIQUE,
    name VARCHAR NOT NULL,
    role VARCHAR NOT NULL, -- 'admin', 'staff', 'manager', 'maintenance_staff', 'finance_staff', 'maintenance', 'supervisor', 'rentee'
    user_type VARCHAR NOT NULL, -- 'staff' or 'rentee'
    contact_details JSONB DEFAULT '{"email": "", "phone": "", "address": ""}',
    
    -- Staff-specific fields
    skills TEXT[] DEFAULT '{}',
    availability JSONB DEFAULT '{"monday": true, "tuesday": true, "wednesday": true, "thursday": true, "friday": true}',
    notes TEXT,
    status VARCHAR DEFAULT 'active',
    
    -- Rentee-specific fields
    id_copy_url TEXT,
    associated_property UUID,
    
    -- Common fields
    invited BOOLEAN DEFAULT false,
    active BOOLEAN DEFAULT true,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_app_users_auth_id ON app_users(auth_id);
CREATE INDEX IF NOT EXISTS idx_app_users_email ON app_users(email);
CREATE INDEX IF NOT EXISTS idx_app_users_role ON app_users(role);
CREATE INDEX IF NOT EXISTS idx_app_users_user_type ON app_users(user_type);

-- Create a function to migrate data from existing tables
CREATE OR REPLACE FUNCTION migrate_to_app_users() RETURNS void AS $$
BEGIN
    -- Migrate team_members
    INSERT INTO app_users (
        id, 
        auth_id, 
        email, 
        name, 
        role, 
        user_type, 
        contact_details, 
        skills, 
        availability, 
        notes, 
        status, 
        invited, 
        created_at, 
        updated_at
    )
    SELECT 
        tm.id, 
        tm.authid, 
        (tm.contactdetails->>'email')::VARCHAR, 
        tm.name, 
        tm.role, 
        'staff', 
        tm.contactdetails, 
        string_to_array(tm.skills, ','), 
        tm.availability, 
        tm.notes, 
        tm.status, 
        tm.invited, 
        tm.createdat, 
        tm.updatedat
    FROM team_members tm
    WHERE NOT EXISTS (
        SELECT 1 FROM app_users au WHERE au.id = tm.id
    );

    -- Migrate rentees
    INSERT INTO app_users (
        id, 
        auth_id, 
        email, 
        name, 
        role, 
        user_type, 
        contact_details, 
        id_copy_url, 
        associated_property, 
        invited, 
        created_at, 
        updated_at
    )
    SELECT 
        r.id, 
        r.authid, 
        (r.contactdetails->>'email')::VARCHAR, 
        r.name, 
        'rentee', 
        'rentee', 
        r.contactdetails, 
        r.idcopyurl, 
        r.associatedproperty, 
        r.invited, 
        r.registrationdate, 
        r.updatedat
    FROM rentees r
    WHERE NOT EXISTS (
        SELECT 1 FROM app_users au WHERE au.id = r.id
    );
END;
$$ LANGUAGE plpgsql;

-- Execute the migration function
-- SELECT migrate_to_app_users();

-- Comment out the function execution above and uncomment below when ready to run
-- DROP FUNCTION migrate_to_app_users();

-- Add triggers to keep updated_at current
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_app_users_updated_at
BEFORE UPDATE ON app_users
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Add comments to the table and columns for documentation
COMMENT ON TABLE app_users IS 'Unified users table that combines team members and rentees';
COMMENT ON COLUMN app_users.auth_id IS 'Reference to Supabase Auth user ID';
COMMENT ON COLUMN app_users.user_type IS 'Indicates if the user is staff or rentee';
COMMENT ON COLUMN app_users.role IS 'Specific role of the user (admin, staff, rentee, etc.)'; 