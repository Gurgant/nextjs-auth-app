import { cookies } from "next/headers";

/**
 * Gets the current locale from cookies
 * This is used in server actions where we don't have access to params
 */
export async function getCurrentLocale(): Promise<string> {
  const cookieStore = await cookies();
  return cookieStore.get("NEXT_LOCALE")?.value || "en";
}
