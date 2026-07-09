import { PaginatedResult, PaginationOptions, QueryOptions } from "../types";

export interface IRepository<T, ID = string> {
  findById(id: ID): Promise<T | null>;
  findOne(where: Partial<T>): Promise<T | null>;
  findAll(options?: QueryOptions<T>): Promise<T[]>;
  findPaginated(
    options?: PaginationOptions & QueryOptions<T>,
  ): Promise<PaginatedResult<T>>;
  create(data: Partial<T>): Promise<T>;
  createMany(data: Partial<T>[]): Promise<T[]>;
  update(id: ID, data: Partial<T>): Promise<T>;
  updateMany(where: Partial<T>, data: Partial<T>): Promise<number>;
  delete(id: ID): Promise<boolean>;
  deleteMany(where: Partial<T>): Promise<number>;
  exists(id: ID): Promise<boolean>;
  count(where?: Partial<T>): Promise<number>;
}
