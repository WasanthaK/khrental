-- Create timestamp triggers for all tables
-- This script sets up automatic timestamp management for createdat and updatedat fields

-- Create the set_timestamps function if it doesn't exist
CREATE OR REPLACE FUNCTION set_timestamps()
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

-- Function to create the timestamp trigger for a specific table
CREATE OR REPLACE FUNCTION create_timestamp_trigger(table_name text)
RETURNS void AS $$
DECLARE
  trigger_name text;
  column_count integer;
  has_snake_case boolean;
  has_camel_case boolean;
BEGIN
  -- Check if the table has createdat and updatedat columns
  SELECT COUNT(*) INTO column_count
  FROM information_schema.columns
  WHERE table_name = create_timestamp_trigger.table_name
    AND column_name IN ('createdat', 'updatedat');
  
  -- Check if the table has created_at and updated_at columns
  SELECT COUNT(*) = 2 INTO has_snake_case
  FROM information_schema.columns
  WHERE table_name = create_timestamp_trigger.table_name
    AND column_name IN ('created_at', 'updated_at');
  
  SELECT COUNT(*) = 2 INTO has_camel_case
  FROM information_schema.columns
  WHERE table_name = create_timestamp_trigger.table_name
    AND column_name IN ('createdat', 'updatedat');
  
  -- Only create trigger if both timestamp columns exist
  IF column_count = 2 THEN
    trigger_name := 'set_timestamps_' || table_name;
    
    -- Drop the trigger if it already exists
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', trigger_name, table_name);
    
    -- Create the trigger
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_timestamps()',
      trigger_name,
      table_name
    );
    
    RAISE NOTICE 'Created timestamp trigger for table: %', table_name;
  ELSIF has_snake_case THEN
    -- If table uses snake_case timestamps, add compatible trigger
    trigger_name := 'set_snake_case_timestamps_' || table_name;
    
    -- Drop the trigger if it already exists
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', trigger_name, table_name);
    
    -- Create a snake_case compatible trigger
    EXECUTE format('
      CREATE OR REPLACE FUNCTION set_snake_case_timestamps() RETURNS TRIGGER AS $$
      BEGIN
        IF NEW.created_at IS NULL THEN
          NEW.created_at = NOW();
        END IF;
        NEW.updated_at = NOW();
        RETURN NEW;
      END; $$ LANGUAGE plpgsql;
      
      CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_snake_case_timestamps()',
      trigger_name,
      table_name
    );
    
    RAISE NOTICE 'Created snake_case timestamp trigger for table: %', table_name;
  ELSE
    RAISE NOTICE 'Table % missing timestamp columns. Trigger not created.', table_name;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for all tables in the public schema
DO $$
DECLARE
  table_record record;
BEGIN
  FOR table_record IN
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
  LOOP
    PERFORM create_timestamp_trigger(table_record.table_name);
  END LOOP;
END $$;

-- Update existing records to ensure they have timestamps
DO $$
DECLARE
  table_record record;
BEGIN
  FOR table_record IN
    SELECT table_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'createdat'
    GROUP BY table_name
  LOOP
    -- Update createdat for records where it's NULL
    EXECUTE format(
      'UPDATE %I SET createdat = NOW() WHERE createdat IS NULL',
      table_record.table_name
    );
    
    -- Update updatedat for records where it's NULL
    EXECUTE format(
      'UPDATE %I SET updatedat = COALESCE(createdat, NOW()) WHERE updatedat IS NULL',
      table_record.table_name
    );
  END LOOP;
END $$; 