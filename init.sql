-- Container first-boot init. The database itself is created by the
-- POSTGRES_DB environment variable; the schema is owned by Prisma
-- (`pnpm db:setup` → prisma db push), so nothing schema-shaped belongs here.

-- Extensions available to the app
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Keep timestamps deterministic
SET timezone = 'UTC';
