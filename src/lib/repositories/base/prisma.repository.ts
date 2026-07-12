import { PrismaClient } from "@/generated/prisma";
import { IRepository } from "./repository.interface";
import { PaginatedResult, PaginationOptions, QueryOptions } from "../types";

/**
 * Type for Prisma transaction client
 */
export type PrismaTransactionClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

/**
 * Base type for Prisma model delegates
 */
export type PrismaModelDelegate = {
  findUnique: (args: any) => Promise<any>;
  findFirst: (args: any) => Promise<any>;
  findMany: (args: any) => Promise<any[]>;
  create: (args: any) => Promise<any>;
  createMany: (args: any) => Promise<any>;
  update: (args: any) => Promise<any>;
  delete: (args: any) => Promise<any>;
  count: (args: any) => Promise<number>;
  upsert: (args: any) => Promise<any>;
  updateMany: (args: any) => Promise<any>;
  deleteMany: (args: any) => Promise<any>;
};

export abstract class PrismaRepository<T, ID = string>
  implements IRepository<T, ID>
{
  constructor(protected readonly prisma: PrismaClient) {}

  abstract get model(): PrismaModelDelegate;

  async findById(id: ID): Promise<T | null> {
    return await this.model.findUnique({
      where: { id },
    });
  }

  async findOne(where: Partial<T>): Promise<T | null> {
    return await this.model.findFirst({
      where,
    });
  }

  async findAll(options?: QueryOptions<T>): Promise<T[]> {
    return await this.model.findMany({
      where: options?.where,
      include: options?.include,
      orderBy: options?.orderBy,
      skip: options?.skip,
      take: options?.take,
    });
  }

  async findPaginated(
    options?: PaginationOptions & QueryOptions<T>,
  ): Promise<PaginatedResult<T>> {
    const page = options?.page || 1;
    const limit = options?.limit || 10;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.model.findMany({
        where: options?.where,
        include: options?.include,
        orderBy: options?.orderBy || { createdAt: "desc" },
        skip,
        take: limit,
      }),
      this.model.count({
        where: options?.where,
      }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async create(data: Partial<T>): Promise<T> {
    return await this.model.create({
      data,
    });
  }

  async createMany(data: Partial<T>[]): Promise<T[]> {
    const result = await this.model.createMany({
      data,
      skipDuplicates: true,
    });

    return await this.model.findMany({
      orderBy: { createdAt: "desc" },
      take: result.count,
    });
  }

  async update(id: ID, data: Partial<T>): Promise<T> {
    return await this.model.update({
      where: { id },
      data,
    });
  }

  async updateMany(where: Partial<T>, data: Partial<T>): Promise<number> {
    const result = await this.model.updateMany({
      where,
      data,
    });
    return result.count;
  }

  async delete(id: ID): Promise<boolean> {
    try {
      await this.model.delete({
        where: { id },
      });
      return true;
    } catch {
      return false;
    }
  }

  async deleteMany(where: Partial<T>): Promise<number> {
    const result = await this.model.deleteMany({
      where,
    });
    return result.count;
  }

  async exists(id: ID): Promise<boolean> {
    const count = await this.model.count({
      where: { id },
    });
    return count > 0;
  }

  async count(where?: Partial<T>): Promise<number> {
    return await this.model.count({
      where,
    });
  }

  protected async transaction<R>(
    fn: (tx: PrismaTransactionClient) => Promise<R>,
  ): Promise<R> {
    return await this.prisma.$transaction(fn);
  }
}
