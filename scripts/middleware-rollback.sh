#!/bin/bash

# Middleware Rollback Script
# This script safely rolls back to the previous middleware version

set -e # Exit on error

echo "🔄 Starting middleware rollback..."

# Check if backup directory exists
BACKUP_DIR="backups/middleware/20250803_125105"
if [ ! -d "$BACKUP_DIR" ]; then
    echo "❌ Error: Backup directory not found at $BACKUP_DIR"
    exit 1
fi

# Check if backup middleware exists
if [ ! -f "$BACKUP_DIR/middleware.root.ts" ]; then
    echo "❌ Error: Backup middleware not found"
    exit 1
fi

# Create timestamp for this rollback
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
ROLLBACK_DIR="backups/rollback_$TIMESTAMP"

# Create rollback directory
echo "📁 Creating rollback directory: $ROLLBACK_DIR"
mkdir -p "$ROLLBACK_DIR"

# Backup current (potentially broken) middleware
echo "💾 Backing up current middleware..."
cp middleware.ts "$ROLLBACK_DIR/middleware.broken.ts" 2>/dev/null || echo "⚠️  No current middleware.ts found"
cp middleware.new.ts "$ROLLBACK_DIR/middleware.new.ts" 2>/dev/null || echo "ℹ️  No middleware.new.ts found"

# Restore the backup
echo "♻️  Restoring backup middleware..."
cp "$BACKUP_DIR/middleware.root.ts" middleware.ts

# Remove the new middleware file if it exists
if [ -f "middleware.new.ts" ]; then
    echo "🗑️  Removing middleware.new.ts..."
    rm middleware.new.ts
fi

# Log the rollback
echo "📝 Logging rollback..."
cat >> backups/rollback.log << EOF
=== Rollback performed at $TIMESTAMP ===
Reason: Manual rollback initiated
Restored from: $BACKUP_DIR/middleware.root.ts
Backed up broken version to: $ROLLBACK_DIR/
=====================================

EOF

# Rebuild the application
echo "🔨 Rebuilding application..."
pnpm run build

echo "✅ Rollback complete!"
echo ""
echo "Next steps:"
echo "1. Restart your application: pnpm run start"
echo "2. Test that auth redirects work correctly"
echo "3. Verify locale routing is functional"
echo "4. Check error logs"
echo ""
echo "Rollback files saved to: $ROLLBACK_DIR"
echo "You can find the problematic middleware there for debugging."