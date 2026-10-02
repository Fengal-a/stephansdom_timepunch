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

ALTER TABLE messages ADD COLUMN IF NOT EXISTS recipient_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- is_active is now enforced at login. Any NULL would lock that user out, so
-- backfill before deploying the code that checks it.
UPDATE users SET is_active = true WHERE is_active IS NULL;
ALTER TABLE users ALTER COLUMN is_active SET DEFAULT true;
ALTER TABLE users ALTER COLUMN is_active SET NOT NULL;
