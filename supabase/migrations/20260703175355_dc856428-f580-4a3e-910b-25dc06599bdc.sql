
-- Add content column to content_pieces_v2
ALTER TABLE public.content_pieces_v2 ADD COLUMN IF NOT EXISTS content text;

-- Storage RLS policies for marketing-assets bucket (authenticated users can manage)
CREATE POLICY "marketing_assets_auth_read"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'marketing-assets');

CREATE POLICY "marketing_assets_auth_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'marketing-assets');

CREATE POLICY "marketing_assets_auth_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'marketing-assets');

CREATE POLICY "marketing_assets_auth_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'marketing-assets');
