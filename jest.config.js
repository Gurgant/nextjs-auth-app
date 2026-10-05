const nextJest = require("next/jest");

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: "./",
});

// Add any custom config to be passed to Jest
const customJestConfig = {
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  testEnvironment: "jest-environment-jsdom",
  testPathIgnorePatterns: [
    "/node_modules/",
    "/.next/",
    "/e2e/",
    "/test-temp/",
    "/test-isolated/",
    "/playwright-report/",
    "/test-results/",
  ],
  moduleDirectories: ["node_modules", "<rootDir>/"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  collectCoverageFrom: [
    "src/**/*.{js,jsx,ts,tsx}",
    "!src/**/*.d.ts",
    "!src/**/index.ts",
    "!src/middleware.ts",
    "!src/app/**",
    // The generated Prisma client is not code of this repository.
    "!src/generated/**",
  ],
};

// Two packages of Auth.js are ES modules that the integration test loads as
// they are (the Prisma adapter, and the function of @auth/core that decides
// whether an account is linked). next/jest transforms nothing under
// node_modules except the packages it names in two generated patterns, one for
// a hoisted layout and one for pnpm's; these packages are added to both, for
// the tests only (next.config.ts and the build are not touched).
const TRANSFORMED_ESM_PACKAGES = ["@auth/core", "@auth/prisma-adapter"];
const HOISTED = "/node_modules/(?!.pnpm)(?!(";
const PNPM = "/node_modules/.pnpm/(?!(";

function transformEsmPackages(config) {
  const byName = TRANSFORMED_ESM_PACKAGES.join("|");
  // pnpm names the directory "@auth+core@<version>". "[+]" and not "\+":
  // Jest rewrites backslashes in these patterns on Windows.
  const byPnpmDirectory = TRANSFORMED_ESM_PACKAGES.map((name) =>
    name.replace("/", "[+]"),
  ).join("|");
  let extended = 0;
  const transformIgnorePatterns = config.transformIgnorePatterns.map(
    (pattern) => {
      if (pattern.startsWith(HOISTED)) {
        extended++;
        return `${HOISTED}${byName}|${pattern.slice(HOISTED.length)}`;
      }
      if (pattern.startsWith(PNPM)) {
        extended++;
        return `${PNPM}${byPnpmDirectory}|${pattern.slice(PNPM.length)}`;
      }
      return pattern;
    },
  );
  // A Next.js upgrade that changes the patterns must fail here, not leave the
  // packages untransformed.
  if (extended !== 2) {
    throw new Error(
      "next/jest no longer generates the two node_modules patterns that jest.config.js extends",
    );
  }
  return { ...config, transformIgnorePatterns };
}

// next/jest returns an async function (it loads the Next.js config); so does this file.
const createConfig = createJestConfig(customJestConfig);
module.exports = async () => transformEsmPackages(await createConfig());
