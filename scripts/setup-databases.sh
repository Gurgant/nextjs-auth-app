#!/bin/bash

# Database Setup Script for Next.js Auth App
# This script sets up both development and test databases

set -e  # Exit on error

echo "🚀 Starting Database Setup..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
DEV_PORT=5432
TEST_PORT=5433
DB_USER="postgres"
DB_PASSWORD="postgres123"
DB_NAME="nextjs_auth_db"

# Function to check if PostgreSQL is running
check_postgres() {
    local port=$1
    local name=$2
    
    echo -e "${YELLOW}Checking PostgreSQL on port $port ($name)...${NC}"
    
    if PGPASSWORD=$DB_PASSWORD psql -h localhost -p $port -U $DB_USER -c '\q' 2>/dev/null; then
        echo -e "${GREEN}✓ PostgreSQL is running on port $port${NC}"
        return 0
    else
        echo -e "${RED}✗ PostgreSQL is not running on port $port${NC}"
        return 1
    fi
}

# Function to create database if it doesn't exist
create_database() {
    local port=$1
    local name=$2
    
    echo -e "${YELLOW}Creating database on port $port...${NC}"
    
    # Check if database exists
    if PGPASSWORD=$DB_PASSWORD psql -h localhost -p $port -U $DB_USER -lqt | cut -d \| -f 1 | grep -qw $DB_NAME; then
        echo -e "${GREEN}✓ Database '$DB_NAME' already exists on port $port${NC}"
    else
        PGPASSWORD=$DB_PASSWORD psql -h localhost -p $port -U $DB_USER -c "CREATE DATABASE $DB_NAME;"
        echo -e "${GREEN}✓ Database '$DB_NAME' created on port $port${NC}"
    fi
}

# Function to push Prisma schema to database
push_schema() {
    local port=$1
    local env_type=$2
    
    echo -e "${YELLOW}Pushing Prisma schema to $env_type database (port $port)...${NC}"
    
    # Create temporary env file for this operation
    cat > .env.temp << EOF
DATABASE_URL="postgresql://$DB_USER:$DB_PASSWORD@localhost:$port/$DB_NAME"
EOF
    
    # Push schema using the temporary env file
    dotenv -e .env.temp -- pnpm prisma db push --skip-generate
    
    # Clean up temp file
    rm .env.temp
    
    echo -e "${GREEN}✓ Schema pushed to $env_type database${NC}"
}

# Function to display database tables
show_tables() {
    local port=$1
    local name=$2
    
    echo -e "${YELLOW}Tables in $name database (port $port):${NC}"
    PGPASSWORD=$DB_PASSWORD psql -h localhost -p $port -U $DB_USER -d $DB_NAME -c "\dt"
}

# Main execution
echo "================================================"
echo "    Database Setup for Next.js Auth App"
echo "================================================"
echo ""

# Check Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}Docker is not running. Please start Docker first.${NC}"
    exit 1
fi

# Check if containers are running
echo -e "${YELLOW}Checking Docker containers...${NC}"
docker-compose ps

# Setup Development Database
echo ""
echo "📦 Setting up Development Database (Port $DEV_PORT)"
echo "--------------------------------------------"
if check_postgres $DEV_PORT "Development"; then
    create_database $DEV_PORT "Development"
    push_schema $DEV_PORT "development"
    show_tables $DEV_PORT "Development"
else
    echo -e "${RED}Please ensure Docker container is running on port $DEV_PORT${NC}"
    echo "Run: docker-compose up -d postgres_dev"
    exit 1
fi

# Setup Test Database
echo ""
echo "🧪 Setting up Test Database (Port $TEST_PORT)"
echo "--------------------------------------------"
if check_postgres $TEST_PORT "Test"; then
    create_database $TEST_PORT "Test"
    push_schema $TEST_PORT "test"
    show_tables $TEST_PORT "Test"
else
    echo -e "${RED}Please ensure Docker container is running on port $TEST_PORT${NC}"
    echo "Run: docker-compose up -d postgres_test"
    exit 1
fi

echo ""
echo "================================================"
echo -e "${GREEN}✨ Database setup completed successfully!${NC}"
echo "================================================"
echo ""
echo "Summary:"
echo "  • Development DB: postgresql://localhost:$DEV_PORT/$DB_NAME"
echo "  • Test DB:        postgresql://localhost:$TEST_PORT/$DB_NAME"
echo ""
echo "Next steps:"
echo "  1. Run 'pnpm dev' to start development server"
echo "  2. Run 'pnpm test' to run tests"
echo ""