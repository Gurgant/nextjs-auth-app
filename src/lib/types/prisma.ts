// Export Prisma types from generated client
export type {
  User,
  Account,
  Session,
  Role,
  SecurityEvent,
  PasswordResetToken,
  EmailVerificationToken,
} from "@/generated/prisma";
export { PrismaClient } from "@/generated/prisma";
export { Role as RoleEnum } from "@/generated/prisma";
