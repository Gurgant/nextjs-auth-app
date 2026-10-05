import { NextResponse } from "next/server";
import type { LinkAccountErrorCode } from "@/lib/auth/link-account-errors";

/**
 * What the two account-link routes share: how they read a request and how
 * they refuse one (src/app/api/auth/link-account/{initiate,unlink}).
 */

/** A refusal: the English text for a reader of the API, and its stable code. */
export function linkAccountRefusal(
  status: number,
  code: LinkAccountErrorCode,
  error: string,
  headers?: HeadersInit,
): NextResponse {
  return NextResponse.json({ error, code }, { status, headers });
}

type LinkAccountRequest =
  | { ok: true; password: string; provider: "google" }
  | { ok: false; code: LinkAccountErrorCode; error: string };

const INVALID_BODY = {
  ok: false,
  code: "invalid_request",
  error: "Invalid request body",
} as const;

/**
 * The password and the provider of a link or unlink request. Decided from the
 * body alone, before anything is read from the database: the body has to be a
 * JSON object, both fields have to be there, both have to be strings, and
 * Google is the only provider that can be linked or unlinked.
 */
export async function readLinkAccountRequest(
  request: Request,
): Promise<LinkAccountRequest> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return INVALID_BODY;
  }
  if (typeof body !== "object" || body === null) return INVALID_BODY;

  const { password, provider } = body as Record<string, unknown>;
  if (!password || !provider) {
    return {
      ok: false,
      code: "missing_fields",
      error: "Password and provider are required",
    };
  }
  if (typeof password !== "string" || typeof provider !== "string") {
    return INVALID_BODY;
  }
  if (provider !== "google") {
    return {
      ok: false,
      code: "unsupported_provider",
      error: "Unsupported provider",
    };
  }
  return { ok: true, password, provider };
}
