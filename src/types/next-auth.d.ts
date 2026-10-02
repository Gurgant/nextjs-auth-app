/**
 * Enhanced NextAuth type definitions
 * This file extends NextAuth's built-in types with application-specific properties
 */

import type { Role } from "@/lib/types/prisma";
import type { Account, Session, User } from "next-auth";
import type { JWT } from "next-auth/jwt";

declare module "next-auth" {
  /**
   * Enhanced User interface with required and optional properties
   */
  interface User {
    id: string;
    email: string;
    name?: string | null;
    image?: string | null;
    emailVerified?: Date | null;
    role: Role;
    twoFactorEnabled: boolean;
    hasGoogleAccount?: boolean;
    lastLoginAt?: Date | null;
    createdAt?: Date;
    updatedAt?: Date;
  }

  /**
   * Enhanced Session interface with properly typed user
   */
  interface Session {
    user: User;
  }

  /**
   * Enhanced Account interface for OAuth accounts
   */
  interface Account {
    userId: string;
    provider: string;
    providerAccountId: string;
    type: string;
    refresh_token?: string | null;
    access_token?: string | null;
    expires_at?: number | null;
    token_type?: string | null;
    scope?: string | null;
    id_token?: string | null;
    session_state?: string | null;
  }
}

declare module "next-auth/jwt" {
  /**
   * Enhanced JWT token interface with required properties
   */
  interface JWT {
    id: string;
    email: string;
    name?: string | null;
    image?: string | null;
    emailVerified?: Date | null;
    role: Role;
    twoFactorEnabled: boolean;
    hasGoogleAccount?: boolean;
    lastLoginAt?: Date | null;
  }
}

/**
 * Event message types for NextAuth callbacks
 */
export interface SignInEventMessage {
  user: User;
  account?: Account | null;
  profile?: unknown;
  isNewUser?: boolean;
}

export interface SignOutEventMessage {
  token: JWT;
  session?: Session | null;
}

export interface CreateUserEventMessage {
  user: User;
}

export interface LinkAccountEventMessage {
  user: User;
  account: Account;
  profile?: unknown;
}

export interface SessionEventMessage {
  token: JWT;
  session?: Session;
}

/**
 * Callback parameter types for enhanced type safety
 */
export interface JWTCallbackParams {
  token: JWT;
  user?: User;
  account?: Account | null;
  profile?: unknown;
  trigger?: "signIn" | "signUp" | "update";
  isNewUser?: boolean;
  session?: unknown;
}

export interface SessionCallbackParams {
  session: Session;
  token: JWT;
  user?: User;
}

export interface SignInCallbackParams {
  user: User;
  account: Account | null;
  profile?: unknown;
  email?: {
    verificationRequest?: boolean;
  };
  credentials?: Record<string, unknown>;
}
