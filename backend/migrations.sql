-- Idempotent schema migrations. Safe to re-run.
-- Local:  PGPASSWORD=postgres psql -h localhost -U postgres -d timepunch -f backend/migrations.sql
-- Server: docker compose exec -T db psql -U timepunch -d timepunch < backend/migrations.sql

ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name             VARCHAR NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name              VARCHAR NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_token   VARCHAR;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_expires TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until           TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS expected_hours         DOUBLE PRECISION NOT NULL DEFAULT 8.0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_sent_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS work_group             VARCHAR;
ALTER TABLE users ADD COLUMN IF NOT EXISTS checkin_cutoff         VARCHAR;

ALTER TABLE messages ADD COLUMN IF NOT EXISTS recipient_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- Latest manual correction, shown in the admin UI under the entry.
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS edited_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS edited_by VARCHAR;
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS created_by_admin BOOLEAN;

-- Full history of corrections. No foreign key on entry_id on purpose, so the
-- log survives the time entry (or the admin) being deleted.
CREATE TABLE IF NOT EXISTS time_entry_edits (
    id            SERIAL PRIMARY KEY,
    entry_id      INTEGER NOT NULL,
    user_id       INTEGER NOT NULL,
    edited_at     TIMESTAMP WITH TIME ZONE DEFAULT now(),
    edited_by     VARCHAR,
    old_punch_in  TIMESTAMP WITH TIME ZONE,
    old_punch_out TIMESTAMP WITH TIME ZONE,
    new_punch_in  TIMESTAMP WITH TIME ZONE,
    new_punch_out TIMESTAMP WITH TIME ZONE
);
CREATE INDEX IF NOT EXISTS ix_time_entry_edits_entry_id ON time_entry_edits (entry_id);

-- is_active is now enforced at login. Any NULL would lock that user out, so
-- backfill before deploying the code that checks it.
UPDATE users SET is_active = true WHERE is_active IS NULL;
ALTER TABLE users ALTER COLUMN is_active SET DEFAULT true;
ALTER TABLE users ALTER COLUMN is_active SET NOT NULL;
