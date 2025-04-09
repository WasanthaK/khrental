-- Enable Row Level Security on storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow authenticated uploads to files bucket" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated reads from files bucket" ON storage.objects;
DROP POLICY IF EXISTS "Allow admin users full access to files bucket" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated updates to files bucket" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated deletes from files bucket" ON storage.objects;

-- Create policy for all Supabase authenticated users to upload files (regardless of app role)
CREATE POLICY "Allow authenticated uploads to files bucket"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'files'
);

-- Create policy for all authenticated users to read files
CREATE POLICY "Allow authenticated reads from files bucket"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'files'
);

-- Create policy for all authenticated users to update files
CREATE POLICY "Allow authenticated updates to files bucket"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'files'
);

-- Create policy for all authenticated users to delete files
CREATE POLICY "Allow authenticated deletes from files bucket"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'files'
);

-- If you want to restrict certain actions to app_user roles, use this pattern instead
-- (commented out, use as example if needed)
/*
CREATE POLICY "Allow admin app users full access to files bucket"
ON storage.objects
FOR ALL
TO authenticated
USING (
  bucket_id = 'files' AND
  EXISTS (
    SELECT 1 FROM app_users
    WHERE auth_id = auth.uid()
    AND role = 'admin'
  )
)
WITH CHECK (
  bucket_id = 'files' AND
  EXISTS (
    SELECT 1 FROM app_users
    WHERE auth_id = auth.uid()
    AND role = 'admin'
  )
);
*/ 