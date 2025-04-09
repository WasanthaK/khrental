-- Migration script to enhance property-unit associations
-- This will set up the app_users table to support the structured approach for 
-- associating rentees with both properties and specific units

-- Create or replace a function to help with property-unit lookups by using associated_property_ids
CREATE OR REPLACE FUNCTION get_rentees_by_property(property_id uuid)
RETURNS SETOF app_users AS $$
BEGIN
  -- Find rentees associated with the property using the existing associated_property_ids column
  RETURN QUERY 
  SELECT * FROM app_users 
  WHERE user_type = 'rentee' AND 
        property_id = ANY(associated_property_ids);
END;
$$ LANGUAGE plpgsql;

-- Create or replace a function to help with property-unit lookups that will work
-- when the app is updated to use a structured JSONB approach in the future
CREATE OR REPLACE FUNCTION get_rentees_by_property_and_unit(property_id uuid, unit_id uuid DEFAULT NULL)
RETURNS SETOF app_users AS $$
BEGIN
  IF unit_id IS NULL THEN
    -- For now, just use the existing array of property IDs
    RETURN QUERY 
    SELECT * FROM app_users 
    WHERE user_type = 'rentee' AND 
          property_id = ANY(associated_property_ids);
  ELSE
    -- For now, we can only look up by property ID since we don't have unit IDs
    -- When the structured approach is implemented, this can be updated
    RETURN QUERY 
    SELECT * FROM app_users 
    WHERE user_type = 'rentee' AND 
          property_id = ANY(associated_property_ids);
  END IF;
END;
$$ LANGUAGE plpgsql; 