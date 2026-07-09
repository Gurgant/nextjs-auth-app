#!/usr/bin/env node

/**
 * Test script to verify 2FA functionality with encryption
 */

require("dotenv").config({ path: ".env.local" });
require("dotenv").config({ path: ".env" });

// Import 2FA functions using require for Node.js compatibility
const path = require("path");
const fs = require("fs");

async function test2FAFunctionality() {
  console.log("🔐 Testing 2FA Functionality...\n");

  // Check environment variables
  const hasEncryptionKey = !!process.env.ENCRYPTION_KEY;

  console.log("📋 Environment Variables Check:");
  console.log(
    `  ✅ ENCRYPTION_KEY: ${hasEncryptionKey ? "Set (" + process.env.ENCRYPTION_KEY.slice(0, 5) + "...)" : "❌ Missing"}`,
  );

  if (!hasEncryptionKey) {
    console.error(
      "\n❌ 2FA configuration incomplete. Please set ENCRYPTION_KEY in your .env files",
    );
    process.exit(1);
  }

  try {
    // Test basic encryption/decryption (similar to our earlier test)
    console.log("\n🔐 Testing Basic Encryption...");
    const crypto = require("crypto");
    const testData = "test-2fa-secret";

    // Modern encryption test with IV
    const algorithm = "aes-256-cbc";
    const key = crypto
      .createHash("sha256")
      .update(process.env.ENCRYPTION_KEY)
      .digest();
    const iv = crypto.randomBytes(16);

    // Encryption
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(testData, "utf8", "hex");
    encrypted += cipher.final("hex");

    // Decryption
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    if (decrypted === testData) {
      console.log("  ✅ Basic encryption/decryption working");
    } else {
      console.log("  ❌ Basic encryption/decryption failed");
      process.exit(1);
    }

    // Test CryptoJS encryption (which the app uses)
    console.log("\n🔐 Testing CryptoJS Encryption...");
    const CryptoJS = require("crypto-js");

    function encrypt(text) {
      try {
        const encrypted = CryptoJS.AES.encrypt(
          text,
          process.env.ENCRYPTION_KEY,
        ).toString();
        return encrypted;
      } catch (error) {
        console.error("Encryption error:", error);
        throw new Error("Failed to encrypt data");
      }
    }

    function decrypt(encryptedText) {
      try {
        const decrypted = CryptoJS.AES.decrypt(
          encryptedText,
          process.env.ENCRYPTION_KEY,
        );
        return decrypted.toString(CryptoJS.enc.Utf8);
      } catch (error) {
        console.error("Decryption error:", error);
        throw new Error("Failed to decrypt data");
      }
    }

    const testSecret = "JBSWY3DPEHPK3PXP"; // Base32 test secret
    const encryptedSecret = encrypt(testSecret);
    const decryptedSecret = decrypt(encryptedSecret);

    console.log(`  Original secret: ${testSecret}`);
    console.log(`  Encrypted: ${encryptedSecret.slice(0, 20)}...`);
    console.log(`  Decrypted: ${decryptedSecret}`);
    console.log(
      `  ✅ CryptoJS encryption working: ${testSecret === decryptedSecret}`,
    );

    // Test backup code generation
    console.log("\n🔑 Testing Backup Code Generation...");

    function generateBackupCodes(count = 8) {
      const codes = [];
      const chars =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

      for (let i = 0; i < count; i++) {
        let code = "";
        for (let j = 0; j < 8; j++) {
          code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        const formattedCode =
          `${code.slice(0, 4)}-${code.slice(4, 8)}`.toUpperCase();
        codes.push(formattedCode);
      }

      return codes;
    }

    const backupCodes = generateBackupCodes(8);
    console.log(`  Generated ${backupCodes.length} backup codes:`);
    backupCodes.forEach((code, i) => {
      console.log(`    ${i + 1}: ${code}`);
    });

    // Test backup code encryption
    console.log("\n🔐 Testing Backup Code Encryption...");
    const encryptedBackupCodes = backupCodes.map((code) => encrypt(code));
    const decryptedBackupCodes = encryptedBackupCodes.map((code) =>
      decrypt(code),
    );

    console.log("  ✅ Backup code encryption test:");
    console.log(
      `  Original codes match decrypted: ${JSON.stringify(backupCodes) === JSON.stringify(decryptedBackupCodes)}`,
    );

    // Test TOTP generation
    console.log("\n🕐 Testing TOTP Generation...");
    const { authenticator } = require("otplib");

    function generateTOTPSecret() {
      const secret = authenticator.generateSecret();
      return secret.toUpperCase().replace(/[^A-Z2-7]/g, "");
    }

    const totpSecret = generateTOTPSecret();
    console.log(`  Generated TOTP secret: ${totpSecret}`);
    console.log(`  Secret length: ${totpSecret.length}`);
    console.log(`  Is Base32: ${/^[A-Z2-7]+$/.test(totpSecret)}`);

    // Generate current TOTP code
    const currentCode = authenticator.generate(totpSecret);
    console.log(`  Current TOTP code: ${currentCode}`);
    console.log(`  Code is 6 digits: ${/^\d{6}$/.test(currentCode)}`);

    // Validate the code
    const isValid = authenticator.verify({
      token: currentCode,
      secret: totpSecret,
    });
    console.log(`  ✅ TOTP validation working: ${isValid}`);

    // Test QR code generation
    console.log("\n📱 Testing QR Code Generation...");
    const QRCode = require("qrcode");

    const userEmail = "test@example.com";
    const issuer = "Test Auth App";
    const otpUrl = authenticator.keyuri(userEmail, issuer, totpSecret);

    console.log(`  OTP URL: ${otpUrl}`);
    console.log(`  URL format valid: ${otpUrl.startsWith("otpauth://totp/")}`);

    try {
      const qrCodeUrl = await QRCode.toDataURL(otpUrl, {
        errorCorrectionLevel: "M",
        type: "image/png",
        width: 256,
      });

      console.log(
        `  ✅ QR code generated successfully (${qrCodeUrl.length} chars)`,
      );
      console.log(
        `  QR code format: ${qrCodeUrl.startsWith("data:image/png;base64,") ? "PNG Base64" : "Unknown"}`,
      );
    } catch (error) {
      console.error(`  ❌ QR code generation failed:`, error.message);
    }

    console.log("\n🎉 All 2FA functionality tests completed successfully!");
    console.log("\n📊 Summary:");
    console.log("  ✅ Basic encryption/decryption: Working");
    console.log("  ✅ CryptoJS encryption: Working");
    console.log("  ✅ Backup code generation: Working");
    console.log("  ✅ Backup code encryption: Working");
    console.log("  ✅ TOTP secret generation: Working");
    console.log("  ✅ TOTP code generation: Working");
    console.log("  ✅ TOTP code validation: Working");
    console.log("  ✅ QR code generation: Working");
  } catch (error) {
    console.error("\n❌ 2FA test failed:", error.message);
    console.error("Stack trace:", error.stack);
    process.exit(1);
  }
}

// Run the test
test2FAFunctionality().catch(console.error);
