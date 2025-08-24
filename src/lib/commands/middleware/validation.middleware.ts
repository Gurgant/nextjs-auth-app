import { ICommandMiddleware } from "./middleware.interface";
import { CommandMetadata } from "../base/command.interface";
import { z } from "zod";

export class ValidationMiddleware implements ICommandMiddleware {
  name = "ValidationMiddleware";

  private schemas = new Map<string, z.ZodSchema>();

  /**
   * Register a validation schema for a command
   */
  registerSchema(commandName: string, schema: z.ZodSchema): void {
    this.schemas.set(commandName, schema);
  }

  async before(
    commandName: string,
    input: any,
    metadata: CommandMetadata,
  ): Promise<boolean> {
    const schema = this.schemas.get(commandName);

    if (!schema) {
      // No schema registered, allow execution
      return true;
    }

    try {
      schema.parse(input);
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error(
          `[ValidationMiddleware] Validation failed for ${commandName}:`,
          {
            commandId: metadata.commandId,
            errors: error.issues,
          },
        );
      }
      return false; // Block execution
    }
  }
}
