-- Enable Row Level Security on storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- First, drop all existing policies for the files bucket
DROP POLICY IF EXISTS "Allow authenticated uploads to files bucket" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated reads from files bucket" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated updates to files bucket" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated deletes from files bucket" ON storage.objects;
DROP POLICY IF EXISTS "Allow admin users full access to files bucket" ON storage.objects;

-- Create a single policy for all authenticated users to do everything with the files bucket
CREATE POLICY "Give authenticated users access to files bucket"
ON storage.objects
FOR ALL
TO authenticated
USING (bucket_id = 'files')
WITH CHECK (bucket_id = 'files'); 