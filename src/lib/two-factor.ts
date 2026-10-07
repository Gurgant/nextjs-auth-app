import { authenticator } from "otplib";
import * as QRCode from "qrcode";
import { encrypt, decrypt, generateBackupCodes } from "@/lib/security";

// Accept ±1 time step (±30 s of clock drift, RFC 6238 §5.2). The rest stays
// on the otplib authenticator defaults (30 s step, 6 digits, SHA-1, base32
// secrets). `options` must be assigned through its setter: the getter returns
// a frozen copy, so mutating it has no effect.
authenticator.options = { window: 1 };

export interface TwoFactorSetup {
  secret: string;
  qrCodeUrl: string;
  backupCodes: string[];
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

// What a stored value has to be before anything is compared with it. A secret
// or a code that was written with another ENCRYPTION_KEY is read, most of
// the time, as the empty text (there is no key rotation, see SECURITY.md).
// otplib has a code for the empty secret, which anyone can compute, and "-"
// without its hyphen is the empty text as well: only a whole secret and a
// whole code can match.
//   - a TOTP secret is base32, sixteen characters or more
//     (generateTOTPSecret above);
//   - a backup code is eight letters and digits, written XXXX-XXXX
//     (generateBackupCodes in src/lib/security.ts).
const WHOLE_TOTP_SECRET = /^[A-Z2-7]{16,}$/;
const WHOLE_BACKUP_CODE = /^[A-Z0-9]{8}$/;

/** A backup code without its hyphen and spaces, in capitals. */
const normalizeBackupCode = (code: string) =>
  code.replace(/[-\s]/g, "").toUpperCase();

// Validate a TOTP code against a secret. Tolerance comes from the module-level
// authenticator options (window: 1 → ±30s).
export function validateTOTPCode(token: string, secret: string): boolean {
  try {
    const normalizedToken = token.replace(/\s/g, "");
    if (!/^\d{6}$/.test(normalizedToken)) {
      return false;
    }
    const normalizedSecret = secret.trim().toUpperCase();
    if (!WHOLE_TOTP_SECRET.test(normalizedSecret)) {
      return false;
    }
    return authenticator.verify({
      token: normalizedToken,
      secret: normalizedSecret,
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
    const normalizedInput = normalizeBackupCode(code);
    // "-", "" and anything else that is no whole code: never valid, whatever
    // the rows hold.
    if (!WHOLE_BACKUP_CODE.test(normalizedInput)) {
      return { valid: false, remainingCodes: encryptedBackupCodes };
    }
    const remainingCodes: string[] = [];
    let codeFound = false;

    for (const encryptedCode of encryptedBackupCodes) {
      try {
        const decryptedCode = normalizeBackupCode(decrypt(encryptedCode));

        // A row that is no whole code (unreadable with this key) never
        // matches.
        if (
          !codeFound &&
          WHOLE_BACKUP_CODE.test(decryptedCode) &&
          decryptedCode === normalizedInput
        ) {
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
    throw new Error("Failed to set up two-factor authentication");
  }
}

// Encrypt backup codes for storage
export function encryptBackupCodes(codes: string[]): string[] {
  return codes.map((code) => encrypt(code));
}

// Generate new backup codes (for when user needs fresh codes)
export function generateNewBackupCodes(): string[] {
  return generateBackupCodes(8);
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
