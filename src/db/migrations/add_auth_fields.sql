-- Add authid and invited fields to rentees table
ALTER TABLE rentees
ADD COLUMN IF NOT EXISTS authid uuid,
ADD COLUMN IF NOT EXISTS invited boolean DEFAULT false;

-- Add authid and invited fields to team_members table
ALTER TABLE team_members
ADD COLUMN IF NOT EXISTS authid uuid,
ADD COLUMN IF NOT EXISTS invited boolean DEFAULT false;

-- Add indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_rentees_authid ON rentees(authid);
CREATE INDEX IF NOT EXISTS idx_team_members_authid ON team_members(authid);

-- Add foreign key constraints (optional, if you have a users table)
-- ALTER TABLE rentees
-- ADD CONSTRAINT fk_rentees_users FOREIGN KEY (authid) REFERENCES auth.users(id) ON DELETE SET NULL;
-- 
-- ALTER TABLE team_members
-- ADD CONSTRAINT fk_team_members_users FOREIGN KEY (authid) REFERENCES auth.users(id) ON DELETE SET NULL; 