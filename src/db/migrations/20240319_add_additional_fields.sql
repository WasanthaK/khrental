-- Add new fields to app_users table
ALTER TABLE app_users
ADD COLUMN IF NOT EXISTS permanent_address TEXT,
ADD COLUMN IF NOT EXISTS national_id VARCHAR(255);

-- Add banking details to properties table
ALTER TABLE properties
ADD COLUMN IF NOT EXISTS bank_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS bank_branch VARCHAR(255),
ADD COLUMN IF NOT EXISTS bank_account_number VARCHAR(255);

-- Add banking details to property_units table
ALTER TABLE property_units
ADD COLUMN IF NOT EXISTS bank_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS bank_branch VARCHAR(255),
ADD COLUMN IF NOT EXISTS bank_account_number VARCHAR(255);

-- Update existing functions and triggers if needed
CREATE OR REPLACE FUNCTION handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updatedat = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add comments for documentation
COMMENT ON COLUMN app_users.permanent_address IS 'Permanent residential address of the user';
COMMENT ON COLUMN app_users.national_id IS 'National ID number of the user';
COMMENT ON COLUMN properties.bank_name IS 'Name of the bank for property payments';
COMMENT ON COLUMN properties.bank_branch IS 'Branch name of the bank for property payments';
COMMENT ON COLUMN properties.bank_account_number IS 'Bank account number for property payments';
COMMENT ON COLUMN property_units.bank_name IS 'Name of the bank for unit-specific payments';
COMMENT ON COLUMN property_units.bank_branch IS 'Branch name of the bank for unit-specific payments';
COMMENT ON COLUMN property_units.bank_account_number IS 'Bank account number for unit-specific payments'; 