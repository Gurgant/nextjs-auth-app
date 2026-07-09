import { z } from "zod";
import bcrypt from "bcryptjs";
import { getBcryptRounds } from "@/lib/utils/bcrypt.config";
import { BaseCommand } from "../base/command.base";
import { CommandMetadata } from "../base/command.interface";
import { repositories } from "@/lib/repositories";
import { eventBus } from "@/lib/events";
import { UserRegisteredEvent } from "@/lib/events/domain/auth.events";
import {
  createSuccessResponse,
  createErrorResponse,
  ActionResponse,
} from "@/lib/utils/form-responses";
import { emailSchema, passwordSchema, nameSchema } from "@/lib/validation";
import { ErrorFactory } from "@/lib/errors/error-factory";
import { createError } from "@/lib/errors/error-builder";

export interface RegisterUserInput {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  locale?: string;
}

const registerSchema = z
  .object({
    name: nameSchema,
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

export class RegisterUserCommand extends BaseCommand<
  RegisterUserInput,
  ActionResponse
> {
  readonly name = "RegisterUserCommand";
  readonly description = "Register a new user account";

  private createdUserId?: string;

  get canUndo(): boolean {
    return true; // Registration can be undone (delete the user)
  }

  // Validation is handled in execute() method for better error messaging

  async execute(
    input: RegisterUserInput,
    metadata?: CommandMetadata,
  ): Promise<ActionResponse> {
    this.logExecution(input, metadata);

    try {
      // Validate input
      const validationResult = registerSchema.safeParse(input);
      if (!validationResult.success) {
        const error = ErrorFactory.validation.fromZod(validationResult.error, {
          userId: metadata?.userId,
          correlationId: metadata?.commandId,
        });
        error.log();
        return createErrorResponse(error.getUserMessage());
      }

      const userRepo = repositories.getUserRepository();

      // Check if user already exists
      const existingUser = await userRepo.findByEmail(input.email);
      if (existingUser) {
        const errorBuilder = createError();
        if (metadata?.userId) errorBuilder.withUserId(metadata.userId);
        if (metadata?.commandId)
          errorBuilder.withCorrelationId(metadata.commandId);
        const error = errorBuilder.business.alreadyExists("User", {
          email: input.email,
        });
        error.log();
        return createErrorResponse(error.getUserMessage());
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(
        input.password,
        getBcryptRounds(),
      );

      // Create user with account
      const user = await userRepo.createWithAccount({
        name: input.name,
        email: input.email,
        password: hashedPassword,
        provider: "credentials",
        providerAccountId: input.email,
      });

      // Update additional metadata
      await userRepo.update(user.id, {
        hasEmailAccount: true,
        hasGoogleAccount: false,
        primaryAuthMethod: "email",
        passwordSetAt: new Date(),
        lastPasswordChange: new Date(),
      } as any);

      this.createdUserId = user.id;

      // Emit user registered event
      await eventBus.publish(
        new UserRegisteredEvent(
          {
            userId: user.id,
            email: user.email,
            name: user.name,
            provider: "credentials",
            emailVerified: false,
            registeredAt: new Date(),
          },
          {
            userId: user.id,
            correlationId: metadata?.commandId,
            locale: input.locale,
          },
        ),
      );

      const response = createSuccessResponse(
        "Account created successfully! Please sign in.",
        { userId: user.id },
      );

      this.logSuccess(response);
      return response;
    } catch (error) {
      const baseError = ErrorFactory.wrap(error, {
        userId: metadata?.userId,
        correlationId: metadata?.commandId,
      });
      baseError.log();
      this.logError(baseError);
      return createErrorResponse(baseError.getUserMessage());
    }
  }

  async undo(): Promise<void> {
    if (!this.createdUserId) {
      throw new Error("No user to undo - registration may have failed");
    }

    console.log(
      `[${this.name}] Undoing registration for user: ${this.createdUserId}`,
    );

    const userRepo = repositories.getUserRepository();
    const deleted = await userRepo.delete(this.createdUserId);

    if (!deleted) {
      throw new Error(`Failed to delete user: ${this.createdUserId}`);
    }

    console.log(`[${this.name}] Successfully undid registration`);
    this.createdUserId = undefined;
  }

  async redo(): Promise<void> {
    if (!this.input) {
      throw new Error("No input available for redo");
    }

    console.log(`[${this.name}] Redoing registration for: ${this.input.email}`);

    // Re-execute the command
    await this.execute(this.input, this.metadata);
  }
}
