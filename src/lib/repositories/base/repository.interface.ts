export interface IRepository<T, ID = string> {
  findById(id: ID): Promise<T | null>;
  update(id: ID, data: Partial<T>): Promise<T>;
  delete(id: ID): Promise<boolean>;
}
