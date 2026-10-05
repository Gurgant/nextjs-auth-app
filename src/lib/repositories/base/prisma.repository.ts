import { PrismaClient } from "@/generated/prisma";
import { IRepository } from "./repository.interface";

/**
 * The part of a Prisma model delegate that the base repository calls
 */
// Method syntax is deliberate: methods are compared bivariantly, so a Prisma delegate stays assignable with `args: unknown`.
export type PrismaModelDelegate<T> = {
  findUnique(args: unknown): Promise<T | null>;
  delete(args: unknown): Promise<T>;
};

export abstract class PrismaRepository<T, ID = string>
  implements IRepository<T, ID>
{
  constructor(protected readonly prisma: PrismaClient) {}

  abstract get model(): PrismaModelDelegate<T>;

  async findById(id: ID): Promise<T | null> {
    return await this.model.findUnique({
      where: { id },
    });
  }

  // Each repository writes its own update: what may be written, and what a
  // write brings with it, differs by model (see UserRepository.update).
  abstract update(id: ID, data: Partial<T>): Promise<T>;

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
}
