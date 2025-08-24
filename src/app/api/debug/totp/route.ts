import { NextRequest, NextResponse } from "next/server";
import {
  generateTOTPSecret,
  getCurrentTOTPCode,
  validateTOTPCode,
  diagnoseTOTPIssue,
} from "@/lib/two-factor";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const testSecret = searchParams.get("secret");
    const testCode = searchParams.get("code");

    if (testSecret && testCode) {
      // Test specific secret and code
      const diagnosis = diagnoseTOTPIssue(testSecret, testCode);
      const isValid = validateTOTPCode(testCode, testSecret);

      return NextResponse.json({
        action: "test_validation",
        secret: testSecret.substring(0, 8) + "...",
        userCode: testCode,
        isValid,
        diagnosis,
      });
    }

    // Generate a fresh secret and test it
    const secret = generateTOTPSecret();
    const currentCode = getCurrentTOTPCode(secret);

    // Test the validation immediately
    const isValid = validateTOTPCode(currentCode, secret);
    const diagnosis = diagnoseTOTPIssue(secret, currentCode);

    return NextResponse.json({
      action: "test_generation",
      secret: secret,
      secretLength: secret.length,
      currentCode,
      isValid,
      diagnosis,
      timestamp: new Date().toISOString(),
      testUrl: `/api/debug/totp?secret=${encodeURIComponent(secret)}&code=${currentCode}`,
    });
  } catch (error: any) {
    console.error("TOTP debug error:", error);
    return NextResponse.json(
      { error: error?.message || "Unknown error" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { secret, code } = await request.json();

    if (!secret || !code) {
      return NextResponse.json(
        { error: "Missing secret or code" },
        { status: 400 },
      );
    }

    const diagnosis = diagnoseTOTPIssue(secret, code);
    const isValid = validateTOTPCode(code, secret);
    const currentCode = getCurrentTOTPCode(secret);

    return NextResponse.json({
      secret: secret.substring(0, 8) + "...",
      userCode: code,
      expectedCode: currentCode,
      isValid,
      diagnosis,
    });
  } catch (error: any) {
    console.error("TOTP debug error:", error);
    return NextResponse.json(
      { error: error?.message || "Unknown error" },
      { status: 500 },
    );
  }
}
