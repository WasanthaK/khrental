-- Enable storage extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "storage" SCHEMA "extensions";

-- Create storage buckets
INSERT INTO storage.buckets (id, name, public, avif_autodetection, file_size_limit, allowed_mime_types)
VALUES
  ('images', 'images', true, false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']),
  ('files', 'files', false, false, 52428800, ARRAY['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
ON CONFLICT (id) DO NOTHING;

-- Enable RLS on storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Create policies for images bucket (public)
CREATE POLICY "Give public access to images" ON storage.objects
  FOR SELECT USING (bucket_id = 'images');

CREATE POLICY "Allow authenticated users to upload images" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'images' 
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "Allow authenticated users to update their images" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'images'
    AND auth.role() = 'authenticated'
    AND owner = auth.uid()
  );

CREATE POLICY "Allow authenticated users to delete their images" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'images'
    AND auth.role() = 'authenticated'
    AND owner = auth.uid()
  );

-- Create policies for files bucket (private)
CREATE POLICY "Allow authenticated users to access files" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'files'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "Allow authenticated users to upload files" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'files'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "Allow authenticated users to update their files" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'files'
    AND auth.role() = 'authenticated'
    AND owner = auth.uid()
  );

CREATE POLICY "Allow authenticated users to delete their files" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'files'
    AND auth.role() = 'authenticated'
    AND owner = auth.uid()
  );

-- Create folders in images bucket
INSERT INTO storage.objects (bucket_id, name, owner, metadata)
VALUES
  ('images', 'properties/.keep', auth.uid(), '{"contentType": "text/plain"}'),
  ('images', 'maintenance/.keep', auth.uid(), '{"contentType": "text/plain"}'),
  ('images', 'utility-readings/.keep', auth.uid(), '{"contentType": "text/plain"}')
ON CONFLICT (bucket_id, name) DO NOTHING;

-- Create folders in files bucket
INSERT INTO storage.objects (bucket_id, name, owner, metadata)
VALUES
  ('files', 'id-copies/.keep', auth.uid(), '{"contentType": "text/plain"}'),
  ('files', 'agreements/.keep', auth.uid(), '{"contentType": "text/plain"}'),
  ('files', 'documents/.keep', auth.uid(), '{"contentType": "text/plain"}'),
  ('files', 'payment-proofs/.keep', auth.uid(), '{"contentType": "text/plain"}')
ON CONFLICT (bucket_id, name) DO NOTHING; 