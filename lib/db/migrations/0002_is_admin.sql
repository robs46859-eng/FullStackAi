-- Add is_admin column to users table for admin dashboard access control
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;
