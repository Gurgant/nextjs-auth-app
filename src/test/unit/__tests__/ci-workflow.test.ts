/**
 * @jest-environment node
 */
import fs from "fs";
import path from "path";

// Source check on the CI workflow. The pre-commit hook compares the keys of
// the five message files with each other (`pnpm validate-translations`), but
// a hook runs on the machine of whoever commits, and can be skipped. CI has
// to run the same script. No Jest test runs the workflow, so this one reads
// it, as text: the repository has no YAML parser among its dependencies.

const REPO_ROOT = path.resolve(__dirname, "../../../..");
const WORKFLOW = path.join(REPO_ROOT, ".github/workflows/ci.yml");

/**
 * The one-line `run:` commands of a job, in the order of its steps. A job
 * starts at its name, two spaces deep, and ends before the next line that is
 * as deep (a comment counts). A command written as a block (`run: |`) is
 * left out.
 */
function commandsOf(workflow: string, job: string): string[] {
  const lines = workflow.split(/\r?\n/);
  const start = lines.indexOf(`  ${job}:`);
  if (start < 0) return [];
  const length = lines
    .slice(start + 1)
    .findIndex((line) => /^ {2}\S/.test(line));
  const body = lines.slice(
    start + 1,
    length < 0 ? undefined : start + 1 + length,
  );
  return body.flatMap((line) => {
    const command = /^\s+(?:- )?run: (.+)$/.exec(line)?.[1].trim();
    return command === undefined || command === "|" ? [] : [command];
  });
}

describe("commandsOf, on a workflow with a known answer", () => {
  const workflow = [
    "jobs:",
    "  # a comment between the jobs",
    "  first:",
    "    steps:",
    "      - name: Lint",
    "        run: pnpm lint",
    "",
    "      - name: A block",
    "        run: |",
    "          pnpm inside-a-block",
    "  second:",
    "    steps:",
    "      - run: pnpm test:e2e",
  ].join("\n");

  it("gives the commands of the job that is asked for, and of no other", () => {
    expect(commandsOf(workflow, "first")).toEqual(["pnpm lint"]);
    expect(commandsOf(workflow, "second")).toEqual(["pnpm test:e2e"]);
    expect(commandsOf(workflow.replace(/\n/g, "\r\n"), "first")).toEqual([
      "pnpm lint",
    ]);
    expect(commandsOf(workflow, "third")).toEqual([]);
  });
});

describe(".github/workflows/ci.yml: the checks job", () => {
  const commands = commandsOf(fs.readFileSync(WORKFLOW, "utf8"), "checks");

  it("is read with its commands", () => {
    expect(commands).toEqual(
      expect.arrayContaining(["pnpm typecheck", "pnpm lint", "pnpm test"]),
    );
  });

  it("validates the translations, as the pre-commit hook does", () => {
    expect(commands).toContain("pnpm validate-translations");
  });
});
