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

  // Global configuration
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
    },
    rules: {
      // TypeScript
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_|^error$",
          ignoreRestSiblings: true,
          destructuredArrayIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      // No explicit `any` is left in src or scripts, so a new one is an
      // error (tests and config files are exempt, see below).
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/ban-ts-comment": "error",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/explicit-module-boundary-types": "off",

      // Import
      "import/no-anonymous-default-export": "off",

      // React
      "react/jsx-key": "error",
      "react/no-unescaped-entities": "error",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      // Next.js
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
      // Disable React hooks rules for E2E tests (Playwright fixtures use 'use' parameter names)
      "react-hooks/rules-of-hooks": "off",
      "react-hooks/exhaustive-deps": "off",
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
