-- Create database if not exists (PostgreSQL doesn't support IF NOT EXISTS for CREATE DATABASE in transaction)
-- This will be handled by POSTGRES_DB environment variable

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Set timezone
SET timezone = 'UTC';

-- Create initial schema version table
CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert initial version
INSERT INTO schema_version (version) VALUES (1) ON CONFLICT DO NOTHING;