-- Create a stored procedure for approving utility readings
-- This procedure handles the transaction for updating a reading's status to approved
-- and creating the corresponding billing record

CREATE OR REPLACE FUNCTION approve_utility_reading(
  reading_id UUID,
  consumption_val DECIMAL,
  billing_data_json JSONB,
  approved_date_val TIMESTAMP WITH TIME ZONE
) RETURNS JSONB AS
$$
DECLARE
  billing_id UUID;
  result JSONB;
BEGIN
  -- Start a transaction
  BEGIN
    -- 1. Update the reading status to approved
    UPDATE utility_readings 
    SET 
      status = 'approved',
      calculatedbill = consumption_val,
      billing_data = billing_data_json,
      approved_date = approved_date_val
    WHERE id = reading_id;
    
    -- 2. Insert a new record in the utility_billing table
    INSERT INTO utility_billing (
      reading_id,
      utility_type,
      consumption,
      rate,
      amount,
      property_id,
      rentee_id,
      billing_month,
      billing_year,
      status,
      created_at
    ) VALUES (
      reading_id,
      billing_data_json->>'utility_type',
      (billing_data_json->>'consumption')::DECIMAL,
      (billing_data_json->>'rate')::DECIMAL,
      (billing_data_json->>'amount')::DECIMAL,
      (billing_data_json->>'property_id')::UUID,
      (billing_data_json->>'rentee_id')::UUID,
      billing_data_json->>'billing_month',
      (billing_data_json->>'billing_year')::INTEGER,
      'pending_invoice',
      now()
    ) RETURNING id INTO billing_id;
    
    -- Prepare the result with success status and the billing id
    result := jsonb_build_object(
      'success', true,
      'message', 'Reading approved successfully',
      'billing_id', billing_id
    );
    
    -- If we got here, commit the transaction
    RETURN result;
  EXCEPTION WHEN OTHERS THEN
    -- Something went wrong, rollback the transaction
    result := jsonb_build_object(
      'success', false,
      'message', 'Error approving reading: ' || SQLERRM
    );
    RETURN result;
  END;
END;
$$ LANGUAGE plpgsql;

-- Helper function to create the stored procedure if it doesn't exist
CREATE OR REPLACE FUNCTION create_approve_reading_procedure() RETURNS JSONB AS
$$
BEGIN
  -- Check if utility_readings table exists, if not create it
  IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'utility_readings') THEN
    CREATE TABLE utility_readings (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      renteeid UUID REFERENCES app_users(id),
      propertyid UUID REFERENCES properties(id),
      unitid UUID REFERENCES property_units(id),
      utilitytype TEXT NOT NULL,
      previousreading DECIMAL,
      currentreading DECIMAL NOT NULL,
      readingdate TIMESTAMP WITH TIME ZONE NOT NULL,
      photourl TEXT,
      status TEXT DEFAULT 'pending',
      rejection_reason TEXT,
      calculatedbill DECIMAL,
      billing_data JSONB,
      approved_date TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
    );
  END IF;
  
  -- Check if utility_billing table exists, if not create it
  IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'utility_billing') THEN
    CREATE TABLE utility_billing (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      reading_id UUID REFERENCES utility_readings(id),
      utility_type TEXT NOT NULL,
      consumption DECIMAL NOT NULL,
      rate DECIMAL NOT NULL,
      amount DECIMAL NOT NULL,
      property_id UUID REFERENCES properties(id),
      rentee_id UUID REFERENCES app_users(id),
      billing_month TEXT NOT NULL,
      billing_year INTEGER NOT NULL,
      status TEXT DEFAULT 'pending_invoice',
      invoice_id UUID,
      invoiced_date TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
    );
  END IF;
  
  RETURN jsonb_build_object('success', true, 'message', 'Utility billing tables and procedures have been set up');
END;
$$ LANGUAGE plpgsql; 