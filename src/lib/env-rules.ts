/**
 * Shared, side-effect-free rules for secrets read from the environment.
 *
 * Used both by the boot-time validator (src/lib/env.ts) and at the point of
 * use (src/lib/security.ts, e2e/global-setup.ts), so every consumer enforces
 * exactly the same rule. Error messages name the variable, never its value.
 */

/** ENCRYPTION_KEY: exactly 64 hex characters (`openssl rand -hex 32`). */
export const ENCRYPTION_KEY_PATTERN = /^[0-9a-fA-F]{64}$/;

export const ENCRYPTION_KEY_HELP =
  "ENCRYPTION_KEY: must be a 64-character hex string (generate one with `openssl rand -hex 32`)";

/**
 * Values that are published in this repository (.env.example, the CI
 * workflow, the Jest setup). They are fine for local development and tests,
 * but anyone can read them, so production refuses them.
 */
const PUBLIC_PLACEHOLDERS = new Set(
  [
    "0".repeat(64), // .env.example ENCRYPTION_KEY
    "0123456789abcdef".repeat(4), // CI + Jest ENCRYPTION_KEY
    "generate-with-openssl-rand-base64-32-xxxx", // .env.example AUTH_SECRET
    "ci-only-secret-0123456789abcdefghijklmnopqrstuv", // CI AUTH_SECRET
    "your-resend-api-key", // older .env.example RESEND_API_KEY
    "re_...", // .env.example RESEND_API_KEY (commented out)
  ].map((v) => v.toLowerCase()),
);

/** True when `value` is one of the example/CI values shipped in this repo. */
export function isPublicPlaceholder(value: string | undefined): boolean {
  return !!value && PUBLIC_PLACEHOLDERS.has(value.trim().toLowerCase());
}

/**
 * Returns ENCRYPTION_KEY or throws. There is deliberately no fallback in any
 * environment: a hardcoded key would make every stored 2FA secret decryptable.
 */
export function requireEncryptionKey(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const key = env.ENCRYPTION_KEY;
  if (!key || !ENCRYPTION_KEY_PATTERN.test(key)) {
    throw new Error(ENCRYPTION_KEY_HELP);
  }
  if (env.NODE_ENV === "production" && isPublicPlaceholder(key)) {
    throw new Error(
      "ENCRYPTION_KEY: the example/CI value is public — generate a real key for production",
    );
  }
  return key;
}
