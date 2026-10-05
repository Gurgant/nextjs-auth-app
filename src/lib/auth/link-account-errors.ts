/**
 * The codes of the refusals of the two account-link routes
 * (src/app/api/auth/link-account/{initiate,unlink}). Each refusal carries a
 * `code` next to its English `error`: the text is for whoever reads the API,
 * the code is what the account page translates
 * (src/components/account/oauth-account-linking.tsx). The codes are part of
 * the answer's contract: a client may depend on them, the texts may change.
 *
 * No import on purpose: the component loads this file in the browser.
 */
export const LINK_ACCOUNT_ERROR_CODES = [
  "authentication_required",
  "too_many_attempts",
  "invalid_request",
  "missing_fields",
  "unsupported_provider",
  "user_not_found",
  "password_not_set",
  "invalid_password",
  "already_linked",
  "not_linked",
  "internal_error",
] as const;

export type LinkAccountErrorCode = (typeof LINK_ACCOUNT_ERROR_CODES)[number];
