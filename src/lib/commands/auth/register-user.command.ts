import { z } from "zod";
import bcrypt from "bcryptjs";
import { getBcryptRounds } from "@/lib/utils/bcrypt.config";
import { BaseCommand, COMMAND_FAILED_MESSAGE } from "../base/command.base";
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

  // Validation is handled in execute() method for better error messaging

  async execute(
    input: RegisterUserInput,
    metadata?: CommandMetadata,
  ): Promise<ActionResponse> {
    this.logExecution(metadata);

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
        passwordSetAt: new Date(),
        lastPasswordChange: new Date(),
      });

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

      this.logSuccess();
      return response;
    } catch (error) {
      const baseError = ErrorFactory.wrap(error, {
        userId: metadata?.userId,
        correlationId: metadata?.commandId,
      });
      baseError.log();
      this.logError(baseError);
      return createErrorResponse(COMMAND_FAILED_MESSAGE);
    }
  }
}
