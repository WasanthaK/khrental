-- Add constraints to the agreements table

-- Add check constraint for status values
ALTER TABLE agreements
ADD CONSTRAINT agreements_status_check 
CHECK (status IN ('draft', 'review', 'pending', 'signed', 'expired', 'cancelled'));

-- Add check constraint for signature_status values
ALTER TABLE agreements
ADD CONSTRAINT agreements_signature_status_check 
CHECK (signature_status IN ('pending', 'in_progress', 'completed', 'failed'));

-- Add check constraint for dates
ALTER TABLE agreements
ADD CONSTRAINT agreements_dates_check 
CHECK (startdate <= enddate);

-- Add check constraint for signeddate
ALTER TABLE agreements
ADD CONSTRAINT agreements_signeddate_check 
CHECK (
  (status = 'signed' AND signeddate IS NOT NULL) OR 
  (status != 'signed' AND signeddate IS NULL)
);

-- Add foreign key constraints
ALTER TABLE agreements
ADD CONSTRAINT agreements_templateid_fkey 
FOREIGN KEY (templateid) 
REFERENCES agreement_templates(id) 
ON DELETE SET NULL;

ALTER TABLE agreements
ADD CONSTRAINT agreements_renteeid_fkey 
FOREIGN KEY (renteeid) 
REFERENCES app_users(id) 
ON DELETE CASCADE;

ALTER TABLE agreements
ADD CONSTRAINT agreements_propertyid_fkey 
FOREIGN KEY (propertyid) 
REFERENCES properties(id) 
ON DELETE CASCADE;

ALTER TABLE agreements
ADD CONSTRAINT agreements_unitid_fkey 
FOREIGN KEY (unitid) 
REFERENCES property_units(id) 
ON DELETE SET NULL;

-- Add unique constraint for eviasignreference
ALTER TABLE agreements
ADD CONSTRAINT agreements_eviasignreference_unique 
UNIQUE (eviasignreference);

-- Add check constraint for terms JSONB structure
ALTER TABLE agreements
ADD CONSTRAINT agreements_terms_check 
CHECK (
  terms IS NULL OR (
    jsonb_typeof(terms) = 'object' AND
    terms ? 'monthlyRent' AND
    terms ? 'depositAmount' AND
    terms ? 'paymentDueDay' AND
    terms ? 'noticePeriod'
  )
);

-- Add check constraint for signatories_status array
ALTER TABLE agreements
ADD CONSTRAINT agreements_signatories_status_check 
CHECK (
  signatories_status IS NULL OR (
    array_length(signatories_status, 1) > 0 AND
    jsonb_typeof(signatories_status[1]) = 'object' AND
    signatories_status[1] ? 'email' AND
    signatories_status[1] ? 'status'
  )
);

-- Add trigger to update updatedat timestamp
CREATE OR REPLACE FUNCTION update_agreement_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updatedat = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_agreement_timestamp
BEFORE UPDATE ON agreements
FOR EACH ROW
EXECUTE FUNCTION update_agreement_timestamp();

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_agreements_status ON agreements(status);
CREATE INDEX IF NOT EXISTS idx_agreements_signature_status ON agreements(signature_status);
CREATE INDEX IF NOT EXISTS idx_agreements_renteeid ON agreements(renteeid);
CREATE INDEX IF NOT EXISTS idx_agreements_propertyid ON agreements(propertyid);
CREATE INDEX IF NOT EXISTS idx_agreements_unitid ON agreements(unitid);
CREATE INDEX IF NOT EXISTS idx_agreements_createdat ON agreements(createdat);
CREATE INDEX IF NOT EXISTS idx_agreements_signeddate ON agreements(signeddate); 