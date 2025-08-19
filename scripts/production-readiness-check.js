#!/usr/bin/env node

/**
 * Production Readiness Check Script
 * Validates that the application is ready for production deployment
 * Run with: node scripts/production-readiness-check.js
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

class ProductionReadinessChecker {
  constructor() {
    this.errors = []
    this.warnings = []
    this.passed = 0
    this.total = 0
  }

  log(message, type = 'info') {
    const colors = {
      info: '\x1b[36m',    // Cyan
      success: '\x1b[32m', // Green
      warning: '\x1b[33m', // Yellow
      error: '\x1b[31m',   // Red
      reset: '\x1b[0m'     // Reset
    }
    
    const prefix = {
      info: 'ℹ',
      success: '✅',
      warning: '⚠️',
      error: '❌'
    }

    console.log(`${colors[type]}${prefix[type]} ${message}${colors.reset}`)
  }

  check(name, testFn) {
    this.total++
    try {
      const result = testFn()
      if (result === true || result === undefined) {
        this.log(`${name}`, 'success')
        this.passed++
      } else if (typeof result === 'string') {
        this.log(`${name}: ${result}`, 'warning')
        this.warnings.push(`${name}: ${result}`)
        this.passed++
      }
    } catch (error) {
      this.log(`${name}: ${error.message}`, 'error')
      this.errors.push(`${name}: ${error.message}`)
    }
  }

  async run() {
    console.log('\n🚀 Production Readiness Check Starting...\n')

    // 1. Environment Variables Check
    this.log('=== Environment Variables ===', 'info')
    this.checkEnvironmentVariables()

    // 2. Dependencies Check
    this.log('\n=== Dependencies ===', 'info')
    this.checkDependencies()

    // 3. Build Process Check
    this.log('\n=== Build Process ===', 'info')
    await this.checkBuildProcess()

    // 4. TypeScript Check
    this.log('\n=== TypeScript ===', 'info')
    this.checkTypeScript()

    // 5. Linting Check
    this.log('\n=== Code Quality ===', 'info')
    this.checkLinting()

    // 6. Security Check
    this.log('\n=== Security ===', 'info')
    this.checkSecurity()

    // 7. Database Check
    this.log('\n=== Database ===', 'info')
    await this.checkDatabase()

    // 8. File Structure Check
    this.log('\n=== File Structure ===', 'info')
    this.checkFileStructure()

    // 9. Configuration Files Check
    this.log('\n=== Configuration ===', 'info')
    this.checkConfiguration()

    // 10. Final Summary
    this.printSummary()
  }

  checkEnvironmentVariables() {
    const requiredEnvVars = [
      'DATABASE_URL',
      'NEXTAUTH_URL',
      'NEXTAUTH_SECRET',
      'GOOGLE_CLIENT_ID',
      'GOOGLE_CLIENT_SECRET',
      'ENCRYPTION_KEY',
      'EMAIL_SERVER_HOST',
      'EMAIL_SERVER_USER',
      'EMAIL_SERVER_PASSWORD',
      'EMAIL_FROM'
    ]

    const productionEnvFile = '.env.production'

    this.check('Production environment file exists', () => {
      if (!fs.existsSync(productionEnvFile)) {
        throw new Error(`${productionEnvFile} not found. Copy from .env.production.template`)
      }
    })

    if (fs.existsSync(productionEnvFile)) {
      const envContent = fs.readFileSync(productionEnvFile, 'utf8')
      
      requiredEnvVars.forEach(envVar => {
        this.check(`${envVar} is set`, () => {
          if (!envContent.includes(`${envVar}=`) || envContent.includes(`${envVar}=your-`)) {
            throw new Error(`${envVar} is not properly configured`)
          }
        })
      })

      this.check('NEXTAUTH_URL uses HTTPS', () => {
        const match = envContent.match(/NEXTAUTH_URL=(.+)/)
        if (match && !match[1].startsWith('https://')) {
          throw new Error('NEXTAUTH_URL must use HTTPS in production')
        }
      })

      this.check('DATABASE_URL includes SSL', () => {
        const match = envContent.match(/DATABASE_URL=(.+)/)
        if (match && !match[1].includes('sslmode=require')) {
          return 'Consider adding sslmode=require for production database security'
        }
      })
    }
  }

  checkDependencies() {
    this.check('package.json exists', () => {
      if (!fs.existsSync('package.json')) {
        throw new Error('package.json not found')
      }
    })

    this.check('node_modules exists', () => {
      if (!fs.existsSync('node_modules')) {
        throw new Error('Dependencies not installed. Run: pnpm install')
      }
    })

    this.check('No security vulnerabilities', () => {
      try {
        execSync('pnpm audit --audit-level moderate', { stdio: 'pipe' })
      } catch (error) {
        if (error.status === 1) {
          return 'Security vulnerabilities found. Run: pnpm audit --fix'
        }
      }
    })
  }

  async checkBuildProcess() {
    this.check('TypeScript compilation', () => {
      try {
        execSync('pnpm run typecheck', { stdio: 'pipe' })
      } catch (error) {
        throw new Error('TypeScript compilation failed. Fix type errors first.')
      }
    })

    this.check('Next.js build', () => {
      try {
        this.log('Building application (this may take a moment)...', 'info')
        execSync('pnpm run build', { stdio: 'pipe' })
      } catch (error) {
        throw new Error('Build failed. Check build output for errors.')
      }
    })

    this.check('Build output exists', () => {
      if (!fs.existsSync('.next')) {
        throw new Error('.next directory not found after build')
      }
    })
  }

  checkTypeScript() {
    this.check('TypeScript configuration', () => {
      if (!fs.existsSync('tsconfig.json')) {
        throw new Error('tsconfig.json not found')
      }
    })

    this.check('Type checking passes', () => {
      try {
        execSync('pnpm run typecheck', { stdio: 'pipe' })
      } catch (error) {
        throw new Error('Type checking failed')
      }
    })
  }

  checkLinting() {
    this.check('ESLint configuration', () => {
      if (!fs.existsSync('.eslintrc.json') && !fs.existsSync('eslint.config.js')) {
        return 'ESLint configuration not found'
      }
    })

    this.check('Linting passes', () => {
      try {
        execSync('pnpm run lint', { stdio: 'pipe' })
      } catch (error) {
        if (error.status === 1) {
          return 'Linting issues found. Run: pnpm run lint --fix'
        }
        throw error
      }
    })
  }

  checkSecurity() {
    this.check('Security headers middleware', () => {
      const middlewareFile = 'middleware.ts'
      if (!fs.existsSync(middlewareFile)) {
        throw new Error('middleware.ts not found')
      }
      
      const content = fs.readFileSync(middlewareFile, 'utf8')
      const requiredHeaders = [
        'X-Content-Type-Options',
        'X-Frame-Options',
        'X-XSS-Protection'
      ]
      
      requiredHeaders.forEach(header => {
        if (!content.includes(header)) {
          throw new Error(`Security header ${header} not found in middleware`)
        }
      })
    })

    this.check('Authentication configuration', () => {
      const authFile = 'src/app/api/auth/[...nextauth]/route.ts'
      if (!fs.existsSync(authFile)) {
        throw new Error('NextAuth route file not found')
      }
    })

    this.check('No sensitive files in git', () => {
      const sensitiveFiles = ['.env', '.env.local', '.env.production']
      const gitignore = fs.existsSync('.gitignore') ? 
        fs.readFileSync('.gitignore', 'utf8') : ''
      
      sensitiveFiles.forEach(file => {
        if (fs.existsSync(file) && !gitignore.includes(file)) {
          throw new Error(`${file} should be in .gitignore`)
        }
      })
    })
  }

  async checkDatabase() {
    this.check('Prisma schema exists', () => {
      if (!fs.existsSync('prisma/schema.prisma')) {
        throw new Error('Prisma schema not found')
      }
    })

    this.check('Prisma client generated', () => {
      if (!fs.existsSync('node_modules/.prisma/client')) {
        throw new Error('Prisma client not generated. Run: pnpm prisma generate')
      }
    })

    // Note: We can't easily test database connection without credentials
    // This would need to be done separately with actual environment
  }

  checkFileStructure() {
    const requiredDirectories = [
      'src/app',
      'src/lib',
      'src/components',
      'prisma'
    ]

    requiredDirectories.forEach(dir => {
      this.check(`${dir} directory exists`, () => {
        if (!fs.existsSync(dir)) {
          throw new Error(`Required directory ${dir} not found`)
        }
      })
    })

    const requiredFiles = [
      'src/app/layout.tsx',
      'src/lib/prisma.ts',
      'middleware.ts',
      'package.json',
      'tsconfig.json'
    ]

    requiredFiles.forEach(file => {
      this.check(`${file} exists`, () => {
        if (!fs.existsSync(file)) {
          throw new Error(`Required file ${file} not found`)
        }
      })
    })
  }

  checkConfiguration() {
    this.check('Next.js configuration', () => {
      if (fs.existsSync('next.config.js') || fs.existsSync('next.config.mjs')) {
        // Check if configuration looks reasonable
        return 'Next.js configuration found'
      }
      return 'No Next.js configuration file (using defaults)'
    })

    this.check('Deployment checklist exists', () => {
      if (!fs.existsSync('DEPLOYMENT-CHECKLIST.md')) {
        return 'DEPLOYMENT-CHECKLIST.md not found'
      }
    })

    this.check('Health check endpoint', () => {
      if (!fs.existsSync('src/app/api/health/route.ts')) {
        return 'Health check endpoint not found'
      }
    })
  }

  printSummary() {
    console.log('\n' + '='.repeat(50))
    console.log('📊 PRODUCTION READINESS SUMMARY')
    console.log('='.repeat(50))
    
    const successRate = Math.round((this.passed / this.total) * 100)
    
    this.log(`Tests Passed: ${this.passed}/${this.total} (${successRate}%)`, 'info')
    
    if (this.warnings.length > 0) {
      this.log(`Warnings: ${this.warnings.length}`, 'warning')
      this.warnings.forEach(warning => {
        this.log(`  • ${warning}`, 'warning')
      })
    }
    
    if (this.errors.length > 0) {
      this.log(`Errors: ${this.errors.length}`, 'error')
      this.errors.forEach(error => {
        this.log(`  • ${error}`, 'error')
      })
    }
    
    console.log('\n' + '='.repeat(50))
    
    if (this.errors.length === 0) {
      this.log('🎉 PRODUCTION READY! Your application passed all critical checks.', 'success')
      if (this.warnings.length > 0) {
        this.log('⚠️  Consider addressing the warnings before deployment.', 'warning')
      }
      console.log('\nNext steps:')
      console.log('1. Review DEPLOYMENT-CHECKLIST.md')
      console.log('2. Set up production environment variables')
      console.log('3. Deploy to your production environment')
      console.log('4. Run post-deployment verification')
    } else {
      this.log('❌ NOT READY FOR PRODUCTION. Please fix the errors above.', 'error')
      process.exit(1)
    }
  }
}

// Run the checker
const checker = new ProductionReadinessChecker()
checker.run().catch(error => {
  console.error('❌ Production readiness check failed:', error)
  process.exit(1)
})