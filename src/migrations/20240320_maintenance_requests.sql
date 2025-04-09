-- Drop existing policies first
DROP POLICY IF EXISTS "Admin can do everything with maintenance requests" ON maintenance_requests;
DROP POLICY IF EXISTS "Staff can view and update maintenance requests" ON maintenance_requests;
DROP POLICY IF EXISTS "Rentees can view their own maintenance requests" ON maintenance_requests;
DROP POLICY IF EXISTS "Rentees can create maintenance requests" ON maintenance_requests;

DROP POLICY IF EXISTS "Admin can do everything with maintenance request images" ON maintenance_request_images;
DROP POLICY IF EXISTS "Staff can manage maintenance request images" ON maintenance_request_images;
DROP POLICY IF EXISTS "Rentees can view maintenance request images" ON maintenance_request_images;
DROP POLICY IF EXISTS "Rentees can insert images for their own maintenance requests" ON maintenance_request_images;

DROP POLICY IF EXISTS "Admin can do everything with maintenance request comments" ON maintenance_request_comments;
DROP POLICY IF EXISTS "Staff can manage maintenance request comments" ON maintenance_request_comments;
DROP POLICY IF EXISTS "Rentees can view and create comments on their maintenance requests" ON maintenance_request_comments;

-- Drop existing tables with CASCADE to handle dependencies
DROP TABLE IF EXISTS maintenance_request_images CASCADE;
DROP TABLE IF EXISTS maintenance_request_comments CASCADE;
DROP TABLE IF EXISTS maintenance_requests CASCADE;

-- Create maintenance_requests table
CREATE TABLE maintenance_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    propertyid UUID REFERENCES properties(id) ON DELETE CASCADE,
    renteeid UUID REFERENCES app_users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'emergency')),
    status TEXT NOT NULL CHECK (status IN ('pending', 'assigned', 'in_progress', 'completed', 'cancelled')),
    requesttype TEXT NOT NULL CHECK (requesttype IN ('air_conditioning', 'plumbing', 'electrical', 'cleaning', 'gardening', 'pest_control', 'emergency', 'other')),
    createdat TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updatedat TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    assignedto UUID REFERENCES app_users(id) ON DELETE SET NULL,
    assignedat TIMESTAMP WITH TIME ZONE,
    startedat TIMESTAMP WITH TIME ZONE,
    completedat TIMESTAMP WITH TIME ZONE,
    cancelledat TIMESTAMP WITH TIME ZONE,
    cancellationreason TEXT,
    notes TEXT
);

-- Create maintenance_request_images table
CREATE TABLE maintenance_request_images (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    maintenance_request_id UUID REFERENCES maintenance_requests(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    image_type TEXT NOT NULL CHECK (image_type IN ('initial', 'additional', 'progress', 'completion')),
    uploaded_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    description TEXT
);

-- Create maintenance_request_comments table
CREATE TABLE maintenance_request_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    maintenance_request_id UUID REFERENCES maintenance_requests(id) ON DELETE CASCADE,
    user_id UUID REFERENCES app_users(id) ON DELETE CASCADE,
    comment TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_maintenance_requests_propertyid ON maintenance_requests(propertyid);
CREATE INDEX idx_maintenance_requests_renteeid ON maintenance_requests(renteeid);
CREATE INDEX idx_maintenance_requests_status ON maintenance_requests(status);
CREATE INDEX idx_maintenance_request_images_request_id ON maintenance_request_images(maintenance_request_id);
CREATE INDEX idx_maintenance_request_comments_request_id ON maintenance_request_comments(maintenance_request_id);

-- Create function to update updatedat timestamp
CREATE OR REPLACE FUNCTION update_updatedat_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updatedat = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for maintenance_requests
CREATE TRIGGER update_maintenance_requests_updatedat
    BEFORE UPDATE ON maintenance_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_updatedat_column();

-- Create RLS policies
ALTER TABLE maintenance_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_request_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_request_comments ENABLE ROW LEVEL SECURITY;

-- Policies for maintenance_requests
CREATE POLICY "Admin can do everything with maintenance requests"
    ON maintenance_requests
    FOR ALL
    TO authenticated
    USING (auth.uid() IN (SELECT auth_id FROM app_users WHERE role = 'admin'));

CREATE POLICY "Staff can view and update maintenance requests"
    ON maintenance_requests
    FOR ALL
    TO authenticated
    USING (auth.uid() IN (SELECT auth_id FROM app_users WHERE role = 'staff'));

CREATE POLICY "Rentees can view their own maintenance requests"
    ON maintenance_requests
    FOR SELECT
    TO authenticated
    USING (auth.uid() IN (SELECT auth_id FROM app_users WHERE id = renteeid));

CREATE POLICY "Rentees can create maintenance requests"
    ON maintenance_requests
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() IN (SELECT auth_id FROM app_users WHERE id = renteeid));

-- Policies for maintenance_request_images
CREATE POLICY "Admin can do everything with maintenance request images"
    ON maintenance_request_images
    FOR ALL
    TO authenticated
    USING (auth.uid() IN (SELECT auth_id FROM app_users WHERE role = 'admin'));

CREATE POLICY "Staff can manage maintenance request images"
    ON maintenance_request_images
    FOR ALL
    TO authenticated
    USING (auth.uid() IN (SELECT auth_id FROM app_users WHERE role = 'staff'));

CREATE POLICY "Rentees can view maintenance request images"
    ON maintenance_request_images
    FOR SELECT
    TO authenticated
    USING (
        maintenance_request_id IN (
            SELECT id FROM maintenance_requests WHERE renteeid IN (SELECT id FROM app_users WHERE auth_id = auth.uid())
        )
    );

CREATE POLICY "Rentees can insert images for their own maintenance requests"
    ON maintenance_request_images
    FOR INSERT
    TO authenticated
    WITH CHECK (
        maintenance_request_id IN (
            SELECT id FROM maintenance_requests WHERE renteeid IN (SELECT id FROM app_users WHERE auth_id = auth.uid())
        )
    );

-- Policies for maintenance_request_comments
CREATE POLICY "Admin can do everything with maintenance request comments"
    ON maintenance_request_comments
    FOR ALL
    TO authenticated
    USING (auth.uid() IN (SELECT auth_id FROM app_users WHERE role = 'admin'));

CREATE POLICY "Staff can manage maintenance request comments"
    ON maintenance_request_comments
    FOR ALL
    TO authenticated
    USING (auth.uid() IN (SELECT auth_id FROM app_users WHERE role = 'staff'));

CREATE POLICY "Rentees can view and create comments on their maintenance requests"
    ON maintenance_request_comments
    FOR ALL
    TO authenticated
    USING (
        maintenance_request_id IN (
            SELECT id FROM maintenance_requests WHERE renteeid IN (SELECT id FROM app_users WHERE auth_id = auth.uid())
        )
    ); 