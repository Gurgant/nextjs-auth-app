import { Role } from "@/lib/types/prisma";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email?: string | null;
      name?: string | null;
      image?: string | null;
      emailVerified?: Date | null;
      twoFactorEnabled?: boolean;
      role?: Role;
    };
  }

  interface User {
    id: string;
    email?: string | null;
    name?: string | null;
    image?: string | null;
    emailVerified?: Date | null;
    twoFactorEnabled?: boolean;
    role?: Role;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    email?: string | null;
    name?: string | null;
    image?: string | null;
    emailVerified?: Date | null;
    twoFactorEnabled?: boolean;
    role?: Role;
  }
}
