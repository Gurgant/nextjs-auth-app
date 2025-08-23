export interface PaginationOptions {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface QueryOptions<T = any> {
  where?: Partial<T>;
  include?: Record<string, boolean>;
  orderBy?: Record<string, "asc" | "desc">;
  skip?: number;
  take?: number;
}

export type CreateDTO<T> = Omit<T, "id" | "createdAt" | "updatedAt">;
export type UpdateDTO<T> = Partial<CreateDTO<T>>;
