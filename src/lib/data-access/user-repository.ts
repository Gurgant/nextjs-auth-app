import { UserRepository } from "@/lib/repositories/user/user.repository";
import { prisma } from "@/lib/prisma";
import type { UserWithAccountDetails } from "@/lib/repositories/user/user.repository.interface";

// Create a singleton instance for the repository
let userRepository: UserRepository | null = null;

function getUserRepository(): UserRepository {
  if (!userRepository) {
    userRepository = new UserRepository(prisma);
  }
  return userRepository;
}

/**
 * Optimized function to get user account details in a single database query
 * This reduces the number of database roundtrips and improves performance
 */
export async function getUserWithAccountDetails(
  userId: string,
): Promise<UserWithAccountDetails | null> {
  const repository = getUserRepository();
  return await repository.findByIdWithAccountDetails(userId);
}

/**
 * Get user with basic account information (cached version)
 */
export async function getUserAccountInfo(
  userId: string,
): Promise<UserWithAccountDetails | null> {
  // This function can be enhanced with caching mechanisms if needed
  return await getUserWithAccountDetails(userId);
}
