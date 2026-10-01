/**
 * Demo-user seed for local development.
 *
 * Creates the three demo accounts documented in the README (idempotent —
 * safe to run repeatedly):
 *
 *   test@example.com  / Test123!   → USER
 *   pro@example.com   / Pro123!    → PRO_USER
 *   admin@example.com / Admin123!  → ADMIN
 *
 * Usage: pnpm db:seed   (runs against DATABASE_URL from your .env)
 */
import * as dotenv from "dotenv";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/index";

// Load .env without overriding an explicitly-exported DATABASE_URL.
dotenv.config();

const prisma = new PrismaClient();

const DEMO_USERS = [
  {
    email: "test@example.com",
    name: "Test User",
    password: "Test123!",
    role: "USER" as const,
  },
  {
    email: "pro@example.com",
    name: "Pro User",
    password: "Pro123!",
    role: "PRO_USER" as const,
  },
  {
    email: "admin@example.com",
    name: "Admin User",
    password: "Admin123!",
    role: "ADMIN" as const,
  },
];

async function main() {
  for (const { email, name, password, role } of DEMO_USERS) {
    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.upsert({
      where: { email },
      // Re-seeding also clears a lockout left by failed sign-ins.
      update: {
        name,
        role,
        password: passwordHash,
        emailVerified: new Date(),
        loginAttempts: 0,
        lockedUntil: null,
      },
      create: {
        email,
        name,
        role,
        password: passwordHash,
        emailVerified: new Date(),
        hasEmailAccount: true,
      },
    });

    // Credentials Account row, as the app creates on registration.
    const existingAccount = await prisma.account.findFirst({
      where: { userId: user.id, provider: "credentials" },
    });
    if (!existingAccount) {
      await prisma.account.create({
        data: {
          userId: user.id,
          type: "credentials",
          provider: "credentials",
          providerAccountId: email,
        },
      });
    }

    console.log(`✔ ${email} (${role})`);
  }

  console.log(
    "\nDemo users ready — sign in with e.g. test@example.com / Test123!",
  );
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
