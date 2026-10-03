/**
 * @jest-environment node
 *
 * AuditMiddleware: the in-memory log is bounded, and an entry keeps the
 * command name, the command id, the user id, the time, the duration and the
 * outcome: no input, no output, no error message and nothing else of the
 * command metadata.
 */
import { AuditMiddleware, DEFAULT_MAX_AUDIT_LOGS } from "../audit.middleware";
import type { CommandMetadata } from "../../base/command.interface";

const metadataFor = (commandId: string): CommandMetadata => ({
  commandId,
  timestamp: new Date(),
});

// The metadata of a command as an action builds it from a request (see
// requestMetadata in src/lib/actions/auth.ts). An entry keeps the two ids.
const REQUEST_METADATA: CommandMetadata = {
  commandId: "c1",
  userId: "u1",
  timestamp: new Date(),
  ipAddress: "203.0.113.9",
  userAgent: "Client-Chosen-Agent/1.0",
  locale: "de",
};

const REGISTRATION_INPUT = {
  name: "Alice Example",
  email: "alice@example.com",
  password: "Plain123!",
  confirmPassword: "Plain123!",
  locale: "de",
};

// Its `name` is the inherited "Error": only the class identifier tells it
// apart.
class RefusedError extends Error {}

// Says about itself what its message says: an own `constructor` property hides
// the class of the object.
class SelfNamedError extends Error {
  constructor(message: string) {
    super(message);
    Object.assign(this, { constructor: { name: message } });
  }
}

// A class whose name is free text, not an identifier.
class RenamedError extends Error {}
Object.defineProperty(RenamedError, "name", {
  value: "Refused alice@example.com",
});

describe("AuditMiddleware", () => {
  describe("memory cap (CB-3)", () => {
    it("keeps only the newest maxLogs entries", async () => {
      const mw = new AuditMiddleware(false, 3);

      for (let i = 0; i < 5; i++) {
        await mw.after("Cmd", { i }, { success: true }, metadataFor(`${i}`), 1);
      }

      expect(mw.getAuditLogs()).toHaveLength(3);
      expect(mw.getAuditLogs().map((log) => log.commandId)).toEqual([
        "2",
        "3",
        "4",
      ]);
    });

    it("counts error entries towards the same cap", async () => {
      const mw = new AuditMiddleware(false, 2);

      await mw.after("Cmd", {}, { success: true }, metadataFor("ok"), 1);
      await mw.onError("Cmd", {}, new Error("first"), metadataFor("e1"));
      await mw.onError("Cmd", {}, new Error("second"), metadataFor("e2"));

      expect(mw.getAuditLogs().map((log) => log.commandId)).toEqual([
        "e1",
        "e2",
      ]);
    });

    it("caps at DEFAULT_MAX_AUDIT_LOGS (1000) when no limit is given", async () => {
      expect(DEFAULT_MAX_AUDIT_LOGS).toBe(1000);
      const mw = new AuditMiddleware();

      for (let i = 0; i <= DEFAULT_MAX_AUDIT_LOGS; i++) {
        await mw.after("Cmd", {}, { success: true }, metadataFor(`${i}`), 1);
      }

      expect(mw.getAuditLogs()).toHaveLength(DEFAULT_MAX_AUDIT_LOGS);
      expect(mw.getAuditLogs()[0].commandId).toBe("1");
    });
  });

  describe("what an entry keeps (CB-4)", () => {
    it("a command that answered success: ids, time, duration and outcome", async () => {
      const mw = new AuditMiddleware();
      const output = {
        success: true,
        message: "Created alice@example.com",
        data: { token: "nested-secret", userId: "u1" },
      };

      await mw.after("Cmd", REGISTRATION_INPUT, output, REQUEST_METADATA, 12);

      expect(mw.getAuditLogs()).toStrictEqual([
        {
          commandName: "Cmd",
          commandId: "c1",
          userId: "u1",
          timestamp: expect.any(Date),
          duration: 12,
          success: true,
        },
      ]);
      // The caller's objects are left alone.
      expect(output.data.token).toBe("nested-secret");
      expect(REGISTRATION_INPUT.password).toBe("Plain123!");
    });

    it.each([
      ["a refusal", { success: false, message: "Refused alice@example.com" }],
      ["an answer without a success field", "done"],
      ["no answer", undefined],
    ])("%s is recorded as not successful", async (_case, output) => {
      const mw = new AuditMiddleware();

      await mw.after("Cmd", REGISTRATION_INPUT, output, REQUEST_METADATA, 7);

      expect(mw.getAuditLogs()).toStrictEqual([
        {
          commandName: "Cmd",
          commandId: "c1",
          userId: "u1",
          timestamp: expect.any(Date),
          duration: 7,
          success: false,
        },
      ]);
    });

    it("a command that threw: the class name of the error, not its message", async () => {
      const mw = new AuditMiddleware();

      await mw.onError(
        "Cmd",
        REGISTRATION_INPUT,
        new RefusedError("Refused alice@example.com"),
        REQUEST_METADATA,
      );

      expect(mw.getAuditLogs()).toStrictEqual([
        {
          commandName: "Cmd",
          commandId: "c1",
          userId: "u1",
          timestamp: expect.any(Date),
          success: false,
          errorType: "RefusedError",
        },
      ]);
    });

    // The class is read from the prototype of what was thrown and its name is
    // kept only when it is an identifier: no text of the error can take its
    // place.
    it.each([
      [
        "an error with a `constructor` property of its own: the name of its class",
        new SelfNamedError("Refused alice@example.com"),
        "SelfNamedError",
      ],
      [
        'an error of a class whose name is not an identifier: "Error"',
        new RenamedError("Refused alice@example.com"),
        "Error",
      ],
      [
        'an error of a class without a name: "Error"',
        new (class extends Error {})("Refused alice@example.com"),
        "Error",
      ],
    ])("%s", async (_case, thrown, errorType) => {
      const mw = new AuditMiddleware();

      await mw.onError("Cmd", REGISTRATION_INPUT, thrown, REQUEST_METADATA);

      expect(mw.getAuditLogs()).toStrictEqual([
        {
          commandName: "Cmd",
          commandId: "c1",
          userId: "u1",
          timestamp: expect.any(Date),
          success: false,
          errorType,
        },
      ]);
    });

    // The bus hands over whatever was thrown, which need not be an Error.
    it.each([
      ["a string", "Refused alice@example.com", "string"],
      ["null", null, "object"],
    ])(
      "what was thrown is %s: its type, never its text",
      async (_case, thrown, errorType) => {
        const mw = new AuditMiddleware();

        await mw.onError(
          "Cmd",
          REGISTRATION_INPUT,
          thrown as unknown as Error,
          REQUEST_METADATA,
        );

        expect(mw.getAuditLogs()).toStrictEqual([
          {
            commandName: "Cmd",
            commandId: "c1",
            userId: "u1",
            timestamp: expect.any(Date),
            success: false,
            errorType,
          },
        ]);
      },
    );
  });
});
