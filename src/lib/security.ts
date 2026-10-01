import CryptoJS from "crypto-js";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma";
import { requireEncryptionKey } from "@/lib/env-rules";

// Encryption for data at rest (2FA secrets, backup codes).
//
// ENCRYPTION_KEY is required in every environment — there is no hardcoded
// fallback, which would make every stored secret decryptable. It is passed to
// CryptoJS as a PASSPHRASE (OpenSSL EVP_BytesToKey with MD5, random salt,
// AES-256-CBC, no MAC), used verbatim and case-sensitive. SECURITY.md
// recommends AES-256-GCM with a managed key for production.
//
// The key is resolved outside the try blocks so a configuration error is
// reported as such instead of a generic "failed to encrypt".

export function encrypt(text: string): string {
  const key = requireEncryptionKey();
  try {
    return CryptoJS.AES.encrypt(text, key).toString();
  } catch (error) {
    console.error("Encryption error:", error);
    throw new Error("Failed to encrypt data");
  }
}

export function decrypt(encryptedText: string): string {
  const key = requireEncryptionKey();
  try {
    const decrypted = CryptoJS.AES.decrypt(encryptedText, key);
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
  metadata?: Prisma.InputJsonObject;
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

const IPV4 =
  /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
const IPV6_GROUP = /^[0-9a-fA-F]{1,4}$/;

// IPv6 in any valid notation: full, compressed ("2001:db8::1", "::1") or with
// an embedded IPv4 tail ("::ffff:203.0.113.7"). Pure code on purpose: this
// module also ends up in bundles where Node's `net` is unavailable.
function isIPv6(ip: string): boolean {
  let s = ip;
  const tail = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(s);
  if (tail) {
    if (!IPV4.test(tail[1])) return false;
    s = `${s.slice(0, -tail[1].length)}0:0`; // an IPv4 tail fills two groups
  }
  const halves = s.split("::");
  if (halves.length > 2) return false;
  const groups = (part: string) => (part === "" ? [] : part.split(":"));
  if (halves.length === 1) {
    const all = groups(s);
    return all.length === 8 && all.every((g) => IPV6_GROUP.test(g));
  }
  const [head, rest] = halves.map(groups);
  return (
    head.length + rest.length <= 7 &&
    [...head, ...rest].every((g) => IPV6_GROUP.test(g))
  );
}

// Validate IP address format: IPv4 or IPv6 in any valid notation, including
// the compressed IPv6 form proxies normally send ("2001:db8::1").
export function isValidIP(ip: string): boolean {
  return IPV4.test(ip) || isIPv6(ip);
}

// "::ffff:203.0.113.7" and "203.0.113.7" are the same client: one key.
function normalizeIP(ip: string): string {
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  return mapped ? mapped[1] : ip;
}

// Extract client IP from request headers. The first valid X-Forwarded-For
// entry is client-supplied unless a trusted proxy overwrites the header (see
// SECURITY.md); the account/email key is the primary rate-limit key.
export function getClientIP(headers: Headers): string | undefined {
  const forwarded = headers.get("x-forwarded-for");
  const realIP = headers.get("x-real-ip");
  const clientIP = headers.get("x-client-ip");

  if (forwarded) {
    const ips = forwarded.split(",").map((ip) => ip.trim());
    const validIP = ips.find((ip) => isValidIP(ip));
    if (validIP) return normalizeIP(validIP);
  }

  if (realIP && isValidIP(realIP)) return normalizeIP(realIP);
  if (clientIP && isValidIP(clientIP)) return normalizeIP(clientIP);

  return undefined;
}
