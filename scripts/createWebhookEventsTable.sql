-- Add trigger to webhook_events table
DROP TRIGGER IF EXISTS set_updated_at ON public.webhook_events;
CREATE TRIGGER set_updated_at
BEFORE UPDATE ON public.webhook_events
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- Add a function to automatically update agreement status when a webhook is received
CREATE OR REPLACE FUNCTION public.update_agreement_from_webhook()
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

-- Create the trigger to automatically update agreements when webhooks are received
DROP TRIGGER IF EXISTS webhook_event_trigger ON public.webhook_events;
CREATE TRIGGER webhook_event_trigger
AFTER INSERT ON public.webhook_events
FOR EACH ROW
EXECUTE FUNCTION public.update_agreement_from_webhook(); 