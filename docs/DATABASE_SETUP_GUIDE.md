# 🗄️ Database Setup Guide

## 📋 Overview

This project uses **PostgreSQL** with two separate database instances for proper test isolation:

- **Development Database**: Port 5432 - For local development
- **Test Database**: Port 5433 - For running tests in isolation

This separation ensures:

- ✅ Tests don't interfere with development data
- ✅ Tests run in a clean, predictable environment
- ✅ Development can continue while tests run
- ✅ Production-like setup demonstration

## 🚀 Quick Start

### 1. Start Docker Containers

```bash
# Start both PostgreSQL containers
pnpm docker:up

# Verify containers are running
docker ps | grep postgres
```

### 2. Setup Both Databases

```bash
# Run the complete setup script
pnpm db:setup:all

# Or setup individually:
pnpm db:push:dev   # Setup development DB (5432)
pnpm db:push:test  # Setup test DB (5433)
```

### 3. Verify Setup

```bash
# Check development database
PGPASSWORD=postgres123 psql -h localhost -p 5432 -U postgres -d nextjs_auth_db -c "\dt"

# Check test database
PGPASSWORD=postgres123 psql -h localhost -p 5433 -U postgres -d nextjs_auth_db -c "\dt"
```

## 📦 Database Architecture

### Database Instances

| Database        | Port | Purpose                           | Connection String                                                 |
| --------------- | ---- | --------------------------------- | ----------------------------------------------------------------- |
| **Development** | 5432 | Local development, manual testing | `postgresql://postgres:postgres123@localhost:5432/nextjs_auth_db` |
| **Test**        | 5433 | Automated tests, CI/CD            | `postgresql://postgres:postgres123@localhost:5433/nextjs_auth_db` |

### Tables Structure

```sql
-- Core Authentication Tables
User                    -- User accounts
Account                 -- OAuth provider accounts
Session                 -- Active sessions
VerificationToken       -- Email verification tokens

-- Security Tables
PasswordResetToken      -- Password reset tokens
EmailVerificationToken  -- Email verification tokens
SecurityEvent          -- Security audit log
AccountLinkRequest     -- OAuth account linking
```

## 🔧 Environment Configuration

### Environment Files

```bash
.env.development    # Development database (5432)
.env.test          # Test database (5433)
.env.production    # Production configuration
```

### Environment Variables

```bash
# Development (.env.development)
DATABASE_URL="postgresql://postgres:postgres123@localhost:5432/nextjs_auth_db"

# Test (.env.test)
DATABASE_URL="postgresql://postgres:postgres123@localhost:5433/nextjs_auth_db"
```

## 📝 Common Commands

### Database Management

```bash
# Push schema to databases
pnpm db:push:dev        # Push to development DB
pnpm db:push:test       # Push to test DB

# Reset databases
pnpm db:reset:test      # Reset test database

# Open Prisma Studio
pnpm prisma:studio      # Browse database with GUI

# Generate Prisma Client
pnpm prisma:generate    # Update TypeScript types
```

### Docker Management

```bash
# Start containers
pnpm docker:up          # Start in background
docker-compose up       # Start with logs

# Stop containers
pnpm docker:down        # Stop and remove
docker-compose stop     # Just stop

# View logs
pnpm docker:logs        # Follow logs
docker-compose logs postgres_dev   # Dev DB logs
docker-compose logs postgres_test  # Test DB logs
```

### Testing Commands

```bash
# Run tests with proper database
pnpm test               # All tests
pnpm test:unit         # Unit tests only
pnpm test:integration  # Integration tests (uses 5433)
pnpm test:e2e          # End-to-end tests
```

## 🐛 Troubleshooting

### Issue: "The table does not exist"

**Error**: `The table 'public.Account' does not exist in the current database`

**Solution**:

```bash
# Push schema to the affected database
pnpm db:push:test   # If test database
pnpm db:push:dev    # If dev database
```

### Issue: "Connection refused"

**Error**: `connect ECONNREFUSED 127.0.0.1:5433`

**Solution**:

```bash
# Check if Docker is running
docker ps

# Start containers if needed
pnpm docker:up

# Check specific container
docker-compose ps postgres_test
```

### Issue: "Database does not exist"

**Error**: `database "nextjs_auth_db" does not exist`

**Solution**:

```bash
# Create database manually
PGPASSWORD=postgres123 psql -h localhost -p 5433 -U postgres -c "CREATE DATABASE nextjs_auth_db;"

# Then push schema
pnpm db:push:test
```

### Issue: Tests hanging

**Symptoms**: Tests start but never complete

**Solution**:

```bash
# 1. Check database connection
PGPASSWORD=postgres123 psql -h localhost -p 5433 -U postgres -d nextjs_auth_db -c "SELECT 1;"

# 2. Reset test database
pnpm db:reset:test

# 3. Run tests with timeout
jest --testTimeout=10000
```

## 🏗️ Architecture Decisions

### Why Two Databases?

1. **Test Isolation**: Tests run in a clean environment
2. **Parallel Development**: Dev work doesn't affect tests
3. **CI/CD Ready**: Separate test DB for pipelines
4. **Production-like**: Mimics staging/production setup

### Why PostgreSQL?

1. **ACID Compliance**: Data integrity
2. **JSON Support**: Flexible data storage
3. **Full-text Search**: Built-in search capabilities
4. **Battle-tested**: Production proven

### Why Prisma?

1. **Type Safety**: Generated TypeScript types
2. **Migrations**: Version controlled schema
3. **Developer Experience**: Great tooling
4. **Performance**: Query optimization

## 🔒 Security Considerations

### Development Environment

- **Default credentials** are used (postgres/postgres123)
- **Localhost only** access
- **Docker isolated** networking
- ⚠️ **Never use these credentials in production**

### Production Environment

- Use strong, unique passwords
- Enable SSL/TLS connections
- Use connection pooling
- Regular backups
- Monitor access logs

## 📚 Best Practices

### 1. Always Use Correct Database

```typescript
// In tests
process.env.DATABASE_URL = "postgresql://...@localhost:5433/...";

// In development
process.env.DATABASE_URL = "postgresql://...@localhost:5432/...";
```

### 2. Clean Test Data

```typescript
// Before each test
beforeEach(async () => {
  await cleanDatabase();
});
```

### 3. Use Transactions for Tests

```typescript
// Wrap test in transaction
await prisma.$transaction(async (tx) => {
  // Test operations
  throw new Error("Rollback"); // Rollback at end
});
```

### 4. Seed Development Data

```bash
# Create useful development data
pnpm create-user
```

## 🚨 Important Notes

1. **Docker Required**: Both databases run in Docker containers
2. **Port Conflicts**: Ensure 5432 and 5433 are available
3. **Data Persistence**: Docker volumes persist data between restarts
4. **Resource Usage**: Two PostgreSQL instances use ~200MB RAM each

## 📖 Additional Resources

- [Prisma Documentation](https://www.prisma.io/docs)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Docker Compose Reference](https://docs.docker.com/compose/)
- [NextAuth Database Adapters](https://authjs.dev/reference/adapters)

## 🆘 Getting Help

If you encounter issues:

1. Check this troubleshooting guide
2. Review Docker logs: `pnpm docker:logs`
3. Verify environment variables: `env | grep DATABASE`
4. Check Prisma schema: `cat prisma/schema.prisma`
5. Test connection: `pnpm prisma:studio`

---

**Remember**: This dual-database setup is a best practice for professional development, ensuring clean test environments and preventing data corruption during testing.
