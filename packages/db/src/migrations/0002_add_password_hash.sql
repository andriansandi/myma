-- Add password hash for simple email/password admin auth.
ALTER TABLE users ADD COLUMN password_hash TEXT;