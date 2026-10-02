import { User } from "@/generated/prisma";

import bcrypt from "bcryptjs";
import { getBcryptRounds } from "@/lib/utils/bcrypt.config";
import { PrismaRepository } from "../base/prisma.repository";
import {
  IUserRepository,
  CreateUserWithAccountDTO,
  CredentialCheckResult,
  FailedLoginResult,
  LockoutPolicy,
  UpdateUserDTO,
  UserWithAccounts,
  UserWithAccountDetails,
} from "./user.repository.interface";

// Compared against when the email is unknown or has no password, so every
// failed check costs one bcrypt comparison (no timing oracle for existence).
let dummyHashPromise: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  dummyHashPromise ??= bcrypt.hash(
    "timing-equalizer-not-a-password",
    getBcryptRounds(),
  );
  return dummyHashPromise;
}

export class UserRepository
  extends PrismaRepository<User>
  implements IUserRepository
{
  get model() {
    return this.prisma.user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return await this.model.findUnique({
      where: { email },
    });
  }

  async findByEmailWithAccounts(
    email: string,
  ): Promise<UserWithAccounts | null> {
    return await this.model.findUnique({
      where: { email },
      include: { accounts: true },
    });
  }

  async findByCredentials(
    email: string,
    password: string,
  ): Promise<User | null> {
    const user = await this.findByEmail(email);

    if (!user || !user.password) {
      return null;
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return null;
    }

    return user;
  }

  async createWithAccount(data: CreateUserWithAccountDTO): Promise<User> {
    const {
      email,
      name,
      password,
      emailVerified,
      image,
      twoFactorEnabled,
      twoFactorSecret,
      provider = "credentials",
      providerAccountId,
    } = data;

    return await this.prisma.user.create({
      data: {
        email,
        name,
        password,
        emailVerified,
        image,
        twoFactorEnabled: twoFactorEnabled || false,
        twoFactorSecret,
        accounts: {
          create: {
            type: provider === "credentials" ? "credentials" : "oauth",
            provider,
            providerAccountId: providerAccountId || email,
          },
        },
      },
    });
  }

  async verifyCredentials(
    email: string,
    password: string,
    now: Date = new Date(),
  ): Promise<CredentialCheckResult> {
    const user = await this.findByEmail(email);
    const passwordOk = await bcrypt.compare(
      password,
      user?.password ?? (await getDummyHash()),
    );

    if (!user || !user.password) return { status: "invalid", userId: null };
    // An active lock refuses even the correct password.
    if (user.lockedUntil && user.lockedUntil > now) {
      return {
        status: "locked",
        userId: user.id,
        lockedUntil: user.lockedUntil,
      };
    }
    return passwordOk
      ? { status: "valid", user }
      : { status: "invalid", userId: user.id };
  }

  /**
   * Count one failed sign-in; lock the account for `policy.lockoutMs` once the
   * count reaches `policy.maxAttempts`. Safe under concurrency: the increment
   * is a single UPDATE, and the conditional lock lets exactly one caller win
   * (it alone gets lockedNow). An active lock is never extended.
   */
  async registerFailedLogin(
    userId: string,
    policy: LockoutPolicy,
    now: Date = new Date(),
  ): Promise<FailedLoginResult> {
    // An expired lock starts a fresh count.
    await this.model.updateMany({
      where: { id: userId, lockedUntil: { lte: now } },
      data: { loginAttempts: 0, lockedUntil: null },
    });

    const { loginAttempts } = await this.model.update({
      where: { id: userId },
      data: { loginAttempts: { increment: 1 } },
      select: { loginAttempts: true },
    });
    if (loginAttempts < policy.maxAttempts) {
      return { attempts: loginAttempts, lockedUntil: null, lockedNow: false };
    }

    const lockedUntil = new Date(now.getTime() + policy.lockoutMs);
    const { count } = await this.model.updateMany({
      where: {
        id: userId,
        OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }],
      },
      data: { lockedUntil },
    });
    return count === 1
      ? { attempts: loginAttempts, lockedUntil, lockedNow: true }
      : { attempts: loginAttempts, lockedUntil: null, lockedNow: false };
  }

  async recordSuccessfulLogin(userId: string): Promise<void> {
    await this.model.update({
      where: { id: userId },
      data: { lastLoginAt: new Date(), loginAttempts: 0, lockedUntil: null },
    });
  }

  async updateLastLogin(userId: string): Promise<void> {
    await this.model.update({
      where: { id: userId },
      data: {
        lastLoginAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }

  async updatePassword(
    userId: string,
    hashedPassword: string,
    options?: { revokeSessions?: boolean },
  ): Promise<void> {
    // One UPDATE: "password changed" and "sessions ended" cannot diverge.
    await this.model.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
        ...(options?.revokeSessions
          ? { sessionVersion: { increment: 1 } }
          : {}),
      },
    });
  }

  async verifyEmail(userId: string): Promise<void> {
    await this.model.update({
      where: { id: userId },
      data: { emailVerified: new Date() },
    });
  }

  async enableTwoFactor(userId: string, secret: string): Promise<void> {
    await this.model.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: true,
        twoFactorSecret: secret,
      },
    });
  }

  async disableTwoFactor(userId: string): Promise<void> {
    await this.model.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
      },
    });
  }

  async findByProvider(
    provider: string,
    providerAccountId: string,
  ): Promise<User | null> {
    const account = await this.prisma.account.findFirst({
      where: {
        provider,
        providerAccountId,
      },
      include: {
        user: true,
      },
    });

    return account?.user || null;
  }

  /**
   * Update a user. `data.password`, when given, is PLAIN TEXT: it is hashed
   * here at the configured cost (`BCRYPT_ROUNDS`). To store a hash that
   * already exists, use `updatePassword()`; passing a hash here would hash
   * it a second time.
   */
  async update(id: string, data: UpdateUserDTO): Promise<User> {
    const updateData: UpdateUserDTO = { ...data };

    if (data.password) {
      updateData.password = await bcrypt.hash(data.password, getBcryptRounds());
    }

    return await this.model.update({
      where: { id },
      data: updateData,
    });
  }

  async findByIdWithAccountDetails(
    userId: string,
  ): Promise<UserWithAccountDetails | null> {
    return (await this.model.findUnique({
      where: { id: userId },
      include: {
        accounts: {
          select: {
            id: true,
            provider: true,
            providerAccountId: true,
            type: true,
          },
        },
      },
    })) as UserWithAccountDetails | null;
  }
}
