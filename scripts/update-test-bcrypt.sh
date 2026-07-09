#!/bin/bash

# Update all bcrypt.hash calls in test files to use 4 rounds for faster tests

echo "🔧 Updating bcrypt rounds in test files..."

# Find all test files and update bcrypt.hash calls from 10 rounds to 4
find src/test -name "*.ts" -type f -exec sed -i 's/bcrypt\.hash(\(.*\), 10)/bcrypt.hash(\1, 4)/g' {} +
find src/test -name "*.ts" -type f -exec sed -i 's/bcrypt\.hashSync(\(.*\), 10)/bcrypt.hashSync(\1, 4)/g' {} +

echo "✅ Updated bcrypt rounds in test files from 10 to 4"

# Show the changes
echo ""
echo "📊 Changes made:"
grep -r "bcrypt\.hash.*4)" src/test --include="*.ts" | head -10

echo ""
echo "✨ Tests should now run significantly faster!"