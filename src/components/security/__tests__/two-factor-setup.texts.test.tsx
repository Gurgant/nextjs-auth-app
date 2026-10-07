/**
 * What the 2FA set-up dialog (two-factor-setup.tsx) says outside its
 * headings and buttons: the two notes of the step with the QR code, and the
 * text file with the backup codes that the last step downloads. All of it is
 * read from messages/<locale>.json; the notes and the file used to be English
 * in every language.
 *
 * The file says what the application does: a code is entered in the sign-in
 * form, through the control that the file names by its label
 * (credentials-form.tsx); a code works once; and new codes are made only when
 * 2FA is disabled and enabled again (enableTwoFactorAuth in
 * src/lib/actions/advanced-auth.ts is the one caller of
 * generateNewBackupCodes, and it refuses an account that has 2FA enabled).
 * It is a text file in UTF-8, named after the day it was made, and that day
 * and the date inside it are the same local time.
 *
 * The Server Actions are mocks. The translator stand-in reads
 * messages/<locale>.json, fills in the values a text is handed and gives what
 * each <tag>…</tag> of a rich text wraps to the function of that name. It is
 * not next-intl: the real formatter is asked about the two notes in
 * src/test/unit/__tests__/rich-messages.real-formatter.test.ts.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import enMessages from "../../../../messages/en.json";
import esMessages from "../../../../messages/es.json";
import frMessages from "../../../../messages/fr.json";
import itMessages from "../../../../messages/it.json";
import deMessages from "../../../../messages/de.json";

let mockLocale = "en";
jest.mock("next-intl", () => ({
  useTranslations: (namespace: string) => {
    type Values = Record<string, unknown>;
    const textOf = (key: string): string =>
      key
        .split(".")
        .reduce(
          (node, part) => node[part],
          jest.requireActual(`../../../../messages/${mockLocale}.json`)[
            namespace
          ],
        );
    const filled = (text: string, values: Values = {}) =>
      text.replace(/\{(\w+)\}/g, (_, name: string) => String(values[name]));
    const translate = (key: string, values?: Values) =>
      filled(textOf(key), values);
    translate.rich = (key: string, values: Values) => {
      const { Fragment, createElement } = jest.requireActual("react");
      const text = filled(textOf(key), values);
      const parts: unknown[] = [];
      const tagged = /<(\w+)>(.*?)<\/\1>/g;
      let end = 0;
      for (const match of text.matchAll(tagged)) {
        parts.push(text.slice(end, match.index));
        parts.push((values[match[1]] as (chunks: string) => unknown)(match[2]));
        end = match.index + match[0].length;
      }
      parts.push(text.slice(end));
      return parts.map((part, index) =>
        createElement(Fragment, { key: index }, part),
      );
    };
    return translate;
  },
}));

const mockSetupTwoFactorAuth = jest.fn();
const mockEnableTwoFactorAuth = jest.fn();
jest.mock("@/lib/actions/advanced-auth", () => ({
  setupTwoFactorAuth: (...args: unknown[]) => mockSetupTwoFactorAuth(...args),
  enableTwoFactorAuth: (...args: unknown[]) => mockEnableTwoFactorAuth(...args),
}));

import { TwoFactorSetup } from "../two-factor-setup";

const MESSAGES = {
  en: enMessages,
  es: esMessages,
  fr: frMessages,
  it: itMessages,
  de: deMessages,
};
type Locale = keyof typeof MESSAGES;
const LOCALES = Object.keys(MESSAGES) as Locale[];
const TRANSLATIONS = LOCALES.filter((locale) => locale !== "en");

const SECRET = "JBSWY3DPEHPK3PXP";
const EMAIL = "reader@example.com";
// The codes that enabling 2FA answers with: the ones the file has to hold.
const CODES = ["AAAA-1111", "BBBB-2222", "CCCC-3333"];
// What the dialog asks the browser for while it makes the file. The time is
// taken in the browser's own zone: the day of the file name is the day of
// the date inside, and not the day in UTC, which differs for some hours.
const dateFor = (locale: string) => `the date as ${locale} writes it`;
const LOCAL_DAY = { year: 2031, month: 0, day: 9 };
const NAME_OF_THE_FILE = "auth-app-backup-codes-2031-01-09.txt";
const UTC_TIME = "1999-12-31T23:59:59.000Z";

/**
 * The sentences of a text file, each as it is said: without the dash of a
 * list item, the mark at its end and its capitals.
 */
const sentencesOf = (text: string) =>
  text
    .split("\n")
    .flatMap((line) => line.replace(/^- /, "").split(/(?<=[.!?])\s+/))
    .map((sentence) =>
      sentence
        .trim()
        .replace(/[.!?:]+$/, "")
        .toLowerCase(),
    )
    .filter((sentence) => sentence !== "");

/** The sentences that a text says more than once. */
const saidTwice = (text: string) => {
  const sentences = sentencesOf(text);
  return [
    ...new Set(
      sentences.filter(
        (sentence, index) => sentences.indexOf(sentence) !== index,
      ),
    ),
  ];
};

interface Download {
  text: string;
  /** The name the browser saves the file under. */
  name: string;
  /** The type of the Blob. */
  type: string | undefined;
}

/** A text as a reader sees it: without the tags of a rich text. */
const plain = (message: string) => message.replace(/<\/?\w+>/g, "");

// The French texts have a no-break space before "?", "!" and ":". The
// queries of the testing library turn it into a space before they compare,
// so the elements are found by their role and an exact comparison here.
const named = (text: string) => (name: string) =>
  name.replace(/\u00a0/g, " ") === text.replace(/\u00a0/g, " ");

/** The <strong> with exactly this text. */
function strong(text: string): HTMLElement {
  const found = [...document.querySelectorAll("strong")].filter(
    (element) => element.textContent === text,
  );
  expect(found).toHaveLength(1);
  return found[0];
}

/** Opens the dialog under `locale` and goes on to the step with the QR code. */
async function openQrCodeStep(locale: Locale) {
  mockLocale = locale;
  mockSetupTwoFactorAuth.mockResolvedValue({
    success: true,
    message: "started",
    data: {
      qrCodeUrl: "data:image/png;base64,AAAA",
      // Replaced by the codes of enableTwoFactorAuth.
      backupCodes: ["of-the-first-step"],
      secret: "encrypted-secret",
      manualEntrySecret: SECRET,
    },
  });
  const texts = MESSAGES[locale].TwoFactorSetup;
  render(
    <TwoFactorSetup user={{ id: "user-1", email: EMAIL }} locale={locale} />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: named(texts.startSetup) }),
  );
  await screen.findByRole("heading", { name: named(texts.qrCodeTitle) });
  return texts;
}

/** Goes through the dialog and returns the file it downloads. */
async function download(locale: Locale): Promise<Download> {
  const texts = await openQrCodeStep(locale);
  mockEnableTwoFactorAuth.mockResolvedValue({
    success: true,
    message: "enabled",
    data: { backupCodes: CODES },
  });
  fireEvent.change(
    screen.getByRole("textbox", { name: named(texts.verificationLabel) }),
    { target: { value: "123456" } },
  );
  fireEvent.click(
    screen.getByRole("button", { name: named(texts.verifyAndEnable) }),
  );
  await screen.findByRole("heading", {
    name: named(texts.enabledSuccessfully),
  });

  // jsdom saves no file: what the component makes its Blob of is kept, and
  // so is the name of the link it clicks.
  const blobs: { parts: BlobPart[]; type: string | undefined }[] = [];
  jest
    .spyOn(global, "Blob")
    .mockImplementation((blobParts?: BlobPart[], options?: BlobPropertyBag) => {
      blobs.push({ parts: blobParts ?? [], type: options?.type });
      return {} as Blob;
    });
  Object.assign(URL, {
    createObjectURL: jest.fn(() => "blob:backup-codes"),
    revokeObjectURL: jest.fn(),
  });
  const names: string[] = [];
  jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    names.push(this.download);
  });
  jest
    .spyOn(Date.prototype, "toLocaleString")
    .mockImplementation((locales) => dateFor(String(locales)));
  jest.spyOn(Date.prototype, "getFullYear").mockReturnValue(LOCAL_DAY.year);
  jest.spyOn(Date.prototype, "getMonth").mockReturnValue(LOCAL_DAY.month);
  jest.spyOn(Date.prototype, "getDate").mockReturnValue(LOCAL_DAY.day);
  jest.spyOn(Date.prototype, "toISOString").mockReturnValue(UTC_TIME);

  fireEvent.click(
    screen.getByRole("button", { name: named(texts.downloadBackupCodes) }),
  );

  expect(blobs).toHaveLength(1);
  expect(names).toHaveLength(1);
  return {
    text: blobs[0].parts.join(""),
    name: names[0],
    type: blobs[0].type,
  };
}

/** The text of the file that the dialog downloads under `locale`. */
const downloadedFile = async (locale: Locale) => (await download(locale)).text;

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe.each(LOCALES)(
  "%s: the notes of the step with the QR code",
  (locale) => {
    const texts = MESSAGES[locale].TwoFactorSetup;

    it("the note under the secret is the text of the locale, with its label in bold", async () => {
      await openQrCodeStep(locale);

      const label = /<strong>(.*?)<\/strong>/.exec(
        texts.replaceOldEntryNote,
      )?.[1];
      expect(label).toBeTruthy();
      const note = strong(`⚠️ ${label}`).closest("p");
      expect(note?.textContent).toBe(`⚠️ ${plain(texts.replaceOldEntryNote)}`);
    });

    it("the tip under the code field is the text of the locale, and shows the secret", async () => {
      await openQrCodeStep(locale);

      const label = /<strong>(.*?)<\/strong>/.exec(texts.newestEntryTip)?.[1];
      expect(label).toBeTruthy();
      const tip = strong(`💡 ${label}`).closest("p");
      expect(tip?.textContent).toBe(
        `💡 ${plain(texts.newestEntryTip).replace("{secret}", SECRET)}`,
      );
      // The secret stands in the <code> of the sentence, and one word of the
      // sentence is stressed.
      expect(tip?.querySelector("code")?.textContent).toBe(SECRET);
      expect(tip?.querySelector("em")?.textContent).toBe(
        /<em>(.*?)<\/em>/.exec(texts.newestEntryTip)?.[1],
      );
    });
  },
);

describe.each(LOCALES)("%s: the file with the backup codes", (locale) => {
  const file = MESSAGES[locale].TwoFactorSetup.backupFile;

  it("is written in the language of the page, with the codes that enabling 2FA answered with", async () => {
    const lines = (await downloadedFile(locale)).split("\n");

    expect(lines).toEqual([
      file.title.replace("{appName}", MESSAGES[locale].Layout.appTitle),
      "",
      // The date is written for the language of the page, not for the
      // language of the browser.
      file.generated.replace("{date}", dateFor(locale)),
      file.email.replace("{email}", EMAIL),
      "",
      file.important,
      "",
      "1. AAAA-1111",
      "2. BBBB-2222",
      "3. CCCC-3333",
      "",
      file.instructions,
      `- ${file.useWhenLocked}`,
      `- ${file.usedOnce}`,
      `- ${file.newCodes}`,
      `- ${file.keepPrivate}`,
    ]);
  });

  it("says no sentence twice, and has no line of spaces", async () => {
    const text = await downloadedFile(locale);

    expect(sentencesOf(text).length).toBeGreaterThan(8);
    expect(saidTwice(text)).toEqual([]);
    expect(
      text.split("\n").filter((line) => line !== "" && line.trim() === ""),
    ).toEqual([]);
  });

  it("tells where a code is entered: it names the control of the sign-in form by its label", () => {
    const { useBackupCode } = MESSAGES[locale].CredentialsForm;

    expect(useBackupCode.trim()).not.toBe("");
    expect(file.useWhenLocked).toContain(useBackupCode);
  });

  it("is a text file in UTF-8, named after the local day it was made", async () => {
    const { name, type } = await download(locale);

    // The day of the file name is the local one, as the date inside; the
    // day in UTC (1999-12-31 here) is another day for part of every day.
    expect(name).toBe(NAME_OF_THE_FILE);
    expect(type).toBe("text/plain;charset=utf-8");
  });
});

describe("the search for a sentence that is said twice", () => {
  it("finds the one that the file of v2.5.2 said twice, in a longer line and in a list item", () => {
    const fileOfV252 = [
      "Auth App - Two-Factor Authentication Backup Codes",
      "",
      "IMPORTANT: Store these codes in a safe place. Each code can only be used once.",
      "",
      "1. AAAA-1111",
      "",
      "Instructions:",
      "- Use these codes if you lose access to your authenticator app",
      "- Each code can only be used once",
      "- Keep these codes secure and private",
    ].join("\n");

    expect(saidTwice(fileOfV252)).toEqual(["each code can only be used once"]);
  });
});

describe("the English file", () => {
  it("says that a code works once, one time, and promises no new codes on demand", async () => {
    const text = await downloadedFile("en");

    expect(text.match(/can only be used once/g)).toHaveLength(1);
    // Nothing in the application generates new codes for an account that
    // keeps 2FA enabled.
    expect(text).not.toMatch(/Generate new codes/i);
    expect(text).toContain(
      "New codes are created only when two-factor authentication is disabled and enabled again",
    );
  });
});

// A text that reads the same in English: the Italian label of the address is
// "Email" too. ("Instructions" is a French word as well, but French puts a
// no-break space before the colon.)
const SHARED_WITH_ENGLISH: Partial<Record<Locale, string[]>> = {
  it: ["email"],
};

describe.each(TRANSLATIONS)("%s: nothing is left in English", (locale) => {
  const english = enMessages.TwoFactorSetup;
  const texts = MESSAGES[locale].TwoFactorSetup;

  it("the two notes and every text of the file differ from the English ones", () => {
    expect(texts.replaceOldEntryNote).not.toBe(english.replaceOldEntryNote);
    expect(texts.newestEntryTip).not.toBe(english.newestEntryTip);
    const untranslated = Object.entries(texts.backupFile)
      .filter(
        ([key, text]) =>
          text === english.backupFile[key as keyof typeof english.backupFile],
      )
      .map(([key]) => key);

    expect(untranslated).toEqual(SHARED_WITH_ENGLISH[locale] ?? []);
  });

  it("the file holds no sentence of the English file", async () => {
    const text = await downloadedFile(locale);

    for (const sentence of [
      english.backupFile.important,
      english.backupFile.useWhenLocked,
      english.backupFile.usedOnce,
      english.backupFile.keepPrivate,
    ]) {
      expect(text).not.toContain(sentence);
    }
  });
});
