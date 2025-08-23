import CryptoJS from "crypto-js";
import { prisma } from "@/lib/prisma";

// Encryption utilities for sensitive data like 2FA secrets
const ENCRYPTION_KEY =
  process.env.ENCRYPTION_KEY || "default-dev-key-change-in-production!";

export function encrypt(text: string): string {
  try {
    const encrypted = CryptoJS.AES.encrypt(text, ENCRYPTION_KEY).toString();
    return encrypted;
  } catch (error) {
    console.error("Encryption error:", error);
    throw new Error("Failed to encrypt data");
  }
}

export function decrypt(encryptedText: string): string {
  try {
    const decrypted = CryptoJS.AES.decrypt(encryptedText, ENCRYPTION_KEY);
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

    console.log(
      `🔒 Security event logged: ${eventData.eventType} for user ${eventData.userId}`,
    );
  } catch (error) {
    console.error("Failed to log security event:", error);
    // Don't throw error to avoid breaking the main flow
  }
}

// Generate secure random tokens
export function generateSecureToken(length: number = 32): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  const randomBytes = CryptoJS.lib.WordArray.random(length);

  for (let i = 0; i < length; i++) {
    result += chars.charAt(
      Math.floor((randomBytes.words[i % 4] >>> (8 * (i % 4))) & 0xff) %
        chars.length,
    );
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

// Check if account should be locked due to failed attempts
export async function checkAccountLockout(userId: string): Promise<boolean> {
  const maxAttempts = parseInt(process.env.MAX_LOGIN_ATTEMPTS || "5");
  const lockoutDuration =
    parseInt(process.env.ACCOUNT_LOCKOUT_DURATION || "15") * 60 * 1000; // Convert to ms

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { loginAttempts: true, lockedUntil: true },
  });

  if (!user) return false;

  // Check if account is currently locked
  if (user.lockedUntil && new Date() < user.lockedUntil) {
    return true;
  }

  // Check if we should lock the account
  if (user.loginAttempts >= maxAttempts) {
    const lockUntil = new Date(Date.now() + lockoutDuration);

    await prisma.user.update({
      where: { id: userId },
      data: {
        lockedUntil: lockUntil,
        loginAttempts: 0, // Reset attempts after locking
      },
    });

    await logSecurityEvent({
      userId,
      eventType: "account_locked",
      details: `Account locked due to ${maxAttempts} failed login attempts`,
      success: true,
    });

    return true;
  }

  return false;
}

// Reset login attempts on successful login
export async function resetLoginAttempts(userId: string): Promise<void> {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        loginAttempts: 0,
        lockedUntil: null,
      },
    });
  } catch (error) {
    console.error("Failed to reset login attempts:", error);
  }
}

// Increment login attempts on failed login
export async function incrementLoginAttempts(userId: string): Promise<void> {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        loginAttempts: {
          increment: 1,
        },
      },
    });
  } catch (error) {
    console.error("Failed to increment login attempts:", error);
  }
}
