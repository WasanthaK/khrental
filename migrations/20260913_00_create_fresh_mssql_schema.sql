-- KH Rentals fresh-install schema for Microsoft SQL Server / Azure SQL.
-- Idempotent: existing tables and the default tenant are preserved.
-- Run this before 20260913_01_create_auth_store.sql.

SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'dbo.tenants', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.tenants (
            id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_tenants PRIMARY KEY DEFAULT NEWID(),
            name NVARCHAR(200) NOT NULL,
            slug NVARCHAR(200) NOT NULL,
            status NVARCHAR(50) NOT NULL CONSTRAINT DF_tenants_status DEFAULT N'active',
            [plan] NVARCHAR(50) NULL,
            createdat DATETIMEOFFSET NOT NULL CONSTRAINT DF_tenants_createdat DEFAULT SYSUTCDATETIME(),
            updatedat DATETIMEOFFSET NOT NULL CONSTRAINT DF_tenants_updatedat DEFAULT SYSUTCDATETIME(),
            CONSTRAINT UQ_tenants_slug UNIQUE (slug)
        );
    END;

    DECLARE @DefaultTenantId UNIQUEIDENTIFIER;

    SELECT TOP 1 @DefaultTenantId = id
    FROM dbo.tenants
    WHERE slug = N'kh-rentals';

    IF @DefaultTenantId IS NULL
    BEGIN
        SET @DefaultTenantId = NEWID();
        INSERT INTO dbo.tenants (id, name, slug, status, [plan])
        VALUES (@DefaultTenantId, N'KH Rentals', N'kh-rentals', N'active', N'free');
    END;

    IF OBJECT_ID(N'dbo.app_users', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.app_users (
            id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_app_users PRIMARY KEY DEFAULT NEWID(),
            tenant_id UNIQUEIDENTIFIER NULL,
            auth_id UNIQUEIDENTIFIER NULL,
            email NVARCHAR(320) NOT NULL,
            name NVARCHAR(255) NOT NULL,
            role NVARCHAR(64) NOT NULL CONSTRAINT DF_app_users_role DEFAULT N'rentee',
            user_type NVARCHAR(64) NOT NULL CONSTRAINT DF_app_users_user_type DEFAULT N'rentee',
            contact_details NVARCHAR(MAX) NULL,
            skills NVARCHAR(MAX) NULL,
            availability NVARCHAR(MAX) NULL,
            notes NVARCHAR(MAX) NULL,
            status NVARCHAR(50) NOT NULL CONSTRAINT DF_app_users_status DEFAULT N'active',
            id_copy_url NVARCHAR(MAX) NULL,
            associated_property_ids NVARCHAR(MAX) NULL,
            permanent_address NVARCHAR(MAX) NULL,
            national_id NVARCHAR(100) NULL,
            profile_image_url NVARCHAR(MAX) NULL,
            invited BIT NOT NULL CONSTRAINT DF_app_users_invited DEFAULT 0,
            active BIT NOT NULL CONSTRAINT DF_app_users_active DEFAULT 1,
            last_login DATETIMEOFFSET NULL,
            createdat DATETIMEOFFSET NOT NULL CONSTRAINT DF_app_users_createdat DEFAULT SYSUTCDATETIME(),
            updatedat DATETIMEOFFSET NOT NULL CONSTRAINT DF_app_users_updatedat DEFAULT SYSUTCDATETIME(),
            CONSTRAINT UQ_app_users_email UNIQUE (email),
            CONSTRAINT FK_app_users_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id)
        );

        CREATE UNIQUE INDEX UX_app_users_auth_id
            ON dbo.app_users(auth_id)
            WHERE auth_id IS NOT NULL;
        CREATE INDEX IX_app_users_tenant_id ON dbo.app_users(tenant_id);
        CREATE INDEX IX_app_users_role ON dbo.app_users(role);
    END;

    IF OBJECT_ID(N'dbo.tenant_memberships', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.tenant_memberships (
            id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_tenant_memberships PRIMARY KEY DEFAULT NEWID(),
            tenant_id UNIQUEIDENTIFIER NOT NULL,
            app_user_id UNIQUEIDENTIFIER NOT NULL,
            role NVARCHAR(100) NOT NULL,
            status NVARCHAR(50) NOT NULL CONSTRAINT DF_tenant_memberships_status DEFAULT N'active',
            is_default BIT NOT NULL CONSTRAINT DF_tenant_memberships_is_default DEFAULT 0,
            createdat DATETIMEOFFSET NOT NULL CONSTRAINT DF_tenant_memberships_createdat DEFAULT SYSUTCDATETIME(),
            updatedat DATETIMEOFFSET NOT NULL CONSTRAINT DF_tenant_memberships_updatedat DEFAULT SYSUTCDATETIME(),
            CONSTRAINT UQ_tenant_memberships_tenant_user UNIQUE (tenant_id, app_user_id),
            CONSTRAINT FK_tenant_memberships_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id),
            CONSTRAINT FK_tenant_memberships_app_user FOREIGN KEY (app_user_id) REFERENCES dbo.app_users(id) ON DELETE CASCADE
        );

        CREATE INDEX IX_tenant_memberships_app_user_id ON dbo.tenant_memberships(app_user_id);
    END;

    IF OBJECT_ID(N'dbo.tenant_settings', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.tenant_settings (
            tenant_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_tenant_settings PRIMARY KEY,
            branding_json NVARCHAR(MAX) NULL,
            email_json NVARCHAR(MAX) NULL,
            signature_json NVARCHAR(MAX) NULL,
            storage_json NVARCHAR(MAX) NULL,
            feature_flags_json NVARCHAR(MAX) NULL,
            createdat DATETIMEOFFSET NOT NULL CONSTRAINT DF_tenant_settings_createdat DEFAULT SYSUTCDATETIME(),
            updatedat DATETIMEOFFSET NOT NULL CONSTRAINT DF_tenant_settings_updatedat DEFAULT SYSUTCDATETIME(),
            CONSTRAINT FK_tenant_settings_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ON DELETE CASCADE
        );
    END;

    IF NOT EXISTS (SELECT 1 FROM dbo.tenant_settings WHERE tenant_id = @DefaultTenantId)
    BEGIN
        INSERT INTO dbo.tenant_settings (tenant_id, branding_json)
        VALUES (@DefaultTenantId, N'{"name":"KH Rentals"}');
    END;

    IF OBJECT_ID(N'dbo.properties', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.properties (
            id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_properties PRIMARY KEY DEFAULT NEWID(),
            tenant_id UNIQUEIDENTIFIER NOT NULL,
            name NVARCHAR(255) NOT NULL,
            address NVARCHAR(MAX) NULL,
            unitconfiguration NVARCHAR(255) NULL,
            rentalvalues NVARCHAR(MAX) NULL,
            checklistitems NVARCHAR(MAX) NULL,
            terms NVARCHAR(MAX) NULL,
            images NVARCHAR(MAX) NULL,
            description NVARCHAR(MAX) NULL,
            status NVARCHAR(50) NOT NULL CONSTRAINT DF_properties_status DEFAULT N'available',
            availablefrom DATETIMEOFFSET NULL,
            propertytype NVARCHAR(100) NULL,
            squarefeet DECIMAL(18, 2) NULL,
            yearbuilt INT NULL,
            amenities NVARCHAR(MAX) NULL,
            bank_name NVARCHAR(255) NULL,
            bank_branch NVARCHAR(255) NULL,
            bank_account_number NVARCHAR(255) NULL,
            electricity_rate DECIMAL(18, 4) NULL,
            water_rate DECIMAL(18, 4) NULL,
            latitude DECIMAL(10, 7) NULL,
            longitude DECIMAL(10, 7) NULL,
            createdat DATETIMEOFFSET NOT NULL CONSTRAINT DF_properties_createdat DEFAULT SYSUTCDATETIME(),
            updatedat DATETIMEOFFSET NOT NULL CONSTRAINT DF_properties_updatedat DEFAULT SYSUTCDATETIME(),
            CONSTRAINT FK_properties_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id)
        );

        CREATE INDEX IX_properties_tenant_id ON dbo.properties(tenant_id);
        CREATE INDEX IX_properties_status ON dbo.properties(status);
    END;

    IF OBJECT_ID(N'dbo.property_units', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.property_units (
            id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_property_units PRIMARY KEY DEFAULT NEWID(),
            tenant_id UNIQUEIDENTIFIER NOT NULL,
            propertyid UNIQUEIDENTIFIER NOT NULL,
            unitnumber NVARCHAR(100) NOT NULL,
            floor NVARCHAR(100) NULL,
            bedrooms INT NULL,
            bathrooms INT NULL,
            squarefeet DECIMAL(18, 2) NULL,
            description NVARCHAR(MAX) NULL,
            rentalvalues NVARCHAR(MAX) NULL,
            terms NVARCHAR(MAX) NULL,
            bank_name NVARCHAR(255) NULL,
            bank_branch NVARCHAR(255) NULL,
            bank_account_number NVARCHAR(255) NULL,
            status NVARCHAR(50) NOT NULL CONSTRAINT DF_property_units_status DEFAULT N'available',
            createdat DATETIMEOFFSET NOT NULL CONSTRAINT DF_property_units_createdat DEFAULT SYSUTCDATETIME(),
            updatedat DATETIMEOFFSET NOT NULL CONSTRAINT DF_property_units_updatedat DEFAULT SYSUTCDATETIME(),
            CONSTRAINT UQ_property_units_property_unit UNIQUE (propertyid, unitnumber),
            CONSTRAINT FK_property_units_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id),
            CONSTRAINT FK_property_units_property FOREIGN KEY (propertyid) REFERENCES dbo.properties(id)
        );

        CREATE INDEX IX_property_units_tenant_id ON dbo.property_units(tenant_id);
        CREATE INDEX IX_property_units_propertyid ON dbo.property_units(propertyid);
    END;

    IF OBJECT_ID(N'dbo.agreement_templates', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.agreement_templates (
            id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_agreement_templates PRIMARY KEY DEFAULT NEWID(),
            tenant_id UNIQUEIDENTIFIER NOT NULL,
            name NVARCHAR(255) NOT NULL,
            language NVARCHAR(100) NOT NULL CONSTRAINT DF_agreement_templates_language DEFAULT N'English',
            content NVARCHAR(MAX) NULL,
            version NVARCHAR(50) NOT NULL CONSTRAINT DF_agreement_templates_version DEFAULT N'1.0',
            createdat DATETIMEOFFSET NOT NULL CONSTRAINT DF_agreement_templates_createdat DEFAULT SYSUTCDATETIME(),
            updatedat DATETIMEOFFSET NOT NULL CONSTRAINT DF_agreement_templates_updatedat DEFAULT SYSUTCDATETIME(),
            CONSTRAINT FK_agreement_templates_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id)
        );

        CREATE INDEX IX_agreement_templates_tenant_id ON dbo.agreement_templates(tenant_id);
    END;

    IF OBJECT_ID(N'dbo.agreements', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.agreements (
            id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_agreements PRIMARY KEY DEFAULT NEWID(),
            tenant_id UNIQUEIDENTIFIER NOT NULL,
            templateid UNIQUEIDENTIFIER NULL,
            renteeid UNIQUEIDENTIFIER NULL,
            propertyid UNIQUEIDENTIFIER NULL,
            unitid UNIQUEIDENTIFIER NULL,
            status NVARCHAR(50) NOT NULL CONSTRAINT DF_agreements_status DEFAULT N'draft',
            startdate DATETIMEOFFSET NULL,
            enddate DATETIMEOFFSET NULL,
            rentamount DECIMAL(18, 2) NULL,
            depositamount DECIMAL(18, 2) NULL,
            documenturl NVARCHAR(MAX) NULL,
            signeddocumenturl NVARCHAR(MAX) NULL,
            signed_document_url NVARCHAR(MAX) NULL,
            signatureurl NVARCHAR(MAX) NULL,
            signature_pdf_url NVARCHAR(MAX) NULL,
            pdfurl NVARCHAR(MAX) NULL,
            evia_document_id NVARCHAR(255) NULL,
            eviasignreference NVARCHAR(255) NULL,
            signature_request_id NVARCHAR(255) NULL,
            title NVARCHAR(255) NULL,
            content NVARCHAR(MAX) NULL,
            processedcontent NVARCHAR(MAX) NULL,
            terms NVARCHAR(MAX) NULL,
            notes NVARCHAR(MAX) NULL,
            needs_document_generation BIT NOT NULL CONSTRAINT DF_agreements_needs_document_generation DEFAULT 0,
            signature_status NVARCHAR(100) NULL,
            signature_sent_at DATETIMEOFFSET NULL,
            signature_completed_at DATETIMEOFFSET NULL,
            signatories_status NVARCHAR(MAX) NULL,
            signeddate DATETIMEOFFSET NULL,
            cancellation_reason NVARCHAR(MAX) NULL,
            createdat DATETIMEOFFSET NOT NULL CONSTRAINT DF_agreements_createdat DEFAULT SYSUTCDATETIME(),
            updatedat DATETIMEOFFSET NOT NULL CONSTRAINT DF_agreements_updatedat DEFAULT SYSUTCDATETIME(),
            CONSTRAINT FK_agreements_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id),
            CONSTRAINT FK_agreements_template FOREIGN KEY (templateid) REFERENCES dbo.agreement_templates(id),
            CONSTRAINT FK_agreements_rentee FOREIGN KEY (renteeid) REFERENCES dbo.app_users(id),
            CONSTRAINT FK_agreements_property FOREIGN KEY (propertyid) REFERENCES dbo.properties(id),
            CONSTRAINT FK_agreements_unit FOREIGN KEY (unitid) REFERENCES dbo.property_units(id)
        );

        CREATE INDEX IX_agreements_tenant_id ON dbo.agreements(tenant_id);
        CREATE INDEX IX_agreements_renteeid ON dbo.agreements(renteeid);
        CREATE INDEX IX_agreements_propertyid ON dbo.agreements(propertyid);
        CREATE INDEX IX_agreements_status ON dbo.agreements(status);
    END;

    IF OBJECT_ID(N'dbo.invoices', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.invoices (
            id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_invoices PRIMARY KEY DEFAULT NEWID(),
            tenant_id UNIQUEIDENTIFIER NOT NULL,
            renteeid UNIQUEIDENTIFIER NULL,
            propertyid UNIQUEIDENTIFIER NULL,
            billingperiod NVARCHAR(100) NULL,
            components NVARCHAR(MAX) NULL,
            totalamount DECIMAL(18, 2) NULL,
            status NVARCHAR(50) NOT NULL CONSTRAINT DF_invoices_status DEFAULT N'pending',
            paymentproofurl NVARCHAR(MAX) NULL,
            paymentdate DATETIMEOFFSET NULL,
            duedate DATETIMEOFFSET NULL,
            notes NVARCHAR(MAX) NULL,
            createdat DATETIMEOFFSET NOT NULL CONSTRAINT DF_invoices_createdat DEFAULT SYSUTCDATETIME(),
            updatedat DATETIMEOFFSET NOT NULL CONSTRAINT DF_invoices_updatedat DEFAULT SYSUTCDATETIME(),
            CONSTRAINT FK_invoices_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id),
            CONSTRAINT FK_invoices_rentee FOREIGN KEY (renteeid) REFERENCES dbo.app_users(id),
            CONSTRAINT FK_invoices_property FOREIGN KEY (propertyid) REFERENCES dbo.properties(id)
        );

        CREATE INDEX IX_invoices_tenant_id ON dbo.invoices(tenant_id);
        CREATE INDEX IX_invoices_renteeid ON dbo.invoices(renteeid);
        CREATE INDEX IX_invoices_propertyid ON dbo.invoices(propertyid);
    END;

    IF OBJECT_ID(N'dbo.payments', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.payments (
            id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_payments PRIMARY KEY DEFAULT NEWID(),
            tenant_id UNIQUEIDENTIFIER NOT NULL,
            invoiceid UNIQUEIDENTIFIER NULL,
            amount DECIMAL(18, 2) NOT NULL,
            paymentmethod NVARCHAR(100) NULL,
            transactionreference NVARCHAR(255) NULL,
            paymentdate DATETIMEOFFSET NULL,
            status NVARCHAR(50) NOT NULL CONSTRAINT DF_payments_status DEFAULT N'pending',
            notes NVARCHAR(MAX) NULL,
            createdat DATETIMEOFFSET NOT NULL CONSTRAINT DF_payments_createdat DEFAULT SYSUTCDATETIME(),
            updatedat DATETIMEOFFSET NOT NULL CONSTRAINT DF_payments_updatedat DEFAULT SYSUTCDATETIME(),
            CONSTRAINT FK_payments_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id),
            CONSTRAINT FK_payments_invoice FOREIGN KEY (invoiceid) REFERENCES dbo.invoices(id)
        );

        CREATE INDEX IX_payments_tenant_id ON dbo.payments(tenant_id);
        CREATE INDEX IX_payments_invoiceid ON dbo.payments(invoiceid);
    END;

    IF OBJECT_ID(N'dbo.maintenance_requests', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.maintenance_requests (
            id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_maintenance_requests PRIMARY KEY DEFAULT NEWID(),
            tenant_id UNIQUEIDENTIFIER NOT NULL,
            propertyid UNIQUEIDENTIFIER NULL,
            renteeid UNIQUEIDENTIFIER NULL,
            title NVARCHAR(255) NOT NULL,
            description NVARCHAR(MAX) NOT NULL,
            priority NVARCHAR(50) NOT NULL CONSTRAINT DF_maintenance_requests_priority DEFAULT N'medium',
            status NVARCHAR(50) NOT NULL CONSTRAINT DF_maintenance_requests_status DEFAULT N'pending',
            requesttype NVARCHAR(100) NOT NULL CONSTRAINT DF_maintenance_requests_type DEFAULT N'other',
            assignedto UNIQUEIDENTIFIER NULL,
            assignedat DATETIMEOFFSET NULL,
            startedat DATETIMEOFFSET NULL,
            completedat DATETIMEOFFSET NULL,
            cancelledat DATETIMEOFFSET NULL,
            cancellationreason NVARCHAR(MAX) NULL,
            notes NVARCHAR(MAX) NULL,
            images NVARCHAR(MAX) NULL,
            createdat DATETIMEOFFSET NOT NULL CONSTRAINT DF_maintenance_requests_createdat DEFAULT SYSUTCDATETIME(),
            updatedat DATETIMEOFFSET NOT NULL CONSTRAINT DF_maintenance_requests_updatedat DEFAULT SYSUTCDATETIME(),
            CONSTRAINT FK_maintenance_requests_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id),
            CONSTRAINT FK_maintenance_requests_property FOREIGN KEY (propertyid) REFERENCES dbo.properties(id),
            CONSTRAINT FK_maintenance_requests_rentee FOREIGN KEY (renteeid) REFERENCES dbo.app_users(id),
            CONSTRAINT FK_maintenance_requests_assigned FOREIGN KEY (assignedto) REFERENCES dbo.app_users(id)
        );

        CREATE INDEX IX_maintenance_requests_tenant_id ON dbo.maintenance_requests(tenant_id);
        CREATE INDEX IX_maintenance_requests_propertyid ON dbo.maintenance_requests(propertyid);
        CREATE INDEX IX_maintenance_requests_renteeid ON dbo.maintenance_requests(renteeid);
        CREATE INDEX IX_maintenance_requests_status ON dbo.maintenance_requests(status);
    END;

    IF OBJECT_ID(N'dbo.maintenance_request_images', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.maintenance_request_images (
            id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_maintenance_request_images PRIMARY KEY DEFAULT NEWID(),
            tenant_id UNIQUEIDENTIFIER NOT NULL,
            maintenance_request_id UNIQUEIDENTIFIER NOT NULL,
            image_url NVARCHAR(MAX) NOT NULL,
            image_type NVARCHAR(50) NULL,
            uploaded_by UNIQUEIDENTIFIER NULL,
            uploaded_at DATETIMEOFFSET NOT NULL CONSTRAINT DF_maintenance_request_images_uploaded DEFAULT SYSUTCDATETIME(),
            description NVARCHAR(MAX) NULL,
            CONSTRAINT FK_maintenance_request_images_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id),
            CONSTRAINT FK_maintenance_request_images_request FOREIGN KEY (maintenance_request_id) REFERENCES dbo.maintenance_requests(id) ON DELETE CASCADE,
            CONSTRAINT FK_maintenance_request_images_user FOREIGN KEY (uploaded_by) REFERENCES dbo.app_users(id)
        );

        CREATE INDEX IX_maintenance_request_images_tenant_id ON dbo.maintenance_request_images(tenant_id);
        CREATE INDEX IX_maintenance_request_images_request_id ON dbo.maintenance_request_images(maintenance_request_id);
    END;

    IF OBJECT_ID(N'dbo.maintenance_request_comments', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.maintenance_request_comments (
            id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_maintenance_request_comments PRIMARY KEY DEFAULT NEWID(),
            tenant_id UNIQUEIDENTIFIER NOT NULL,
            maintenance_request_id UNIQUEIDENTIFIER NOT NULL,
            user_id UNIQUEIDENTIFIER NOT NULL,
            comment NVARCHAR(MAX) NOT NULL,
            created_at DATETIMEOFFSET NOT NULL CONSTRAINT DF_maintenance_request_comments_created DEFAULT SYSUTCDATETIME(),
            updated_at DATETIMEOFFSET NOT NULL CONSTRAINT DF_maintenance_request_comments_updated DEFAULT SYSUTCDATETIME(),
            CONSTRAINT FK_maintenance_request_comments_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id),
            CONSTRAINT FK_maintenance_request_comments_request FOREIGN KEY (maintenance_request_id) REFERENCES dbo.maintenance_requests(id) ON DELETE CASCADE,
            CONSTRAINT FK_maintenance_request_comments_user FOREIGN KEY (user_id) REFERENCES dbo.app_users(id)
        );

        CREATE INDEX IX_maintenance_request_comments_tenant_id ON dbo.maintenance_request_comments(tenant_id);
        CREATE INDEX IX_maintenance_request_comments_request_id ON dbo.maintenance_request_comments(maintenance_request_id);
    END;

    IF OBJECT_ID(N'dbo.notifications', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.notifications (
            id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_notifications PRIMARY KEY DEFAULT NEWID(),
            tenant_id UNIQUEIDENTIFIER NOT NULL,
            user_id UNIQUEIDENTIFIER NULL,
            message NVARCHAR(MAX) NOT NULL,
            is_read BIT NOT NULL CONSTRAINT DF_notifications_is_read DEFAULT 0,
            createdat DATETIMEOFFSET NOT NULL CONSTRAINT DF_notifications_createdat DEFAULT SYSUTCDATETIME(),
            updatedat DATETIMEOFFSET NOT NULL CONSTRAINT DF_notifications_updatedat DEFAULT SYSUTCDATETIME(),
            CONSTRAINT FK_notifications_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id),
            CONSTRAINT FK_notifications_user FOREIGN KEY (user_id) REFERENCES dbo.app_users(id)
        );

        CREATE INDEX IX_notifications_tenant_id ON dbo.notifications(tenant_id);
        CREATE INDEX IX_notifications_user_id ON dbo.notifications(user_id);
    END;

    IF OBJECT_ID(N'dbo.utility_configs', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.utility_configs (
            id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_utility_configs PRIMARY KEY DEFAULT NEWID(),
            tenant_id UNIQUEIDENTIFIER NOT NULL,
            utilitytype NVARCHAR(100) NOT NULL,
            billingtype NVARCHAR(100) NULL,
            rate DECIMAL(18, 4) NULL,
            fixedamount DECIMAL(18, 2) NULL,
            createdat DATETIMEOFFSET NOT NULL CONSTRAINT DF_utility_configs_createdat DEFAULT SYSUTCDATETIME(),
            updatedat DATETIMEOFFSET NOT NULL CONSTRAINT DF_utility_configs_updatedat DEFAULT SYSUTCDATETIME(),
            CONSTRAINT FK_utility_configs_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id)
        );

        CREATE INDEX IX_utility_configs_tenant_id ON dbo.utility_configs(tenant_id);
    END;

    IF OBJECT_ID(N'dbo.utility_readings', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.utility_readings (
            id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_utility_readings PRIMARY KEY DEFAULT NEWID(),
            tenant_id UNIQUEIDENTIFIER NOT NULL,
            renteeid UNIQUEIDENTIFIER NULL,
            propertyid UNIQUEIDENTIFIER NULL,
            invoice_id UNIQUEIDENTIFIER NULL,
            utilitytype NVARCHAR(100) NOT NULL,
            previousreading DECIMAL(18, 4) NULL,
            currentreading DECIMAL(18, 4) NULL,
            readingvalue DECIMAL(18, 4) NULL,
            readingdate DATETIMEOFFSET NULL,
            photourl NVARCHAR(MAX) NULL,
            meteridentifier NVARCHAR(255) NULL,
            calculatedbill DECIMAL(18, 2) NULL,
            status NVARCHAR(50) NOT NULL CONSTRAINT DF_utility_readings_status DEFAULT N'pending',
            billing_status NVARCHAR(50) NULL,
            rejection_reason NVARCHAR(MAX) NULL,
            rejected_date DATETIMEOFFSET NULL,
            approved_date DATETIMEOFFSET NULL,
            invoiced_date DATETIMEOFFSET NULL,
            billing_data NVARCHAR(MAX) NULL,
            notes NVARCHAR(MAX) NULL,
            createdat DATETIMEOFFSET NOT NULL CONSTRAINT DF_utility_readings_createdat DEFAULT SYSUTCDATETIME(),
            updatedat DATETIMEOFFSET NOT NULL CONSTRAINT DF_utility_readings_updatedat DEFAULT SYSUTCDATETIME(),
            CONSTRAINT FK_utility_readings_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id),
            CONSTRAINT FK_utility_readings_rentee FOREIGN KEY (renteeid) REFERENCES dbo.app_users(id),
            CONSTRAINT FK_utility_readings_property FOREIGN KEY (propertyid) REFERENCES dbo.properties(id),
            CONSTRAINT FK_utility_readings_invoice FOREIGN KEY (invoice_id) REFERENCES dbo.invoices(id)
        );

        CREATE INDEX IX_utility_readings_tenant_id ON dbo.utility_readings(tenant_id);
        CREATE INDEX IX_utility_readings_propertyid ON dbo.utility_readings(propertyid);
        CREATE INDEX IX_utility_readings_renteeid ON dbo.utility_readings(renteeid);
        CREATE INDEX IX_utility_readings_status ON dbo.utility_readings(status);
    END;

    IF OBJECT_ID(N'dbo.action_records', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.action_records (
            id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_action_records PRIMARY KEY DEFAULT NEWID(),
            tenant_id UNIQUEIDENTIFIER NOT NULL,
            propertyid UNIQUEIDENTIFIER NULL,
            renteeid UNIQUEIDENTIFIER NULL,
            actiontype NVARCHAR(100) NOT NULL,
            amount DECIMAL(18, 2) NULL,
            status NVARCHAR(50) NULL,
            [date] DATE NULL,
            comments NVARCHAR(MAX) NULL,
            relateddocs NVARCHAR(MAX) NULL,
            createdat DATETIMEOFFSET NOT NULL CONSTRAINT DF_action_records_createdat DEFAULT SYSUTCDATETIME(),
            updatedat DATETIMEOFFSET NOT NULL CONSTRAINT DF_action_records_updatedat DEFAULT SYSUTCDATETIME(),
            CONSTRAINT FK_action_records_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id),
            CONSTRAINT FK_action_records_property FOREIGN KEY (propertyid) REFERENCES dbo.properties(id),
            CONSTRAINT FK_action_records_rentee FOREIGN KEY (renteeid) REFERENCES dbo.app_users(id)
        );

        CREATE INDEX IX_action_records_tenant_id ON dbo.action_records(tenant_id);
    END;

    IF OBJECT_ID(N'dbo.scheduled_tasks', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.scheduled_tasks (
            id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_scheduled_tasks PRIMARY KEY DEFAULT NEWID(),
            tenant_id UNIQUEIDENTIFIER NOT NULL,
            propertyid UNIQUEIDENTIFIER NULL,
            tasktype NVARCHAR(100) NOT NULL,
            frequency NVARCHAR(100) NULL,
            description NVARCHAR(MAX) NULL,
            assignedteam NVARCHAR(255) NULL,
            lastcompleteddate DATETIMEOFFSET NULL,
            nextduedate DATETIMEOFFSET NULL,
            status NVARCHAR(50) NOT NULL CONSTRAINT DF_scheduled_tasks_status DEFAULT N'active',
            notes NVARCHAR(MAX) NULL,
            createdat DATETIMEOFFSET NOT NULL CONSTRAINT DF_scheduled_tasks_createdat DEFAULT SYSUTCDATETIME(),
            updatedat DATETIMEOFFSET NOT NULL CONSTRAINT DF_scheduled_tasks_updatedat DEFAULT SYSUTCDATETIME(),
            CONSTRAINT FK_scheduled_tasks_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id),
            CONSTRAINT FK_scheduled_tasks_property FOREIGN KEY (propertyid) REFERENCES dbo.properties(id)
        );

        CREATE INDEX IX_scheduled_tasks_tenant_id ON dbo.scheduled_tasks(tenant_id);
    END;

    IF OBJECT_ID(N'dbo.task_assignments', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.task_assignments (
            id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_task_assignments PRIMARY KEY DEFAULT NEWID(),
            tenant_id UNIQUEIDENTIFIER NOT NULL,
            teammemberid UNIQUEIDENTIFIER NULL,
            tasktype NVARCHAR(100) NULL,
            tasktitle NVARCHAR(255) NOT NULL,
            taskdescription NVARCHAR(MAX) NULL,
            status NVARCHAR(50) NOT NULL CONSTRAINT DF_task_assignments_status DEFAULT N'pending',
            priority NVARCHAR(50) NULL,
            duedate DATETIMEOFFSET NULL,
            completiondate DATETIMEOFFSET NULL,
            notes NVARCHAR(MAX) NULL,
            relatedentitytype NVARCHAR(100) NULL,
            relatedentityid UNIQUEIDENTIFIER NULL,
            createdat DATETIMEOFFSET NOT NULL CONSTRAINT DF_task_assignments_createdat DEFAULT SYSUTCDATETIME(),
            updatedat DATETIMEOFFSET NOT NULL CONSTRAINT DF_task_assignments_updatedat DEFAULT SYSUTCDATETIME(),
            CONSTRAINT FK_task_assignments_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id),
            CONSTRAINT FK_task_assignments_user FOREIGN KEY (teammemberid) REFERENCES dbo.app_users(id)
        );

        CREATE INDEX IX_task_assignments_tenant_id ON dbo.task_assignments(tenant_id);
    END;

    IF OBJECT_ID(N'dbo.letter_templates', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.letter_templates (
            id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_letter_templates PRIMARY KEY DEFAULT NEWID(),
            tenant_id UNIQUEIDENTIFIER NOT NULL,
            [type] NVARCHAR(100) NOT NULL,
            subject NVARCHAR(255) NULL,
            content NVARCHAR(MAX) NULL,
            language NVARCHAR(100) NULL,
            version NVARCHAR(50) NULL,
            createdat DATETIMEOFFSET NOT NULL CONSTRAINT DF_letter_templates_createdat DEFAULT SYSUTCDATETIME(),
            updatedat DATETIMEOFFSET NOT NULL CONSTRAINT DF_letter_templates_updatedat DEFAULT SYSUTCDATETIME(),
            CONSTRAINT FK_letter_templates_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id)
        );

        CREATE INDEX IX_letter_templates_tenant_id ON dbo.letter_templates(tenant_id);
    END;

    IF OBJECT_ID(N'dbo.sent_letters', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.sent_letters (
            id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_sent_letters PRIMARY KEY DEFAULT NEWID(),
            tenant_id UNIQUEIDENTIFIER NOT NULL,
            templateid UNIQUEIDENTIFIER NULL,
            renteeid UNIQUEIDENTIFIER NULL,
            propertyid UNIQUEIDENTIFIER NULL,
            sentdate DATETIMEOFFSET NULL,
            channel NVARCHAR(100) NULL,
            status NVARCHAR(50) NULL,
            content NVARCHAR(MAX) NULL,
            createdat DATETIMEOFFSET NOT NULL CONSTRAINT DF_sent_letters_createdat DEFAULT SYSUTCDATETIME(),
            updatedat DATETIMEOFFSET NOT NULL CONSTRAINT DF_sent_letters_updatedat DEFAULT SYSUTCDATETIME(),
            CONSTRAINT FK_sent_letters_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id),
            CONSTRAINT FK_sent_letters_template FOREIGN KEY (templateid) REFERENCES dbo.letter_templates(id),
            CONSTRAINT FK_sent_letters_rentee FOREIGN KEY (renteeid) REFERENCES dbo.app_users(id),
            CONSTRAINT FK_sent_letters_property FOREIGN KEY (propertyid) REFERENCES dbo.properties(id)
        );

        CREATE INDEX IX_sent_letters_tenant_id ON dbo.sent_letters(tenant_id);
    END;

    IF OBJECT_ID(N'dbo.cameras', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.cameras (
            id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_cameras PRIMARY KEY DEFAULT NEWID(),
            tenant_id UNIQUEIDENTIFIER NOT NULL,
            propertyid UNIQUEIDENTIFIER NULL,
            locationdescription NVARCHAR(MAX) NULL,
            cameratype NVARCHAR(100) NULL,
            installationdetails NVARCHAR(MAX) NULL,
            datapackageinfo NVARCHAR(MAX) NULL,
            status NVARCHAR(50) NULL,
            createdat DATETIMEOFFSET NOT NULL CONSTRAINT DF_cameras_createdat DEFAULT SYSUTCDATETIME(),
            updatedat DATETIMEOFFSET NOT NULL CONSTRAINT DF_cameras_updatedat DEFAULT SYSUTCDATETIME(),
            CONSTRAINT FK_cameras_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id),
            CONSTRAINT FK_cameras_property FOREIGN KEY (propertyid) REFERENCES dbo.properties(id)
        );

        CREATE INDEX IX_cameras_tenant_id ON dbo.cameras(tenant_id);
    END;

    IF OBJECT_ID(N'dbo.camera_monitoring', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.camera_monitoring (
            id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_camera_monitoring PRIMARY KEY DEFAULT NEWID(),
            tenant_id UNIQUEIDENTIFIER NOT NULL,
            cameraid UNIQUEIDENTIFIER NOT NULL,
            monitoringdate DATETIMEOFFSET NULL,
            statusupdate NVARCHAR(100) NULL,
            notes NVARCHAR(MAX) NULL,
            createdat DATETIMEOFFSET NOT NULL CONSTRAINT DF_camera_monitoring_createdat DEFAULT SYSUTCDATETIME(),
            updatedat DATETIMEOFFSET NOT NULL CONSTRAINT DF_camera_monitoring_updatedat DEFAULT SYSUTCDATETIME(),
            CONSTRAINT FK_camera_monitoring_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id),
            CONSTRAINT FK_camera_monitoring_camera FOREIGN KEY (cameraid) REFERENCES dbo.cameras(id) ON DELETE CASCADE
        );

        CREATE INDEX IX_camera_monitoring_tenant_id ON dbo.camera_monitoring(tenant_id);
    END;

    IF OBJECT_ID(N'dbo.webhook_events', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.webhook_events (
            id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_webhook_events PRIMARY KEY DEFAULT NEWID(),
            tenant_id UNIQUEIDENTIFIER NOT NULL,
            event_type NVARCHAR(255) NULL,
            request_id NVARCHAR(255) NULL,
            user_name NVARCHAR(255) NULL,
            user_email NVARCHAR(320) NULL,
            subject NVARCHAR(MAX) NULL,
            event_id INT NULL,
            event_time DATETIMEOFFSET NULL,
            raw_data NVARCHAR(MAX) NULL,
            processed BIT NOT NULL CONSTRAINT DF_webhook_events_processed DEFAULT 0,
            processed_at DATETIMEOFFSET NULL,
            createdat DATETIMEOFFSET NOT NULL CONSTRAINT DF_webhook_events_createdat DEFAULT SYSUTCDATETIME(),
            updatedat DATETIMEOFFSET NOT NULL CONSTRAINT DF_webhook_events_updatedat DEFAULT SYSUTCDATETIME(),
            CONSTRAINT FK_webhook_events_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id)
        );

        CREATE INDEX IX_webhook_events_tenant_id ON dbo.webhook_events(tenant_id);
        CREATE INDEX IX_webhook_events_request_id ON dbo.webhook_events(request_id);
    END;

    IF OBJECT_ID(N'dbo.agreement_signature_status', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.agreement_signature_status (
            agreement_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_agreement_signature_status PRIMARY KEY,
            agreement_status NVARCHAR(100) NULL,
            signature_status NVARCHAR(100) NULL,
            signatories_status NVARCHAR(MAX) NULL,
            last_event_id INT NULL,
            last_event_type NVARCHAR(255) NULL,
            last_event_time DATETIMEOFFSET NULL,
            CONSTRAINT FK_agreement_signature_status_agreement FOREIGN KEY (agreement_id) REFERENCES dbo.agreements(id) ON DELETE CASCADE
        );
    END;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;

    THROW;
END CATCH;

SELECT
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'dbo' AND TABLE_TYPE = 'BASE TABLE') AS TableCount,
    @DefaultTenantId AS DefaultTenantId,
    N'KH Rentals fresh schema created successfully.' AS Result;
