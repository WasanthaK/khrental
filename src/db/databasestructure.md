| table_name                   | column_name               | data_type                   |
| ---------------------------- | ------------------------- | --------------------------- |
| action_records               | id                        | uuid                        |
| action_records               | propertyid                | uuid                        |
| action_records               | renteeid                  | uuid                        |
| action_records               | actiontype                | character varying           |
| action_records               | amount                    | numeric                     |
| action_records               | status                    | character varying           |
| action_records               | date                      | date                        |
| action_records               | comments                  | text                        |
| action_records               | relateddocs               | ARRAY                       |
| action_records               | createdat                 | timestamp with time zone    |
| action_records               | updatedat                 | timestamp with time zone    |
| agreement_signature_status   | agreement_id              | uuid                        |
| agreement_signature_status   | agreement_status          | character varying           |
| agreement_signature_status   | signature_status          | text                        |
| agreement_signature_status   | signatories_status        | jsonb                       |
| agreement_signature_status   | last_event_id             | integer                     |
| agreement_signature_status   | last_event_type           | text                        |
| agreement_signature_status   | last_event_time           | timestamp with time zone    |
| agreement_templates          | id                        | uuid                        |
| agreement_templates          | language                  | character varying           |
| agreement_templates          | content                   | text                        |
| agreement_templates          | version                   | character varying           |
| agreement_templates          | createdat                 | timestamp with time zone    |
| agreement_templates          | updatedat                 | timestamp with time zone    |
| agreement_templates          | name                      | character varying           |
| agreements                   | id                        | uuid                        |
| agreements                   | templateid                | uuid                        |
| agreements                   | renteeid                  | uuid                        |
| agreements                   | propertyid                | uuid                        |
| agreements                   | status                    | character varying           |
| agreements                   | signeddate                | timestamp with time zone    |
| agreements                   | startdate                 | date                        |
| agreements                   | enddate                   | date                        |
| agreements                   | eviasignreference         | uuid                        |
| agreements                   | documenturl               | text                        |
| agreements                   | createdat                 | timestamp with time zone    |
| agreements                   | updatedat                 | timestamp with time zone    |
| agreements                   | terms                     | jsonb                       |
| agreements                   | notes                     | text                        |
| agreements                   | unitid                    | uuid                        |
| agreements                   | needs_document_generation | boolean                     |
| agreements                   | pdfurl                    | text                        |
| agreements                   | signatureurl              | text                        |
| agreements                   | signature_status          | text                        |
| agreements                   | signatories_status        | jsonb                       |
| agreements                   | signature_request_id      | text                        |
| agreements                   | signature_sent_at         | timestamp with time zone    |
| agreements                   | signature_completed_at    | timestamp with time zone    |
| agreements                   | signature_pdf_url         | text                        |
| agreements                   | signed_document_url       | text                        |
| app_users                    | id                        | uuid                        |
| app_users                    | auth_id                   | uuid                        |
| app_users                    | email                     | character varying           |
| app_users                    | name                      | character varying           |
| app_users                    | role                      | character varying           |
| app_users                    | user_type                 | character varying           |
| app_users                    | contact_details           | jsonb                       |
| app_users                    | skills                    | ARRAY                       |
| app_users                    | availability              | jsonb                       |
| app_users                    | notes                     | text                        |
| app_users                    | status                    | character varying           |
| app_users                    | id_copy_url               | text                        |
| app_users                    | invited                   | boolean                     |
| app_users                    | active                    | boolean                     |
| app_users                    | last_login                | timestamp without time zone |
| app_users                    | createdat                 | timestamp without time zone |
| app_users                    | updatedat                 | timestamp without time zone |
| app_users                    | associated_property_ids   | ARRAY                       |
| app_users                    | permanent_address         | text                        |
| app_users                    | national_id               | character varying           |
| camera_monitoring            | id                        | uuid                        |
| camera_monitoring            | cameraid                  | uuid                        |
| camera_monitoring            | monitoringdate            | date                        |
| camera_monitoring            | statusupdate              | character varying           |
| camera_monitoring            | notes                     | text                        |
| camera_monitoring            | createdat                 | timestamp with time zone    |
| camera_monitoring            | updatedat                 | timestamp with time zone    |
| cameras                      | id                        | uuid                        |
| cameras                      | propertyid                | uuid                        |
| cameras                      | locationdescription       | text                        |
| cameras                      | cameratype                | character varying           |
| cameras                      | installationdetails       | text                        |
| cameras                      | datapackageinfo           | jsonb                       |
| cameras                      | status                    | character varying           |
| cameras                      | createdat                 | timestamp with time zone    |
| cameras                      | updatedat                 | timestamp with time zone    |
| invoices                     | id                        | uuid                        |
| invoices                     | renteeid                  | uuid                        |
| invoices                     | propertyid                | uuid                        |
| invoices                     | billingperiod             | character varying           |
| invoices                     | components                | jsonb                       |
| invoices                     | totalamount               | numeric                     |
| invoices                     | status                    | character varying           |
| invoices                     | paymentproofurl           | text                        |
| invoices                     | paymentdate               | timestamp with time zone    |
| invoices                     | duedate                   | date                        |
| invoices                     | notes                     | text                        |
| invoices                     | createdat                 | timestamp with time zone    |
| invoices                     | updatedat                 | timestamp with time zone    |
| letter_templates             | id                        | uuid                        |
| letter_templates             | type                      | character varying           |
| letter_templates             | subject                   | character varying           |
| letter_templates             | content                   | text                        |
| letter_templates             | language                  | character varying           |
| letter_templates             | version                   | character varying           |
| letter_templates             | createdat                 | timestamp with time zone    |
| letter_templates             | updatedat                 | timestamp with time zone    |
| maintenance_request_comments | id                        | uuid                        |
| maintenance_request_comments | maintenance_request_id    | uuid                        |
| maintenance_request_comments | user_id                   | uuid                        |
| maintenance_request_comments | comment                   | text                        |
| maintenance_request_comments | created_at                | timestamp with time zone    |
| maintenance_request_comments | updated_at                | timestamp with time zone    |
| maintenance_request_images   | id                        | uuid                        |
| maintenance_request_images   | maintenance_request_id    | uuid                        |
| maintenance_request_images   | image_url                 | text                        |
| maintenance_request_images   | image_type                | text                        |
| maintenance_request_images   | uploaded_by               | uuid                        |
| maintenance_request_images   | uploaded_at               | timestamp with time zone    |
| maintenance_request_images   | description               | text                        |
| maintenance_requests         | id                        | uuid                        |
| maintenance_requests         | propertyid                | uuid                        |
| maintenance_requests         | renteeid                  | uuid                        |
| maintenance_requests         | title                     | text                        |
| maintenance_requests         | description               | text                        |
| maintenance_requests         | priority                  | text                        |
| maintenance_requests         | status                    | text                        |
| maintenance_requests         | requesttype               | text                        |
| maintenance_requests         | createdat                 | timestamp with time zone    |
| maintenance_requests         | updatedat                 | timestamp with time zone    |
| maintenance_requests         | assignedto                | uuid                        |
| maintenance_requests         | assignedat                | timestamp with time zone    |
| maintenance_requests         | startedat                 | timestamp with time zone    |
| maintenance_requests         | completedat               | timestamp with time zone    |
| maintenance_requests         | cancelledat               | timestamp with time zone    |
| maintenance_requests         | cancellationreason        | text                        |
| maintenance_requests         | notes                     | text                        |
| notifications                | id                        | uuid                        |
| notifications                | user_id                   | uuid                        |
| notifications                | message                   | text                        |
| notifications                | createdat                 | timestamp with time zone    |
| notifications                | is_read                   | boolean                     |
| notifications                | updatedat                 | timestamp with time zone    |
| payments                     | id                        | uuid                        |
| payments                     | invoiceid                 | uuid                        |
| payments                     | amount                    | numeric                     |
| payments                     | paymentmethod             | character varying           |
| payments                     | transactionreference      | character varying           |
| payments                     | paymentdate               | timestamp with time zone    |
| payments                     | status                    | character varying           |
| payments                     | notes                     | text                        |
| payments                     | createdat                 | timestamp with time zone    |
| payments                     | updatedat                 | timestamp with time zone    |
| properties                   | id                        | uuid                        |
| properties                   | name                      | character varying           |
| properties                   | address                   | text                        |
| properties                   | unitconfiguration         | character varying           |
| properties                   | rentalvalues              | jsonb                       |
| properties                   | checklistitems            | ARRAY                       |
| properties                   | terms                     | jsonb                       |
| properties                   | images                    | ARRAY                       |
| properties                   | description               | text                        |
| properties                   | status                    | character varying           |
| properties                   | createdat                 | timestamp with time zone    |
| properties                   | updatedat                 | timestamp with time zone    |
| properties                   | availablefrom             | timestamp with time zone    |
| properties                   | propertytype              | character varying           |
| properties                   | squarefeet                | numeric                     |
| properties                   | yearbuilt                 | integer                     |
| properties                   | amenities                 | ARRAY                       |
| properties                   | bank_name                 | character varying           |
| properties                   | bank_branch               | character varying           |
| properties                   | bank_account_number       | character varying           |
| properties                   | electricity_rate          | numeric                     |
| properties                   | water_rate                | numeric                     |
| property_units               | id                        | uuid                        |
| property_units               | propertyid                | uuid                        |
| property_units               | unitnumber                | character varying           |
| property_units               | floor                     | character varying           |
| property_units               | bedrooms                  | integer                     |
| property_units               | bathrooms                 | integer                     |
| property_units               | rentalvalues              | jsonb                       |
| property_units               | status                    | character varying           |
| property_units               | createdat                 | timestamp with time zone    |
| property_units               | updatedat                 | timestamp with time zone    |
| property_units               | description               | character varying           |
| property_units               | squarefeet                | numeric                     |
| property_units               | bank_name                 | character varying           |
| property_units               | bank_branch               | character varying           |
| property_units               | bank_account_number       | character varying           |
| scheduled_tasks              | id                        | uuid                        |
| scheduled_tasks              | propertyid                | uuid                        |
| scheduled_tasks              | tasktype                  | character varying           |
| scheduled_tasks              | frequency                 | character varying           |
| scheduled_tasks              | description               | text                        |
| scheduled_tasks              | assignedteam              | character varying           |
| scheduled_tasks              | lastcompleteddate         | timestamp with time zone    |
| scheduled_tasks              | nextduedate               | timestamp with time zone    |
| scheduled_tasks              | status                    | character varying           |
| scheduled_tasks              | notes                     | text                        |
| scheduled_tasks              | createdat                 | timestamp with time zone    |
| scheduled_tasks              | updatedat                 | timestamp with time zone    |
| sent_letters                 | id                        | uuid                        |
| sent_letters                 | templateid                | uuid                        |
| sent_letters                 | renteeid                  | uuid                        |
| sent_letters                 | propertyid                | uuid                        |
| sent_letters                 | sentdate                  | timestamp with time zone    |
| sent_letters                 | channel                   | character varying           |
| sent_letters                 | status                    | character varying           |
| sent_letters                 | content                   | text                        |
| sent_letters                 | createdat                 | timestamp with time zone    |
| sent_letters                 | updatedat                 | timestamp with time zone    |
| task_assignments             | id                        | uuid                        |
| task_assignments             | teammemberid              | uuid                        |
| task_assignments             | tasktype                  | character varying           |
| task_assignments             | tasktitle                 | character varying           |
| task_assignments             | taskdescription           | text                        |
| task_assignments             | status                    | character varying           |
| task_assignments             | priority                  | character varying           |
| task_assignments             | duedate                   | timestamp with time zone    |
| task_assignments             | completiondate            | timestamp with time zone    |
| task_assignments             | notes                     | text                        |
| task_assignments             | relatedentitytype         | character varying           |
| task_assignments             | relatedentityid           | uuid                        |
| task_assignments             | createdat                 | timestamp with time zone    |
| task_assignments             | updatedat                 | timestamp with time zone    |
| utility_configs              | id                        | uuid                        |
| utility_configs              | utilitytype               | character varying           |
| utility_configs              | billingtype               | character varying           |
| utility_configs              | rate                      | numeric                     |
| utility_configs              | fixedamount               | numeric                     |
| utility_configs              | createdat                 | timestamp with time zone    |
| utility_configs              | updatedat                 | timestamp with time zone    |
| utility_readings             | id                        | uuid                        |
| utility_readings             | renteeid                  | uuid                        |
| utility_readings             | propertyid                | uuid                        |
| utility_readings             | utilitytype               | character varying           |
| utility_readings             | previousreading           | numeric                     |
| utility_readings             | currentreading            | numeric                     |
| utility_readings             | readingdate               | date                        |
| utility_readings             | photourl                  | text                        |
| utility_readings             | calculatedbill            | numeric                     |
| utility_readings             | status                    | character varying           |
| utility_readings             | createdat                 | timestamp with time zone    |
| utility_readings             | updatedat                 | timestamp with time zone    |
| webhook_events               | id                        | uuid                        |
| webhook_events               | event_type                | text                        |
| webhook_events               | request_id                | uuid                        |
| webhook_events               | user_name                 | text                        |
| webhook_events               | user_email                | text                        |
| webhook_events               | subject                   | text                        |
| webhook_events               | event_id                  | integer                     |
| webhook_events               | event_time                | timestamp with time zone    |
| webhook_events               | raw_data                  | jsonb                       |
| webhook_events               | createdat                 | timestamp with time zone    |
| webhook_events               | updatedat                 | timestamp with time zone    |
| webhook_events               | processed                 | boolean                     |

## Utility Readings Status Flow

The utility readings table has constraints that control the allowed values for `status` and `billing_status` columns.

### Status Column Constraint

The `status` column has a constraint that restricts values to:

```sql
ALTER TABLE utility_readings
ADD CONSTRAINT utility_readings_status_check
CHECK (status IN ('pending', 'verified', 'billed', 'disputed', 'approved', 'completed', 'rejected', 'cancelled'));
```

This constraint ensures that utility readings can only have a valid workflow status. The status values represent:

- `pending`: Initial status when a reading is submitted but not yet reviewed
- `approved`: Reading has been reviewed and approved by staff
- `completed`: Reading has been processed and is ready for invoicing
- `verified`: Reading has been verified for accuracy
- `rejected`: Reading was rejected by staff (e.g., incorrect values)
- `cancelled`: Reading was cancelled and will not be processed
- `billed`: Reading has been billed to the customer
- `disputed`: Reading has been disputed by the customer

### Billing Status Column Constraint

The `billing_status` column has a separate constraint that restricts values to:

```sql
ALTER TABLE utility_readings
ADD CONSTRAINT utility_readings_billing_status_check
CHECK (billing_status IN ('pending', 'pending_invoice', 'invoiced', 'rejected') OR billing_status IS NULL);
```

The billing status tracks the invoicing process for the utility reading:

- `NULL`: No billing action has been taken yet
- `pending`: Initial status when a reading is first approved for billing
- `pending_invoice`: Reading has been processed and is ready to be included in an invoice
- `invoiced`: Reading has been included in an invoice
- `rejected`: Reading was rejected and will not be invoiced

### Effective Status Tracking

Due to database constraints, the application uses a combination of fields to track the effective status:

1. The `status` column holds the overall status
2. The `billing_status` column tracks billing-specific status
3. The `billing_data` JSON field contains an `effective_status` property that may override display status
4. Additional timestamp fields (approved_date, rejected_date, invoiced_date) provide audit trail

This approach allows the system to display the correct status to users while maintaining database constraints and providing detailed information about the utility reading's progress through the workflow.

## Database Functions and Triggers

### Timestamp Triggers

| trigger_name                          | table_name           | trigger_definition                                                                                                                                                               |
| ------------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| tr_check_filters                      | subscription         | CREATE TRIGGER tr_check_filters BEFORE INSERT OR UPDATE ON realtime.subscription FOR EACH ROW EXECUTE FUNCTION realtime.subscription_check_filters()                             |
| key_encrypt_secret_trigger_raw_key    | key                  | CREATE TRIGGER key_encrypt_secret_trigger_raw_key BEFORE INSERT OR UPDATE OF raw_key ON pgsodium.key FOR EACH ROW EXECUTE FUNCTION pgsodium.key_encrypt_secret_raw_key()         |
| secrets_encrypt_secret_trigger_secret | secrets              | CREATE TRIGGER secrets_encrypt_secret_trigger_secret BEFORE INSERT OR UPDATE OF secret ON vault.secrets FOR EACH ROW EXECUTE FUNCTION vault.secrets_encrypt_secret_secret()      |
| update_maintenance_requests_updatedat | maintenance_requests | CREATE TRIGGER update_maintenance_requests_updatedat BEFORE UPDATE ON public.maintenance_requests FOR EACH ROW EXECUTE FUNCTION update_updatedat_column()                        |
| update_properties_updated_at          | properties           | CREATE TRIGGER update_properties_updated_at BEFORE UPDATE ON public.properties FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()                                          |
| update_property_units_updated_at      | property_units       | CREATE TRIGGER update_property_units_updated_at BEFORE UPDATE ON public.property_units FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()                                  |
| update_action_records_updated_at      | action_records       | CREATE TRIGGER update_action_records_updated_at BEFORE UPDATE ON public.action_records FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()                                  |
| update_agreement_templates_updated_at | agreement_templates  | CREATE TRIGGER update_agreement_templates_updated_at BEFORE UPDATE ON public.agreement_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()                        |
| update_agreements_updated_at          | agreements           | CREATE TRIGGER update_agreements_updated_at BEFORE UPDATE ON public.agreements FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()                                          |
| update_utility_configs_updated_at     | utility_configs      | CREATE TRIGGER update_utility_configs_updated_at BEFORE UPDATE ON public.utility_configs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()                                |
| update_task_assignments_updated_at    | task_assignments     | CREATE TRIGGER update_task_assignments_updated_at BEFORE UPDATE ON public.task_assignments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()                              |
| update_maintenance_request_status     | task_assignments     | CREATE TRIGGER update_maintenance_request_status AFTER INSERT OR UPDATE ON public.task_assignments FOR EACH ROW EXECUTE FUNCTION update_maintenance_request_on_task_assignment() |
| update_utility_readings_updated_at    | utility_readings     | CREATE TRIGGER update_utility_readings_updated_at BEFORE UPDATE ON public.utility_readings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()                              |
| update_invoices_updated_at            | invoices             | CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()                                              |
| update_payments_updated_at            | payments             | CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()                                              |
| update_scheduled_tasks_updated_at     | scheduled_tasks      | CREATE TRIGGER update_scheduled_tasks_updated_at BEFORE UPDATE ON public.scheduled_tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()                                |
| update_cameras_updated_at             | cameras              | CREATE TRIGGER update_cameras_updated_at BEFORE UPDATE ON public.cameras FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()                                                |
| update_letter_templates_updated_at    | letter_templates     | CREATE TRIGGER update_letter_templates_updated_at BEFORE UPDATE ON public.letter_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()                              |
| calculate_invoice_total_trigger       | invoices             | CREATE TRIGGER calculate_invoice_total_trigger BEFORE INSERT OR UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION calculate_invoice_total()                                |
| update_invoice_status_trigger         | invoices             | CREATE TRIGGER update_invoice_status_trigger BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION update_invoice_status_on_overdue()                                   |
| update_app_users_updated_at           | app_users            | CREATE TRIGGER update_app_users_updated_at BEFORE UPDATE ON public.app_users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()                                            |
| set_properties_timestamps             | properties           | CREATE TRIGGER set_properties_timestamps BEFORE INSERT OR UPDATE ON public.properties FOR EACH ROW EXECUTE FUNCTION set_properties_timestamps()                                  |
| set_cameras_updatedat                 | cameras              | CREATE TRIGGER set_cameras_updatedat BEFORE UPDATE ON public.cameras FOR EACH ROW EXECUTE FUNCTION handle_updated_at()                                                           |
| agreement_document_trigger            | agreements           | CREATE TRIGGER agreement_document_trigger BEFORE INSERT OR UPDATE ON public.agreements FOR EACH ROW EXECUTE FUNCTION generate_agreement_document()                               |
| set_timestamps_notifications          | notifications        | CREATE TRIGGER set_timestamps_notifications BEFORE INSERT OR UPDATE ON public.notifications FOR EACH ROW EXECUTE FUNCTION set_timestamps()                                       |
| update_objects_updated_at             | objects              | CREATE TRIGGER update_objects_updated_at BEFORE UPDATE ON storage.objects FOR EACH ROW EXECUTE FUNCTION storage.update_updated_at_column()                                       |
| set_updated_at                        | webhook_events       | CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.webhook_events FOR EACH ROW EXECUTE FUNCTION handle_updated_at()                                                           |
| webhook_event_trigger                 | webhook_events       | CREATE TRIGGER webhook_event_trigger AFTER INSERT ON public.webhook_events FOR EACH ROW EXECUTE FUNCTION update_agreement_from_webhook()                                         |

## Functions

[
  {
    "routine_name": "generate_agreement_document",
    "data_type": "trigger",
    "routine_definition": "\r\nBEGIN\r\n  -- Only proceed for 'review' status changes\r\n  IF NEW.status = 'review' AND (OLD.status != 'review' OR OLD.status IS NULL) THEN\r\n    -- Logic would be handled in application, but we can update the DB record\r\n    -- In a real implementation, you'd add a task to a queue for document generation\r\n    \r\n    -- For now, just set a flag to indicate document generation is needed\r\n    NEW.needs_document_generation = TRUE;\r\n  END IF;\r\n  \r\n  RETURN NEW;\r\nEND;\r\n"
  },
  {
    "routine_name": "create_storage_policy",
    "data_type": "void",
    "routine_definition": "\r\nBEGIN\r\n    -- Check if policy already exists\r\n    IF EXISTS (\r\n        SELECT 1 \r\n        FROM pg_policies \r\n        WHERE tablename = bucket_name \r\n        AND policyname = policy_name\r\n    ) THEN\r\n        -- Drop existing policy\r\n        EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', policy_name);\r\n    END IF;\r\n\r\n    -- Create new policy\r\n    EXECUTE format(\r\n        'CREATE POLICY %I ON storage.objects FOR %s USING (%s)',\r\n        policy_name,\r\n        policy_operation,\r\n        policy_definition\r\n    );\r\nEND;\r\n"
  },
  {
    "routine_name": "migrate_to_app_users",
    "data_type": "void",
    "routine_definition": "\r\nBEGIN\r\n    -- Migrate team_members\r\n    INSERT INTO app_users (\r\n        id, \r\n        auth_id, \r\n        email, \r\n        name, \r\n        role, \r\n        user_type, \r\n        contact_details, \r\n        skills, \r\n        availability, \r\n        notes, \r\n        status, \r\n        invited, \r\n        created_at, \r\n        updated_at\r\n    )\r\n    SELECT \r\n        tm.id, \r\n        tm.authid, \r\n        (tm.contactdetails->>'email')::VARCHAR, \r\n        tm.name, \r\n        tm.role, \r\n        'staff', \r\n        tm.contactdetails, \r\n        string_to_array(tm.skills, ','), \r\n        tm.availability, \r\n        tm.notes, \r\n        tm.status, \r\n        tm.invited, \r\n        tm.createdat, \r\n        tm.updatedat\r\n    FROM team_members tm\r\n    WHERE NOT EXISTS (\r\n        SELECT 1 FROM app_users au WHERE au.id = tm.id\r\n    );\r\n\r\n    -- Migrate rentees\r\n    INSERT INTO app_users (\r\n        id, \r\n        auth_id, \r\n        email, \r\n        name, \r\n        role, \r\n        user_type, \r\n        contact_details, \r\n        id_copy_url, \r\n        associated_property, \r\n        invited, \r\n        created_at, \r\n        updated_at\r\n    )\r\n    SELECT \r\n        r.id, \r\n        r.authid, \r\n        (r.contactdetails->>'email')::VARCHAR, \r\n        r.name, \r\n        'rentee', \r\n        'rentee', \r\n        r.contactdetails, \r\n        r.idcopyurl, \r\n        r.associatedproperty, \r\n        r.invited, \r\n        r.registrationdate, \r\n        r.updatedat\r\n    FROM rentees r\r\n    WHERE NOT EXISTS (\r\n        SELECT 1 FROM app_users au WHERE au.id = r.id\r\n    );\r\nEND;\r\n"
  },
  {
    "routine_name": "update_agreement_from_webhook",
    "data_type": "trigger",
    "routine_definition": "\r\nDECLARE\r\n    status_map TEXT;\r\n    signatory_data JSONB;\r\n    current_signatories JSONB;\r\nBEGIN\r\n    -- Map event_id to signature_status\r\n    CASE NEW.event_id\r\n        WHEN 1 THEN status_map := 'pending';\r\n        WHEN 2 THEN status_map := 'in_progress';\r\n        WHEN 3 THEN status_map := 'completed';\r\n        ELSE status_map := NULL;\r\n    END CASE;\r\n    \r\n    -- Only proceed if we have a valid status map and request_id\r\n    IF status_map IS NULL OR NEW.request_id IS NULL THEN\r\n        RETURN NEW;\r\n    END IF;\r\n    \r\n    -- Handle signatory data for EventId 2 (SignatoryCompleted)\r\n    IF NEW.event_id = 2 AND NEW.user_email IS NOT NULL THEN\r\n        -- Create signatory info\r\n        signatory_data := jsonb_build_object(\r\n            'name', COALESCE(NEW.user_name, 'Unknown'),\r\n            'email', NEW.user_email,\r\n            'status', 'completed',\r\n            'signedAt', COALESCE(NEW.event_time, NOW())\r\n        );\r\n        \r\n        -- Get current signatories if any\r\n        SELECT signatories_status INTO current_signatories\r\n        FROM agreements\r\n        WHERE eviasignreference_uuid = NEW.request_id;\r\n        \r\n        -- Initialize if null\r\n        IF current_signatories IS NULL THEN\r\n            current_signatories := '[]'::jsonb;\r\n        END IF;\r\n        \r\n        -- Add or update signatory\r\n        -- Check if signatory already exists\r\n        WITH existing_signatory AS (\r\n            SELECT jsonb_array_elements(current_signatories) ->> 'email' as email\r\n        )\r\n        SELECT \r\n            CASE \r\n                WHEN EXISTS (SELECT 1 FROM existing_signatory WHERE email = NEW.user_email) THEN\r\n                    (\r\n                        SELECT jsonb_agg(\r\n                            CASE \r\n                                WHEN (x ->> 'email') = NEW.user_email THEN signatory_data\r\n                                ELSE x\r\n                            END\r\n                        )\r\n                        FROM jsonb_array_elements(current_signatories) x\r\n                    )\r\n                ELSE\r\n                    jsonb_insert(current_signatories, '{0}', signatory_data)\r\n            END INTO current_signatories;\r\n    END IF;\r\n    \r\n    -- Update agreement based on event type\r\n    IF NEW.event_id = 3 THEN\r\n        -- For completed events (signed)\r\n        UPDATE agreements\r\n        SET \r\n            signature_status = status_map,\r\n            status = 'signed',\r\n            signature_completed_at = COALESCE(NEW.event_time, NOW()),\r\n            updatedat = NOW()\r\n        WHERE \r\n            eviasignreference_uuid = NEW.request_id;\r\n    ELSIF NEW.event_id = 2 THEN\r\n        -- For signatory completed events (partially signed)\r\n        UPDATE agreements\r\n        SET \r\n            signature_status = status_map,\r\n            status = 'partially_signed',\r\n            signatories_status = current_signatories,\r\n            updatedat = NOW()\r\n        WHERE \r\n            eviasignreference_uuid = NEW.request_id;\r\n    ELSIF NEW.event_id = 1 THEN\r\n        -- For sign request received events (pending signature)\r\n        UPDATE agreements\r\n        SET \r\n            signature_status = status_map,\r\n            status = 'pending_signature',\r\n            signature_sent_at = COALESCE(NEW.event_time, NOW()),\r\n            updatedat = NOW()\r\n        WHERE \r\n            eviasignreference_uuid = NEW.request_id;\r\n    END IF;\r\n    \r\n    RETURN NEW;\r\nEND;\r\n"
  },
  {
    "routine_name": "exec_sql",
    "data_type": "void",
    "routine_definition": "\r\nBEGIN\r\n  EXECUTE query;\r\nEND;\r\n"
  },
  {
    "routine_name": "update_updatedat_column",
    "data_type": "trigger",
    "routine_definition": "\r\nBEGIN\r\n    NEW.updatedat = NOW();\r\n    RETURN NEW;\r\nEND;\r\n"
  },
  {
    "routine_name": "set_timestamps",
    "data_type": "trigger",
    "routine_definition": "BEGIN\r\n  -- For new records, set created_at\r\n  IF NEW.createdat IS NULL THEN\r\n    NEW.createdat = NOW();\r\n  END IF;\r\n  \r\n  RETURN NEW;\r\nEND;"
  },
  {
    "routine_name": "update_agreement_status",
    "data_type": "void",
    "routine_definition": "\r\nBEGIN\r\n  -- Update the agreement status directly with a SQL UPDATE\r\n  -- This avoids issues with JSON validation that might occur with the API\r\n  UPDATE agreements \r\n  SET \r\n    signature_status = status_value,\r\n    updatedat = NOW()\r\n  WHERE id = agreement_id;\r\nEND;\r\n"
  },
  {
    "routine_name": "set_properties_timestamps",
    "data_type": "trigger",
    "routine_definition": "\r\nBEGIN\r\n  -- For new records, set createdat\r\n  IF NEW.createdat IS NULL THEN\r\n    NEW.createdat = NOW();\r\n  END IF;\r\n  \r\n  -- Always set updatedat\r\n  NEW.updatedat = NOW();\r\n  \r\n  RETURN NEW;\r\nEND;\r\n"
  },
  {
    "routine_name": "update_rls_policies",
    "data_type": "void",
    "routine_definition": "\r\nDECLARE\r\n    policy_record RECORD;\r\nBEGIN\r\n    -- Drop and recreate policies for tables that reference user roles\r\n    FOR policy_record IN \r\n        SELECT schemaname, tablename, policyname, cmd, qual\r\n        FROM pg_policies \r\n        WHERE schemaname = 'public'\r\n        AND qual LIKE '%auth.users%'\r\n    LOOP\r\n        -- Drop existing policy\r\n        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', \r\n            policy_record.policyname, \r\n            policy_record.schemaname, \r\n            policy_record.tablename);\r\n            \r\n        -- Create new policy using app_users\r\n        EXECUTE format(\r\n            'CREATE POLICY %I ON %I.%I FOR %s TO PUBLIC USING (%s)',\r\n            policy_record.policyname,\r\n            policy_record.schemaname,\r\n            policy_record.tablename,\r\n            policy_record.cmd,\r\n            replace(policy_record.qual, 'auth.users', 'app_users')\r\n        );\r\n    END LOOP;\r\nEND;\r\n"
  },
  {
    "routine_name": "invite_user",
    "data_type": "json",
    "routine_definition": "\r\nDECLARE\r\n  result JSON;\r\nBEGIN\r\n  -- Check if the user already exists\r\n  IF EXISTS (\r\n    SELECT 1 FROM auth.users WHERE email = $1\r\n  ) THEN\r\n    RETURN json_build_object(\r\n      'success', false,\r\n      'error', 'User already exists'\r\n    );\r\n  END IF;\r\n\r\n  -- Create the user invitation\r\n  SELECT json_build_object(\r\n    'success', true,\r\n    'data', json_build_object(\r\n      'email', $1,\r\n      'role', $2,\r\n      'redirect_url', $3\r\n    )\r\n  ) INTO result;\r\n\r\n  -- Send the invitation email using Supabase's built-in email service\r\n  -- Note: This requires the email service to be configured in your Supabase project\r\n  PERFORM net.send_email(\r\n    to_email := $1,\r\n    subject := 'Welcome to KH Rentals',\r\n    body := format(\r\n      'Welcome to KH Rentals! Click the link below to complete your registration: %s',\r\n      $3\r\n    )\r\n  );\r\n\r\n  RETURN result;\r\nEND;\r\n"
  },
  {
    "routine_name": "handle_updated_at",
    "data_type": "trigger",
    "routine_definition": "\r\nBEGIN\r\n  NEW.updatedat = NOW();\r\n  RETURN NEW;\r\nEND;\r\n"
  },
  {
    "routine_name": "calculate_invoice_total",
    "data_type": "trigger",
    "routine_definition": "\r\nBEGIN\r\n  NEW.totalAmount = (NEW.components->>'rent')::numeric + \r\n                    (NEW.components->>'electricity')::numeric + \r\n                    (NEW.components->>'water')::numeric + \r\n                    (NEW.components->>'pastDues')::numeric + \r\n                    (NEW.components->>'taxes')::numeric;\r\n  RETURN NEW;\r\nEND;\r\n"
  },
  {
    "routine_name": "update_updated_at_column",
    "data_type": "trigger",
    "routine_definition": "BEGIN\r\n    NEW.updatedat = now();\r\n    RETURN NEW;\r\nEND;"
  },
  {
    "routine_name": "update_maintenance_request_on_task_assignment",
    "data_type": "trigger",
    "routine_definition": "\r\nBEGIN\r\n  IF NEW.taskType = 'maintenance' AND NEW.relatedEntityType = 'maintenance_request' THEN\r\n    UPDATE maintenance_requests\r\n    SET status = CASE\r\n      WHEN NEW.status = 'pending' THEN 'assigned'\r\n      WHEN NEW.status = 'in_progress' THEN 'in_progress'\r\n      WHEN NEW.status = 'completed' THEN 'completed'\r\n      WHEN NEW.status = 'cancelled' THEN 'cancelled'\r\n      ELSE status\r\n    END,\r\n    assignedTo = NEW.teamMemberId,\r\n    updatedAt = NOW()\r\n    WHERE id = NEW.relatedEntityId;\r\n  END IF;\r\n  RETURN NEW;\r\nEND;\r\n"
  },
  {
    "routine_name": "update_invoice_status_on_overdue",
    "data_type": "trigger",
    "routine_definition": "\r\nBEGIN\r\n  -- If the invoice is still pending and the due date has passed, mark it as overdue\r\n  IF NEW.status = 'pending' AND NEW.dueDate < CURRENT_DATE THEN\r\n    NEW.status = 'overdue';\r\n  END IF;\r\n  RETURN NEW;\r\nEND;\r\n"
  },
  {
    "routine_name": "add_column_if_not_exists",
    "data_type": "void",
    "routine_definition": "\r\nDECLARE\r\n    column_exists boolean;\r\nBEGIN\r\n    -- Check if the column already exists\r\n    SELECT EXISTS (\r\n        SELECT FROM information_schema.columns \r\n        WHERE table_schema = 'public' \r\n        AND table_name = p_table_name\r\n        AND column_name = p_column_name\r\n    ) INTO column_exists;\r\n    \r\n    -- If the column doesn't exist, add it\r\n    IF NOT column_exists THEN\r\n        EXECUTE format('ALTER TABLE %I ADD COLUMN %I %s', p_table_name, p_column_name, p_column_type);\r\n        RAISE NOTICE 'Added column % to table %', p_column_name, p_table_name;\r\n    ELSE\r\n        RAISE NOTICE 'Column % already exists in table %', p_column_name, p_table_name;\r\n    END IF;\r\nEND;\r\n"
  },
  {
    "routine_name": "setup_rls_for_table",
    "data_type": "void",
    "routine_definition": "\r\nDECLARE\r\n    table_exists boolean;\r\nBEGIN\r\n    -- Check if the table exists\r\n    SELECT EXISTS (\r\n        SELECT FROM information_schema.tables \r\n        WHERE table_schema = 'public' \r\n        AND table_name = p_table_name\r\n    ) INTO table_exists;\r\n    \r\n    IF NOT table_exists THEN\r\n        RAISE NOTICE 'Table % does not exist, skipping', p_table_name;\r\n        RETURN;\r\n    END IF;\r\n\r\n    -- Enable RLS\r\n    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', p_table_name);\r\n    \r\n    -- Drop existing policies if they exist (both authenticated and PUBLIC)\r\n    EXECUTE format('DROP POLICY IF EXISTS \"Allow authenticated users to select %1$s\" ON %1$s', p_table_name);\r\n    EXECUTE format('DROP POLICY IF EXISTS \"Allow authenticated users to insert %1$s\" ON %1$s', p_table_name);\r\n    EXECUTE format('DROP POLICY IF EXISTS \"Allow authenticated users to update %1$s\" ON %1$s', p_table_name);\r\n    EXECUTE format('DROP POLICY IF EXISTS \"Allow authenticated users to delete %1$s\" ON %1$s', p_table_name);\r\n    \r\n    EXECUTE format('DROP POLICY IF EXISTS \"%1$s_select_policy\" ON %1$s', p_table_name);\r\n    EXECUTE format('DROP POLICY IF EXISTS \"%1$s_insert_policy\" ON %1$s', p_table_name);\r\n    EXECUTE format('DROP POLICY IF EXISTS \"%1$s_update_policy\" ON %1$s', p_table_name);\r\n    EXECUTE format('DROP POLICY IF EXISTS \"%1$s_delete_policy\" ON %1$s', p_table_name);\r\n    \r\n    -- Create new PUBLIC policies\r\n    EXECUTE format('CREATE POLICY \"%1$s_select_policy\" ON %1$s FOR SELECT TO PUBLIC USING (true)', p_table_name);\r\n    EXECUTE format('CREATE POLICY \"%1$s_insert_policy\" ON %1$s FOR INSERT TO PUBLIC WITH CHECK (true)', p_table_name);\r\n    EXECUTE format('CREATE POLICY \"%1$s_update_policy\" ON %1$s FOR UPDATE TO PUBLIC USING (true)', p_table_name);\r\n    EXECUTE format('CREATE POLICY \"%1$s_delete_policy\" ON %1$s FOR DELETE TO PUBLIC USING (true)', p_table_name);\r\n    \r\n    RAISE NOTICE 'RLS policies set up for table %', p_table_name;\r\nEND;\r\n"
  },
  {
    "routine_name": "setup_rls_for_all_tables",
    "data_type": "void",
    "routine_definition": "\r\nDECLARE\r\n    table_record RECORD;\r\nBEGIN\r\n    FOR table_record IN \r\n        SELECT tablename \r\n        FROM pg_tables \r\n        WHERE schemaname = 'public' \r\n        AND tablename NOT IN ('schema_migrations', 'spatial_ref_sys')\r\n    LOOP\r\n        PERFORM setup_rls_for_table(table_record.tablename);\r\n    END LOOP;\r\n    \r\n    RAISE NOTICE 'RLS policies have been set up for all tables in the public schema';\r\nEND;\r\n"
  }
]



