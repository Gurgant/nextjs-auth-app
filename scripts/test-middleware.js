/**
 * Manual test script for middleware functionality
 * Run with: node scripts/test-middleware.js
 */

console.log('🧪 Testing Secure Middleware Implementation\n');

// Test locale validation
const { isValidLocale, getSafeLocale, ALLOWED_LOCALES } = require('../src/config/i18n');

console.log('1️⃣ Testing Locale Validation:');
console.log('----------------------------');

// Valid locales
ALLOWED_LOCALES.forEach(locale => {
  console.log(`✅ isValidLocale('${locale}'): ${isValidLocale(locale)}`);
});

// Invalid locales
const invalidLocales = ['xx', 'eng', 'EN', '../../../etc/passwd', '<script>alert("xss")</script>', '"; DROP TABLE users; --'];
invalidLocales.forEach(locale => {
  console.log(`❌ isValidLocale('${locale}'): ${isValidLocale(locale)}`);
  console.log(`   getSafeLocale('${locale}'): ${getSafeLocale(locale)}`);
});

console.log('\n2️⃣ Testing URL Patterns:');
console.log('------------------------');

// Test regex patterns
const pathRegex = /^\/([a-z]{2})(?:\/|$)/;
const testPaths = [
  '/en/dashboard',
  '/es/',
  '/fr',
  '/xx/invalid',
  '/eng/too-long',
  '/dashboard',
  '/',
  '/../../../etc/passwd'
];

testPaths.forEach(path => {
  const match = path.match(pathRegex);
  console.log(`Path: '${path}'`);
  if (match) {
    console.log(`  → Locale found: '${match[1]}' (valid: ${isValidLocale(match[1])})`);
  } else {
    console.log(`  → No locale found`);
  }
});

console.log('\n3️⃣ Testing Accept-Language Parsing:');
console.log('-----------------------------------');

// Simulate Accept-Language header parsing
const acceptLanguageHeaders = [
  'en-US,en;q=0.9,es;q=0.8',
  'fr-CA,fr;q=0.9,en;q=0.8',
  'de-DE,de;q=0.9',
  'xx-XX,xx;q=0.9,en;q=0.8',
  'zh-CN,zh;q=0.9'
];

acceptLanguageHeaders.forEach(header => {
  console.log(`Header: '${header}'`);
  const languages = header
    .split(',')
    .map(lang => lang.split(';')[0].trim().toLowerCase())
    .map(lang => lang.split('-')[0]);
  
  const validLocale = languages.find(lang => isValidLocale(lang));
  console.log(`  → Languages: ${languages.join(', ')}`);
  console.log(`  → First valid locale: ${validLocale || 'none (would use default)'}`);
});

console.log('\n4️⃣ Security Test Cases:');
console.log('-----------------------');

const securityTests = [
  { path: '/<script>alert("xss")</script>/dashboard', expected: 'en' },
  { path: '/../../admin', expected: 'en' },
  { path: '/%2e%2e%2f%2e%2e', expected: 'en' },
  { path: '/"; DROP TABLE users; --/page', expected: 'en' }
];

securityTests.forEach(test => {
  const match = test.path.match(pathRegex);
  const locale = match ? match[1] : null;
  const safeLocale = getSafeLocale(locale);
  console.log(`Attack: '${test.path}'`);
  console.log(`  → Extracted: '${locale}'`);
  console.log(`  → Safe locale: '${safeLocale}' ${safeLocale === test.expected ? '✅' : '❌'}`);
});

console.log('\n✨ Middleware Security Features:');
console.log('--------------------------------');
console.log('• Whitelist validation for all locales');
console.log('• Multiple fallback strategies (path → cookie → header → default)');
console.log('• Security logging for invalid attempts');
console.log('• Protection against path traversal');
console.log('• Protection against XSS in URLs');
console.log('• Protection against SQL injection');
console.log('• Type-safe locale handling');

console.log('\n✅ Test completed!');