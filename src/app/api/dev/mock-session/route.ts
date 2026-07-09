import { NextRequest, NextResponse } from "next/server";

/**
 * Mock Session Endpoint for Documentation Screenshots
 *
 * SECURITY: Only available in non-production environments
 * Creates temporary session cookies for screenshot testing
 */

export async function GET(request: NextRequest) {
  // Security check - only allow in non-production
  if (
    process.env.NODE_ENV === "production" &&
    process.env.DOCS_SCREENSHOTS !== "true"
  ) {
    return NextResponse.json(
      { error: "Mock session endpoint not available in production" },
      { status: 403 },
    );
  }

  const { searchParams } = new URL(request.url);
  const role = searchParams.get("role") || "USER";

  // Validate role
  const validRoles = ["USER", "PRO_USER", "ADMIN"];
  if (!validRoles.includes(role)) {
    return NextResponse.json(
      { error: "Invalid role. Must be USER, PRO_USER, or ADMIN" },
      { status: 400 },
    );
  }

  // Mock user data based on role
  const mockUsers = {
    USER: {
      id: "docs-user-001",
      email: "docs.user@example.com",
      name: "Documentation User",
      role: "USER",
      image: null,
    },
    PRO_USER: {
      id: "docs-pro-001",
      email: "docs.pro@example.com",
      name: "Documentation Pro User",
      role: "PRO_USER",
      image: null,
    },
    ADMIN: {
      id: "docs-admin-001",
      email: "docs.admin@example.com",
      name: "Documentation Admin",
      role: "ADMIN",
      image: null,
    },
  };

  const mockUser = mockUsers[role as keyof typeof mockUsers];

  try {
    // Create a simple session object that NextAuth would recognize
    const sessionData = {
      user: mockUser,
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
    };

    // Create response
    const response = NextResponse.json({
      success: true,
      message: `Mock ${role} session created for documentation screenshots`,
      user: mockUser,
    });

    // Set a simple session cookie (this is a simplified version)
    // In a real implementation, you'd need to properly sign/encrypt this
    response.cookies.set(
      "next-auth.session-token",
      JSON.stringify(sessionData),
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 24 * 60 * 60, // 24 hours
      },
    );

    // Also set a simple user info cookie for easier access
    response.cookies.set("docs-mock-user", JSON.stringify(mockUser), {
      httpOnly: false, // Allow client-side access for debugging
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 24 * 60 * 60,
    });

    return response;
  } catch (error) {
    console.error("Error creating mock session:", error);
    return NextResponse.json(
      { error: "Failed to create mock session" },
      { status: 500 },
    );
  }
}

// Also allow POST for consistency
export async function POST(request: NextRequest) {
  return GET(request);
}
