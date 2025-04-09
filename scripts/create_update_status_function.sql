-- Create a function to update an agreement's signature status safely
CREATE OR REPLACE FUNCTION update_agreement_status(agreement_id UUID, status_value TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update the agreement status directly with a SQL UPDATE
  -- This avoids issues with JSON validation that might occur with the API
  UPDATE agreements 
  SET 
    signature_status = status_value,
    updatedat = NOW()
  WHERE id = agreement_id;
END;
$$;

-- Grant appropriate permissions
GRANT EXECUTE ON FUNCTION update_agreement_status TO authenticated;
GRANT EXECUTE ON FUNCTION update_agreement_status TO anon;
GRANT EXECUTE ON FUNCTION update_agreement_status TO service_role; 