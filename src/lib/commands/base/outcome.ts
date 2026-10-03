/**
 * Whether a command's answer says it succeeded. The commands answer a refusal
 * (`{ success: false, ... }`) instead of throwing, so a command that returned
 * has not necessarily succeeded. An answer without `success: true` does not
 * say so. The executed event and the log line both use this rule.
 */
export function answerSaysSuccess(output: unknown): boolean {
  return (
    typeof output === "object" &&
    output !== null &&
    "success" in output &&
    output.success === true
  );
}
