import { CommandBus } from "./base/command-bus";
import { LoggingMiddleware } from "./middleware/logging.middleware";
import { ValidationMiddleware } from "./middleware/validation.middleware";
import { AuditMiddleware } from "./middleware/audit.middleware";

// Import all commands
import { RegisterUserCommand, ChangePasswordCommand } from "./auth";

// Create singleton command bus instance
let commandBusInstance: CommandBus | null = null;

export function getCommandBus(): CommandBus {
  if (!commandBusInstance) {
    commandBusInstance = createCommandBus();
  }
  return commandBusInstance;
}

function createCommandBus(): CommandBus {
  const bus = new CommandBus({
    enableHistory: true,
    maxHistorySize: 100,
    enableLogging: process.env.NODE_ENV === "development",
  });

  // Register middleware (per-command console logging only in development)
  if (process.env.NODE_ENV === "development") {
    bus.use(new LoggingMiddleware());
  }
  bus.use(new ValidationMiddleware());
  bus.use(new AuditMiddleware(false)); // Set to true to persist audit logs to database

  // Register all commands
  bus.registerMany([RegisterUserCommand, ChangePasswordCommand]);

  return bus;
}

// Export singleton instance
export const commandBus = getCommandBus();
