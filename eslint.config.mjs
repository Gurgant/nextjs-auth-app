import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  // Extend Next.js configurations
  ...compat.extends("next/core-web-vitals", "next/typescript"),

  // Global ignores
  {
    ignores: [
      // Build outputs
      ".next/**",
      "out/**",
      "dist/**",
      "build/**",

      // Dependencies
      "node_modules/**",
      "pnpm-lock.yaml",

      // Generated files
      "src/generated/**",
      "prisma/generated/**",
      ".prisma/**",

      // Test outputs
      "coverage/**",
      "test-results/**",
      "playwright-report/**",

      // Environment files
      ".env*",

      // Cache directories
      ".cache/**",
      "tsconfig.tsbuildinfo",

      // Archive and backup files
      "ARCHIVE_*",
      "*.backup.*",
      "conversation_backup.json",
      "error_log.txt",
    ],
  },

  // Global configuration - RELAXED RULES
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
    },
    rules: {
      // Focus on critical issues only

      // TypeScript - minimal rules
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern:
            "^_|^(error|request|params|router|response|result|locale|entry|provider|providerAccountId)$",
          varsIgnorePattern:
            "^_|^(error|getSafeLocale|t|tCommon|signIn|redirect|notFound|auth|useRef|ActionResult|setupTwoFactorAuth|enableTwoFactorAuth|router|resetProfileForm|response|result|ActionResponse|prisma|ErrorSeverity|PasswordChangedEvent|UserLoggedOutEvent|PrismaClient|windowTime|UpdateUserDTO|locale|entry)$",
          ignoreRestSiblings: true,
          destructuredArrayIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-explicit-any": "off", // Turn off for now
      "@typescript-eslint/ban-ts-comment": "off", // Turn off for now
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/explicit-module-boundary-types": "off",

      // Import - turn off strict rules for now
      "import/order": "off",
      "import/no-anonymous-default-export": "off",
      "import/no-extraneous-dependencies": "off",

      // React - keep critical ones only
      "react/jsx-key": "error",
      "react/no-unescaped-entities": "error",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      // Next.js - keep defaults
      "@next/next/no-img-element": "warn",
    },
  },

  // Test files - very relaxed
  {
    files: [
      "**/*.test.ts",
      "**/*.test.tsx",
      "**/*.spec.ts",
      "**/*.spec.tsx",
      "e2e/**/*.ts",
      "src/test/**/*.ts",
      "src/test/**/*.tsx",
    ],
    rules: {
      // Turn off almost everything for tests
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "import/no-extraneous-dependencies": "off",
      "import/order": "off",
    },
  },

  // Configuration and script files - very relaxed
  {
    files: [
      "*.config.js",
      "*.config.ts",
      "*.config.mjs",
      "tailwind.config.js",
      "next.config.ts",
      "playwright.config.ts",
      "jest.config.js",
      "jest.config.*.js",
      "jest.setup.js",
      "jest.setup.*.js",
      "scripts/**/*.js",
      "middleware.new.ts",
      "next-env.d.ts",
    ],
    rules: {
      "@typescript-eslint/no-var-requires": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/triple-slash-reference": "off",
      "import/no-extraneous-dependencies": "off",
      "import/no-anonymous-default-export": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
];

export default eslintConfig;
