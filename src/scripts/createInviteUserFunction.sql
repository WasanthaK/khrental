-- Create a function to invite users
CREATE OR REPLACE FUNCTION invite_user(
  email_param TEXT,
  role TEXT,
  redirect_url TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  -- Check if the user already exists
  IF EXISTS (
    SELECT 1 FROM auth.users WHERE email = email_param
  ) THEN
    RETURN json_build_object(
      'success', false,
      'error', 'User already exists'
    );
  END IF;

  -- Create the user invitation
  SELECT json_build_object(
    'success', true,
    'data', json_build_object(
      'email', email_param,
      'role', role,
      'redirect_url', redirect_url
    )
  ) INTO result;

  -- Send the invitation email using Supabase's built-in email service
  -- Note: This requires the email service to be configured in your Supabase project
  PERFORM net.send_email(
    to_email := email_param,
    subject := 'Welcome to KH Rentals',
    body := format(
      'Welcome to KH Rentals! Click the link below to complete your registration: %s',
      redirect_url
    )
  );

  RETURN result;
END;
$$; 