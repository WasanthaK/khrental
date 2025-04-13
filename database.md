# KH Rentals Database Schema

KH Rentals Database Schema Documentation

-- Module 1: Core Database Structure
-- Contains essential database settings, utility functions, and core tables

-- Enable RLS for all tables by default
ALTER DATABASE postgres SET row_security TO on;

-- =============================================
-- Create Utility Functions
-- =============================================

-- Create storage policy function
CREATE OR REPLACE FUNCTION create_storage_policy(
    bucket_name text,
    policy_name text,
    policy_operation text,
    policy_definition text
)
RETURNS void AS $$
BEGIN
    -- Check if policy already exists
    IF EXISTS (
        SELECT 1 
        FROM pg_policies 
        WHERE tablename = bucket_name 
        AND policyname = policy_name
    ) THEN
        -- Drop existing policy
        EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', policy_name);
    END IF;

    -- Create new policy
    EXECUTE format(
        'CREATE POLICY %I ON storage.objects FOR %s USING (%s)',
        policy_name,
        policy_operation,
        policy_definition
    );
END;
$$ LANGUAGE plpgsql;

-- Add column function
CREATE OR REPLACE FUNCTION add_column_if_not_exists(
    p_table_name text,
    p_column_name text,
    p_column_type text
)
RETURNS void AS $$
DECLARE
    column_exists boolean;
BEGIN
    -- Check if the column already exists
    SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = p_table_name
        AND column_name = p_column_name
    ) INTO column_exists;
    
    -- If the column doesn't exist, add it
    IF NOT column_exists THEN
        EXECUTE format('ALTER TABLE %I ADD COLUMN %I %s', p_table_name, p_column_name, p_column_type);
        RAISE NOTICE 'Added column % to table %', p_column_name, p_table_name;
    ELSE
        RAISE NOTICE 'Column % already exists in table %', p_column_name, p_table_name;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Setup RLS for a single table
CREATE OR REPLACE FUNCTION setup_rls_for_table(
    p_table_name text
)
RETURNS void AS $$
DECLARE
    table_exists boolean;
BEGIN
    -- Check if the table exists
    SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = p_table_name
    ) INTO table_exists;
    
    IF NOT table_exists THEN
        RAISE NOTICE 'Table % does not exist, skipping', p_table_name;
        RETURN;
    END IF;

    -- Enable RLS
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', p_table_name);
    
    -- Drop existing policies if they exist
    EXECUTE format('DROP POLICY IF EXISTS "%1$s_select_policy" ON %1$s', p_table_name);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s_insert_policy" ON %1$s', p_table_name);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s_update_policy" ON %1$s', p_table_name);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s_delete_policy" ON %1$s', p_table_name);
    
    -- Create new PUBLIC policies
    EXECUTE format('CREATE POLICY "%1$s_select_policy" ON %1$s FOR SELECT TO PUBLIC USING (true)', p_table_name);
    EXECUTE format('CREATE POLICY "%1$s_insert_policy" ON %1$s FOR INSERT TO PUBLIC WITH CHECK (true)', p_table_name);
    EXECUTE format('CREATE POLICY "%1$s_update_policy" ON %1$s FOR UPDATE TO PUBLIC USING (true)', p_table_name);
    EXECUTE format('CREATE POLICY "%1$s_delete_policy" ON %1$s FOR DELETE TO PUBLIC USING (true)', p_table_name);
    
    RAISE NOTICE 'RLS policies set up for table %', p_table_name;
END;
$$ LANGUAGE plpgsql;

-- Setup RLS for all tables
CREATE OR REPLACE FUNCTION setup_rls_for_all_tables()
RETURNS void AS $$
DECLARE
    table_record RECORD;
BEGIN
    FOR table_record IN 
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public' 
        AND tablename NOT IN ('schema_migrations', 'spatial_ref_sys')
    LOOP
        PERFORM setup_rls_for_table(table_record.tablename);
    END LOOP;
    
    RAISE NOTICE 'RLS policies have been set up for all tables in the public schema';
END;
$$ LANGUAGE plpgsql;

-- Execute SQL statement function
CREATE OR REPLACE FUNCTION exec_sql(query text)
RETURNS void AS $$
BEGIN
  EXECUTE query;
END;
$$ LANGUAGE plpgsql;

-- Basic trigger functions
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updatedat = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updatedat = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION set_timestamps()
RETURNS TRIGGER AS $$
BEGIN
  -- For new records, set created_at
  IF NEW.createdat IS NULL THEN
    NEW.createdat = NOW();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION set_properties_timestamps()
RETURNS TRIGGER AS $$
BEGIN
  -- For new records, set createdat
  IF NEW.createdat IS NULL THEN
    NEW.createdat = NOW();
  END IF;
  
  -- Always set updatedat
  NEW.updatedat = NOW();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


2. Business Logic Functions

-- Module 2: Business Logic Functions
-- Contains functions that implement business logic for the application

-- Calculate invoice total function
CREATE OR REPLACE FUNCTION calculate_invoice_total()
RETURNS TRIGGER AS $$
BEGIN
  NEW.totalAmount = (NEW.components->>'rent')::numeric + 
                    (NEW.components->>'electricity')::numeric + 
                    (NEW.components->>'water')::numeric + 
                    (NEW.components->>'pastDues')::numeric + 
                    (NEW.components->>'taxes')::numeric;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Update invoice status on overdue function
CREATE OR REPLACE FUNCTION update_invoice_status_on_overdue()
RETURNS TRIGGER AS $$
BEGIN
  -- If the invoice is still pending and the due date has passed, mark it as overdue
  IF NEW.status = 'pending' AND NEW.dueDate < CURRENT_DATE THEN
    NEW.status = 'overdue';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Update maintenance request on task assignment function
CREATE OR REPLACE FUNCTION update_maintenance_request_on_task_assignment()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.taskType = 'maintenance' AND NEW.relatedEntityType = 'maintenance_request' THEN
    UPDATE maintenance_requests
    SET status = CASE
      WHEN NEW.status = 'pending' THEN 'assigned'
      WHEN NEW.status = 'in_progress' THEN 'in_progress'
      WHEN NEW.status = 'completed' THEN 'completed'
      WHEN NEW.status = 'cancelled' THEN 'cancelled'
      ELSE status
    END,
    assignedTo = NEW.teamMemberId,
    updatedAt = NOW()
    WHERE id = NEW.relatedEntityId;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Generate agreement document function
CREATE OR REPLACE FUNCTION generate_agreement_document()
RETURNS TRIGGER AS $$
BEGIN
  -- Only proceed for 'review' status changes
  IF NEW.status = 'review' AND (OLD.status != 'review' OR OLD.status IS NULL) THEN
    -- Logic would be handled in application, but we can update the DB record
    -- In a real implementation, you'd add a task to a queue for document generation
    
    -- For now, just set a flag to indicate document generation is needed
    NEW.needs_document_generation = TRUE;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Update agreement status function
CREATE OR REPLACE FUNCTION update_agreement_status(
    agreement_id uuid,
    status_value text
)
RETURNS void AS $$
BEGIN
  -- Update the agreement status directly with a SQL UPDATE
  -- This avoids issues with JSON validation that might occur with the API
  UPDATE agreements 
  SET 
    signature_status = status_value,
    updatedat = NOW()
  WHERE id = agreement_id;
END;
$$ LANGUAGE plpgsql;

-- Invite user function
CREATE OR REPLACE FUNCTION invite_user(
    email text,
    role text,
    redirect_url text
)
RETURNS json AS $$
DECLARE
  result JSON;
BEGIN
  -- Check if the user already exists
  IF EXISTS (
    SELECT 1 FROM auth.users WHERE email = $1
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
      'email', $1,
      'role', $2,
      'redirect_url', $3
    )
  ) INTO result;

  -- Send the invitation email using Supabase's built-in email service
  PERFORM net.send_email(
    to_email := $1,
    subject := 'Welcome to KH Rentals',
    body := format(
      'Welcome to KH Rentals! Click the link below to complete your registration: %s',
      $3
    )
  );

  RETURN result;
END;
$$ LANGUAGE plpgsql;

3. Evia Sign Integration Functions

-- Module 3: Evia Sign Integration Functions
-- Contains functions specific to the Evia Sign integration for digital signatures

-- Update agreement from webhook function
CREATE OR REPLACE FUNCTION update_agreement_from_webhook()
RETURNS TRIGGER AS $$
DECLARE
    status_map TEXT;
    signatory_data JSONB;
    current_signatories JSONB;
BEGIN
    -- Map event_id to signature_status
    CASE NEW.event_id
        WHEN 1 THEN status_map := 'pending';
        WHEN 2 THEN status_map := 'in_progress';
        WHEN 3 THEN status_map := 'completed';
        ELSE status_map := NULL;
    END CASE;
    
    -- Only proceed if we have a valid status map and request_id
    IF status_map IS NULL OR NEW.request_id IS NULL THEN
        RETURN NEW;
    END IF;
    
    -- Handle signatory data for EventId 2 (SignatoryCompleted)
    IF NEW.event_id = 2 AND NEW.user_email IS NOT NULL THEN
        -- Create signatory info
        signatory_data := jsonb_build_object(
            'name', COALESCE(NEW.user_name, 'Unknown'),
            'email', NEW.user_email,
            'status', 'completed',
            'signedAt', COALESCE(NEW.event_time, NOW())
        );
        
        -- Get current signatories if any
        SELECT signatories_status INTO current_signatories
        FROM agreements
        WHERE eviasignreference = NEW.request_id;
        
        -- Initialize if null
        IF current_signatories IS NULL THEN
            current_signatories := '[]'::jsonb;
        END IF;
        
        -- Add or update signatory
        -- Check if signatory already exists
        WITH existing_signatory AS (
            SELECT jsonb_array_elements(current_signatories) ->> 'email' as email
        )
        SELECT 
            CASE 
                WHEN EXISTS (SELECT 1 FROM existing_signatory WHERE email = NEW.user_email) THEN
                    (
                        SELECT jsonb_agg(
                            CASE 
                                WHEN (x ->> 'email') = NEW.user_email THEN signatory_data
                                ELSE x
                            END
                        )
                        FROM jsonb_array_elements(current_signatories) x
                    )
                ELSE
                    jsonb_insert(current_signatories, '{0}', signatory_data)
            END INTO current_signatories;
    END IF;
    
    -- Update agreement based on event type
    IF NEW.event_id = 3 THEN
        -- For completed events (signed)
        UPDATE agreements
        SET 
            signature_status = status_map,
            status = 'signed',
            signature_completed_at = COALESCE(NEW.event_time, NOW()),
            updatedat = NOW()
        WHERE 
            eviasignreference = NEW.request_id;
    ELSIF NEW.event_id = 2 THEN
        -- For signatory completed events (partially signed)
        UPDATE agreements
        SET 
            signature_status = status_map,
            status = 'partially_signed',
            signatories_status = current_signatories,
            updatedat = NOW()
        WHERE 
            eviasignreference = NEW.request_id;
    ELSIF NEW.event_id = 1 THEN
        -- For sign request received events (pending signature)
        UPDATE agreements
        SET 
            signature_status = status_map,
            status = 'pending_signature',
            signature_sent_at = COALESCE(NEW.event_time, NOW()),
            updatedat = NOW()
        WHERE 
            eviasignreference = NEW.request_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Update RLS policies function
CREATE OR REPLACE FUNCTION update_rls_policies()
RETURNS void AS $$
DECLARE
    policy_record RECORD;
BEGIN
    -- Drop and recreate policies for tables that reference user roles
    FOR policy_record IN 
        SELECT schemaname, tablename, policyname, cmd, qual
        FROM pg_policies 
        WHERE schemaname = 'public'
        AND qual LIKE '%auth.users%'
    LOOP
        -- Drop existing policy
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', 
            policy_record.policyname, 
            policy_record.schemaname, 
            policy_record.tablename);
            
        -- Create new policy using app_users
        EXECUTE format(
            'CREATE POLICY %I ON %I.%I FOR %s TO PUBLIC USING (%s)',
            policy_record.policyname,
            policy_record.schemaname,
            policy_record.tablename,
            policy_record.cmd,
            replace(policy_record.qual, 'auth.users', 'app_users')
        );
    END LOOP;
END;
$$ LANGUAGE plpgsql;


4. Core Tables

-- Module 4: Core Tables
-- Contains the main entity tables for the application

-- Create app_users table
CREATE TABLE app_users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_id uuid,
    email character varying,
    name character varying,
    role character varying,
    user_type character varying,
    contact_details jsonb,
    skills text[],
    availability jsonb,
    notes text,
    status character varying,
    id_copy_url text,
    invited boolean DEFAULT false,
    active boolean DEFAULT true,
    last_login timestamp without time zone,
    createdat timestamp without time zone DEFAULT NOW(),
    updatedat timestamp without time zone DEFAULT NOW(),
    associated_property_ids uuid[],
    permanent_address text,
    national_id character varying
);

-- Create properties table
CREATE TABLE properties (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name character varying,
    address text,
    unitconfiguration character varying,
    rentalvalues jsonb,
    checklistitems text[],
    terms jsonb,
    images text[],
    description text,
    status character varying,
    createdat timestamp with time zone DEFAULT NOW(),
    updatedat timestamp with time zone DEFAULT NOW(),
    availablefrom timestamp with time zone,
    propertytype character varying,
    squarefeet numeric,
    yearbuilt integer,
    amenities text[],
    bank_name character varying,
    bank_branch character varying,
    bank_account_number character varying,
    electricity_rate numeric,
    water_rate numeric
);

-- Create property_units table
CREATE TABLE property_units (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    propertyid uuid,
    unitnumber character varying,
    floor character varying,
    bedrooms integer,
    bathrooms integer,
    rentalvalues jsonb,
    status character varying,
    createdat timestamp with time zone DEFAULT NOW(),
    updatedat timestamp with time zone DEFAULT NOW(),
    description character varying,
    squarefeet numeric,
    bank_name character varying,
    bank_branch character varying,
    bank_account_number character varying
);

-- Create agreement_templates table
CREATE TABLE agreement_templates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    language character varying,
    content text,
    version character varying,
    createdat timestamp with time zone DEFAULT NOW(),
    updatedat timestamp with time zone DEFAULT NOW(),
    name character varying
);

-- Create agreements table
CREATE TABLE agreements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    templateid uuid,
    renteeid uuid,
    propertyid uuid,
    status character varying,
    signeddate timestamp with time zone,
    startdate date,
    enddate date,
    eviasignreference uuid,
    documenturl text,
    createdat timestamp with time zone DEFAULT NOW(),
    updatedat timestamp with time zone DEFAULT NOW(),
    terms jsonb,
    notes text,
    unitid uuid,
    needs_document_generation boolean DEFAULT false,
    pdfurl text,
    signatureurl text,
    signature_status text,
    signatories_status jsonb,
    signature_request_id text,
    signature_sent_at timestamp with time zone,
    signature_completed_at timestamp with time zone,
    signature_pdf_url text,
    signed_document_url text
);

-- Create agreement_signature_status table
CREATE TABLE agreement_signature_status (
    agreement_id uuid PRIMARY KEY,
    agreement_status character varying,
    signature_status text,
    signatories_status jsonb,
    last_event_id integer,
    last_event_type text,
    last_event_time timestamp with time zone
);

5. Operational Tables

-- Module 5: Operational Tables
-- Contains tables for day-to-day property management operations

-- Create invoices table
CREATE TABLE invoices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    renteeid uuid,
    propertyid uuid,
    billingperiod character varying,
    components jsonb,
    totalamount numeric,
    status character varying,
    paymentproofurl text,
    paymentdate timestamp with time zone,
    duedate date,
    notes text,
    createdat timestamp with time zone DEFAULT NOW(),
    updatedat timestamp with time zone DEFAULT NOW()
);

-- Create payments table
CREATE TABLE payments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    invoiceid uuid,
    amount numeric,
    paymentmethod character varying,
    transactionreference character varying,
    paymentdate timestamp with time zone,
    status character varying,
    notes text,
    createdat timestamp with time zone DEFAULT NOW(),
    updatedat timestamp with time zone DEFAULT NOW()
);

-- Create action_records table
CREATE TABLE action_records (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    propertyid uuid,
    renteeid uuid,
    actiontype character varying,
    amount numeric,
    status character varying,
    date date,
    comments text,
    relateddocs text[],
    createdat timestamp with time zone DEFAULT NOW(),
    updatedat timestamp with time zone DEFAULT NOW()
);

-- Create maintenance_requests table
CREATE TABLE maintenance_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    propertyid uuid,
    renteeid uuid,
    title text,
    description text,
    priority text,
    status text,
    requesttype text,
    createdat timestamp with time zone DEFAULT NOW(),
    updatedat timestamp with time zone DEFAULT NOW(),
    assignedto uuid,
    assignedat timestamp with time zone,
    startedat timestamp with time zone,
    completedat timestamp with time zone,
    cancelledat timestamp with time zone,
    cancellationreason text,
    notes text
);

-- Create maintenance_request_comments table
CREATE TABLE maintenance_request_comments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    maintenance_request_id uuid,
    user_id uuid,
    comment text,
    created_at timestamp with time zone DEFAULT NOW(),
    updated_at timestamp with time zone DEFAULT NOW()
);

-- Create maintenance_request_images table
CREATE TABLE maintenance_request_images (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    maintenance_request_id uuid,
    image_url text,
    image_type text,
    uploaded_by uuid,
    uploaded_at timestamp with time zone DEFAULT NOW(),
    description text
);

-- Create utility_configs table
CREATE TABLE utility_configs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    utilitytype character varying,
    billingtype character varying,
    rate numeric,
    fixedamount numeric,
    createdat timestamp with time zone DEFAULT NOW(),
    updatedat timestamp with time zone DEFAULT NOW()
);

-- Create utility_readings table
CREATE TABLE utility_readings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    renteeid uuid,
    propertyid uuid,
    utilitytype character varying,
    previousreading numeric,
    currentreading numeric,
    readingdate date,
    photourl text,
    calculatedbill numeric,
    status character varying,
    createdat timestamp with time zone DEFAULT NOW(),
    updatedat timestamp with time zone DEFAULT NOW(),
    billing_status character varying
);

-- Create scheduled_tasks table
CREATE TABLE scheduled_tasks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    propertyid uuid,
    tasktype character varying,
    frequency character varying,
    description text,
    assignedteam character varying,
    lastcompleteddate timestamp with time zone,
    nextduedate timestamp with time zone,
    status character varying,
    notes text,
    createdat timestamp with time zone DEFAULT NOW(),
    updatedat timestamp with time zone DEFAULT NOW()
);

-- Create task_assignments table
CREATE TABLE task_assignments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    teammemberid uuid,
    tasktype character varying,
    tasktitle character varying,
    taskdescription text,
    status character varying,
    priority character varying,
    duedate timestamp with time zone,
    completiondate timestamp with time zone,
    notes text,
    relatedentitytype character varying,
    relatedentityid uuid,
    createdat timestamp with time zone DEFAULT NOW(),
    updatedat timestamp with time zone DEFAULT NOW()
);

6. Communication & Monitoring Tables

-- Module 6: Communication & Monitoring Tables
-- Contains tables for notifications, communications, and monitoring

-- Create notifications table
CREATE TABLE notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid,
    message text,
    createdat timestamp with time zone DEFAULT NOW(),
    is_read boolean DEFAULT false,
    updatedat timestamp with time zone DEFAULT NOW()
);

-- Create letter_templates table
CREATE TABLE letter_templates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    type character varying,
    subject character varying,
    content text,
    language character varying,
    version character varying,
    createdat timestamp with time zone DEFAULT NOW(),
    updatedat timestamp with time zone DEFAULT NOW()
);

-- Create sent_letters table
CREATE TABLE sent_letters (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    templateid uuid,
    renteeid uuid,
    propertyid uuid,
    sentdate timestamp with time zone,
    channel character varying,
    status character varying,
    content text,
    createdat timestamp with time zone DEFAULT NOW(),
    updatedat timestamp with time zone DEFAULT NOW()
);

-- Create cameras table
CREATE TABLE cameras (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    propertyid uuid,
    locationdescription text,
    cameratype character varying,
    installationdetails text,
    datapackageinfo jsonb,
    status character varying,
    createdat timestamp with time zone DEFAULT NOW(),
    updatedat timestamp with time zone DEFAULT NOW()
);

-- Create camera_monitoring table
CREATE TABLE camera_monitoring (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    cameraid uuid,
    monitoringdate date,
    statusupdate character varying,
    notes text,
    createdat timestamp with time zone DEFAULT NOW(),
    updatedat timestamp with time zone DEFAULT NOW()
);

-- Create webhook_events table
CREATE TABLE webhook_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type text,
    request_id uuid,
    user_name text,
    user_email text,
    subject text,
    event_id integer,
    event_time timestamp with time zone,
    raw_data jsonb,
    createdat timestamp with time zone DEFAULT NOW(),
    updatedat timestamp with time zone DEFAULT NOW(),
    processed boolean DEFAULT false
);


7. Constraints and Relationships


-- Module 7: Constraints and Relationships
-- Contains all foreign key constraints and check constraints

-- Utility readings status constraint
ALTER TABLE utility_readings
ADD CONSTRAINT utility_readings_status_check
CHECK (status IN ('pending', 'verified', 'billed', 'disputed', 'approved', 'completed', 'rejected', 'cancelled'));

-- Utility readings billing status constraint
ALTER TABLE utility_readings
ADD CONSTRAINT utility_readings_billing_status_check
CHECK (billing_status IN ('pending', 'pending_invoice', 'invoiced', 'rejected') OR billing_status IS NULL);

-- Add Foreign Key Constraints
ALTER TABLE action_records ADD CONSTRAINT fk_action_records_property FOREIGN KEY (propertyid) REFERENCES properties(id);
ALTER TABLE action_records ADD CONSTRAINT fk_action_records_rentee FOREIGN KEY (renteeid) REFERENCES app_users(id);

ALTER TABLE agreement_signature_status ADD CONSTRAINT fk_agreement_signature_status_agreement FOREIGN KEY (agreement_id) REFERENCES agreements(id);

ALTER TABLE agreements ADD CONSTRAINT fk_agreements_template FOREIGN KEY (templateid) REFERENCES agreement_templates(id);
ALTER TABLE agreements ADD CONSTRAINT fk_agreements_rentee FOREIGN KEY (renteeid) REFERENCES app_users(id);
ALTER TABLE agreements ADD CONSTRAINT fk_agreements_property FOREIGN KEY (propertyid) REFERENCES properties(id);
ALTER TABLE agreements ADD CONSTRAINT fk_agreements_unit FOREIGN KEY (unitid) REFERENCES property_units(id);

ALTER TABLE camera_monitoring ADD CONSTRAINT fk_camera_monitoring_camera FOREIGN KEY (cameraid) REFERENCES cameras(id);

ALTER TABLE cameras ADD CONSTRAINT fk_cameras_property FOREIGN KEY (propertyid) REFERENCES properties(id);

ALTER TABLE invoices ADD CONSTRAINT fk_invoices_rentee FOREIGN KEY (renteeid) REFERENCES app_users(id);
ALTER TABLE invoices ADD CONSTRAINT fk_invoices_property FOREIGN KEY (propertyid) REFERENCES properties(id);

ALTER TABLE maintenance_request_comments ADD CONSTRAINT fk_maintenance_request_comments_request FOREIGN KEY (maintenance_request_id) REFERENCES maintenance_requests(id);
ALTER TABLE maintenance_request_comments ADD CONSTRAINT fk_maintenance_request_comments_user FOREIGN KEY (user_id) REFERENCES app_users(id);

ALTER TABLE maintenance_request_images ADD CONSTRAINT fk_maintenance_request_images_request FOREIGN KEY (maintenance_request_id) REFERENCES maintenance_requests(id);
ALTER TABLE maintenance_request_images ADD CONSTRAINT fk_maintenance_request_images_uploader FOREIGN KEY (uploaded_by) REFERENCES app_users(id);

ALTER TABLE maintenance_requests ADD CONSTRAINT fk_maintenance_requests_property FOREIGN KEY (propertyid) REFERENCES properties(id);
ALTER TABLE maintenance_requests ADD CONSTRAINT fk_maintenance_requests_rentee FOREIGN KEY (renteeid) REFERENCES app_users(id);
ALTER TABLE maintenance_requests ADD CONSTRAINT fk_maintenance_requests_assigned FOREIGN KEY (assignedto) REFERENCES app_users(id);

ALTER TABLE notifications ADD CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES app_users(id);

ALTER TABLE payments ADD CONSTRAINT fk_payments_invoice FOREIGN KEY (invoiceid) REFERENCES invoices(id);

ALTER TABLE property_units ADD CONSTRAINT fk_property_units_property FOREIGN KEY (propertyid) REFERENCES properties(id);

ALTER TABLE scheduled_tasks ADD CONSTRAINT fk_scheduled_tasks_property FOREIGN KEY (propertyid) REFERENCES properties(id);

ALTER TABLE sent_letters ADD CONSTRAINT fk_sent_letters_template FOREIGN KEY (templateid) REFERENCES letter_templates(id);
ALTER TABLE sent_letters ADD CONSTRAINT fk_sent_letters_rentee FOREIGN KEY (renteeid) REFERENCES app_users(id);
ALTER TABLE sent_letters ADD CONSTRAINT fk_sent_letters_property FOREIGN KEY (propertyid) REFERENCES properties(id);

ALTER TABLE task_assignments ADD CONSTRAINT fk_task_assignments_team_member FOREIGN KEY (teammemberid) REFERENCES app_users(id);

ALTER TABLE utility_readings ADD CONSTRAINT fk_utility_readings_rentee FOREIGN KEY (renteeid) REFERENCES app_users(id);
ALTER TABLE utility_readings ADD CONSTRAINT fk_utility_readings_property FOREIGN KEY (propertyid) REFERENCES properties(id);


8. Triggers


-- Module 8: Triggers (continued)
-- Contains all database triggers for the KH Rentals application

-- Timestamp triggers
CREATE TRIGGER update_maintenance_requests_updatedat BEFORE UPDATE ON maintenance_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_properties_updated_at BEFORE UPDATE ON properties FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_property_units_updated_at BEFORE UPDATE ON property_units FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_scheduled_tasks_updated_at BEFORE UPDATE ON scheduled_tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_task_assignments_updated_at BEFORE UPDATE ON task_assignments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_utility_configs_updated_at BEFORE UPDATE ON utility_configs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_utility_readings_updated_at BEFORE UPDATE ON utility_readings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_cameras_updatedat BEFORE UPDATE ON cameras FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE TRIGGER set_timestamps_notifications BEFORE INSERT OR UPDATE ON notifications FOR EACH ROW EXECUTE FUNCTION set_timestamps();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON webhook_events FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE TRIGGER set_properties_timestamps BEFORE INSERT OR UPDATE ON properties FOR EACH ROW EXECUTE FUNCTION set_properties_timestamps();

-- Business logic triggers
CREATE TRIGGER calculate_invoice_total_trigger BEFORE INSERT OR UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION calculate_invoice_total();
CREATE TRIGGER update_invoice_status_trigger BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION update_invoice_status_on_overdue();
CREATE TRIGGER update_maintenance_request_status AFTER INSERT OR UPDATE ON task_assignments FOR EACH ROW EXECUTE FUNCTION update_maintenance_request_on_task_assignment();
CREATE TRIGGER agreement_document_trigger BEFORE INSERT OR UPDATE ON agreements FOR EACH ROW EXECUTE FUNCTION generate_agreement_document();
CREATE TRIGGER webhook_event_trigger AFTER INSERT ON webhook_events FOR EACH ROW EXECUTE FUNCTION update_agreement_from_webhook();


9. RLS Policies

-- Module 9: RLS Policies
-- Contains Row-Level Security policies for all tables

-- =============================================
-- Enable Row Level Security on Tables
-- =============================================

ALTER TABLE action_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE agreement_signature_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE agreement_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE camera_monitoring ENABLE ROW LEVEL SECURITY;
ALTER TABLE cameras ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE letter_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_request_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_request_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE sent_letters ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE utility_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE utility_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

-- =============================================
-- Basic Policies for Default Access Control
-- =============================================

-- action_records policies
CREATE POLICY action_records_select_policy ON action_records FOR SELECT TO PUBLIC USING (true);
CREATE POLICY action_records_insert_policy ON action_records FOR INSERT TO PUBLIC WITH CHECK (true);
CREATE POLICY action_records_update_policy ON action_records FOR UPDATE TO PUBLIC USING (true);
CREATE POLICY action_records_delete_policy ON action_records FOR DELETE TO PUBLIC USING (true);

-- agreement_templates policies
CREATE POLICY agreement_templates_select_policy ON agreement_templates FOR SELECT TO PUBLIC USING (true);
CREATE POLICY agreement_templates_insert_policy ON agreement_templates FOR INSERT TO PUBLIC WITH CHECK (true);
CREATE POLICY agreement_templates_update_policy ON agreement_templates FOR UPDATE TO PUBLIC USING (true);
CREATE POLICY agreement_templates_delete_policy ON agreement_templates FOR DELETE TO PUBLIC USING (true);

-- agreements policies
CREATE POLICY agreements_select_policy ON agreements FOR SELECT TO PUBLIC USING (true);
CREATE POLICY agreements_insert_policy ON agreements FOR INSERT TO PUBLIC WITH CHECK (true);
CREATE POLICY agreements_update_policy ON agreements FOR UPDATE TO PUBLIC USING (true);
CREATE POLICY agreements_delete_policy ON agreements FOR DELETE TO PUBLIC USING (true);

-- camera_monitoring policies
CREATE POLICY camera_monitoring_select_policy ON camera_monitoring FOR SELECT TO PUBLIC USING (true);
CREATE POLICY camera_monitoring_insert_policy ON camera_monitoring FOR INSERT TO PUBLIC WITH CHECK (true);
CREATE POLICY camera_monitoring_update_policy ON camera_monitoring FOR UPDATE TO PUBLIC USING (true);
CREATE POLICY camera_monitoring_delete_policy ON camera_monitoring FOR DELETE TO PUBLIC USING (true);

-- cameras policies
CREATE POLICY cameras_select_policy ON cameras FOR SELECT TO PUBLIC USING (true);
CREATE POLICY cameras_insert_policy ON cameras FOR INSERT TO PUBLIC WITH CHECK (true);
CREATE POLICY cameras_update_policy ON cameras FOR UPDATE TO PUBLIC USING (true);
CREATE POLICY cameras_delete_policy ON cameras FOR DELETE TO PUBLIC USING (true);

-- Role-specific camera policies
CREATE POLICY "Allow admins and staff to view cameras" ON cameras 
FOR SELECT TO PUBLIC USING (
    auth.uid() IN (
        SELECT app_users.auth_id FROM app_users
        WHERE app_users.role::text = ANY (ARRAY['admin'::character varying, 'staff'::character varying]::text[])
    )
);

CREATE POLICY "Allow admins and staff to insert cameras" ON cameras 
FOR INSERT TO PUBLIC WITH CHECK (
    auth.uid() IN (
        SELECT app_users.auth_id FROM app_users
        WHERE app_users.role::text = ANY (ARRAY['admin'::character varying, 'staff'::character varying]::text[])
    )
);

CREATE POLICY "Allow admins and staff to update cameras" ON cameras 
FOR UPDATE TO PUBLIC USING (
    auth.uid() IN (
        SELECT app_users.auth_id FROM app_users
        WHERE app_users.role::text = ANY (ARRAY['admin'::character varying, 'staff'::character varying]::text[])
    )
);

CREATE POLICY "Allow admins and staff to delete cameras" ON cameras 
FOR DELETE TO PUBLIC USING (
    auth.uid() IN (
        SELECT app_users.auth_id FROM app_users
        WHERE app_users.role::text = ANY (ARRAY['admin'::character varying, 'staff'::character varying]::text[])
    )
);

-- invoices policies
CREATE POLICY invoices_select_policy ON invoices FOR SELECT TO PUBLIC USING (true);
CREATE POLICY invoices_insert_policy ON invoices FOR INSERT TO PUBLIC WITH CHECK (true);
CREATE POLICY invoices_update_policy ON invoices FOR UPDATE TO PUBLIC USING (true);
CREATE POLICY invoices_delete_policy ON invoices FOR DELETE TO PUBLIC USING (true);

-- letter_templates policies
CREATE POLICY letter_templates_select_policy ON letter_templates FOR SELECT TO PUBLIC USING (true);
CREATE POLICY letter_templates_insert_policy ON letter_templates FOR INSERT TO PUBLIC WITH CHECK (true);
CREATE POLICY letter_templates_update_policy ON letter_templates FOR UPDATE TO PUBLIC USING (true);
CREATE POLICY letter_templates_delete_policy ON letter_templates FOR DELETE TO PUBLIC USING (true);

-- =============================================
-- Specialized Policies for Role-Based Access
-- =============================================

-- maintenance_request_comments policies
CREATE POLICY "Admin can do everything with maintenance request comments" ON maintenance_request_comments 
FOR ALL TO authenticated USING (
    auth.uid() IN (
        SELECT app_users.auth_id FROM app_users
        WHERE app_users.role::text = 'admin'::text
    )
);

CREATE POLICY "Rentees can view and create comments on their maintenance reque" ON maintenance_request_comments 
FOR ALL TO authenticated USING (
    maintenance_request_id IN (
        SELECT maintenance_requests.id FROM maintenance_requests
        WHERE maintenance_requests.renteeid IN (
            SELECT app_users.id FROM app_users
            WHERE app_users.auth_id = auth.uid()
        )
    )
);

CREATE POLICY "Staff can manage maintenance request comments" ON maintenance_request_comments 
FOR ALL TO authenticated USING (
    auth.uid() IN (
        SELECT app_users.auth_id FROM app_users
        WHERE app_users.role::text = 'staff'::text
    )
);

-- maintenance_request_images policies
CREATE POLICY "Admin can do everything with maintenance request images" ON maintenance_request_images 
FOR ALL TO authenticated USING (
    auth.uid() IN (
        SELECT app_users.auth_id FROM app_users
        WHERE app_users.role::text = 'admin'::text
    )
);

CREATE POLICY "Rentees can insert images for their own maintenance requests" ON maintenance_request_images 
FOR INSERT TO authenticated WITH CHECK (
    maintenance_request_id IN (
        SELECT maintenance_requests.id FROM maintenance_requests
        WHERE maintenance_requests.renteeid IN (
            SELECT app_users.id FROM app_users
            WHERE app_users.auth_id = auth.uid()
        )
    )
);

CREATE POLICY "Rentees can view maintenance request images" ON maintenance_request_images 
FOR SELECT TO authenticated USING (
    maintenance_request_id IN (
        SELECT maintenance_requests.id FROM maintenance_requests
        WHERE maintenance_requests.renteeid IN (
            SELECT app_users.id FROM app_users
            WHERE app_users.auth_id = auth.uid()
        )
    )
);

CREATE POLICY "Staff can manage maintenance request images" ON maintenance_request_images 
FOR ALL TO authenticated USING (
    auth.uid() IN (
        SELECT app_users.auth_id FROM app_users
        WHERE app_users.role::text = 'staff'::text
    )
);

-- maintenance_requests policies
CREATE POLICY "Admin can do everything with maintenance requests" ON maintenance_requests 
FOR ALL TO authenticated USING (
    auth.uid() IN (
        SELECT app_users.auth_id FROM app_users
        WHERE app_users.role::text = 'admin'::text
    )
);

CREATE POLICY "Rentees can create maintenance requests" ON maintenance_requests 
FOR INSERT TO authenticated WITH CHECK (
    auth.uid() IN (
        SELECT app_users.auth_id FROM app_users
        WHERE app_users.id = maintenance_requests.renteeid
    )
);

CREATE POLICY "Rentees can view their own maintenance requests" ON maintenance_requests 
FOR SELECT TO authenticated USING (
    auth.uid() IN (
        SELECT app_users.auth_id FROM app_users
        WHERE app_users.id = maintenance_requests.renteeid
    )
);

CREATE POLICY "Staff can view and update maintenance requests" ON maintenance_requests 
FOR ALL TO authenticated USING (
    auth.uid() IN (
        SELECT app_users.auth_id FROM app_users
        WHERE app_users.role::text = 'staff'::text
    )
);

CREATE POLICY "maintenance_update_policy" ON maintenance_requests 
FOR UPDATE TO authenticated USING (
    (renteeid = (
        SELECT app_users.id FROM app_users
        WHERE app_users.auth_id = auth.uid()
    )) OR (
        EXISTS (
            SELECT 1 FROM app_users
            WHERE app_users.auth_id = auth.uid() AND app_users.role::text = 'staff'::text
        )
    )
) WITH CHECK (
    (renteeid = (
        SELECT app_users.id FROM app_users
        WHERE app_users.auth_id = auth.uid()
    )) OR (
        EXISTS (
            SELECT 1 FROM app_users
            WHERE app_users.auth_id = auth.uid() AND app_users.role::text = 'staff'::text
        )
    )
);


10. More RLS Policies

-- Module 10: More RLS Policies
-- Contains additional Row-Level Security policies for remaining tables

-- payments policies
CREATE POLICY payments_select_policy ON payments FOR SELECT TO PUBLIC USING (true);
CREATE POLICY payments_insert_policy ON payments FOR INSERT TO PUBLIC WITH CHECK (true);
CREATE POLICY payments_update_policy ON payments FOR UPDATE TO PUBLIC USING (true);
CREATE POLICY payments_delete_policy ON payments FOR DELETE TO PUBLIC USING (true);

-- properties policies
CREATE POLICY properties_select_policy ON properties FOR SELECT TO PUBLIC USING (true);
CREATE POLICY properties_insert_policy ON properties FOR INSERT TO PUBLIC WITH CHECK (true);
CREATE POLICY properties_update_policy ON properties FOR UPDATE TO PUBLIC USING (true);
CREATE POLICY properties_delete_policy ON properties FOR DELETE TO PUBLIC USING (true);

-- property_units policies
CREATE POLICY property_units_select_policy ON property_units FOR SELECT TO PUBLIC USING (true);
CREATE POLICY property_units_insert_policy ON property_units FOR INSERT TO PUBLIC WITH CHECK (true);
CREATE POLICY property_units_update_policy ON property_units FOR UPDATE TO PUBLIC USING (true);
CREATE POLICY property_units_delete_policy ON property_units FOR DELETE TO PUBLIC USING (true);

-- scheduled_tasks policies
CREATE POLICY scheduled_tasks_select_policy ON scheduled_tasks FOR SELECT TO PUBLIC USING (true);
CREATE POLICY scheduled_tasks_insert_policy ON scheduled_tasks FOR INSERT TO PUBLIC WITH CHECK (true);
CREATE POLICY scheduled_tasks_update_policy ON scheduled_tasks FOR UPDATE TO PUBLIC USING (true);
CREATE POLICY scheduled_tasks_delete_policy ON scheduled_tasks FOR DELETE TO PUBLIC USING (true);

-- sent_letters policies
CREATE POLICY sent_letters_select_policy ON sent_letters FOR SELECT TO PUBLIC USING (true);
CREATE POLICY sent_letters_insert_policy ON sent_letters FOR INSERT TO PUBLIC WITH CHECK (true);
CREATE POLICY sent_letters_update_policy ON sent_letters FOR UPDATE TO PUBLIC USING (true);
CREATE POLICY sent_letters_delete_policy ON sent_letters FOR DELETE TO PUBLIC USING (true);

-- task_assignments policies
CREATE POLICY task_assignments_select_policy ON task_assignments FOR SELECT TO PUBLIC USING (true);
CREATE POLICY task_assignments_insert_policy ON task_assignments FOR INSERT TO PUBLIC WITH CHECK (true);
CREATE POLICY task_assignments_update_policy ON task_assignments FOR UPDATE TO PUBLIC USING (true);
CREATE POLICY task_assignments_delete_policy ON task_assignments FOR DELETE TO PUBLIC USING (true);

-- utility_configs policies
CREATE POLICY utility_configs_select_policy ON utility_configs FOR SELECT TO PUBLIC USING (true);
CREATE POLICY utility_configs_insert_policy ON utility_configs FOR INSERT TO PUBLIC WITH CHECK (true);
CREATE POLICY utility_configs_update_policy ON utility_configs FOR UPDATE TO PUBLIC USING (true);
CREATE POLICY utility_configs_delete_policy ON utility_configs FOR DELETE TO PUBLIC USING (true);

-- utility_readings policies
CREATE POLICY utility_readings_select_policy ON utility_readings FOR SELECT TO PUBLIC USING (true);
CREATE POLICY utility_readings_insert_policy ON utility_readings FOR INSERT TO PUBLIC WITH CHECK (true);
CREATE POLICY utility_readings_update_policy ON utility_readings FOR UPDATE TO PUBLIC USING (true);
CREATE POLICY utility_readings_delete_policy ON utility_readings FOR DELETE TO PUBLIC USING (true);

-- webhook_events policies
CREATE POLICY "Allow webhook access" ON webhook_events FOR ALL TO PUBLIC USING (true);
CREATE POLICY "Anyone can insert webhook_events" ON webhook_events FOR INSERT TO PUBLIC WITH CHECK (true);
CREATE POLICY "Anyone can select webhook_events" ON webhook_events FOR SELECT TO PUBLIC USING (true);
CREATE POLICY "Only service_role can update webhook_events" ON webhook_events 
FOR UPDATE TO PUBLIC USING (auth.role() = 'service_role'::text) 
WITH CHECK (auth.role() = 'service_role'::text);

CREATE POLICY "service_role_access" ON webhook_events 
FOR ALL TO anon, authenticated USING (auth.role() = 'service_role'::text);

CREATE POLICY "users_can_view" ON webhook_events 
FOR SELECT TO authenticated USING (true);

CREATE POLICY webhook_events_select_policy ON webhook_events FOR SELECT TO authenticated USING (true);
CREATE POLICY webhook_events_insert_policy ON webhook_events FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY webhook_events_delete_policy ON webhook_events 
FOR DELETE TO authenticated USING (
    EXISTS (
        SELECT 1 FROM app_users 
        WHERE app_users.auth_id = auth.uid() AND app_users.role::text = 'admin'::text
    )
);

-- Create utility_billing table with policies
CREATE TABLE utility_billing (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    propertyid uuid REFERENCES properties(id),
    renteeid uuid REFERENCES app_users(id),
    utilitytype character varying,
    billingperiod character varying,
    amount numeric,
    status character varying,
    readingids uuid[],
    invoiceid uuid REFERENCES invoices(id),
    createdat timestamp with time zone DEFAULT NOW(),
    updatedat timestamp with time zone DEFAULT NOW()
);

-- Enable RLS for utility_billing
ALTER TABLE utility_billing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to utility_billing" ON utility_billing FOR ALL TO PUBLIC USING (true) WITH CHECK (true);

11. Storage Configuration

-- Module 11: Storage Configuration
-- Contains configuration for Supabase storage buckets and policies

-- Initialize required storage buckets
DO $$
BEGIN
    -- Create storage buckets if they don't exist
    PERFORM storage.create_bucket('images', 'Image storage for properties, maintenance, and more', public => false);
    PERFORM storage.create_bucket('files', 'Document storage for agreements and other files', public => false);

    -- Note: The actual structure is organized with folders within these buckets
    -- images bucket contains folders: id-copies, maintenance, properties, utility-readings
    -- files bucket contains folders: agreements, documents, id-copies, payment-proofs
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error creating buckets: %', SQLERRM;
END;
$$;

-- Storage policies for utility-readings bucket
CALL create_storage_policy(
    'utility-readings',
    'utility_readings_admin_access',
    'ALL',
    'auth.uid() IN (SELECT auth_id FROM app_users WHERE role = ''admin'')'
);

CALL create_storage_policy(
    'utility-readings',
    'utility_readings_staff_access',
    'ALL',
    'auth.uid() IN (SELECT auth_id FROM app_users WHERE role = ''staff'')'
);

CALL create_storage_policy(
    'utility-readings',
    'utility_readings_rentee_select',
    'SELECT',
    'auth.uid() IN (SELECT auth_id FROM app_users WHERE id IN (SELECT renteeid FROM utility_readings WHERE photourl LIKE ''%'' || storage.filename() || ''%''))'
);

CALL create_storage_policy(
    'utility-readings',
    'utility_readings_rentee_insert',
    'INSERT',
    'auth.uid() IN (SELECT auth_id FROM app_users WHERE role = ''rentee'')'
);

-- Storage policies for maintenance-images bucket
CALL create_storage_policy(
    'maintenance-images',
    'maintenance_images_admin_access',
    'ALL',
    'auth.uid() IN (SELECT auth_id FROM app_users WHERE role = ''admin'')'
);

CALL create_storage_policy(
    'maintenance-images',
    'maintenance_images_staff_access',
    'ALL',
    'auth.uid() IN (SELECT auth_id FROM app_users WHERE role = ''staff'')'
);

CALL create_storage_policy(
    'maintenance-images',
    'maintenance_images_rentee_select',
    'SELECT',
    'auth.uid() IN (SELECT auth_id FROM app_users WHERE id IN (SELECT renteeid FROM maintenance_requests WHERE id IN (SELECT maintenance_request_id FROM maintenance_request_images WHERE image_url LIKE ''%'' || storage.filename() || ''%'')))'
);

CALL create_storage_policy(
    'maintenance-images',
    'maintenance_images_rentee_insert',
    'INSERT',
    'auth.uid() IN (SELECT auth_id FROM app_users WHERE role = ''rentee'')'
);

-- Storage policies for agreements bucket
CALL create_storage_policy(
    'agreements',
    'agreements_admin_access',
    'ALL',
    'auth.uid() IN (SELECT auth_id FROM app_users WHERE role = ''admin'')'
);

CALL create_storage_policy(
    'agreements',
    'agreements_staff_access',
    'ALL',
    'auth.uid() IN (SELECT auth_id FROM app_users WHERE role = ''staff'')'
);

CALL create_storage_policy(
    'agreements',
    'agreements_rentee_select',
    'SELECT',
    'auth.uid() IN (SELECT auth_id FROM app_users WHERE id IN (SELECT renteeid FROM agreements WHERE documenturl LIKE ''%'' || storage.filename() || ''%'' OR pdfurl LIKE ''%'' || storage.filename() || ''%'' OR signed_document_url LIKE ''%'' || storage.filename() || ''%''))'
);

-- Storage policies for payment-proofs bucket
CALL create_storage_policy(
    'payment-proofs',
    'payment_proofs_admin_access',
    'ALL',
    'auth.uid() IN (SELECT auth_id FROM app_users WHERE role = ''admin'')'
);

CALL create_storage_policy(
    'payment-proofs',
    'payment_proofs_staff_access',
    'ALL',
    'auth.uid() IN (SELECT auth_id FROM app_users WHERE role = ''staff'')'
);

CALL create_storage_policy(
    'payment-proofs',
    'payment_proofs_rentee_select',
    'SELECT',
    'auth.uid() IN (SELECT auth_id FROM app_users WHERE id IN (SELECT renteeid FROM invoices WHERE paymentproofurl LIKE ''%'' || storage.filename() || ''%''))'
);

CALL create_storage_policy(
    'payment-proofs',
    'payment_proofs_rentee_insert',
    'INSERT',
    'auth.uid() IN (SELECT auth_id FROM app_users WHERE role = ''rentee'')'
);

12. Evia Sign Integration

-- Module 12: Evia Sign Integration
-- Contains configuration specific to Evia Sign webhook integration

-- Create webhook processing table to track Evia Sign events
CREATE TABLE IF NOT EXISTS evia_sign_webhook_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id uuid,
    event_id integer,
    event_description text,
    event_time timestamp with time zone,
    user_name text,
    user_email text,
    subject text,
    document_content bytea,
    document_name text,
    raw_data jsonb,
    processed boolean DEFAULT false,
    processing_error text,
    createdat timestamp with time zone DEFAULT NOW(),
    updatedat timestamp with time zone DEFAULT NOW()
);

-- Enable RLS for webhook events
ALTER TABLE evia_sign_webhook_events ENABLE ROW LEVEL SECURITY;

-- Event processing policies
CREATE POLICY "Admin access to webhook events" ON evia_sign_webhook_events 
FOR ALL TO authenticated USING (
    auth.uid() IN (
        SELECT app_users.auth_id FROM app_users
        WHERE app_users.role::text = 'admin'::text
    )
);

CREATE POLICY "Staff read-only access to webhook events" ON evia_sign_webhook_events 
FOR SELECT TO authenticated USING (
    auth.uid() IN (
        SELECT app_users.auth_id FROM app_users
        WHERE app_users.role::text = 'staff'::text
    )
);

-- Function to process webhook events asynchronously
CREATE OR REPLACE FUNCTION process_evia_sign_webhook(event_id uuid)
RETURNS void AS $$
DECLARE
    event_record evia_sign_webhook_events;
    agreement_record agreements;
    agreement_id uuid;
    event_type integer;
    document_url text;
BEGIN
    -- Get the webhook event
    SELECT * INTO event_record FROM evia_sign_webhook_events WHERE id = event_id;
    
    IF event_record IS NULL THEN
        RAISE EXCEPTION 'Webhook event not found: %', event_id;
    END IF;
    
    -- Skip if already processed
    IF event_record.processed THEN
        RETURN;
    END IF;
    
    -- Find the corresponding agreement
    SELECT id INTO agreement_id 
    FROM agreements 
    WHERE eviasignreference = event_record.request_id;
    
    IF agreement_id IS NULL THEN
        UPDATE evia_sign_webhook_events 
        SET 
            processed = true,
            processing_error = 'No matching agreement found',
            updatedat = NOW()
        WHERE id = event_id;
        
        RETURN;
    END IF;
    
    -- Update agreement based on event type
    event_type := event_record.event_id;
    
    CASE 
        WHEN event_type = 1 THEN -- SignRequestReceived
            UPDATE agreements
            SET 
                status = 'pending_signature',
                signature_status = 'pending',
                signature_sent_at = event_record.event_time,
                updatedat = NOW()
            WHERE id = agreement_id;
            
        WHEN event_type = 2 THEN -- SignatoryCompleted
            -- Update signatories status JSON
            UPDATE agreements a
            SET 
                status = 'partially_signed',
                signature_status = 'in_progress',
                signatories_status = CASE
                    WHEN a.signatories_status IS NULL THEN 
                        jsonb_build_array(
                            jsonb_build_object(
                                'name', event_record.user_name,
                                'email', event_record.user_email,
                                'status', 'completed',
                                'signedAt', event_record.event_time
                            )
                        )
                    ELSE
                        jsonb_insert(
                            a.signatories_status, 
                            '{-1}', 
                            jsonb_build_object(
                                'name', event_record.user_name,
                                'email', event_record.user_email,
                                'status', 'completed',
                                'signedAt', event_record.event_time
                            )
                        )
                END,
                updatedat = NOW()
            WHERE id = agreement_id;
            
        WHEN event_type = 3 THEN -- RequestCompleted
            -- If document content was included, save it to storage
            IF event_record.document_content IS NOT NULL THEN
                -- Logic to save to storage would go here
                -- For this example we'll just update the URL
                document_url := 'agreements/' || agreement_id || '/' || 
                                COALESCE(event_record.document_name, 'signed_agreement.pdf');
            END IF;
            
            UPDATE agreements
            SET 
                status = 'signed',
                signature_status = 'completed',
                signature_completed_at = event_record.event_time,
                signeddate = event_record.event_time,
                signed_document_url = COALESCE(document_url, signed_document_url),
                updatedat = NOW()
            WHERE id = agreement_id;
    END CASE;
    
    -- Mark webhook event as processed
    UPDATE evia_sign_webhook_events 
    SET 
        processed = true,
        updatedat = NOW()
    WHERE id = event_id;
    
EXCEPTION
    WHEN OTHERS THEN
        -- Log the error and mark as failed
        UPDATE evia_sign_webhook_events 
        SET 
            processing_error = SQLERRM,
            updatedat = NOW()
        WHERE id = event_id;
END;
$$ LANGUAGE plpgsql;

13. Database Initialization & Setup

-- Module 13: Database Initialization & Setup
-- Contains initialization scripts to setup the database with sample data

-- Create initial admin user
INSERT INTO app_users (
    id, 
    email, 
    name, 
    role, 
    user_type,
    contact_details,
    status,
    active
) 
VALUES (
    gen_random_uuid(),
    'admin@khrentals.com',
    'System Administrator',
    'admin',
    'staff',
    '{"phone": "+1234567890", "address": "KH Rentals HQ"}',
    'active',
    true
)
ON CONFLICT (email) DO NOTHING;

-- Create utility types
INSERT INTO utility_configs (utilitytype, billingtype, rate)
VALUES 
    ('electricity', 'metered', 0.12),
    ('water', 'metered', 1.50)
ON CONFLICT DO NOTHING;

-- Execute final setup function to enable RLS on all tables
SELECT setup_rls_for_all_tables();

-- =============================================
-- Database Setup Complete
-- =============================================

Storage Schema and Policies Documentation
In addition to the SQL scripts, let's document the storage schema and policies to provide a complete reference:
Storage Schema
The KH Rentals application uses the following storage buckets:
agreements: Stores rental agreement documents including:
Draft agreement PDFs
Signed agreement documents from Evia Sign
Agreement templates
utility-readings: Stores photos of utility meter readings:
Electricity meter readings
Water meter readings
Supporting documentation for utility bill verification
maintenance-images: Stores images related to maintenance requests:
Before images showing maintenance issues
Progress images during repairs
Completion images showing resolved issues
documents: Stores general documentation:
Legal documents
Policies and procedures
Other reference materials
id-documents: Stores identity verification documents:
Rentee ID copies
Business verification documents
property-images: Stores property listing imagery:
Exterior property photos
Interior unit photos
Amenity photos
payment-proofs: Stores evidence of invoice payments:
Payment receipts
Bank transfer confirmations
Storage Access Policies
The following access pattern is implemented for storage buckets:
Admin Access: Administrators have full access (read/write/delete) to all buckets.
Staff Access: Staff members have:
Full access to operational buckets (maintenance-images, utility-readings, property-images)
Read access to sensitive buckets (id-documents, payment-proofs)
Read/write access to documents and agreements
Rentee Access: Rentees have:
Read-only access to their own agreements
Read/write access to their own utility readings
Read/write access to their own maintenance request images
Read/write access to their own payment proofs
No access to other rentees' data

14. Evia Sign Integration Documentation

-- Module 14: Evia Sign Integration Documentation
-- Contains documentation and additional configuration for Evia Sign integration

/*
The KH Rentals application integrates with Evia Sign for digital signatures on rental agreements.
This module documents the integration flow and provides any additional setup required.

INTEGRATION WORKFLOW:
1. Register application with Evia Sign team (done once during setup)
2. Upload agreement document to Evia Sign
3. Create signature request with signatories
4. Receive webhooks for each signature event
5. Update agreement status based on webhook events
6. Download and store signed document when all signatures are complete

WEBHOOK EVENTS:
EventId 1: SignRequestReceived - Initial request created
EventId 2: SignatoryCompleted - Individual signatory has signed
EventId 3: RequestCompleted - All signatories have completed, document is fully signed

ENVIRONMENT VARIABLES REQUIRED:
- EVIA_SIGN_CLIENT_ID: Application ID provided by Evia Sign
- EVIA_SIGN_CLIENT_SECRET: Application secret provided by Evia Sign
- EVIA_SIGN_REDIRECT_URL: Redirect URL for OAuth flow
- EVIA_SIGN_API_URL: Base URL for Evia Sign API
- EVIA_SIGN_WEBHOOK_URL: URL where webhooks will be received
*/

-- Create config table for Evia Sign settings
CREATE TABLE IF NOT EXISTS evia_sign_config (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    config_key text NOT NULL UNIQUE,
    config_value text,
    is_secret boolean DEFAULT false,
    description text,
    last_updated timestamp with time zone DEFAULT NOW()
);

-- Insert default configuration
INSERT INTO evia_sign_config (config_key, config_value, is_secret, description)
VALUES 
    ('client_id', NULL, true, 'Evia Sign Client ID provided during registration'),
    ('client_secret', NULL, true, 'Evia Sign Client Secret provided during registration'),
    ('api_url', 'https://evia.enadocapp.com/_apis', false, 'Base URL for Evia Sign API'),
    ('redirect_url', 'https://app.khrentals.com/auth/evia-callback', false, 'Redirect URL for OAuth authentication flow'),
    ('webhook_url', 'https://app.khrentals.com/api/webhooks/evia', false, 'Webhook URL to receive Evia Sign events'),
    ('token_lifespan', '3600', false, 'Lifespan of access token in seconds (default 1 hour)'),
    ('auto_download_documents', 'true', false, 'Whether to automatically download signed documents'),
    ('include_documents_in_webhook', 'true', false, 'Whether completed document should be included in webhook payload'),
    ('signature_request_type', '3', false, 'Signature request type to use (3=Auto-stamping)')
ON CONFLICT (config_key) DO NOTHING;

-- Create table for storing Evia Sign tokens
CREATE TABLE IF NOT EXISTS evia_sign_tokens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_token text NOT NULL,
    refresh_token text NOT NULL,
    created_at timestamp with time zone DEFAULT NOW(),
    expires_at timestamp with time zone,
    user_id uuid REFERENCES app_users(id),
    is_active boolean DEFAULT true
);

-- Add index for efficiency
CREATE INDEX IF NOT EXISTS idx_evia_sign_tokens_user_id ON evia_sign_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_evia_sign_tokens_is_active ON evia_sign_tokens(is_active);

-- Documentation for webhook payload format
COMMENT ON TABLE webhook_events IS 
'Stores webhook events from Evia Sign. The expected payload format for these events is:

For SignRequestReceived (EventId 1):
{
  "RequestId": "c93fe389-cb3f-4a53-81d5-fa38b4077f98",
  "UserName": "Admin Name",
  "Email": "admin@example.com",
  "Subject": "Rental Agreement #123",
  "EventId": 1,
  "EventDescription": "SignRequestReceived",
  "EventTime": "2023-03-31T05:55:55.2975393Z"
}

For SignatoryCompleted (EventId 2):
{
  "RequestId": "c93fe389-cb3f-4a53-81d5-fa38b4077f98",
  "UserName": "Signatory Name",
  "Email": "signatory@example.com",
  "Subject": "Rental Agreement #123",
  "EventId": 2,
  "EventDescription": "SignatoryCompleted",
  "EventTime": "2023-03-31T05:56:06.8342123Z"
}

For RequestCompleted (EventId 3) without document:
{
  "RequestId": "c93fe389-cb3f-4a53-81d5-fa38b4077f98",
  "UserName": "Final Signatory Name",
  "Email": "signatory@example.com",
  "Subject": "Rental Agreement #123",
  "EventId": 3,
  "EventDescription": "RequestCompleted",
  "EventTime": "2023-03-31T05:31:42.1064458Z"
}

For RequestCompleted (EventId 3) with document:
{
  "RequestId": "c93fe389-cb3f-4a53-81d5-fa38b4077f98",
  "UserName": "Final Signatory Name",
  "Email": "signatory@example.com",
  "Subject": "Rental Agreement #123",
  "EventId": 3,
  "EventDescription": "RequestCompleted",
  "EventTime": "2023-03-31T05:31:42.1064458Z",
  "Documents": [
    {
      "DocumentName": "Rental Agreement.pdf",
      "DocumentContent": "JVBERi0xLjcNCiW1tb..." // Base64 encoded PDF
    }
  ]
}';

15. Indexes and Performance Optimizations

-- Module 15: Indexes and Performance Optimizations
-- Contains indexes and other optimizations to improve database performance

-- Indexes for agreements table
CREATE INDEX IF NOT EXISTS idx_agreements_renteeid ON agreements(renteeid);
CREATE INDEX IF NOT EXISTS idx_agreements_propertyid ON agreements(propertyid);
CREATE INDEX IF NOT EXISTS idx_agreements_status ON agreements(status);
CREATE INDEX IF NOT EXISTS idx_agreements_eviasignreference ON agreements(eviasignreference);
CREATE INDEX IF NOT EXISTS idx_agreements_startdate ON agreements(startdate);
CREATE INDEX IF NOT EXISTS idx_agreements_enddate ON agreements(enddate);

-- Indexes for app_users table
CREATE INDEX IF NOT EXISTS idx_app_users_auth_id ON app_users(auth_id);
CREATE INDEX IF NOT EXISTS idx_app_users_email ON app_users(email);
CREATE INDEX IF NOT EXISTS idx_app_users_role ON app_users(role);
CREATE INDEX IF NOT EXISTS idx_app_users_user_type ON app_users(user_type);

-- Indexes for maintenance_requests table
CREATE INDEX IF NOT EXISTS idx_maintenance_requests_propertyid ON maintenance_requests(propertyid);
CREATE INDEX IF NOT EXISTS idx_maintenance_requests_renteeid ON maintenance_requests(renteeid);
CREATE INDEX IF NOT EXISTS idx_maintenance_requests_status ON maintenance_requests(status);
CREATE INDEX IF NOT EXISTS idx_maintenance_requests_assignedto ON maintenance_requests(assignedto);

-- Indexes for invoices table
CREATE INDEX IF NOT EXISTS idx_invoices_renteeid ON invoices(renteeid);
CREATE INDEX IF NOT EXISTS idx_invoices_propertyid ON invoices(propertyid);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_duedate ON invoices(duedate);

-- Indexes for payments table
CREATE INDEX IF NOT EXISTS idx_payments_invoiceid ON payments(invoiceid);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

-- Indexes for utility_readings table
CREATE INDEX IF NOT EXISTS idx_utility_readings_renteeid ON utility_readings(renteeid);
CREATE INDEX IF NOT EXISTS idx_utility_readings_propertyid ON utility_readings(propertyid);
CREATE INDEX IF NOT EXISTS idx_utility_readings_status ON utility_readings(status);
CREATE INDEX IF NOT EXISTS idx_utility_readings_readingdate ON utility_readings(readingdate);
CREATE INDEX IF NOT EXISTS idx_utility_readings_billing_status ON utility_readings(billing_status);

-- Indexes for webhook_events table
CREATE INDEX IF NOT EXISTS idx_webhook_events_request_id ON webhook_events(request_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_event_id ON webhook_events(event_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_processed ON webhook_events(processed);

-- Create partial index for pending utility readings
CREATE INDEX IF NOT EXISTS idx_utility_readings_pending ON utility_readings(propertyid, renteeid)
WHERE status = 'pending';

-- Create partial index for overdue invoices
CREATE INDEX IF NOT EXISTS idx_invoices_overdue ON invoices(renteeid, duedate)
WHERE status = 'pending' AND duedate < CURRENT_DATE;

-- Create GIN index for JSON fields
CREATE INDEX IF NOT EXISTS idx_properties_amenities_gin ON properties USING gin (amenities);
CREATE INDEX IF NOT EXISTS idx_properties_rentalvalues_gin ON properties USING gin (rentalvalues);
CREATE INDEX IF NOT EXISTS idx_agreements_signatories_status_gin ON agreements USING gin (signatories_status);
CREATE INDEX IF NOT EXISTS idx_app_users_contact_details_gin ON app_users USING gin (contact_details);
CREATE INDEX IF NOT EXISTS idx_invoices_components_gin ON invoices USING gin (components);

16. Database Views for Reporting

-- Module 16: Database Views for Reporting
-- Contains views for common reporting and analytics needs

-- View for active agreements
CREATE OR REPLACE VIEW vw_active_agreements AS
SELECT 
    a.id,
    a.startdate,
    a.enddate,
    a.status,
    a.signature_status,
    p.name AS property_name,
    p.address AS property_address,
    u.name AS rentee_name,
    u.email AS rentee_email,
    pu.unitnumber,
    a.createdat,
    a.updatedat
FROM agreements a
JOIN properties p ON a.propertyid = p.id
JOIN app_users u ON a.renteeid = u.id
LEFT JOIN property_units pu ON a.unitid = pu.id
WHERE a.status IN ('active', 'signed') 
AND a.enddate >= CURRENT_DATE;

-- View for overdue invoices
CREATE OR REPLACE VIEW vw_overdue_invoices AS
SELECT 
    i.id,
    i.billingperiod,
    i.duedate,
    i.totalamount,
    i.status,
    i.createdat,
    p.name AS property_name,
    p.address AS property_address,
    u.name AS rentee_name,
    u.email AS rentee_email,
    u.contact_details->>'phone' AS rentee_phone,
    CURRENT_DATE - i.duedate AS days_overdue
FROM invoices i
JOIN properties p ON i.propertyid = p.id
JOIN app_users u ON i.renteeid = u.id
WHERE i.status = 'pending' 
AND i.duedate < CURRENT_DATE
ORDER BY days_overdue DESC;

-- View for pending maintenance requests
CREATE OR REPLACE VIEW vw_pending_maintenance_requests AS
SELECT 
    m.id,
    m.title,
    m.description,
    m.status,
    m.priority,
    m.requesttype,
    m.createdat,
    p.name AS property_name,
    p.address AS property_address,
    r.name AS rentee_name,
    r.email AS rentee_email,
    r.contact_details->>'phone' AS rentee_phone,
    s.name AS staff_name,
    s.email AS staff_email
FROM maintenance_requests m
JOIN properties p ON m.propertyid = p.id
JOIN app_users r ON m.renteeid = r.id
LEFT JOIN app_users s ON m.assignedto = s.id
WHERE m.status IN ('pending', 'assigned', 'in_progress')
ORDER BY 
    CASE 
        WHEN m.priority = 'high' THEN 1
        WHEN m.priority = 'medium' THEN 2
        WHEN m.priority = 'low' THEN 3
        ELSE 4
    END,
    m.createdat;

-- View for utility billing summary
CREATE OR REPLACE VIEW vw_utility_billing_summary AS
SELECT 
    p.id AS property_id,
    p.name AS property_name,
    u.id AS rentee_id,
    u.name AS rentee_name,
    ur.utilitytype,
    COUNT(ur.id) AS reading_count,
    SUM(ur.calculatedbill) AS total_billed,
    MAX(ur.readingdate) AS latest_reading_date,
    STRING_AGG(ur.status, ', ' ORDER BY ur.readingdate) AS reading_statuses
FROM utility_readings ur
JOIN properties p ON ur.propertyid = p.id
JOIN app_users u ON ur.renteeid = u.id
GROUP BY p.id, p.name, u.id, u.name, ur.utilitytype
ORDER BY p.name, u.name, ur.utilitytype;

-- View for properties with expiring agreements
CREATE OR REPLACE VIEW vw_expiring_agreements AS
SELECT 
    p.id AS property_id,
    p.name AS property_name,
    p.address AS property_address,
    a.id AS agreement_id,
    a.startdate,
    a.enddate,
    u.name AS rentee_name,
    u.email AS rentee_email,
    u.contact_details->>'phone' AS rentee_phone,
    a.enddate - CURRENT_DATE AS days_to_expiration
FROM agreements a
JOIN properties p ON a.propertyid = p.id
JOIN app_users u ON a.renteeid = u.id
WHERE a.status = 'active'
AND a.enddate > CURRENT_DATE
AND a.enddate - CURRENT_DATE <= 30
ORDER BY days_to_expiration;

-- View for payment summary by property
CREATE OR REPLACE VIEW vw_payment_summary_by_property AS
SELECT
    p.id AS property_id,
    p.name AS property_name,
    COUNT(i.id) AS invoice_count,
    SUM(i.totalamount) AS total_invoiced,
    SUM(CASE WHEN i.status = 'paid' THEN i.totalamount ELSE 0 END) AS total_paid,
    SUM(CASE WHEN i.status = 'pending' THEN i.totalamount ELSE 0 END) AS total_pending,
    SUM(CASE WHEN i.status = 'pending' AND i.duedate < CURRENT_DATE THEN i.totalamount ELSE 0 END) AS total_overdue,
    COUNT(CASE WHEN i.status = 'pending' AND i.duedate < CURRENT_DATE THEN 1 END) AS overdue_count
FROM properties p
LEFT JOIN invoices i ON p.id = i.propertyid
GROUP BY p.id, p.name
ORDER BY p.name;

17. Final Setup and Utilities

-- Module 17: Final Setup and Utilities
-- Contains final setup commands and utility functions

-- Create a super admin function for user elevation
CREATE OR REPLACE FUNCTION create_super_admin(
    admin_email text,
    admin_name text DEFAULT 'System Administrator'
)
RETURNS uuid AS $$
DECLARE
    admin_id uuid;
BEGIN
    INSERT INTO app_users (
        id, 
        email, 
        name, 
        role, 
        user_type,
        contact_details,
        status,
        active
    ) 
    VALUES (
        gen_random_uuid(),
        admin_email,
        admin_name,
        'admin',
        'staff',
        jsonb_build_object('email', admin_email),
        'active',
        true
    )
    ON CONFLICT (email) 
    DO UPDATE SET
        role = 'admin',
        status = 'active',
        active = true
    RETURNING id INTO admin_id;
    
    RETURN admin_id;
END;
$$ LANGUAGE plpgsql;

-- Function to reset RLS policies
CREATE OR REPLACE FUNCTION reset_rls_policies()
RETURNS void AS $$
BEGIN
    -- Call the setup function for all tables
    PERFORM setup_rls_for_all_tables();
    
    -- Execute any additional manual policy setups
    -- These are for complex policies that the generic function can't handle
    
    -- 1. Maintenance request policies
    EXECUTE 'DROP POLICY IF EXISTS "Admin can do everything with maintenance requests" ON maintenance_requests;';
    EXECUTE 'CREATE POLICY "Admin can do everything with maintenance requests" ON maintenance_requests 
             FOR ALL TO authenticated USING (
                 auth.uid() IN (
                     SELECT app_users.auth_id FROM app_users
                     WHERE app_users.role::text = ''admin''::text
                 )
             );';
             
    -- 2. Webhook policies
    EXECUTE 'DROP POLICY IF EXISTS "Allow webhook access" ON webhook_events;';
    EXECUTE 'CREATE POLICY "Allow webhook access" ON webhook_events FOR ALL TO PUBLIC USING (true);';
    
    RAISE NOTICE 'All RLS policies have been reset and reconfigured';
END;
$$ LANGUAGE plpgsql;

-- Function to backup database structure
CREATE OR REPLACE FUNCTION backup_database_structure(
    backup_file text DEFAULT 'database_backup_' || to_char(NOW(), 'YYYY_MM_DD') || '.sql'
)
RETURNS text AS $$
DECLARE
    backup_path text;
BEGIN
    -- Execute pg_dump to backup schema only
    backup_path := '/tmp/' || backup_file;
    
    EXECUTE format('COPY (
        SELECT pg_catalog.pg_get_functiondef(p.oid) 
        FROM pg_catalog.pg_proc p
        LEFT JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = ''public''
        ORDER BY p.proname
    ) TO %L', backup_path);
    
    RETURN 'Database structure backed up to ' || backup_path;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up test data
CREATE OR REPLACE FUNCTION cleanup_test_data()
RETURNS void AS $$
BEGIN
    -- Delete test records based on specific patterns
    DELETE FROM webhook_events WHERE subject LIKE 'TEST%';
    DELETE FROM utility_readings WHERE propertyid IN (
        SELECT id FROM properties WHERE name LIKE 'TEST%'
    );
    DELETE FROM invoices WHERE propertyid IN (
        SELECT id FROM properties WHERE name LIKE 'TEST%'
    );
    DELETE FROM agreements WHERE propertyid IN (
        SELECT id FROM properties WHERE name LIKE 'TEST%'
    );
    DELETE FROM property_units WHERE propertyid IN (
        SELECT id FROM properties WHERE name LIKE 'TEST%'
    );
    DELETE FROM properties WHERE name LIKE 'TEST%';
    DELETE FROM app_users WHERE email LIKE 'test%@example.com';
    
    RAISE NOTICE 'Test data cleanup completed';
END;
$$ LANGUAGE plpgsql;

-- Finalize database configuration
COMMENT ON DATABASE postgres IS 'KH Rentals Property Management System Database';

COMMENT ON SCHEMA public IS 'Contains all tables and functions for the KH Rentals application.
This schema includes:
- Property and unit management
- Tenant (rentee) management
- Agreement generation and digital signatures
- Utility readings and billing
- Maintenance request management
- Invoicing and payments
- Webhook handling for third-party integrations

For detailed documentation, see the GitHub repository README or contact the development team.';

-- Execute final setup
DO $$
BEGIN
    -- Reset RLS policies to ensure they are correctly applied
    PERFORM reset_rls_policies();
    
    -- Create buckets if not already created
    BEGIN
        PERFORM storage.create_bucket('agreements', 'Rental agreement documents', public => false);
    EXCEPTION
        WHEN OTHERS THEN
            RAISE NOTICE 'Storage bucket creation skipped - this is normal if running without storage extension';
    END;
    
    RAISE NOTICE 'Database setup complete!';
END;
$$;

This completes the modular documentation for KH Rentals database schema. Each module addresses a specific aspect of the database, making it easier to understand, maintain, and implement.
The complete system includes:
Core database functions and utilities
Business logic for property management
Evia Sign integration for digital signatures
Tables for all entities in the system
Constraints and relationships
Triggers for automatic data updates
RLS policies for security
Storage configuration for file management
Indexes for performance optimization
Views for reporting
Utility functions for maintenance
To implement this schema, run each module in sequence, as later modules depend on earlier ones.