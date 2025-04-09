-- Enable RLS on the storage.objects table
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Policy for authenticated users to upload files to agreements folder
CREATE POLICY "Allow authenticated uploads to agreements folder" ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'files' AND 
  (storage.foldername(name))[1] = 'agreements'
);

-- Policy for authenticated users to read files from agreements folder
CREATE POLICY "Allow authenticated reads from agreements folder" ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'files' AND 
  (storage.foldername(name))[1] = 'agreements'
);

-- Policy for authenticated users to update their own files
CREATE POLICY "Allow authenticated updates to own files" ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'files' AND 
  (storage.foldername(name))[1] = 'agreements'
)
WITH CHECK (
  bucket_id = 'files' AND 
  (storage.foldername(name))[1] = 'agreements'
);

-- Policy for admins to have full access
CREATE POLICY "Allow admin full access" ON storage.objects
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

-- Policy for authenticated users to delete their own files
CREATE POLICY "Allow authenticated deletes of own files" ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'files' AND 
  (storage.foldername(name))[1] = 'agreements'
); 