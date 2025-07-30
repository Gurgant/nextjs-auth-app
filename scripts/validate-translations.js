#!/usr/bin/env node

/**
 * Translation Validation Script
 * Ensures all translation files have the same keys as the base English file
 */

const fs = require('fs');
const path = require('path');

const MESSAGES_DIR = path.join(__dirname, '../messages');
const BASE_LOCALE = 'en';
const SUPPORTED_LOCALES = ['en', 'es', 'fr', 'it', 'de'];

// ANSI color codes for output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

function colorize(text, color) {
  return `${colors[color]}${text}${colors.reset}`;
}

function loadTranslations(locale) {
  const filePath = path.join(MESSAGES_DIR, `${locale}.json`);
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error(colorize(`❌ Error loading ${locale}.json: ${error.message}`, 'red'));
    return null;
  }
}

function getNestedKeys(obj, prefix = '') {
  const keys = [];
  
  for (const [key, value] of Object.entries(obj)) {
    const currentKey = prefix ? `${prefix}.${key}` : key;
    
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      keys.push(...getNestedKeys(value, currentKey));
    } else {
      keys.push(currentKey);
    }
  }
  
  return keys.sort();
}

function findMissingKeys(baseKeys, targetKeys) {
  return baseKeys.filter(key => !targetKeys.includes(key));
}

function findExtraKeys(baseKeys, targetKeys) {
  return targetKeys.filter(key => !baseKeys.includes(key));
}

function validateTranslations() {
  console.log(colorize('\n🌍 Translation Validation Tool', 'cyan'));
  console.log(colorize('=====================================\n', 'cyan'));

  // Load base translations (English)
  const baseTranslations = loadTranslations(BASE_LOCALE);
  if (!baseTranslations) {
    console.error(colorize('❌ Cannot load base translations. Exiting.', 'red'));
    process.exit(1);
  }

  const baseKeys = getNestedKeys(baseTranslations);
  console.log(colorize(`📋 Base locale (${BASE_LOCALE}) has ${baseKeys.length} translation keys`, 'blue'));

  let hasErrors = false;
  let totalMissing = 0;
  let totalExtra = 0;

  // Validate each supported locale
  for (const locale of SUPPORTED_LOCALES) {
    if (locale === BASE_LOCALE) continue;

    console.log(colorize(`\n🔍 Validating ${locale}.json...`, 'yellow'));

    const translations = loadTranslations(locale);
    if (!translations) {
      hasErrors = true;
      continue;
    }

    const localeKeys = getNestedKeys(translations);
    const missingKeys = findMissingKeys(baseKeys, localeKeys);
    const extraKeys = findExtraKeys(baseKeys, localeKeys);

    if (missingKeys.length === 0 && extraKeys.length === 0) {
      console.log(colorize(`  ✅ ${locale}: All keys present (${localeKeys.length} keys)`, 'green'));
    } else {
      hasErrors = true;
      
      if (missingKeys.length > 0) {
        console.log(colorize(`  ❌ ${locale}: Missing ${missingKeys.length} keys:`, 'red'));
        missingKeys.forEach(key => {
          console.log(colorize(`    - ${key}`, 'red'));
        });
        totalMissing += missingKeys.length;
      }

      if (extraKeys.length > 0) {
        console.log(colorize(`  ⚠️  ${locale}: Extra ${extraKeys.length} keys:`, 'yellow'));
        extraKeys.forEach(key => {
          console.log(colorize(`    + ${key}`, 'yellow'));
        });
        totalExtra += extraKeys.length;
      }
    }
  }

  // Summary
  console.log(colorize('\n📊 Validation Summary:', 'cyan'));
  console.log(colorize('===================', 'cyan'));
  
  if (hasErrors) {
    console.log(colorize(`❌ Validation FAILED`, 'red'));
    if (totalMissing > 0) {
      console.log(colorize(`   Missing keys: ${totalMissing}`, 'red'));
    }
    if (totalExtra > 0) {
      console.log(colorize(`   Extra keys: ${totalExtra}`, 'yellow'));
    }
    console.log(colorize('\n💡 Fix missing translations before deployment!', 'yellow'));
    process.exit(1);
  } else {
    console.log(colorize(`✅ All translations are synchronized!`, 'green'));
    console.log(colorize(`   Supported locales: ${SUPPORTED_LOCALES.join(', ')}`, 'green'));
    console.log(colorize(`   Total keys per locale: ${baseKeys.length}`, 'green'));
  }

  console.log(colorize('\n🎉 Translation validation complete!\n', 'cyan'));
}

// Run validation
validateTranslations();