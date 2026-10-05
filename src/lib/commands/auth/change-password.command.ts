import { z } from "zod";
import bcrypt from "bcryptjs";
import { getBcryptRounds } from "@/lib/utils/bcrypt.config";
import { BaseCommand, COMMAND_FAILED_MESSAGE } from "../base/command.base";
import { CommandMetadata } from "../base/command.interface";
import { repositories } from "@/lib/repositories";
import { eventBus } from "@/lib/events";
import { PasswordChangedEvent } from "@/lib/events/domain/auth.events";
import {
  createSuccessResponse,
  createErrorResponse,
  ActionResponse,
} from "@/lib/utils/form-responses";
import { passwordSchema } from "@/lib/validation";
import { ErrorFactory } from "@/lib/errors/error-factory";
import { createError } from "@/lib/errors/error-builder";

export interface ChangePasswordInput {
  userId: string;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
  locale?: string;
}

const changePasswordSchema = z
  .object({
    userId: z.string().min(1),
    currentPassword: z.string().min(1),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "New passwords don't match",
    path: ["confirmPassword"],
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: "New password must be different from current password",
    path: ["newPassword"],
  });

export class ChangePasswordCommand extends BaseCommand<
  ChangePasswordInput,
  ActionResponse
> {
  readonly name = "ChangePasswordCommand";
  readonly description = "Change user password";

  // Validation is handled in execute() method for better error messaging

  async execute(
    input: ChangePasswordInput,
    metadata?: CommandMetadata,
  ): Promise<ActionResponse> {
    const run = this.logExecution(metadata);

    try {
      // Validate input
      const validationResult = changePasswordSchema.safeParse(input);
      if (!validationResult.success) {
        const error = ErrorFactory.validation.fromZod(validationResult.error, {
          userId: input.userId,
          correlationId: metadata?.commandId,
        });
        error.log();
        return createErrorResponse(error.getUserMessage());
      }

      const userRepo = repositories.getUserRepository();

      // Get user and verify current password
      const user = await userRepo.findById(input.userId);

      if (!user) {
        const error = ErrorFactory.business.notFound("User", input.userId, {
          userId: input.userId,
          correlationId: metadata?.commandId,
        });
        error.log();
        return createErrorResponse(error.getUserMessage());
      }

      if (!user.password) {
        const errorBuilder = createError().withUserId(input.userId);
        if (metadata?.commandId)
          errorBuilder.withCorrelationId(metadata.commandId);
        const error = errorBuilder.business.operationNotAllowed(
          "change password",
          "No password set for this account",
        );
        error.log();
        return createErrorResponse(error.getUserMessage());
      }

      // Verify current password
      const isCurrentPasswordValid = await bcrypt.compare(
        input.currentPassword,
        user.password,
      );

      if (!isCurrentPasswordValid) {
        const errorBuilder = createError().withUserId(input.userId);
        if (metadata?.commandId)
          errorBuilder.withCorrelationId(metadata.commandId);
        const error = errorBuilder.validation.invalidInput(
          "currentPassword",
          undefined,
          "password",
        );
        error.log();
        return createErrorResponse(error.getUserMessage());
      }

      // Hash new password
      const newPasswordHash = await bcrypt.hash(
        input.newPassword,
        getBcryptRounds(),
      );

      // Update password. The same write ends every session of the user, the
      // one that asked for the change included.
      await userRepo.updatePassword(user.id, newPasswordHash, {
        revokeSessions: true,
      });

      // Update password metadata
      await userRepo.update(user.id, {
        lastPasswordChange: new Date(),
        requiresPasswordChange: false,
      });

      // Emit password changed event
      await eventBus.publish(
        new PasswordChangedEvent(
          {
            userId: user.id,
            changedAt: new Date(),
            requiresLogout: true,
          },
          {
            userId: user.id,
            correlationId: metadata?.commandId,
            locale: input.locale,
          },
        ),
      );

      const response = createSuccessResponse(
        "Password changed successfully! Please sign in again.",
        {
          userId: user.id,
          passwordChanged: true,
        },
      );

      this.logSuccess(run);
      return response;
    } catch (error) {
      const baseError = ErrorFactory.wrap(error, {
        userId: input.userId,
        correlationId: metadata?.commandId,
      });
      baseError.log();
      this.logError(run, baseError);
      return createErrorResponse(COMMAND_FAILED_MESSAGE);
    }
  }
}
