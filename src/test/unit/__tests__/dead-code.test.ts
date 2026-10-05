/**
 * @jest-environment node
 */
import fs from "fs";
import path from "path";
import ts from "typescript";
import * as formReset from "@/hooks/use-form-reset";
import { AuditMiddleware } from "@/lib/commands/middleware/audit.middleware";
import { BaseError } from "@/lib/errors/base/base-error";
import {
  ErrorCategory,
  ErrorCode,
  ErrorSeverity,
} from "@/lib/errors/base/error-codes";
import * as systemErrors from "@/lib/errors/domain/system-errors";
import * as validationErrors from "@/lib/errors/domain/validation-errors";
import { ErrorBuilder, createError } from "@/lib/errors/error-builder";
import { ErrorFactory } from "@/lib/errors/error-factory";
import { BaseEvent } from "@/lib/events/base/event.base";
import { RATE_LIMITS } from "@/lib/rate-limit";
import { routes } from "@/lib/utils/navigation";

// The error classes publish through the event bus. Check C only reads their
// shape and needs no bus.
jest.mock("@/lib/events", () => ({
  eventBus: { publish: async () => {} },
}));

// Dead-code guard. Code that nothing imports and nothing calls has no
// behaviour, so no behavioural test fails when it is left behind. These
// checks read the sources instead:
//   A. every module under src is reachable from an entry point or from a test;
//   B. every exported name is mentioned somewhere besides its definition;
//   C. the retired members that A and B cannot see stay retired.
// A and B work on text (import specifiers, whole words), not on types; the
// TypeScript parser only tells them where the comments are. Dead code that
// they do not see:
//   - a name that is also a word somewhere else: in another file (a test
//     counts), in a string, or once more in its own file;
//   - a member of a class or of an object, and an export in a form that
//     `exportedNames` does not read (a default export, `module.exports`);
//   - the exports of src/app, of src/test, of the test files, of the
//     declaration files and of the three framework entries;
//   - a file in a `__tests__` directory that holds no test (Jest fails it);
//   - a module that only a file outside src imports: for A those files are
//     entry points.
// They report live code when it is reached in a way they do not read: a
// specifier built at run time, a file convention not listed below, a name
// read only through `import * as`.

const REPO_ROOT = path.resolve(__dirname, "../../../..");

// This file names what it allows and what was retired. Read as part of the
// tree, it would count as a mention of every one of those names.
const THIS_FILE = path
  .relative(REPO_ROOT, __filename)
  .split(path.sep)
  .join("/");

// What may stay although a check reports it, each with the reason. The checks
// compare for equality: an entry that no longer applies fails as well.
// "owner decision": the owner keeps it. "pending owner decision": nothing is
// decided yet, and the entry says what is open.
const ALLOWED_ORPHANS: Record<string, string> = {};

const ALLOWED_TEST_ONLY: Record<string, string> = {
  "src/lib/prisma-test.ts":
    "the Prisma client of the integration test (docs/TESTING.md)",
};

const ALLOWED_UNUSED_EXPORTS: Record<string, string> = {};

// Retired members that A and B cannot see: a member of a class or of an
// object, a name that a test still mentions or that its own file writes
// once more (in a log text), an export under src/test, and an export that
// would come back together with the code that names it (an event class with
// the listener branch that handles it). The retired Server Actions are listed
// too: every export of a "use server" file is an endpoint, with a caller or
// without. Listed as well is what went with the account-link confirmation
// page and is no export: the page itself (a file under src/app is an entry
// point, so A takes it as reached), a member of a string-literal type, a key
// of an object that is not exported, a model of the Prisma schema, a prop
// that only the page passed, and the page's texts in the message files (a
// namespace and five keys: `pnpm validate-translations` compares the files
// with each other, not with the code, so a text that nothing reads passes
// it; message-keys.test.ts now compares the keys with the code).
// The parts of the Prisma schema that nothing read are listed too (the
// schema is no source file for A and B, and the client generated from it is
// skipped): a model, fields of the User model, the member of the event type
// that went with the model, and the member of the repository's update type
// that went with one of the fields.
// The rows for package.json, for the enums and the context of the error layer
// and for the props of GradientPageLayout are of the same kind: a script, a
// dependency and a member of an enum or of an interface are no exports
// either. The module of the route list that the language selector asked
// (src/types/routes.ts) is listed for the reason the event classes are: it
// would come back together with the import that reaches it, and A would
// then take it as used.
// `kept` is a member that is
// still there, so a holder that cannot be read does not pass. C looks at
// names, not at use: a member that returns with a caller is no longer
// retired, and its row is deleted.
const RETIRED: {
  holder: string;
  members: () => string[];
  kept: string;
  retired: string[];
}[] = [
  {
    holder: "exports of hooks/use-form-reset",
    members: () => Object.keys(formReset),
    kept: "useFormReset",
    retired: ["useMultipleFormReset"],
  },
  {
    holder: "names exported by hooks/use-safe-locale.ts",
    members: () => namesExportedBy("src/hooks/use-safe-locale.ts"),
    kept: "useSafeLocale",
    retired: ["useSafeLocaleWithOptions"],
  },
  {
    holder: "BaseError.prototype",
    members: () => Object.getOwnPropertyNames(BaseError.prototype),
    kept: "toJSON",
    retired: [
      "toResponse",
      "getDebugInfo",
      "isRetryable",
      "getSuggestedAction",
    ],
  },
  {
    holder: "names exported by errors/base/base-error.ts",
    members: () => namesExportedBy("src/lib/errors/base/base-error.ts"),
    kept: "ErrorContext",
    retired: ["ErrorDetails"],
  },
  {
    holder: "members of ErrorContext",
    members: () =>
      interfaceMembers("src/lib/errors/base/base-error.ts", "ErrorContext"),
    kept: "correlationId",
    retired: ["requestId", "path", "method"],
  },
  {
    holder: "ErrorCode",
    members: () => Object.keys(ErrorCode),
    kept: "VALIDATION_FAILED",
    retired: [
      "AUTHENTICATION_FAILED",
      "INVALID_CREDENTIALS",
      "SESSION_EXPIRED",
      "ACCOUNT_LOCKED",
      "ACCOUNT_DISABLED",
      "EMAIL_NOT_VERIFIED",
      "TWO_FACTOR_REQUIRED",
      "TWO_FACTOR_FAILED",
      "UNAUTHORIZED",
      "FORBIDDEN",
      "INSUFFICIENT_PERMISSIONS",
      "RESOURCE_ACCESS_DENIED",
      "MISSING_REQUIRED_FIELD",
      "INVALID_FORMAT",
      "VALUE_OUT_OF_RANGE",
      "DUPLICATE_VALUE",
      "BUSINESS_RULE_VIOLATION",
      "CONCURRENT_MODIFICATION",
      "QUOTA_EXCEEDED",
      "RATE_LIMIT_EXCEEDED",
      "TOO_MANY_REQUESTS",
      "THROTTLED",
      "SERVICE_UNAVAILABLE",
      "DATABASE_ERROR",
      "NETWORK_ERROR",
      "TIMEOUT",
      "CONFIGURATION_ERROR",
      "EXTERNAL_SERVICE_ERROR",
      "API_ERROR",
      "WEBHOOK_FAILED",
      "EMAIL_SEND_FAILED",
      "SMS_SEND_FAILED",
      "UNKNOWN",
    ],
  },
  {
    holder: "ErrorCategory",
    members: () => Object.keys(ErrorCategory),
    kept: "VALIDATION",
    retired: [
      "AUTHENTICATION",
      "AUTHORIZATION",
      "RATE_LIMITING",
      "INTEGRATION",
      "UNKNOWN",
    ],
  },
  {
    holder: "ErrorSeverity",
    members: () => Object.keys(ErrorSeverity),
    kept: "HIGH",
    retired: ["MEDIUM", "CRITICAL"],
  },
  {
    holder: "names exported by errors/types/error-details.ts",
    members: () => namesExportedBy("src/lib/errors/types/error-details.ts"),
    kept: "ErrorDetails",
    retired: [
      "BaseErrorDetails",
      "ValidationErrorDetails",
      "DuplicateValueErrorDetails",
      "InvalidInputErrorDetails",
      "SchemaValidationErrorDetails",
      "AuthErrorDetails",
      "AuthorizationErrorDetails",
      "BusinessLogicErrorDetails",
      "SystemErrorDetails",
      "DatabaseErrorDetails",
      "ExternalServiceErrorDetails",
      "RateLimitErrorDetails",
    ],
  },
  {
    holder: "ErrorFactory",
    members: () => Object.getOwnPropertyNames(ErrorFactory),
    kept: "wrap",
    retired: ["fromCode", "is", "hasCode", "auth", "system"],
  },
  {
    holder: "ErrorFactory.validation",
    members: () => Object.keys(ErrorFactory.validation),
    kept: "fromZod",
    retired: [
      "duplicate",
      "schema",
      "field",
      "composite",
      "failed",
      "missingField",
      "invalidFormat",
      "outOfRange",
    ],
  },
  {
    holder: "ErrorFactory.business",
    members: () => Object.keys(ErrorFactory.business),
    kept: "notFound",
    retired: [
      "ruleViolation",
      "concurrentModification",
      "quotaExceeded",
      "invalidStateTransition",
      "invariantViolation",
      "preconditionFailed",
      "postconditionFailed",
      "dependency",
      "workflow",
    ],
  },
  {
    holder: "ErrorBuilder.prototype",
    members: () => Object.getOwnPropertyNames(ErrorBuilder.prototype),
    kept: "withUserId",
    retired: ["withContext", "withRequestId", "withPath", "withMethod"],
  },
  {
    holder: "groups of createError()",
    members: () => Object.keys(createError()),
    kept: "business",
    retired: ["auth", "system"],
  },
  {
    holder: "createError().validation",
    members: () => Object.keys(createError().validation),
    kept: "invalidInput",
    retired: [
      "duplicate",
      "failed",
      "fromZod",
      "missingField",
      "invalidFormat",
      "outOfRange",
    ],
  },
  {
    holder: "createError().business",
    members: () => Object.keys(createError().business),
    kept: "alreadyExists",
    retired: [
      "ruleViolation",
      "notFound",
      "concurrentModification",
      "quotaExceeded",
      "invalidStateTransition",
    ],
  },
  {
    holder: "exports of errors/domain/validation-errors",
    members: () => Object.keys(validationErrors),
    kept: "ValidationError",
    retired: [
      "DuplicateValueError",
      "SchemaValidationError",
      "FieldValidationError",
      "CompositeValidationError",
      "MissingRequiredFieldError",
      "InvalidFormatError",
      "ValueOutOfRangeError",
    ],
  },
  {
    holder: "names exported by errors/domain/business-errors.ts",
    members: () => namesExportedBy("src/lib/errors/domain/business-errors.ts"),
    kept: "ResourceNotFoundError",
    retired: [
      "BusinessRuleViolationError",
      "ConcurrentModificationError",
      "QuotaExceededError",
      "InvalidStateTransitionError",
      "InvariantViolationError",
      "PreconditionFailedError",
      "PostconditionFailedError",
      "DependencyError",
      "WorkflowError",
    ],
  },
  {
    holder: "exports of errors/domain/system-errors",
    members: () => Object.keys(systemErrors),
    kept: "InternalError",
    retired: [
      "ExternalServiceError",
      "ApiError",
      "ServiceUnavailableError",
      "DatabaseError",
      "NetworkError",
      "TimeoutError",
      "ConfigurationError",
      "RateLimitError",
      "WebhookFailedError",
      "EmailSendFailedError",
      "SmsSendFailedError",
      "CircuitBreakerOpenError",
      "ResourceExhaustedError",
    ],
  },
  {
    holder: "error classes of errors/domain (the auth errors went as a file)",
    members: () =>
      sourceFiles("src/lib/errors/domain").flatMap(namesExportedBy),
    kept: "OperationNotAllowedError",
    retired: [
      "InvalidCredentialsError",
      "SessionExpiredError",
      "AccountLockedError",
      "AccountDisabledError",
      "EmailNotVerifiedError",
      "TwoFactorRequiredError",
      "TwoFactorFailedError",
      "AuthorizationError",
      "InsufficientPermissionsError",
      "ResourceAccessDeniedError",
    ],
  },
  {
    holder: "BaseEvent and BaseEvent.prototype",
    members: () => [
      ...Object.getOwnPropertyNames(BaseEvent),
      ...Object.getOwnPropertyNames(BaseEvent.prototype),
    ],
    kept: "toJSON",
    retired: ["fromJSON"],
  },
  {
    holder: "event classes exported by lib/events",
    members: () => sourceFiles("src/lib/events").flatMap(namesExportedBy),
    kept: "UserRegisteredEvent",
    retired: [
      "UserLoggedInEvent",
      "UserLoggedOutEvent",
      "PasswordResetRequestedEvent",
      "PasswordResetCompletedEvent",
      "EmailVerificationSentEvent",
      "EmailVerifiedEvent",
      "TwoFactorEnabledEvent",
      "TwoFactorDisabledEvent",
      "SuspiciousActivityEvent",
      "LoginFailedEvent",
      "AccountLockedEvent",
      "AccountUnlockedEvent",
      "RateLimitExceededEvent",
      "UnauthorizedAccessEvent",
      "SecurityAlertEvent",
      "DatabaseErrorEvent",
      "ApplicationStartedEvent",
      "ApplicationStoppedEvent",
      "HealthCheckEvent",
      "PerformanceMetricEvent",
    ],
  },
  {
    holder: "listeners, store and provider names exported by lib/events",
    members: () => sourceFiles("src/lib/events").flatMap(namesExportedBy),
    kept: "AuditLogHandler",
    retired: [
      "NotificationHandler",
      "getNotificationHandler",
      "InMemoryEventStore",
      "IEventStore",
      "EventFilter",
      "getEventStore",
      "eventStore",
    ],
  },
  {
    holder: "names exported by two-factor.ts",
    members: () => namesExportedBy("src/lib/two-factor.ts"),
    kept: "validateTOTPCode",
    retired: ["isValidTOTPFormat", "isValidBackupCodeFormat"],
  },
  {
    holder: "modules under src/types",
    members: () => sourceFiles("src/types"),
    kept: "src/types/next-auth.d.ts",
    retired: ["src/types/routes.ts"],
  },
  {
    holder: "names exported by test/builders/base.builder.ts",
    members: () => namesExportedBy("src/test/builders/base.builder.ts"),
    kept: "ChainableBuilder",
    retired: [
      "CompositeBuilder",
      "StatefulBuilder",
      "BuilderFactory",
      "BuilderMethods",
      "createBuilder",
    ],
  },
  {
    holder: "names exported by test/builders/account.builder.ts",
    members: () => namesExportedBy("src/test/builders/account.builder.ts"),
    kept: "AccountBuilder",
    retired: ["AccountBuilderFactory", "accountBuilders", "AccountScenarios"],
  },
  {
    holder: "names exported by test/builders/session.builder.ts",
    members: () => namesExportedBy("src/test/builders/session.builder.ts"),
    kept: "SessionBuilder",
    retired: [
      "NextAuthSessionBuilder",
      "SessionBuilderFactory",
      "sessionBuilders",
    ],
  },
  {
    holder: "names exported by test/builders/user.builder.ts",
    members: () => namesExportedBy("src/test/builders/user.builder.ts"),
    kept: "UserBuilder",
    retired: ["userBuilders", "UserBuilderFactory"],
  },
  {
    holder: "names exported by test/utils/test-utils.tsx",
    members: () => namesExportedBy("src/test/utils/test-utils.tsx"),
    kept: "generate",
    retired: [
      "render",
      "createUser",
      "waitFor",
      "createDeferredPromise",
      "mockConsole",
      "mockFetch",
      "timing",
      "assert",
      "TestCleanup",
      "userEvent",
    ],
  },
  {
    holder: "names exported by utils/form-responses.ts",
    members: () => namesExportedBy("src/lib/utils/form-responses.ts"),
    kept: "createErrorResponse",
    retired: [
      "CommonErrorType",
      "createGenericErrorResponse",
      "isSuccessResponse",
      "hasFieldErrors",
      "withErrorHandling",
    ],
  },
  {
    holder: "names exported by utils/form-locale-server.ts",
    members: () => namesExportedBy("src/lib/utils/form-locale-server.ts"),
    kept: "resolveFormLocale",
    retired: ["getFormTranslations"],
  },
  {
    holder: "names exported by components/ui/card.tsx",
    members: () => namesExportedBy("src/components/ui/card.tsx"),
    kept: "CardContent",
    retired: ["CardFooter"],
  },
  {
    holder: "AuditMiddleware.prototype",
    members: () => Object.getOwnPropertyNames(AuditMiddleware.prototype),
    kept: "getAuditLogs",
    retired: ["getAuditLogsByUser", "clearAuditLogs"],
  },
  {
    holder: "scripts of package.json",
    members: () => Object.keys(packageJson().scripts ?? {}),
    kept: "test:e2e:chromium",
    retired: ["test:e2e:firefox", "test:e2e:webkit"],
  },
  {
    holder: "dependencies of package.json",
    members: () => [
      ...Object.keys(packageJson().dependencies ?? {}),
      ...Object.keys(packageJson().devDependencies ?? {}),
    ],
    kept: "next-intl",
    retired: ["negotiator", "@types/negotiator"],
  },
  {
    holder: "fields and methods of BaseCommand",
    members: () =>
      classMembers("src/lib/commands/base/command.base.ts", "BaseCommand"),
    kept: "logExecution",
    retired: ["executedAt", "commandId"],
  },
  {
    holder: "names exported by actions/auth.ts",
    members: () => namesExportedBy("src/lib/actions/auth.ts"),
    kept: "registerUser",
    retired: ["getUserAccountInfo", "migrateUserAccountMetadata"],
  },
  {
    holder: "names exported by actions/advanced-auth.ts",
    members: () => namesExportedBy("src/lib/actions/advanced-auth.ts"),
    kept: "setupTwoFactorAuth",
    retired: [
      "initiateAccountLinking",
      "getEnhancedUserAccountInfo",
      "confirmAccountLinking",
    ],
  },
  {
    holder: "names exported by email.ts",
    members: () => namesExportedBy("src/lib/email.ts"),
    kept: "sendVerificationEmail",
    retired: ["sendAccountLinkConfirmation", "createAccountLinkTemplate"],
  },
  {
    holder: "names exported by utils/server-translations.ts",
    members: () => namesExportedBy("src/lib/utils/server-translations.ts"),
    kept: "translateError",
    retired: ["translateCommonError"],
  },
  {
    holder: "RATE_LIMITS",
    members: () => Object.keys(RATE_LIMITS),
    kept: "emailVerify",
    retired: ["accountLink"],
  },
  {
    holder: "pages and route handlers under src/app",
    members: () => sourceFiles("src/app"),
    kept: "src/app/[locale]/verify-email/[token]/page.tsx",
    retired: ["src/app/[locale]/link-account/confirm/[token]/page.tsx"],
  },
  {
    holder: "routes of utils/navigation",
    members: () => Object.keys(routes),
    kept: "dashboard",
    retired: [
      "linkAccount",
      "home",
      "account",
      "signin",
      "register",
      "error",
      "verifyEmail",
    ],
  },
  {
    holder: "names exported by utils/navigation.ts",
    members: () => namesExportedBy("src/lib/utils/navigation.ts"),
    kept: "switchLocale",
    retired: ["localizedRedirect", "isProtectedRoute", "isPublicRoute"],
  },
  {
    holder: "models of prisma/schema.prisma",
    members: prismaModels,
    kept: "EmailVerificationToken",
    retired: ["AccountLinkRequest", "PasswordResetToken"],
  },
  {
    holder: "fields of User in prisma/schema.prisma",
    members: () => prismaFields("User"),
    kept: "twoFactorEnabled",
    retired: [
      "passwordResetTokens",
      "lastLoginIp",
      "requiresPasswordChange",
      "emailVerificationRequired",
      "twoFactorEnabledAt",
    ],
  },
  {
    holder: "members of UpdateUserDTO",
    members: () =>
      interfaceMembers(
        "src/lib/repositories/user/user.repository.interface.ts",
        "UpdateUserDTO",
      ),
    kept: "lastPasswordChange",
    retired: ["requiresPasswordChange"],
  },
  {
    holder: "security event types (string literals of security.ts)",
    members: () => stringLiteralsIn("src/lib/security.ts"),
    kept: "account_unlinked",
    retired: ["account_linked", "password_reset"],
  },
  {
    holder: "security alert types (string literals of email.ts)",
    members: () => stringLiteralsIn("src/lib/email.ts"),
    kept: "2fa_enabled",
    retired: ["account_linked"],
  },
  {
    holder: "gradients of the page layouts (string literals of both files)",
    members: () => [
      ...stringLiteralsIn("src/components/layouts/gradient-page-layout.tsx"),
      ...stringLiteralsIn("src/components/layouts/form-page-layout.tsx"),
    ],
    kept: "from-blue-50 via-white to-purple-50",
    retired: [
      "green-blue",
      "blue-purple",
      "purple-pink",
      "from-purple-50 via-white to-pink-50",
    ],
  },
  {
    holder: "props of GradientPageLayout",
    members: () =>
      interfaceMembers(
        "src/components/layouts/gradient-page-layout.tsx",
        "GradientPageLayoutProps",
      ),
    kept: "children",
    retired: ["gradient"],
  },
  {
    holder: "props of FormPageLayout",
    members: () =>
      interfaceMembers(
        "src/components/layouts/form-page-layout.tsx",
        "FormPageLayoutProps",
      ),
    kept: "maxWidth",
    retired: ["gradient"],
  },
  {
    holder: "namespaces of the message files",
    members: () => messageKeys(),
    kept: "EmailVerification",
    retired: ["AccountLinking"],
  },
  {
    holder: "keys of Errors in the message files",
    members: () => messageKeys("Errors"),
    kept: "failedToVerifyEmail",
    retired: [
      "invalidLinkingToken",
      "accountLinkingCompleted",
      "linkingTokenExpired",
      "failedToConfirmAccountLinking",
    ],
  },
  {
    holder: "keys of Success in the message files",
    members: () => messageKeys("Success"),
    kept: "emailVerified",
    retired: ["accountLinked"],
  },
];

/** Sources without comments, by repo-relative path ("/" as separator). */
interface Tree {
  /** The files under src. */
  modules: Map<string, string>;
  /** The files outside src that can import a module or mention a name. */
  outside: Map<string, string>;
}

/**
 * The source without its comments. The TypeScript parser splits the file into
 * tokens, and what stands before a token is white space and comments. A `//`
 * or a comment opener inside a string, a template, a regular expression or
 * JSX text is part of a token and stays.
 */
function withoutComments(file: string, source: string): string {
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest);
  let code = "";
  let copied = 0;
  const visit = (node: ts.Node): void => {
    // The parser hands out a JSDoc comment as a node of its own. It goes with
    // the white space of the token after it.
    const children = node
      .getChildren(parsed)
      .filter((child) => !ts.isJSDoc(child));
    if (children.length > 0) {
      children.forEach(visit);
      return;
    }
    const start = node.getStart(parsed);
    code +=
      source.slice(copied, node.pos) +
      source.slice(node.pos, start).replace(/\S+/g, "");
    copied = start;
  };
  visit(parsed);
  return code + source.slice(copied);
}

function treeOf(
  modules: Record<string, string>,
  outside: Record<string, string>,
): Tree {
  const strip = (files: Record<string, string>) =>
    new Map(
      Object.entries(files).map(([file, source]): [string, string] => [
        file,
        withoutComments(file, source),
      ]),
    );
  return { modules: strip(modules), outside: strip(outside) };
}

const SOURCE_FILE = /\.(?:ts|tsx|js|jsx|mjs|cjs)$/;
// The generated Prisma client is not code of this repository.
const SKIPPED_DIRECTORIES = ["src/generated"];

/** The source files in `dir` (repo-relative), by default with its subdirectories. */
function sourceFiles(dir: string, recursive = true): string[] {
  return fs
    .readdirSync(path.join(REPO_ROOT, dir), { withFileTypes: true })
    .flatMap((entry) => {
      const file = path.posix.join(dir, entry.name);
      if (entry.isDirectory()) {
        return recursive && !SKIPPED_DIRECTORIES.includes(file)
          ? sourceFiles(file)
          : [];
      }
      return SOURCE_FILE.test(entry.name) ? [file] : [];
    });
}

/** The names that a file of the repository exports. */
function namesExportedBy(file: string): string[] {
  const source = fs.readFileSync(path.join(REPO_ROOT, file), "utf8");
  return [...exportedNames(withoutComments(file, source)).keys()];
}

/**
 * The text of every string literal in a file of the repository: the members
 * of a string-literal type, the keys and values of an object, the values of
 * JSX attributes. Comments are not literals.
 */
function stringLiteralsIn(file: string): string[] {
  const source = fs.readFileSync(path.join(REPO_ROOT, file), "utf8");
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest);
  const texts: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteralLike(node)) texts.push(node.text);
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return texts;
}

/** The scripts and the dependencies that package.json names. */
function packageJson(): {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
} {
  return JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"),
  );
}

/** The models that prisma/schema.prisma declares. */
function prismaModels(): string[] {
  const schema = fs.readFileSync(
    path.join(REPO_ROOT, "prisma/schema.prisma"),
    "utf8",
  );
  return [...schema.matchAll(/^model (\w+) \{/gm)].map((match) => match[1]);
}

/**
 * The fields that a model declares in the text of a Prisma schema: its
 * columns and its relations. An attribute of the model (`@@index`) is no
 * field, and neither is a comment. The body of the model ends at the line
 * that starts with its closing brace: a brace inside a field
 * (`@default("{}")`) or inside a comment does not end it. Prisma does not ask
 * for indentation, so a field counts with or without it.
 */
function fieldsOfModel(schema: string, model: string): string[] {
  const body = new RegExp(`^model ${model} \\{$([\\s\\S]*?)^\\}`, "m").exec(
    schema,
  );
  return [...(body?.[1] ?? "").matchAll(/^[ \t]*(\w+)[ \t]/gm)].map(
    (match) => match[1],
  );
}

/** The fields that a model of prisma/schema.prisma declares. */
function prismaFields(model: string): string[] {
  return fieldsOfModel(
    fs.readFileSync(path.join(REPO_ROOT, "prisma/schema.prisma"), "utf8"),
    model,
  );
}

/**
 * The names of the members of an interface that a file of the repository
 * declares: the props of a component, the fields of a DTO.
 */
function interfaceMembers(file: string, name: string): string[] {
  const source = fs.readFileSync(path.join(REPO_ROOT, file), "utf8");
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest);
  return parsed.statements
    .filter(ts.isInterfaceDeclaration)
    .filter((declaration) => declaration.name.text === name)
    .flatMap((declaration) => [...declaration.members])
    .map((member) => member.name?.getText(parsed) ?? "");
}

/**
 * The names of the fields and methods that a class of a file of the
 * repository declares. A field without an initial value is not on the
 * prototype, so the source is read.
 */
function classMembers(file: string, name: string): string[] {
  const source = fs.readFileSync(path.join(REPO_ROOT, file), "utf8");
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest);
  return parsed.statements
    .filter(ts.isClassDeclaration)
    .filter((declaration) => declaration.name?.text === name)
    .flatMap((declaration) => [...declaration.members])
    .map((member) => member.name?.getText(parsed) ?? "");
}

/**
 * The keys of a namespace in every messages/*.json file, or the namespaces
 * themselves when none is named. A key that one file alone has is in the
 * list.
 */
function messageKeys(namespace?: string): string[] {
  const directory = path.join(REPO_ROOT, "messages");
  return fs
    .readdirSync(directory)
    .filter((file) => file.endsWith(".json"))
    .flatMap((file) => {
      const messages: Record<string, Record<string, unknown>> = JSON.parse(
        fs.readFileSync(path.join(directory, file), "utf8"),
      );
      return Object.keys(namespace ? (messages[namespace] ?? {}) : messages);
    });
}

function readTree(): Tree {
  const read = (files: string[]) =>
    Object.fromEntries(
      files.map((file) => [
        file,
        fs.readFileSync(path.join(REPO_ROOT, file), "utf8"),
      ]),
    );
  return treeOf(
    read(sourceFiles("src").filter((file) => file !== THIS_FILE)),
    read([
      ...sourceFiles("e2e"),
      ...sourceFiles("scripts"),
      ...sourceFiles("prisma"),
      ...sourceFiles("", false),
    ]),
  );
}

// Jest takes every file in a `__tests__` directory for a test suite (its
// default `testMatch`), so each of them is a test here as well. A file named
// `*.typecheck.ts` is a test too: a compile-time test that `tsc` checks and
// nothing imports.
const isTest = (file: string) =>
  file.includes("/__tests__/") ||
  /\.test\.tsx?$/.test(file) ||
  file.endsWith(".typecheck.ts");

const isDeclaration = (file: string) => file.endsWith(".d.ts");

// Entry points: nothing imports them. The framework loads these by name, and
// the compiler loads every declaration file. Every file outside src (e2e,
// scripts, prisma, the configuration in the root) is an entry point as well.
const APP_ENTRY =
  /^src\/app\/(?:.+\/)?(?:page|layout|route|loading|error|global-error|not-found|template|default)\.tsx?$/;
const FRAMEWORK_ENTRIES = [
  "src/middleware.ts",
  "src/instrumentation.ts",
  "src/i18n.ts",
];

const SPECIFIERS = [
  /\bfrom\s*["']([^"'\n]+)["']/g, // import ... from "x", export ... from "x"
  /\bimport\s*["']([^"'\n]+)["']/g, // import "x"
  // The specifier of a call may be a template without `${}`.
  /\bimport\s*\(\s*["'`]([^"'`\n]+)["'`]\s*\)/g, // import("x"), typeof import("x")
  // require("x"), jest.requireActual<T>("x"), jest.requireMock("x"); the
  // formatter adds a comma after the specifier when it wraps the call.
  /\b(?:require|requireActual|requireMock)\s*(?:<[^\n]*?>)?\s*\(\s*["'`]([^"'`\n]+)["'`]\s*,?\s*\)/g,
];

function specifiersOf(code: string): string[] {
  return SPECIFIERS.flatMap((pattern) =>
    [...code.matchAll(pattern)].map((match) => match[1]),
  );
}

// The extensions that a specifier may leave out.
const IMPLIED_EXTENSIONS = ["ts", "tsx", "js", "jsx"];

/** The module that `specifier` names in `from`; nothing for a package or a file outside src. */
function resolveModule(
  from: string,
  specifier: string,
  modules: Map<string, string>,
): string[] {
  let base: string;
  if (specifier.startsWith("@/")) {
    base = `src/${specifier.slice(2)}`;
  } else if (specifier.startsWith(".")) {
    base = path.posix.join(path.posix.dirname(from), specifier);
  } else {
    return [];
  }
  const found = [
    base,
    ...IMPLIED_EXTENSIONS.map((extension) => `${base}.${extension}`),
    ...IMPLIED_EXTENSIONS.map((extension) => `${base}/index.${extension}`),
  ].find((candidate) => modules.has(candidate));
  return found ? [found] : [];
}

/**
 * `orphans`: modules that neither an entry point nor a test reaches.
 * `testOnly`: modules outside src/test that only the tests under src reach.
 */
function unreachableModules(tree: Tree): {
  orphans: string[];
  testOnly: string[];
} {
  const files = [...tree.modules.keys()].sort();
  const importsOf = (file: string, code: string) =>
    specifiersOf(code).flatMap((specifier) =>
      resolveModule(file, specifier, tree.modules),
    );
  const reachedFrom = (roots: string[]) => {
    const reached = new Set<string>();
    const queue = [...roots];
    for (let file = queue.pop(); file !== undefined; file = queue.pop()) {
      if (reached.has(file)) continue;
      reached.add(file);
      queue.push(...importsOf(file, tree.modules.get(file) ?? ""));
    }
    return reached;
  };

  const byEntryPoints = reachedFrom([
    ...files.filter(
      (file) =>
        !isTest(file) &&
        (APP_ENTRY.test(file) ||
          FRAMEWORK_ENTRIES.includes(file) ||
          isDeclaration(file)),
    ),
    ...[...tree.outside].flatMap(([file, code]) => importsOf(file, code)),
  ]);
  const byTests = reachedFrom(files.filter(isTest));
  const candidates = files.filter(
    (file) => !isTest(file) && !isDeclaration(file) && !byEntryPoints.has(file),
  );

  return {
    orphans: candidates.filter((file) => !byTests.has(file)),
    testOnly: candidates.filter(
      (file) => byTests.has(file) && !file.startsWith("src/test/"),
    ),
  };
}

// A default export is not read: every importer gives it a name of its own,
// and A says whether its module is used.
const EXPORTED_NAME =
  /^export (?:async )?(?:abstract )?(?:function|const|let|class|interface|type|enum) (\w+)/gm;
// export { a, b as c }, export type { D }; not `export { a } from "x"`
const EXPORT_LIST = /^export (?:type )?\{([^}]*)\}(?!\s*from\b)/gm;
// export const { a, b: c } = ...
const EXPORTED_PATTERN = /^export (?:const|let) \{([^}]*)\}/gm;

/**
 * The names that `code` exports, each with the number of times its definition
 * writes it: once in a declaration; twice in an export list, which names what
 * the file declares or imports elsewhere, and once when the list renames it.
 */
function exportedNames(code: string): Map<string, number> {
  const names = new Map<string, number>();
  const add = (name: string, times: number) =>
    names.set(name, (names.get(name) ?? 0) + times);
  // The words of each entry of a list, without a default value: the last one
  // is the name.
  const entriesOf = (list: string) =>
    list
      .split(",")
      .map((entry) => entry.split("=")[0].match(/\w+/g) ?? [])
      .filter((words) => words.length > 0 && words.at(-1) !== "default");

  for (const [, name] of code.matchAll(EXPORTED_NAME)) add(name, 1);
  for (const [, list] of code.matchAll(EXPORT_LIST)) {
    for (const words of entriesOf(list)) {
      add(words.at(-1) ?? "", words.at(-2) === "as" ? 1 : 2);
    }
  }
  for (const [, list] of code.matchAll(EXPORTED_PATTERN)) {
    for (const words of entriesOf(list)) add(words.at(-1) ?? "", 1);
  }
  return names;
}

// The exports of these files are read by the framework or are test support.
const exportsAreChecked = (file: string) =>
  !isTest(file) &&
  !isDeclaration(file) &&
  !file.startsWith("src/app/") &&
  !file.startsWith("src/test/") &&
  !FRAMEWORK_ENTRIES.includes(file);

/**
 * "file#name" for every exported name that no file of the tree writes, as a
 * whole word, more often than the file defines it. A second definition of the
 * same name in another checked file is no mention. In a file whose exports are
 * not checked every occurrence is a mention: a route that imports a handler
 * and exports it again in a list is its only reader.
 */
function unreferencedExports(tree: Tree): string[] {
  const mentioned = new Set<string>();
  const sources: [string, string, boolean][] = [
    ...[...tree.modules].map(([file, code]): [string, string, boolean] => [
      file,
      code,
      exportsAreChecked(file),
    ]),
    ...[...tree.outside].map(([file, code]): [string, string, boolean] => [
      file,
      code,
      false,
    ]),
  ];
  for (const [, code, checked] of sources) {
    const defined = checked ? exportedNames(code) : new Map<string, number>();
    const written = new Map<string, number>();
    for (const word of code.match(/\w+/g) ?? []) {
      written.set(word, (written.get(word) ?? 0) + 1);
    }
    for (const [word, times] of written) {
      if (times > (defined.get(word) ?? 0)) mentioned.add(word);
    }
  }

  return [...tree.modules]
    .filter(([file]) => exportsAreChecked(file))
    .flatMap(([file, code]) =>
      [...exportedNames(code).keys()]
        .filter((name) => !mentioned.has(name))
        .map((name) => `${file}#${name}`),
    )
    .sort();
}

// A check that finds nothing in a tree it cannot read would pass. This tree
// has a known answer.
describe("the checks, on a tree with a known answer", () => {
  const fixture = treeOf(
    {
      "src/app/[locale]/page.tsx": [
        'import { used } from "@/lib/used";',
        'import { Panel } from "@/components/panel";',
        'import { Legacy } from "@/components/legacy";',
        'import renamed from "@/lib/default-export";',
        'import { listedUsed, first } from "@/lib/listed";',
        "export default function Page() {",
        "  return [used, Panel, Legacy, renamed, listedUsed, first];",
        "}",
      ].join("\n"),
      "src/app/[locale]/helper.tsx": "export const notAnEntryPoint = 1;",
      // The framework reads GET from the route; the list is its only mention.
      "src/app/api/thing/route.ts": [
        'import { GET } from "@/lib/handler";',
        "export { GET };",
      ].join("\n"),
      "src/lib/handler.ts": "export function GET() {}",
      "src/lib/used.ts": [
        'export { barrel } from "./barrel";',
        'import "./literals";',
        'import "./same-a";',
        'import "./same-b";',
        "export const used = 1; // unusedHelper() is named after this code",
        "/**",
        " * unusedHelper() is named in this comment and called nowhere.",
        " * @see unusedHelper",
        " */",
        "export async function unusedHelper() {",
        '  const lazy = (await import("./lazy")).lazy;',
        "  const byTemplate = (await import(`./by-template`)).byTemplate;",
        '  return lazy + byTemplate + require("./required").required;',
        "}",
        '// import "./commented-out";',
        "export type OnlyInAString = 'OnlyInAString';",
        "export interface UsedByATest {}",
      ].join("\n"),
      // A comment opener or a quote inside a literal is text: what follows it
      // is still code, and a comment after it is still a comment.
      "src/lib/literals.tsx": [
        'const trimmed = (value: string) => value.replace(/\\/*$/, "");',
        'import "./after-regex";',
        'const glob = "src/*";',
        'import "./after-string";',
        "const escaped = 'it\\'s /* text';",
        'import "./after-escape";',
        "const Text = () => <p>src/*</p>;",
        'import "./after-jsx-text";',
        "const page = `",
        "// onlyInATemplate is named in this line of a template",
        "`;",
        "export const onlyInATemplate = 1;",
        "const backtick = /`/;",
        "// afterBacktick is named in this comment only",
        "export const afterBacktick = 1;",
      ].join("\n"),
      "src/lib/after-regex.ts": "",
      "src/lib/after-string.ts": "",
      "src/lib/after-escape.ts": "",
      "src/lib/after-jsx-text.ts": "",
      "src/lib/same-a.ts": "export function sameName() {}",
      "src/lib/same-b.ts": "export function sameName() {}",
      "src/lib/default-export.ts": "export default function DefaultName() {}",
      "src/lib/listed.ts": [
        "const listedUsed = 1;",
        "const listedUnused = 1;",
        "const local = 1;",
        "const inner = 1;",
        "export { listedUsed, listedUnused, local as renamedUnused };",
        "export { inner as namedInAString };",
        "export const label = 'namedInAString';",
        'export const { first, second: secondUnused } = JSON.parse("{}");',
      ].join("\n"),
      "src/components/panel/index.tsx": "export const Panel = () => null;",
      "src/components/legacy.jsx": "export const Legacy = () => null;",
      "src/lib/barrel/index.ts": "export const barrel = 1;",
      "src/lib/lazy.ts": "export const lazy = 1;",
      "src/lib/by-template.ts": "export const byTemplate = 1;",
      "src/lib/required.js": "module.exports = { required: 1 };",
      "src/lib/commented-out.ts": "export const commentedOut = 1;",
      "src/lib/orphan.ts": 'import "./orphan-too";',
      "src/lib/orphan-too.ts": "export const orphanToo = 1;",
      "src/lib/by-script.ts": "export const byScript = 1;",
      "src/lib/test-only.ts": "export const testOnly = 1;",
      "src/lib/__tests__/test-only.test.ts": [
        'import { testOnly } from "../test-only";',
        'import type { UsedByATest } from "@/lib/used";',
        'import { support } from "@/test/support";',
        'import { label } from "@/lib/listed";',
        "const actual =",
        '  jest.requireActual<Record<string, number>>("@/test/actual-only");',
        "const mock =",
        '  jest.requireMock<typeof import("@/test/support")>("@/test/mock-only");',
        "const wrapped = jest.requireActual<Record<string, number>>(",
        '  "@/test/wrapped-only",',
        ");",
      ].join("\n"),
      "src/lib/__tests__/holds-no-test.ts": "",
      "src/lib/shape.typecheck.ts": 'import "./checked-shape";',
      "src/lib/checked-shape.ts": "export const checkedShape = 1;",
      "src/test/support.ts": "export const support = 1;",
      "src/test/actual-only.ts": "export const actualOnly = 1;",
      "src/test/mock-only.ts": "export const mockOnly = 1;",
      "src/test/wrapped-only.ts": "export const wrappedOnly = 1;",
      "src/test/unused-support.ts": "export const unusedSupport = 1;",
      "src/types/ambient.d.ts":
        'import type { AmbientShape } from "@/lib/ambient-shape";',
      "src/lib/ambient-shape.ts": "export type AmbientShape = string;",
    },
    {
      "scripts/run.ts": 'import { byScript } from "../src/lib/by-script";',
      "next.config.ts": 'import pkg from "some-package";',
    },
  );

  it("reports the modules that nothing reaches, and those that only tests reach", () => {
    expect(unreachableModules(fixture)).toEqual({
      orphans: [
        "src/app/[locale]/helper.tsx",
        "src/lib/commented-out.ts",
        "src/lib/orphan-too.ts",
        "src/lib/orphan.ts",
        "src/test/unused-support.ts",
      ],
      testOnly: ["src/lib/checked-shape.ts", "src/lib/test-only.ts"],
    });
  });

  it("reports the exported names that nothing else mentions", () => {
    expect(unreferencedExports(fixture)).toEqual([
      "src/lib/checked-shape.ts#checkedShape",
      "src/lib/commented-out.ts#commentedOut",
      "src/lib/listed.ts#listedUnused",
      "src/lib/listed.ts#renamedUnused",
      "src/lib/listed.ts#secondUnused",
      "src/lib/literals.tsx#afterBacktick",
      "src/lib/orphan-too.ts#orphanToo",
      "src/lib/same-a.ts#sameName",
      "src/lib/same-b.ts#sameName",
      "src/lib/used.ts#unusedHelper",
    ]);
  });

  it("reads the names of an export list and of a destructuring export", () => {
    expect([
      ...exportedNames(
        "export { a as default, a as b, a };\nexport type { T };",
      ),
    ]).toEqual([
      ["b", 1],
      ["a", 2],
      ["T", 2],
    ]);
    expect([
      ...exportedNames("export const { c, d: e = 1, ...f } = g;"),
    ]).toEqual([
      ["c", 1],
      ["e", 1],
      ["f", 1],
    ]);
  });

  it("reads the fields of a Prisma model past a brace inside its body, indented or not", () => {
    const schema = [
      "model Before {",
      "  id String @id",
      "}",
      "",
      "model User {",
      "  id       String @id @default(cuid())",
      '  settings Json   @default("{}")',
      "  // a comment with a brace }",
      "  email    String @unique",
      "name String?",
      "",
      "  @@index([email])",
      "}",
      "",
      "model After {",
      "  userId String @id",
      "}",
    ].join("\n");
    const fields = ["id", "settings", "email", "name"];

    expect(fieldsOfModel(schema, "User")).toEqual(fields);
    expect(fieldsOfModel(schema.replace(/\n/g, "\r\n"), "User")).toEqual(
      fields,
    );
    expect(fieldsOfModel(schema, "Nobody")).toEqual([]);
  });
});

describe("dead code in this repository", () => {
  const tree = readTree();

  it("reads the sources", () => {
    expect(tree.modules.size).toBeGreaterThan(100);
    expect([...tree.modules.keys()]).toEqual(
      expect.arrayContaining([
        "src/middleware.ts",
        "src/app/[locale]/page.tsx",
        "src/test/unit/__tests__/auth.unit.test.ts",
      ]),
    );
    expect(THIS_FILE).toBe("src/test/unit/__tests__/dead-code.test.ts");
    expect(tree.modules.has(THIS_FILE)).toBe(false);
    expect([...tree.outside.keys()]).toEqual(
      expect.arrayContaining([
        "e2e/global-setup.ts",
        "scripts/create-user.ts",
        "prisma/seed.ts",
        "playwright.config.ts",
        "jest.setup.js",
      ]),
    );
    expect(
      [...tree.modules.keys()].filter((file) =>
        file.startsWith("src/generated/"),
      ),
    ).toEqual([]);
  });

  it("every allowed entry gives its reason", () => {
    const allowed = Object.entries({
      ...ALLOWED_ORPHANS,
      ...ALLOWED_TEST_ONLY,
      ...ALLOWED_UNUSED_EXPORTS,
    });

    expect(
      allowed.filter(([, reason]) => reason.trim() === "").map(([key]) => key),
    ).toEqual([]);
  });

  describe("A. no orphan modules", () => {
    const { orphans, testOnly } = unreachableModules(tree);

    it("every module under src is reachable from an entry point or from a test", () => {
      expect(orphans).toEqual(Object.keys(ALLOWED_ORPHANS).sort());
    });

    it("no module outside src/test is kept alive by Jest tests alone", () => {
      expect(testOnly).toEqual(Object.keys(ALLOWED_TEST_ONLY).sort());
    });
  });

  describe("B. no unreferenced exports", () => {
    it("every exported name is mentioned outside its definition", () => {
      expect(unreferencedExports(tree)).toEqual(
        Object.keys(ALLOWED_UNUSED_EXPORTS).sort(),
      );
    });
  });

  describe("C. retired members stay retired", () => {
    it.each(RETIRED)("$holder", ({ members, kept, retired }) => {
      const present = members();

      expect(present).toContain(kept);
      expect(retired.filter((name) => present.includes(name))).toEqual([]);
    });
  });
});
