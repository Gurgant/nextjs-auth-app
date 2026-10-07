import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import CryptoJS from "crypto-js";
import { PrismaClient, type Role } from "../../src/generated/prisma/index";
import { requireEncryptionKey } from "../../src/lib/env-rules";
import { uniqueEmail } from "./app";
import { assertNotDevelopmentDatabase, resolveE2EDatabaseUrl } from "./test-db";

/**
 * Direct database access for specs whose subject is a change made in the
 * database behind an open session (a role edit, a deleted account), and for
 * specs that change a user: they create a user of their own instead of
 * touching the seeded ones, which other specs sign in with at the same time.
 * Creating a user this way spends nothing from the registration budget.
 *
 * Same database as the global setup and the dev server; never the
 * development database (see ./test-db.ts).
 */
export function openTestDatabase(): PrismaClient {
  const url = resolveE2EDatabaseUrl();
  assertNotDevelopmentDatabase(url);
  return new PrismaClient({ datasources: { db: { url } } });
}

export interface OwnUser {
  id: string;
  email: string;
  password: string;
  name: string;
  role: Role;
}

/**
 * A verified user without 2FA and its credentials account, like the ones
 * e2e/global-setup.ts seeds, under an address no other test uses. With
 * `verified: false` the address is not verified.
 */
export async function createTestUser(
  prisma: PrismaClient,
  options: { role?: Role; verified?: boolean } = {},
): Promise<OwnUser> {
  const email = uniqueEmail("own");
  const password = "OwnUser123!";
  const name = "Own Test User";
  const role = options.role ?? "USER";

  const user = await prisma.user.create({
    data: {
      email,
      name,
      password: await bcrypt.hash(password, 12),
      emailVerified: options.verified === false ? null : new Date(),
      role,
      twoFactorEnabled: false,
    },
  });
  await prisma.account.create({
    data: {
      userId: user.id,
      type: "credentials",
      provider: "credentials",
      providerAccountId: user.email,
    },
  });

  return { id: user.id, email, password, name, role };
}

/**
 * `text` encrypted with another key than `key`, such that `key` reads the
 * result as the empty text. A bounded search: most values of another key are
 * read that way, the others throw or give a few bytes.
 */
function unreadableWith(key: string, text: string): string {
  const anotherKey = key.split("").reverse().join("") + "-another";
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const row = CryptoJS.AES.encrypt(text, anotherKey).toString();
    let read: string | undefined;
    try {
      read = CryptoJS.AES.decrypt(row, key).toString(CryptoJS.enc.Utf8);
    } catch {
      // Not readable at all with this key: another row.
    }
    if (read === "") return row;
  }
  throw new Error("No value of another key was read as the empty text");
}

/**
 * Turns two-factor authentication on for a user of the test's own, in the
 * database: a TOTP secret and the given backup codes, both encrypted as the
 * application stores them (encrypt() in src/lib/security.ts), with the
 * ENCRYPTION_KEY that the global setup encrypts the seeded 2FA user with.
 * Enabling it through the account page would send the security alert; this
 * sends nothing.
 *
 * With `writtenWith: "another key"` the values are stored as they are after
 * ENCRYPTION_KEY was changed: encrypted with a key that is not the server's,
 * and each chosen so that the server's key reads it as the empty text, which
 * is what it reads most values of another key as.
 */
export async function enableTwoFactorInDatabase(
  prisma: PrismaClient,
  user: OwnUser,
  secrets: {
    totpSecret: string;
    backupCodes: readonly string[];
    writtenWith?: "the key of the server" | "another key";
  },
): Promise<void> {
  const key = requireEncryptionKey();
  const encrypted =
    secrets.writtenWith === "another key"
      ? (text: string) => unreadableWith(key, text)
      : (text: string) => CryptoJS.AES.encrypt(text, key).toString();

  await prisma.user.update({
    where: { id: user.id },
    data: {
      twoFactorEnabled: true,
      twoFactorSecret: encrypted(secrets.totpSecret),
      backupCodes: secrets.backupCodes.map(encrypted),
    },
  });
}

/**
 * The token of a verification link for `user`, stored as the app stores it
 * when it sends the e-mail (sendEmailVerification in
 * src/lib/actions/advanced-auth.ts): one unused row, valid for 30 minutes.
 * No e-mail is sent, and nothing is spent from the limit on sending them.
 */
export async function createEmailVerificationToken(
  prisma: PrismaClient,
  user: OwnUser,
): Promise<string> {
  // 32 characters from the alphabet of the app's own tokens
  // (generateSecureToken in src/lib/security.ts).
  const token = randomBytes(16).toString("hex");

  await prisma.emailVerificationToken.create({
    data: {
      token,
      userId: user.id,
      email: user.email,
      expires: new Date(Date.now() + 30 * 60 * 1000),
    },
  });

  return token;
}
