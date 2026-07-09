# Changelog

## [v1.1.0] - 2025-08-01

### ✨ Features

- Upgraded TailwindCSS from v3.4.16 → v4.1.11
- Updated `postcss.config.js` to use `@tailwindcss/postcss`
- Migrated `globals.css` to new `@import` syntax
- Refactored styling using `@layer` instead of legacy `@apply`
- Replaced deprecated `@types/bcryptjs` with native types

### 🔧 Dependency Upgrades

- TypeScript: 5.8.3 → 5.9.2
- PostCSS: 8.4.49 → 8.5.6
- Autoprefixer: 10.4.20 → 10.4.21
- Lucide React: 0.535.0 → 0.536.0

### 🛠 Fixes

- Resolved issues with `searchParams` typing in Next.js 15
- Ensured backward compatibility with previous CSS structure

### 🧪 QA

- Build verified (dev + prod)
- Linting & TypeScript checks passing
- i18n rendering and form UX validated

---
