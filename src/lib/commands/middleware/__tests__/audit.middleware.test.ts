/**
 * @jest-environment node
 *
 * AuditMiddleware: the in-memory log is bounded and stores redacted copies.
 */
import { AuditMiddleware, DEFAULT_MAX_AUDIT_LOGS } from "../audit.middleware";
import type { CommandMetadata } from "../../base/command.interface";

const metadataFor = (commandId: string): CommandMetadata => ({
  commandId,
  timestamp: new Date(),
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

  describe("redaction (CB-4)", () => {
    it("redacts data.token in the stored entry and leaves the caller's object alone", async () => {
      const mw = new AuditMiddleware();
      const output = {
        success: true,
        data: { token: "nested-secret", userId: "u1" },
      };

      await mw.after("Cmd", { password: "p" }, output, metadataFor("c1"), 1);

      const [entry] = mw.getAuditLogs();
      expect(entry.output).toEqual({
        success: true,
        data: { token: "[REDACTED]", userId: "u1" },
      });
      expect(entry.input).toEqual({ password: "[REDACTED]" });
      expect(output.data.token).toBe("nested-secret");
    });

    it("redacts the input of a failed command", async () => {
      const mw = new AuditMiddleware();

      await mw.onError(
        "Cmd",
        { currentPassword: "Old123!", newPassword: "New123!", userId: "u1" },
        new Error("boom"),
        metadataFor("c1"),
      );

      const [entry] = mw.getAuditLogs();
      expect(entry.input).toEqual({
        currentPassword: "[REDACTED]",
        newPassword: "[REDACTED]",
        userId: "u1",
      });
      expect(entry.error).toBe("boom");
    });
  });
});
