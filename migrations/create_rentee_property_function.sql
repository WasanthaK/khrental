-- Function to get rentees by property
CREATE OR REPLACE FUNCTION get_rentees_by_property(property_id uuid)
RETURNS SETOF app_users
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT DISTINCT au.*
  FROM app_users au
  WHERE 
    au.user_type = 'rentee' 
    AND (
      -- Check if property_id is in the associated_property_ids array
      property_id = ANY(au.associated_property_ids)
      OR
      -- Or check agreements directly to see if this rentee has an agreement for this property
      EXISTS (
        SELECT 1 
        FROM agreements 
        WHERE 
          (agreements.propertyid = property_id OR agreements.unitid IN (
            SELECT id FROM property_units WHERE propertyid = property_id
          ))
          AND agreements.renteeid = au.id
          AND agreements.status IN ('active', 'pending', 'review', 'signed')
      )
    );
$$;

-- Function to get rentees by specific unit
CREATE OR REPLACE FUNCTION get_rentees_by_unit(unit_id uuid)
RETURNS SETOF app_users
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT DISTINCT au.*
  FROM app_users au
  WHERE 
    au.user_type = 'rentee' 
    AND (
      -- Check agreements directly to see if this rentee has an agreement for this unit
      EXISTS (
        SELECT 1 
        FROM agreements 
        WHERE 
          agreements.unitid = unit_id
          AND agreements.renteeid = au.id
          AND agreements.status IN ('active', 'pending', 'review', 'signed')
      )
    );
$$; 