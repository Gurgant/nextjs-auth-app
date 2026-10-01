import { User, Account } from "@/generated/prisma";
import { IRepository } from "../base/repository.interface";

export interface CreateUserWithAccountDTO {
  email: string;
  name?: string | null;
  password?: string | null;
  emailVerified?: Date | null;
  image?: string | null;
  twoFactorEnabled?: boolean;
  twoFactorSecret?: string | null;
  provider?: string;
  providerAccountId?: string;
}

export interface UpdateUserDTO {
  name?: string | null;
  email?: string;
  emailVerified?: Date | null;
  image?: string | null;
  password?: string | null;
  twoFactorEnabled?: boolean;
  twoFactorSecret?: string | null;
  // Account-metadata columns (see prisma/schema.prisma User model)
  hasGoogleAccount?: boolean;
  hasEmailAccount?: boolean;
  lastLoginMethod?: string | null;
  passwordSetAt?: Date | null;
  lastPasswordChange?: Date | null;
  lastLoginAt?: Date | null;
  requiresPasswordChange?: boolean;
}

export interface UserWithAccounts extends User {
  accounts?: Account[];
}

export interface UserWithAccountDetails extends User {
  accounts: Account[];
}

/** Temporary lockout after repeated failed sign-ins (see src/lib/auth/lockout.ts). */
export interface LockoutPolicy {
  maxAttempts: number;
  lockoutMs: number;
}

/**
 * Outcome of a credential check. Callers MUST give every non-"valid" status
 * the same generic answer, so the lock state never reveals itself.
 */
export type CredentialCheckResult =
  | { status: "valid"; user: User }
  // userId is null for an unknown email or a password-less (OAuth-only) user
  | { status: "invalid"; userId: string | null }
  | { status: "locked"; userId: string; lockedUntil: Date };

export interface FailedLoginResult {
  /** loginAttempts after this failure */
  attempts: number;
  /** the lock applied by THIS call, else null */
  lockedUntil: Date | null;
  /** true for exactly one caller: the one that locked the account */
  lockedNow: boolean;
}

export interface IUserRepository extends IRepository<User> {
  findByEmail(email: string): Promise<User | null>;
  findByEmailWithAccounts(email: string): Promise<UserWithAccounts | null>;
  findByCredentials(email: string, password: string): Promise<User | null>;
  verifyCredentials(
    email: string,
    password: string,
    now?: Date,
  ): Promise<CredentialCheckResult>;
  registerFailedLogin(
    userId: string,
    policy: LockoutPolicy,
    now?: Date,
  ): Promise<FailedLoginResult>;
  recordSuccessfulLogin(userId: string): Promise<void>;
  createWithAccount(data: CreateUserWithAccountDTO): Promise<User>;
  updateLastLogin(userId: string): Promise<void>;
  updatePassword(userId: string, hashedPassword: string): Promise<void>;
  verifyEmail(userId: string): Promise<void>;
  enableTwoFactor(userId: string, secret: string): Promise<void>;
  disableTwoFactor(userId: string): Promise<void>;
  findByProvider(
    provider: string,
    providerAccountId: string,
  ): Promise<User | null>;
  findByIdWithAccountDetails(
    userId: string,
  ): Promise<UserWithAccountDetails | null>;
}
