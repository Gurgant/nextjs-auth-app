import { User } from "@/generated/prisma";
import { PrismaClient } from "@/generated/prisma";
import bcrypt from "bcryptjs";
import { PrismaRepository } from "../base/prisma.repository";
import {
  IUserRepository,
  CreateUserWithAccountDTO,
  UpdateUserDTO,
  UserWithAccounts,
  UserWithAccountDetails,
} from "./user.repository.interface";

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

  async updateLastLogin(userId: string): Promise<void> {
    await this.model.update({
      where: { id: userId },
      data: {
        lastLoginAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }

  async updatePassword(userId: string, hashedPassword: string): Promise<void> {
    await this.model.update({
      where: { id: userId },
      data: { password: hashedPassword },
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

  async update(id: string, data: UpdateUserDTO): Promise<User> {
    const updateData: any = { ...data };

    if (data.password) {
      updateData.password = await bcrypt.hash(data.password, 12);
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
