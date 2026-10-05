import { PrismaClient } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { UserRepository } from "./user/user.repository";
import { IUserRepository } from "./user/user.repository.interface";

export class RepositoryProvider {
  private static instance: RepositoryProvider | null = null;
  private userRepository: IUserRepository | null = null;

  private constructor(private readonly prisma: PrismaClient) {}

  static getInstance(prismaClient?: PrismaClient): RepositoryProvider {
    if (!RepositoryProvider.instance) {
      RepositoryProvider.instance = new RepositoryProvider(
        prismaClient || prisma,
      );
    }
    return RepositoryProvider.instance;
  }

  getUserRepository(): IUserRepository {
    if (!this.userRepository) {
      this.userRepository = new UserRepository(this.prisma);
    }
    return this.userRepository;
  }
}

export const repositories = RepositoryProvider.getInstance();
