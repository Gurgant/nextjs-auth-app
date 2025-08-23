#!/usr/bin/env node

/**
 * Comprehensive Translation Testing Script
 * Tests translation completeness, validates format, and checks for missing keys
 */

const fs = require("fs");
const path = require("path");

const MESSAGES_DIR = path.join(__dirname, "../messages");
const SUPPORTED_LOCALES = ["en", "es", "fr", "de", "it"];
const BASE_LOCALE = "en";

console.log("🌍 Starting Translation Testing & i18n Validation...\n");

// Load all translation files
const translations = {};
const loadErrors = [];

for (const locale of SUPPORTED_LOCALES) {
  const filePath = path.join(MESSAGES_DIR, `${locale}.json`);
  try {
    const content = fs.readFileSync(filePath, "utf8");
    translations[locale] = JSON.parse(content);
    console.log(
      `✅ Loaded ${locale}.json (${content.split("\n").length} lines)`,
    );
  } catch (error) {
    console.error(`❌ Failed to load ${locale}.json:`, error.message);
    loadErrors.push({ locale, error: error.message });
  }
}

if (loadErrors.length > 0) {
  console.error("\n❌ Translation file loading errors:", loadErrors);
  process.exit(1);
}

console.log("\n📊 Translation Completeness Analysis:\n");

// Helper function to get all nested keys from an object
function getAllKeys(obj, prefix = "") {
  let keys = [];
  for (const key in obj) {
    if (typeof obj[key] === "object" && obj[key] !== null) {
      keys = keys.concat(getAllKeys(obj[key], prefix + key + "."));
    } else {
      keys.push(prefix + key);
    }
  }
  return keys;
}

// Get all keys from base language (English)
const baseKeys = getAllKeys(translations[BASE_LOCALE]);
console.log(
  `📋 Base language (${BASE_LOCALE}) has ${baseKeys.length} translation keys`,
);

// Check each locale for missing keys
const missingKeys = {};
const completenessReport = {};

for (const locale of SUPPORTED_LOCALES) {
  if (locale === BASE_LOCALE) continue;

  const localeKeys = getAllKeys(translations[locale]);
  const missing = baseKeys.filter((key) => !localeKeys.includes(key));

  missingKeys[locale] = missing;
  const completeness = (
    ((baseKeys.length - missing.length) / baseKeys.length) *
    100
  ).toFixed(1);
  completenessReport[locale] = {
    total: baseKeys.length,
    translated: baseKeys.length - missing.length,
    missing: missing.length,
    completeness: parseFloat(completeness),
  };

  console.log(
    `🌐 ${locale}: ${completeness}% complete (${missing.length} missing keys)`,
  );
}

// Detailed missing keys report
console.log("\n🔍 Missing Keys Analysis:\n");
for (const locale in missingKeys) {
  if (missingKeys[locale].length > 0) {
    console.log(
      `❌ ${locale.toUpperCase()} - Missing ${missingKeys[locale].length} keys:`,
    );
    missingKeys[locale].slice(0, 5).forEach((key) => {
      console.log(`   • ${key}`);
    });
    if (missingKeys[locale].length > 5) {
      console.log(`   • ... and ${missingKeys[locale].length - 5} more`);
    }
    console.log("");
  } else {
    console.log(`✅ ${locale.toUpperCase()} - Complete translation coverage!`);
  }
}

// Test key structure consistency
console.log("🔧 Translation Structure Validation:\n");
function validateStructure(obj, path = "", issues = []) {
  for (const key in obj) {
    const currentPath = path ? `${path}.${key}` : key;

    if (typeof obj[key] === "object" && obj[key] !== null) {
      validateStructure(obj[key], currentPath, issues);
    } else if (typeof obj[key] === "string") {
      // Check for interpolation syntax
      const interpolations = obj[key].match(/\{[^}]+\}/g) || [];
      if (interpolations.length > 0) {
        console.log(
          `🔧 ${currentPath}: Found interpolations: ${interpolations.join(", ")}`,
        );
      }

      // Check for empty values
      if (obj[key].trim() === "") {
        issues.push(`Empty value at ${currentPath}`);
      }
    }
  }
  return issues;
}

for (const locale of SUPPORTED_LOCALES) {
  const issues = validateStructure(translations[locale]);
  if (issues.length > 0) {
    console.log(`⚠️ ${locale}: ${issues.length} issues found`);
    issues.slice(0, 3).forEach((issue) => console.log(`   • ${issue}`));
  } else {
    console.log(`✅ ${locale}: No structure issues`);
  }
}

// Generate frontend test scenarios
console.log("\n🧪 Frontend Translation Test Scenarios:\n");

const testScenarios = [
  {
    name: "Home page welcome message",
    path: "/en",
    expectedKey: "Home.title",
    description: "Check home page title in all languages",
  },
  {
    name: "Authentication flow",
    path: "/en/auth/signin",
    expectedKey: "Auth.signInWithGoogle",
    description: "Verify sign-in button translations",
  },
  {
    name: "Dashboard welcome",
    path: "/en/dashboard",
    expectedKey: "Dashboard.welcome",
    description: "Test dashboard welcome message with user name interpolation",
  },
  {
    name: "Error messages",
    path: "/en/register",
    expectedKey: "Errors.validation.required",
    description: "Validate form error messages",
  },
];

testScenarios.forEach((scenario, index) => {
  console.log(`${index + 1}. ${scenario.name}`);
  console.log(`   📍 Path: ${scenario.path}`);
  console.log(`   🔑 Key: ${scenario.expectedKey}`);
  console.log(`   📝 ${scenario.description}\n`);
});

// Summary and recommendations
console.log("📊 TRANSLATION TESTING SUMMARY:\n");

const totalLocales = SUPPORTED_LOCALES.length - 1; // Exclude base locale
const completeLocales = Object.values(completenessReport).filter(
  (r) => r.completeness === 100,
).length;
const averageCompleteness =
  Object.values(completenessReport).reduce(
    (sum, r) => sum + r.completeness,
    0,
  ) / totalLocales;

console.log(`📈 Overall Translation Status:`);
console.log(`   • Supported Languages: ${SUPPORTED_LOCALES.length}`);
console.log(`   • Complete Translations: ${completeLocales}/${totalLocales}`);
console.log(`   • Average Completeness: ${averageCompleteness.toFixed(1)}%`);

if (completeLocales === totalLocales) {
  console.log(`\n🎉 EXCELLENT! All translations are complete!`);
} else {
  console.log(`\n⚠️ Action Required:`);
  const incompleteLocales = Object.keys(completenessReport).filter(
    (locale) => completenessReport[locale].completeness < 100,
  );
  console.log(
    `   • Complete translations for: ${incompleteLocales.join(", ")}`,
  );
  console.log(
    `   • Total missing keys: ${Object.values(missingKeys).flat().length}`,
  );
}

console.log("\n🔄 Next Steps for E2E Translation Testing:");
console.log("   1. Test language switcher component");
console.log("   2. Validate URL-based locale routing (/en, /es, /fr, etc.)");
console.log("   3. Check form validation messages in all languages");
console.log("   4. Test user-facing error messages");
console.log("   5. Verify email templates translations");

console.log("\n✅ Translation analysis complete!");
