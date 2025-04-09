-- Create storage buckets if they don't exist
INSERT INTO storage.buckets (id, name, public)
VALUES 
  ('images', 'images', true),
  ('files', 'files', true)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS on storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Create policies for the images bucket
CREATE POLICY "Allow public read access to images"
ON storage.objects FOR SELECT
USING (bucket_id = 'images');

CREATE POLICY "Allow authenticated users to upload images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'images' 
  AND auth.role() = 'authenticated'
);

CREATE POLICY "Allow authenticated users to update their own images"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'images' 
  AND auth.role() = 'authenticated'
);

CREATE POLICY "Allow authenticated users to delete their own images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'images' 
  AND auth.role() = 'authenticated'
);

-- Create policies for the files bucket
CREATE POLICY "Allow public read access to files"
ON storage.objects FOR SELECT
USING (bucket_id = 'files');

CREATE POLICY "Allow authenticated users to upload files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'files' 
  AND auth.role() = 'authenticated'
);

CREATE POLICY "Allow authenticated users to update their own files"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'files' 
  AND auth.role() = 'authenticated'
);

CREATE POLICY "Allow authenticated users to delete their own files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'files' 
  AND auth.role() = 'authenticated'
); 