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
}

export interface UserWithAccounts extends User {
  accounts?: Account[];
}

export interface UserWithAccountDetails extends User {
  accounts: Account[];
}

export interface IUserRepository extends IRepository<User> {
  findByEmail(email: string): Promise<User | null>;
  findByEmailWithAccounts(email: string): Promise<UserWithAccounts | null>;
  findByCredentials(email: string, password: string): Promise<User | null>;
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
