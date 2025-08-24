#!/usr/bin/env node

/**
 * Script to check which middleware file is active in the Next.js project
 * Run with: node scripts/check-middleware.js
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

console.log("🔍 Checking Middleware Configuration\n");

// Define possible middleware locations
const middlewareLocations = [
  { path: "middleware.ts", location: "Root" },
  { path: "middleware.js", location: "Root" },
  { path: "src/middleware.ts", location: "Src" },
  { path: "src/middleware.js", location: "Src" },
  { path: "app/middleware.ts", location: "App" },
  { path: "app/middleware.js", location: "App" },
];

// Check which files exist
console.log("📁 Checking for middleware files:");
const foundFiles = [];

middlewareLocations.forEach(({ path: filePath, location }) => {
  const fullPath = path.join(process.cwd(), filePath);
  if (fs.existsSync(fullPath)) {
    foundFiles.push({ path: filePath, location, fullPath });
    console.log(`  ✅ Found: ${filePath} (${location})`);

    // Check file size and modification time
    const stats = fs.statSync(fullPath);
    console.log(`     Size: ${stats.size} bytes`);
    console.log(`     Modified: ${stats.mtime.toISOString()}`);

    // Check first few lines
    const content = fs.readFileSync(fullPath, "utf8");
    const firstLines = content.split("\n").slice(0, 5).join("\n");
    console.log(`     Preview:`);
    console.log(`     ${firstLines.split("\n").join("\n     ")}`);
    console.log("");
  }
});

if (foundFiles.length === 0) {
  console.log("  ❌ No middleware files found\n");
} else if (foundFiles.length > 1) {
  console.log(`\n⚠️  WARNING: Multiple middleware files found!`);
  console.log("  Next.js only supports ONE middleware file.");
  console.log(
    "  The active one depends on Next.js version and configuration.\n",
  );
}

// Check Next.js version
console.log("📦 Next.js Configuration:");
try {
  const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
  const nextVersion =
    packageJson.dependencies?.next || packageJson.devDependencies?.next;
  console.log(`  Next.js version: ${nextVersion}`);
} catch (error) {
  console.log("  Unable to determine Next.js version");
}

// According to Next.js documentation
console.log("\n📚 According to Next.js documentation:");
console.log("  Priority order (first found wins):");
console.log("  1. /middleware.ts or /middleware.js (root)");
console.log("  2. /src/middleware.ts or /src/middleware.js");
console.log("  Note: /app/middleware.* is NOT supported\n");

// Determine likely active middleware
if (foundFiles.length > 0) {
  const rootMiddleware = foundFiles.find((f) => f.location === "Root");
  const srcMiddleware = foundFiles.find((f) => f.location === "Src");

  if (rootMiddleware) {
    console.log(`🎯 Most likely active: ${rootMiddleware.path}`);
    console.log("  (Root middleware takes precedence)");
  } else if (srcMiddleware) {
    console.log(`🎯 Most likely active: ${srcMiddleware.path}`);
  }
}

// Check for locale handling patterns
console.log("\n🔍 Checking for locale handling patterns:");
foundFiles.forEach(({ path: filePath, fullPath }) => {
  console.log(`\n  In ${filePath}:`);
  const content = fs.readFileSync(fullPath, "utf8");

  // Check for unsafe patterns
  if (content.includes("split('/')[1]")) {
    console.log("    ⚠️  Found unsafe pattern: split('/')[1]");
  }

  // Check for locale imports
  if (content.includes("locales")) {
    console.log("    ✅ Imports locales configuration");
  }

  // Check for validation
  if (content.includes("includes") && content.includes("locale")) {
    console.log("    ✅ Appears to validate locales");
  }

  // Check for next-intl
  if (content.includes("next-intl")) {
    console.log("    ✅ Uses next-intl middleware");
  }
});

// Recommendations
console.log("\n💡 Recommendations:");
if (foundFiles.length > 1) {
  console.log("  1. Consolidate all middleware logic into ONE file");
  console.log("  2. Delete unused middleware files");
  console.log("  3. Use /middleware.ts in the root (recommended)");
}

if (
  foundFiles.some((f) =>
    fs.readFileSync(f.fullPath, "utf8").includes("split('/')[1]"),
  )
) {
  console.log("  ⚠️  Replace unsafe locale extraction with validated approach");
  console.log("     See: docs/secure-locale-implementation-guide.md");
}

console.log("\n✨ Done! Check the analysis above.\n");
