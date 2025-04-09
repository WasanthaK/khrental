-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create app_users table first (if not exists)
CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_id UUID NOT NULL UNIQUE,
  name VARCHAR(255),
  email VARCHAR(255) NOT NULL UNIQUE,
  role VARCHAR(50) NOT NULL DEFAULT 'rentee',
  user_type VARCHAR(50) NOT NULL DEFAULT 'rentee',
  contact_details JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create rentees table
CREATE TABLE IF NOT EXISTS rentees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  national_id VARCHAR(50),
  phone_number VARCHAR(20),
  emergency_contact JSONB DEFAULT '{}',
  occupation VARCHAR(255),
  employer VARCHAR(255),
  monthly_income DECIMAL(12,2),
  id_copy_url TEXT,
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create RLS policies
ALTER TABLE rentees ENABLE ROW LEVEL SECURITY;

-- Policy for rentees to view and edit their own data
CREATE POLICY "Rentees can view their own data"
  ON rentees
  FOR SELECT
  USING (auth.uid() IN (
    SELECT auth_id FROM app_users WHERE id = rentees.user_id
  ));

CREATE POLICY "Rentees can update their own data"
  ON rentees
  FOR UPDATE
  USING (auth.uid() IN (
    SELECT auth_id FROM app_users WHERE id = rentees.user_id
  ));

-- Policy for admins to manage all rentee data
CREATE POLICY "Admins can manage all rentee data"
  ON rentees
  FOR ALL
  USING (auth.uid() IN (
    SELECT auth_id FROM app_users WHERE role = 'admin'
  ));

-- Create function to automatically update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for rentees table
CREATE TRIGGER update_rentees_updated_at
  BEFORE UPDATE ON rentees
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create trigger for app_users table
CREATE TRIGGER update_app_users_updated_at
  BEFORE UPDATE ON app_users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column(); 