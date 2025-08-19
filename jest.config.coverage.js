/**
 * Jest configuration for coverage reporting
 */

const baseConfig = require('./jest.config')

module.exports = {
  ...baseConfig,
  
  // Coverage configuration
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: [
    'text',
    'text-summary',
    'html',
    'lcov',
    'json',
    'json-summary'
  ],
  
  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 75,
      functions: 80,
      lines: 80,
      statements: 80
    },
    // Specific thresholds for critical paths
    './src/lib/auth/**/*.{ts,tsx}': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    },
    './src/lib/repositories/**/*.{ts,tsx}': {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85
    }
  },
  
  // Files to collect coverage from
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.stories.tsx',
    '!src/**/*.test.{ts,tsx}',
    '!src/**/*.spec.{ts,tsx}',
    '!src/test/**/*',
    '!src/generated/**/*',
    '!**/node_modules/**',
    '!**/.next/**',
    '!**/coverage/**'
  ],
  
  // Coverage path ignore patterns
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/.next/',
    '/coverage/',
    '/dist/',
    '/public/',
    '/prisma/',
    '/.github/',
    '/e2e/',
    '/performance-tests/'
  ],
  
  // Reporter options
  coverageReporters: [
    'text',
    ['html', { subdir: 'html' }],
    ['lcov', { projectRoot: './' }],
    ['json-summary', { file: 'coverage-summary.json' }],
    ['cobertura', { file: 'cobertura-coverage.xml' }]
  ]
}