import { PrismaClient } from '@/generated/prisma'
import { prisma } from '@/lib/prisma'
import { UserRepository } from './user/user.repository'
import { IUserRepository } from './user/user.repository.interface'

export class RepositoryProvider {
  private static instance: RepositoryProvider | null = null
  private userRepository: IUserRepository | null = null
  
  private constructor(private readonly prisma: PrismaClient) {}

  static getInstance(prismaClient?: PrismaClient): RepositoryProvider {
    if (!RepositoryProvider.instance) {
      RepositoryProvider.instance = new RepositoryProvider(prismaClient || prisma)
    }
    return RepositoryProvider.instance
  }

  static reset(): void {
    RepositoryProvider.instance = null
  }

  getUserRepository(): IUserRepository {
    if (!this.userRepository) {
      this.userRepository = new UserRepository(this.prisma)
    }
    return this.userRepository
  }

  async transaction<T>(
    fn: (repositories: RepositoryProvider) => Promise<T>
  ): Promise<T> {
    return await this.prisma.$transaction(async (tx) => {
      const transactionalProvider = new RepositoryProvider(tx as PrismaClient)
      return await fn(transactionalProvider)
    })
  }
}

export const repositories = RepositoryProvider.getInstance()

export function getRepositories(prismaClient?: PrismaClient): RepositoryProvider {
  return RepositoryProvider.getInstance(prismaClient)
}