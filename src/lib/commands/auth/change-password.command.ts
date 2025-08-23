import { z } from "zod";
import bcrypt from "bcryptjs";
import { getBcryptRounds } from "@/lib/utils/bcrypt.config";
import { BaseCommand } from "../base/command.base";
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

  private previousPasswordHash?: string;
  private userId?: string;

  get canUndo(): boolean {
    return true; // Password change can be undone (restore old password)
  }

  async validate(input: ChangePasswordInput): Promise<boolean> {
    try {
      changePasswordSchema.parse(input);

      const userRepo = repositories.getUserRepository();
      const user = await userRepo.findById(input.userId);

      if (!user) {
        console.log(`[${this.name}] User not found: ${input.userId}`);
        return false;
      }

      if (!user.password) {
        console.log(`[${this.name}] User has no password set: ${input.userId}`);
        return false;
      }

      return true;
    } catch (error) {
      console.error(`[${this.name}] Validation failed:`, error);
      return false;
    }
  }

  async execute(
    input: ChangePasswordInput,
    metadata?: CommandMetadata,
  ): Promise<ActionResponse> {
    this.logExecution(input, metadata);

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

      // Store old password hash for undo
      this.previousPasswordHash = user.password;
      this.userId = user.id;

      // Hash new password
      const newPasswordHash = await bcrypt.hash(
        input.newPassword,
        getBcryptRounds(),
      );

      // Update password
      await userRepo.updatePassword(user.id, newPasswordHash);

      // Update password metadata
      await userRepo.update(user.id, {
        lastPasswordChange: new Date(),
        requiresPasswordChange: false,
      } as any);

      // Emit password changed event
      await eventBus.publish(
        new PasswordChangedEvent(
          {
            userId: user.id,
            changedAt: new Date(),
            requiresLogout: false,
          },
          {
            userId: user.id,
            correlationId: metadata?.commandId,
            locale: input.locale,
          },
        ),
      );

      const response = createSuccessResponse("Password changed successfully!", {
        userId: user.id,
        passwordChanged: true,
      });

      this.logSuccess(response);
      return response;
    } catch (error) {
      const baseError = ErrorFactory.wrap(error, {
        userId: input.userId,
        correlationId: metadata?.commandId,
      });
      baseError.log();
      this.logError(baseError);
      return createErrorResponse(baseError.getUserMessage());
    }
  }

  async undo(): Promise<void> {
    if (!this.userId || !this.previousPasswordHash) {
      throw new Error("No password change to undo");
    }

    console.log(
      `[${this.name}] Restoring previous password for user: ${this.userId}`,
    );

    const userRepo = repositories.getUserRepository();

    // Restore the old password (already hashed)
    await userRepo.update(this.userId, {
      password: this.previousPasswordHash,
      lastPasswordChange: new Date(),
    } as any);

    console.log(`[${this.name}] Successfully restored previous password`);
  }

  async redo(): Promise<void> {
    if (!this.input) {
      throw new Error("No input available for redo");
    }

    console.log(
      `[${this.name}] Redoing password change for user: ${this.input.userId}`,
    );

    // Re-execute the command
    await this.execute(this.input, this.metadata);
  }
}
