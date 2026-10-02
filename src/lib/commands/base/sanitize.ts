/**
 * Redaction of command input and output before they are copied into events
 * and audit entries. Both functions return a copy: the object handed to the
 * command, and the object the command returns to its caller, are never
 * changed.
 */

export const REDACTED = "[REDACTED]";

const SENSITIVE_INPUT_FIELDS = [
  "password",
  "confirmPassword",
  "currentPassword",
  "newPassword",
  "token",
  "secret",
];

interface SanitizableOutput {
  token?: unknown;
  data?: { token?: unknown } | null;
  [key: string]: unknown;
}

/**
 * Copy of a command input with the sensitive fields redacted
 */
export function sanitizeCommandInput(input: unknown): unknown {
  if (!input) return input;

  const sanitized: Record<string, unknown> = {
    ...(input as Record<string, unknown>),
  };

  SENSITIVE_INPUT_FIELDS.forEach((field) => {
    if (sanitized[field]) {
      sanitized[field] = REDACTED;
    }
  });

  return sanitized;
}

/**
 * Copy of a command output with `token` and `data.token` redacted
 */
export function sanitizeCommandOutput(output: unknown): unknown {
  if (!output) return output;

  const sanitized = { ...(output as SanitizableOutput) };

  if (sanitized.token) {
    sanitized.token = REDACTED;
  }
  if (sanitized.data?.token) {
    // `data` is shared with the real output: replace it, never write into it.
    sanitized.data = { ...sanitized.data, token: REDACTED };
  }

  return sanitized;
}
