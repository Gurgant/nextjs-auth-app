import CryptoJS from "crypto-js";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";

// Encryption utilities for sensitive data like 2FA secrets.
// The key MUST come from the environment. There is NO usable hardcoded fallback
// in production — shipping one would make every stored 2FA secret decryptable.
function getEncryptionKey(): string {
  const key = process.env.ENCRYPTION_KEY;
  if (key && key.length >= 32) return key;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "ENCRYPTION_KEY environment variable is required (>= 32 characters) in production to encrypt 2FA secrets and backup codes.",
    );
  }
  // Dev/test only — never used for real data.
  console.warn(
    "⚠️  ENCRYPTION_KEY not set: using an insecure development fallback. Set ENCRYPTION_KEY (>= 32 chars) for anything real.",
  );
  return "dev-only-insecure-key-not-for-production-use!";
}

export function encrypt(text: string): string {
  try {
    const encrypted = CryptoJS.AES.encrypt(text, getEncryptionKey()).toString();
    return encrypted;
  } catch (error) {
    console.error("Encryption error:", error);
    throw new Error("Failed to encrypt data");
  }
}

export function decrypt(encryptedText: string): string {
  try {
    const decrypted = CryptoJS.AES.decrypt(encryptedText, getEncryptionKey());
    return decrypted.toString(CryptoJS.enc.Utf8);
  } catch (error) {
    console.error("Decryption error:", error);
    throw new Error("Failed to decrypt data");
  }
}

// Security event logging for audit trail
export interface SecurityEventData {
  userId: string;
  eventType:
    | "login"
    | "failed_login"
    | "logout"
    | "password_changed"
    | "password_reset"
    | "2fa_enabled"
    | "2fa_disabled"
    | "2fa_verified"
    | "2fa_failed"
    | "account_linked"
    | "account_unlinked"
    | "email_verified"
    | "account_created"
    | "account_deleted"
    | "profile_updated"
    | "suspicious_activity"
    | "account_locked"
    | "account_unlocked";
  details?: string;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  success?: boolean;
}

export async function logSecurityEvent(
  eventData: SecurityEventData,
): Promise<void> {
  try {
    await prisma.securityEvent.create({
      data: {
        userId: eventData.userId,
        eventType: eventData.eventType,
        details: eventData.details,
        metadata: eventData.metadata,
        ipAddress: eventData.ipAddress,
        userAgent: eventData.userAgent,
        success: eventData.success ?? true,
      },
    });
  } catch (error) {
    console.error("Failed to log security event:", error);
    // Don't throw error to avoid breaking the main flow
  }
}

// Generate secure random tokens
export function generateSecureToken(length: number = 32): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  // CSPRNG with rejection sampling to avoid modulo bias.
  const maxUnbiased = 256 - (256 % chars.length);
  let result = "";
  while (result.length < length) {
    const bytes = randomBytes(length);
    for (let i = 0; i < bytes.length && result.length < length; i++) {
      if (bytes[i] < maxUnbiased) {
        result += chars.charAt(bytes[i] % chars.length);
      }
    }
  }

  return result;
}

// Generate backup codes for 2FA recovery
export function generateBackupCodes(count: number = 8): string[] {
  const codes: string[] = [];

  for (let i = 0; i < count; i++) {
    // Generate 8-character alphanumeric codes
    const code = generateSecureToken(8).toUpperCase();
    // Format as XXXX-XXXX for better readability
    const formattedCode = `${code.slice(0, 4)}-${code.slice(4, 8)}`;
    codes.push(formattedCode);
  }

  return codes;
}

// Validate IP address format
export function isValidIP(ip: string): boolean {
  const ipv4Regex =
    /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
  return ipv4Regex.test(ip) || ipv6Regex.test(ip);
}

// Extract client IP from request headers
export function getClientIP(headers: Headers): string | undefined {
  const forwarded = headers.get("x-forwarded-for");
  const realIP = headers.get("x-real-ip");
  const clientIP = headers.get("x-client-ip");

  if (forwarded) {
    const ips = forwarded.split(",").map((ip) => ip.trim());
    const validIP = ips.find((ip) => isValidIP(ip));
    if (validIP) return validIP;
  }

  if (realIP && isValidIP(realIP)) return realIP;
  if (clientIP && isValidIP(clientIP)) return clientIP;

  return undefined;
}
