/**
 * @jest-environment node
 */
import fs from "fs";
import path from "path";

// Source checks on the E2E support code. The global setup once carried log
// strings damaged by a lost encoding (a raw control byte, a replacement
// character, leftover bytes of an emoji) and printed a password hash to the
// log. The wiring of the warm-up and of the compile guard is checked here as
// well: no Jest test loads playwright.config.ts or runs the global setup, and
// without the guard the E2E suite stays green.
// The file lives here because jest.config.js ignores paths under /e2e/.

const REPO_ROOT = path.resolve(__dirname, "../../../..");
const E2E_DIR = path.join(REPO_ROOT, "e2e");
const GLOBAL_SETUP = path.join(E2E_DIR, "global-setup.ts");
const PLAYWRIGHT_CONFIG = path.join(REPO_ROOT, "playwright.config.ts");
const COMPILE_GUARD = '["./e2e/support/compile-guard.ts"]';

function typeScriptFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return typeScriptFiles(full);
    return entry.name.endsWith(".ts") ? [full] : [];
  });
}

/** "line:column U+XXXX" for every control or replacement character. */
function damagedCharacters(text: string): string[] {
  const found: string[] = [];
  text.split("\n").forEach((line, index) => {
    for (let column = 0; column < line.length; column++) {
      const code = line.charCodeAt(column);
      const allowed = code === 0x09 || code === 0x0d; // tab, carriage return
      if ((code < 0x20 && !allowed) || code === 0x7f || code === 0xfffd) {
        found.push(
          `${index + 1}:${column + 1} U+${code.toString(16).toUpperCase().padStart(4, "0")}`,
        );
      }
    }
  });
  return found;
}

/** The text of every call that `start` opens, up to its closing bracket. */
function callsOf(source: string, start: RegExp): string[] {
  const calls: string[] = [];
  for (let match = start.exec(source); match; match = start.exec(source)) {
    let depth = 1;
    let end = start.lastIndex;
    while (end < source.length && depth > 0) {
      if (source[end] === "(") depth++;
      if (source[end] === ")") depth--;
      end++;
    }
    calls.push(source.slice(match.index, end));
  }
  return calls;
}

/** The text of every `console.<method>(...)` call. */
const consoleCalls = (source: string) => callsOf(source, /console\.\w+\(/g);

const QUOTES = ['"', "'", "`"];

/** The index after the string or template literal that opens at `from`. */
function endOfLiteral(source: string, from: number): number {
  let index = from + 1;
  while (index < source.length && source[index] !== source[from]) {
    index += source[index] === "\\" ? 2 : 1;
  }
  return index + 1;
}

/** The source without its comments. String literals stay as they are. */
function withoutComments(source: string): string {
  let code = "";
  let index = 0;
  while (index < source.length) {
    const two = source.slice(index, index + 2);
    if (two === "//") {
      while (index < source.length && source[index] !== "\n") index++;
    } else if (two === "/*") {
      const end = source.indexOf("*/", index + 2);
      index = end < 0 ? source.length : end + 2;
    } else if (QUOTES.includes(source[index])) {
      const end = endOfLiteral(source, index);
      code += source.slice(index, end);
      index = end;
    } else {
      code += source[index];
      index++;
    }
  }
  return code;
}

/**
 * The value of the property `name` of an object literal, cut into the pieces
 * that `?` and `:` separate at its top level: one piece for a plain value,
 * three (condition, then, else) for a conditional.
 */
function propertyValue(code: string, name: string): string[] {
  const start = code.search(new RegExp(`\\b${name}:`));
  if (start < 0) return [];
  const pieces = [""];
  let depth = 0;
  let index = code.indexOf(":", start) + 1;
  while (index < code.length) {
    const char = code[index];
    if (QUOTES.includes(char)) {
      const end = endOfLiteral(code, index);
      pieces[pieces.length - 1] += code.slice(index, end);
      index = end;
      continue;
    }
    if ("([{".includes(char)) depth++;
    if (")]}".includes(char)) depth--;
    if (depth < 0 || (depth === 0 && char === ",")) break;
    if (depth === 0 && (char === "?" || char === ":")) pieces.push("");
    else pieces[pieces.length - 1] += char;
    index++;
  }
  return pieces.map((piece) => piece.trim());
}

/** A call without the text of its string literals: what is left is code. */
function codeOf(call: string): string {
  return call
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, (template) =>
      (template.match(/\$\{[^}]*\}/g) ?? []).join(" "),
    );
}

describe("e2e support code: source checks", () => {
  const files = typeScriptFiles(E2E_DIR);

  it("finds the E2E TypeScript files", () => {
    expect(files).toContain(GLOBAL_SETUP);
    expect(files.length).toBeGreaterThan(5);
  });

  it("has no control character and no replacement character in any file", () => {
    const damaged = files.flatMap((file) =>
      damagedCharacters(fs.readFileSync(file, "utf8")).map(
        (where) => `${path.relative(REPO_ROOT, file)}:${where}`,
      ),
    );

    expect(damaged).toEqual([]);
  });

  describe("global-setup.ts", () => {
    const source = fs.readFileSync(GLOBAL_SETUP, "utf8");

    it.each([
      [
        "Connected to test database",
        'console.log("Connected to test database");',
      ],
      ["Cleaned test database", 'console.log("Cleaned test database");'],
      ["Seeded test data", 'console.log("Seeded test data");'],
      ["Global setup failed", 'console.error("Global setup failed:", error);'],
      [
        "Playwright global setup complete",
        'console.log("Playwright global setup complete");',
      ],
    ])("logs '%s' in plain ASCII, with nothing in front", (text, statement) => {
      const lines = source
        .split("\n")
        .filter((line) => line.includes(text))
        .map((line) => line.trim());

      expect(lines).toEqual([statement]);
    });

    it("prints no hash and no hash comparison", () => {
      const calls = consoleCalls(source);
      const printingAHash = calls.filter((call) =>
        /hash|compare/i.test(codeOf(call)),
      );

      // The scan sees the calls at all (a broken scan would pass vacuously).
      expect(calls.length).toBeGreaterThan(5);
      expect(printingAHash).toEqual([]);
    });
  });

  // The compile guard fails a run in which the dev server compiled while
  // tests were running. Without it in the reporter list no E2E test fails.
  describe("playwright.config.ts: the wiring of the compile guard", () => {
    const code = withoutComments(fs.readFileSync(PLAYWRIGHT_CONFIG, "utf8"));
    const [webServer] = propertyValue(code, "webServer");

    it("names the compile guard in the reporter list for CI and in the local one", () => {
      const [condition, inCI, local] = propertyValue(code, "reporter");

      expect(condition).toBe("process.env.CI");
      expect(inCI).toContain(COMPILE_GUARD);
      expect(local).toContain(COMPILE_GUARD);
    });

    it('pipes the output of the dev server to the reporters (stdout: "pipe")', () => {
      expect(webServer).toMatch(/\bstdout: "pipe"/);
    });

    it("gives the dev server no name, so its lines keep the prefix the guard reads", () => {
      expect(webServer).toContain("command:");
      expect(webServer).not.toMatch(/\bname:/);
    });

    it("reuses a server only with E2E_REUSE_SERVER=1, which the guard relies on", () => {
      expect(webServer).toContain(
        'reuseExistingServer: process.env.E2E_REUSE_SERVER === "1"',
      );
    });
  });

  describe("global-setup.ts: the wiring of the warm-up", () => {
    const code = withoutComments(fs.readFileSync(GLOBAL_SETUP, "utf8"));
    const warmUpCalls = callsOf(code, /\bwarmUp\(/g);

    it("awaits warmUp() once", () => {
      expect(warmUpCalls).toHaveLength(1);
      expect(code).toContain(`await ${warmUpCalls[0]}`);
    });

    it("sends each request without following redirects and with the timeout the warm-up gives it", () => {
      const requests = callsOf(warmUpCalls[0] ?? "", /\bapi\.get\(/g);

      expect(requests).toHaveLength(1);
      expect(requests[0]).toMatch(/\bmaxRedirects: 0\b/);
      expect(requests[0]).toMatch(/\btimeout: timeoutMs\b/);
    });
  });
});
