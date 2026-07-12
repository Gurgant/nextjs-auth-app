#!/usr/bin/env tsx

import { PrismaClient } from "../src/lib/types/prisma";

const prisma = new PrismaClient();

async function migrateAllUsers() {
  console.log("🔄 Starting user metadata migration...");

  try {
    // Get all users with their accounts
    const users = await prisma.user.findMany({
      include: {
        accounts: {
          select: {
            provider: true,
            type: true,
          },
        },
      },
    });

    console.log(`📊 Found ${users.length} users to migrate`);

    let migratedCount = 0;
    let skippedCount = 0;

    for (const user of users) {
      const hasGoogleAccount = user.accounts.some(
        (account: any) => account.provider === "google",
      );
      const hasPassword = !!user.password;
      const hasEmailAccount = hasPassword;

      // Determine primary auth method
      let primaryAuthMethod = null;
      if (hasGoogleAccount && hasPassword) {
        primaryAuthMethod = user.primaryAuthMethod || "google";
      } else if (hasGoogleAccount) {
        primaryAuthMethod = "google";
      } else if (hasPassword) {
        primaryAuthMethod = "email";
      }

      // Check if migration is needed
      const needsMigration =
        user.hasGoogleAccount !== hasGoogleAccount ||
        user.hasEmailAccount !== hasEmailAccount ||
        user.primaryAuthMethod !== primaryAuthMethod ||
        (user.password && !user.passwordSetAt) ||
        (user.password && !user.lastPasswordChange);

      if (needsMigration) {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            hasGoogleAccount,
            hasEmailAccount,
            primaryAuthMethod,
            passwordSetAt:
              user.password && !user.passwordSetAt
                ? user.createdAt
                : user.passwordSetAt,
            lastPasswordChange:
              user.password && !user.lastPasswordChange
                ? user.createdAt
                : user.lastPasswordChange,
            lastLoginAt: user.lastLoginAt || new Date(),
          },
        });

        console.log(`✅ Migrated user: ${user.email}`);
        console.log(`   - Google Account: ${hasGoogleAccount}`);
        console.log(`   - Email Account: ${hasEmailAccount}`);
        console.log(`   - Primary Method: ${primaryAuthMethod}`);

        migratedCount++;
      } else {
        console.log(`⏭️  Skipped user: ${user.email} (already up to date)`);
        skippedCount++;
      }
    }

    console.log("\n🎉 Migration completed!");
    console.log(`   - Migrated: ${migratedCount} users`);
    console.log(`   - Skipped: ${skippedCount} users`);
    console.log(`   - Total: ${users.length} users`);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run migration
migrateAllUsers();
