import { BaseError, ErrorContext } from "../base/base-error";
import { ErrorCode } from "../base/error-codes";

/**
 * Internal system error
 */
export class InternalError extends BaseError {
  constructor(
    message: string = "An internal error occurred",
    cause?: Error,
    context?: ErrorContext,
  ) {
    super(
      ErrorCode.INTERNAL_ERROR,
      message,
      { originalError: cause?.message },
      context,
      cause,
    );
  }
}
