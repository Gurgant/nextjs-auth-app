import { authenticator } from "otplib";
import * as QRCode from "qrcode";
import { encrypt, decrypt, generateBackupCodes } from "@/lib/security";

// TOTP configuration - using const instead of direct assignment to avoid read-only errors
const TOTP_OPTIONS = {
  window: 1, // Allow ±1 step (±30s) tolerance — RFC 6238 recommendation
  step: 30, // 30-second time step
  digits: 6, // 6-digit codes
  algorithm: "sha1", // Explicitly set algorithm
  encoding: "ascii", // Ensure proper encoding
};

// Safe configuration - only set if options is writable
try {
  Object.assign(authenticator.options, TOTP_OPTIONS);
} catch {
  // Options object is read-only in some otplib builds; method-level
  // defaults (TOTP_OPTIONS above) still apply where passed explicitly.
}

export interface TwoFactorSetup {
  secret: string;
  qrCodeUrl: string;
  backupCodes: string[];
}

export interface TwoFactorInfo {
  enabled: boolean;
  backupCodesCount: number;
  enabledAt?: Date;
}

// Generate a new TOTP secret for a user
export function generateTOTPSecret(): string {
  const secret = authenticator.generateSecret();
  // Ensure the secret is properly formatted (Base32)
  return secret.toUpperCase().replace(/[^A-Z2-7]/g, "");
}

// Generate QR code URL for TOTP setup
export async function generateQRCode(
  secret: string,
  userEmail: string,
  issuer: string = "Auth App",
): Promise<string> {
  try {
    // Ensure secret is properly formatted (Base32)
    const normalizedSecret = secret.toUpperCase().replace(/[^A-Z2-7]/g, "");

    // Generate the TOTP URL with explicit parameters
    const otpUrl = authenticator.keyuri(userEmail, issuer, normalizedSecret);

    // Validate the URL format
    if (!otpUrl.startsWith("otpauth://totp/")) {
      throw new Error("Invalid OTP URL format");
    }

    // Generate QR code as data URL
    return await QRCode.toDataURL(otpUrl, {
      errorCorrectionLevel: "M",
      type: "image/png",
      margin: 1,
      color: {
        dark: "#000000",
        light: "#FFFFFF",
      },
      width: 256,
    });
  } catch (_error) {
    console.error("❌ Error generating QR code:", _error);
    throw new Error("Failed to generate QR code");
  }
}

// Validate a TOTP code against a secret. Tolerance comes from the module-level
// authenticator options (window: 1 → ±30s).
export function validateTOTPCode(token: string, secret: string): boolean {
  try {
    const normalizedToken = token.replace(/\s/g, "");
    if (!/^\d{6}$/.test(normalizedToken)) {
      return false;
    }
    return authenticator.verify({
      token: normalizedToken,
      secret: secret.trim().toUpperCase(),
    });
  } catch {
    return false;
  }
}

// Validate backup code
export function validateBackupCode(
  code: string,
  encryptedBackupCodes: string[],
): { valid: boolean; remainingCodes: string[] } {
  try {
    const normalizedInput = code.replace(/[-\s]/g, "").toUpperCase();
    const remainingCodes: string[] = [];
    let codeFound = false;

    for (const encryptedCode of encryptedBackupCodes) {
      try {
        const decryptedCode = decrypt(encryptedCode)
          .replace(/[-\s]/g, "")
          .toUpperCase();

        if (decryptedCode === normalizedInput && !codeFound) {
          codeFound = true;
          // Don't add the used code to remaining codes
        } else {
          remainingCodes.push(encryptedCode);
        }
      } catch (error) {
        console.error("Error decrypting backup code:", error);
        // Keep the code if we can't decrypt it
        remainingCodes.push(encryptedCode);
      }
    }

    return {
      valid: codeFound,
      remainingCodes,
    };
  } catch (error) {
    console.error("Error validating backup code:", error);
    return {
      valid: false,
      remainingCodes: encryptedBackupCodes,
    };
  }
}

// Setup 2FA for a user (generate secret, QR code, and backup codes)
export async function setupTwoFactor(
  userEmail: string,
): Promise<TwoFactorSetup> {
  try {
    // Generate secret and backup codes
    const secret = generateTOTPSecret();
    const backupCodes = generateBackupCodes(8); // Generate 8 backup codes

    // Generate QR code
    const qrCodeUrl = await generateQRCode(secret, userEmail);

    return {
      secret,
      qrCodeUrl,
      backupCodes,
    };
  } catch (error) {
    console.error("Error setting up 2FA:", error);
    throw new Error("Failed to setup two-factor authentication");
  }
}

// Encrypt backup codes for storage
export function encryptBackupCodes(codes: string[]): string[] {
  return codes.map((code) => encrypt(code));
}

// Decrypt backup codes for display (use sparingly)
export function decryptBackupCodes(encryptedCodes: string[]): string[] {
  return encryptedCodes.map((code) => {
    try {
      return decrypt(code);
    } catch (error) {
      console.error("Error decrypting backup code:", error);
      return "****-****"; // Return masked code on error
    }
  });
}

// Generate new backup codes (for when user needs fresh codes)
export function generateNewBackupCodes(): string[] {
  return generateBackupCodes(8);
}

// Check if TOTP code format is valid
export function isValidTOTPFormat(code: string): boolean {
  const cleanCode = code.replace(/\s/g, "");
  return /^\d{6}$/.test(cleanCode);
}

// Check if backup code format is valid
export function isValidBackupCodeFormat(code: string): boolean {
  const cleanCode = code.replace(/[-\s]/g, "").toUpperCase();
  return /^[A-Z0-9]{8}$/.test(cleanCode);
}

// Generate TOTP URL for manual entry (when QR code can't be scanned)
export function generateTOTPUrl(
  secret: string,
  userEmail: string,
  issuer: string = "Auth App",
): string {
  return authenticator.keyuri(userEmail, issuer, secret);
}

// Get current TOTP code (for testing purposes)
export function getCurrentTOTPCode(secret: string): string {
  return authenticator.generate(secret);
}

// Get time remaining until next TOTP code
export function getTimeRemaining(): number {
  const now = Date.now();
  const step = (authenticator.options.step || 30) * 1000; // Convert to milliseconds
  return step - (now % step);
}

// Verify if secret is valid
export function isValidSecret(secret: string): boolean {
  try {
    // Try to generate a code with the secret
    authenticator.generate(secret);
    return true;
  } catch {
    return false;
  }
}

// Format backup code for display (add dash in middle)
export function formatBackupCode(code: string): string {
  const cleanCode = code.replace(/[-\s]/g, "").toUpperCase();
  if (cleanCode.length === 8) {
    return `${cleanCode.slice(0, 4)}-${cleanCode.slice(4, 8)}`;
  }
  return code;
}

// Count remaining backup codes
export function countRemainingBackupCodes(encryptedCodes: string[]): number {
  return encryptedCodes.length;
}

// Check if 2FA is required for user
export function requiresTwoFactor(user: {
  twoFactorEnabled: boolean;
}): boolean {
  return user.twoFactorEnabled;
}

// Generate 2FA status info
export function getTwoFactorInfo(user: {
  twoFactorEnabled: boolean;
  backupCodes: string[];
  twoFactorEnabledAt?: Date | null;
}): TwoFactorInfo {
  return {
    enabled: user.twoFactorEnabled,
    backupCodesCount: user.backupCodes.length,
    enabledAt: user.twoFactorEnabledAt || undefined,
  };
}
