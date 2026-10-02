import bcrypt from "bcryptjs";
import { PrismaClient, type Role } from "../../src/generated/prisma/index";
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
 * e2e/global-setup.ts seeds, under an address no other test uses.
 */
export async function createTestUser(
  prisma: PrismaClient,
  options: { role?: Role } = {},
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
      emailVerified: new Date(),
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
