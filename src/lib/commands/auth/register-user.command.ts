import { z } from "zod";
import bcrypt from "bcryptjs";
import { getBcryptRounds } from "@/lib/utils/bcrypt.config";
import { BaseCommand, COMMAND_FAILED_MESSAGE } from "../base/command.base";
import { CommandMetadata } from "../base/command.interface";
import { repositories } from "@/lib/repositories";
import { eventBus } from "@/lib/events";
import { UserRegisteredEvent } from "@/lib/events/domain/auth.events";
import { ActionResponse } from "@/lib/utils/form-responses";
import {
  createSuccessResponseI18n,
  createErrorResponseI18n,
} from "@/lib/utils/form-responses-i18n";
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

  // What the command answers is a message of the Errors or Success namespace
  // in `input.locale`, which the action has checked. The English message of
  // an error is for the server log and the error event: it is the answer only
  // when there is no locale, or no translation for it. The texts of the schema
  // above stay on the server as well: a form that fails it is answered with
  // one message, without them.

  async execute(
    input: RegisterUserInput,
    metadata?: CommandMetadata,
  ): Promise<ActionResponse> {
    const run = this.logExecution(metadata);
    // Read once, and so that it cannot throw: the type is not checked at run
    // time, and a caller can hand over null or undefined. Such an input fails
    // the schema below and is answered like any other invalid one.
    const locale = input?.locale;

    try {
      // Validate input
      const validationResult = registerSchema.safeParse(input);
      if (!validationResult.success) {
        const error = ErrorFactory.validation.fromZod(validationResult.error, {
          userId: metadata?.userId,
          correlationId: metadata?.commandId,
        });
        error.log();
        return await createErrorResponseI18n(
          "errors.validationFailed",
          locale,
          error.getUserMessage(),
        );
      }

      const userRepo = repositories.getUserRepository();

      // Check if user already exists
      const existingUser = await userRepo.findByEmail(input.email);
      if (existingUser) {
        const errorBuilder = createError();
        if (metadata?.userId) errorBuilder.withUserId(metadata.userId);
        if (metadata?.commandId)
          errorBuilder.withCorrelationId(metadata.commandId);
        // Which field collides, not its value: log() prints these details to
        // the server console and the error event carries them.
        const error = errorBuilder.business.alreadyExists("User", {
          field: "email",
        });
        error.log();
        return await createErrorResponseI18n(
          "errors.userAlreadyExists",
          locale,
          error.getUserMessage(),
        );
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
            locale,
          },
        ),
      );

      const response = await createSuccessResponseI18n(
        "success.accountCreated",
        locale,
        "Account created successfully! Please sign in.",
        { userId: user.id },
      );

      this.logSuccess(run);
      return response;
    } catch (error) {
      const baseError = ErrorFactory.wrap(error, {
        userId: metadata?.userId,
        correlationId: metadata?.commandId,
      });
      baseError.log();
      this.logError(run, baseError);
      return await createErrorResponseI18n(
        "errors.somethingWentWrong",
        locale,
        COMMAND_FAILED_MESSAGE,
      );
    }
  }
}
