/**
 * @jest-environment node
 */

/**
 * sendEmail(): e-mail is only sent when a real RESEND_API_KEY is configured;
 * the .env.example placeholder counts as "not configured" (simulated), and a
 * provider error is reported as a failure (the Resend SDK never throws).
 */

import enMessages from "../../../messages/en.json";
import esMessages from "../../../messages/es.json";
import frMessages from "../../../messages/fr.json";
import itMessages from "../../../messages/it.json";
import deMessages from "../../../messages/de.json";

const mockSend = jest.fn();
jest.mock("resend", () => ({
  Resend: jest.fn().mockImplementation(() => ({ emails: { send: mockSend } })),
}));

const ORIGINAL = process.env.RESEND_API_KEY;
const TEMPLATE = {
  to: "user@example.com",
  subject: "Hello",
  html: "<p>Hi</p>",
};

function loadWithKey(key: string | undefined): typeof import("@/lib/email") {
  if (key === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = key;
  let mod: typeof import("@/lib/email") | undefined;
  jest.isolateModules(() => {
    mod = require("@/lib/email");
  });
  return mod!;
}

beforeEach(() => {
  mockSend.mockReset();
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  if (ORIGINAL === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = ORIGINAL;
});

it("simulates sending when RESEND_API_KEY is unset", async () => {
  const { sendEmail } = loadWithKey(undefined);
  await expect(sendEmail(TEMPLATE)).resolves.toBe(true);
  expect(mockSend).not.toHaveBeenCalled();
});

it("treats the .env.example placeholder as not configured", async () => {
  const { sendEmail } = loadWithKey("your-resend-api-key");
  await expect(sendEmail(TEMPLATE)).resolves.toBe(true);
  expect(mockSend).not.toHaveBeenCalled();
});

it("returns true when the provider accepts the message", async () => {
  mockSend.mockResolvedValue({ data: { id: "msg_1" }, error: null });
  const { sendEmail } = loadWithKey("re_test_key");
  await expect(sendEmail(TEMPLATE)).resolves.toBe(true);
  expect(mockSend).toHaveBeenCalledTimes(1);
});

it("returns false when the provider reports an error", async () => {
  mockSend.mockResolvedValue({
    data: null,
    error: { name: "validation_error", message: "API key is invalid" },
  });
  const { sendEmail } = loadWithKey("re_test_key");
  await expect(sendEmail(TEMPLATE)).resolves.toBe(false);
});

/**
 * sendVerificationEmail(): the locale becomes part of the e-mailed link and
 * of the e-mail's HTML, so only one of the five supported locales is used;
 * any other value falls back to the default.
 */
describe("sendVerificationEmail", () => {
  async function sent(locale: string) {
    mockSend.mockResolvedValue({ data: { id: "msg_1" }, error: null });
    const { sendVerificationEmail } = loadWithKey("re_test_key");
    await expect(
      sendVerificationEmail("user@example.com", "User", "tok123", locale),
    ).resolves.toBe(true);
    expect(mockSend).toHaveBeenCalledTimes(1);
    return mockSend.mock.calls[0][0] as { html: string; text: string };
  }

  // [locale handed in, text that must not appear in the e-mail]
  it.each([
    ['"><img src=x onerror=alert(1)>', '"><img src=x onerror=alert(1)>'],
    ["../../evil", "../../evil"],
    ["en-US", "en-US"],
    ["", "//verify-email"],
  ])(
    "builds the link with the default locale for %p",
    async (locale, absent) => {
      const { html, text } = await sent(locale);

      expect(html).toContain("/en/verify-email/tok123");
      expect(text).toContain("/en/verify-email/tok123");
      expect(html).not.toContain(absent);
      expect(text).not.toContain(absent);
    },
  );

  it("keeps a supported locale", async () => {
    const { html, text } = await sent("fr");

    expect(html).toContain("/fr/verify-email/tok123");
    expect(text).toContain("/fr/verify-email/tok123");
    expect(html).toContain("Vérifiez votre adresse email");
  });
});

/**
 * createEmailVerificationTemplate(): the header of the mail names the
 * application as the pages of that language do (Layout.appTitle of
 * messages/<locale>.json), and a user without a name is greeted without a
 * word standing in for one ("Ciao utente," is what no Italian mail says).
 */
describe("createEmailVerificationTemplate", () => {
  const MESSAGES = {
    en: enMessages,
    es: esMessages,
    fr: frMessages,
    it: itMessages,
    de: deMessages,
  };
  type Locale = keyof typeof MESSAGES;
  const LOCALES = Object.keys(MESSAGES) as Locale[];
  const LINK = "https://app.example.com/verify-email/tok123";

  const mail = (locale: string, name: string) =>
    loadWithKey(undefined).createEmailVerificationTemplate(
      "user@example.com",
      name,
      LINK,
      locale,
    );
  /** What the header of the HTML mail shows after its icon. */
  const header = (html: string) =>
    /<div class="logo">🔐 ([^<]*)<\/div>/.exec(html)?.[1];
  const greeting = (html: string) => /<h2>([^<]*)<\/h2>/.exec(html)?.[1];

  it.each(LOCALES)(
    "%s: the header names the application as the pages of that language do",
    (locale) => {
      expect(header(mail(locale, "Ada").html)).toBe(
        MESSAGES[locale].Layout.appTitle,
      );
    },
  );

  it("the name is not the English one in every language", () => {
    const names = LOCALES.map((locale) => header(mail(locale, "Ada").html));

    expect(names[0]).toBe("Auth App");
    expect(names.filter((name) => name === "Auth App")).toEqual(["Auth App"]);
  });

  it("a locale that has no texts gets the English header, like the English texts", () => {
    expect(header(mail("pt", "Ada").html)).toBe("Auth App");
  });

  // [locale, with the name "Ada", without a name: the salutation alone]
  const GREETINGS: [Locale, string, string][] = [
    ["en", "Hello Ada,", "Hello,"],
    ["es", "Hola, Ada:", "Hola:"],
    ["fr", "Bonjour Ada,", "Bonjour,"],
    ["it", "Ciao Ada,", "Ciao,"],
    ["de", "Hallo Ada,", "Guten Tag,"],
  ];
  /** The first line of the text part: its greeting. */
  const firstLine = (text: string | undefined) => (text ?? "").split("\n")[0];

  it.each(GREETINGS)("%s: greets a user by name", (locale, withName) => {
    const { html, text } = mail(locale, "Ada");

    expect(greeting(html)).toBe(withName);
    expect(firstLine(text)).toBe(withName);
  });

  it.each(GREETINGS)(
    "%s: greets a user without a name with the salutation alone",
    (locale, _withName, salutation) => {
      const { html, text } = mail(locale, "");

      expect(greeting(html)).toBe(salutation);
      expect(firstLine(text)).toBe(salutation);
      // One or two words and the punctuation mark: no word stands in for
      // the name ("Hello there,", "Ciao utente,").
      expect(salutation).toMatch(/^(?:Hello|Hola|Bonjour|Ciao|Guten Tag)[,:]$/);
    },
  );

  it.each(GREETINGS)(
    "%s: a name that is only spaces is no name",
    (locale, _withName, salutation) => {
      const { html, text } = mail(locale, "   ");

      expect(greeting(html)).toBe(salutation);
      expect(firstLine(text)).toBe(salutation);
    },
  );

  it.each(GREETINGS)(
    "%s: spaces around a name are no part of the greeting",
    (locale, withName) => {
      expect(greeting(mail(locale, "  Ada ").html)).toBe(withName);
    },
  );

  // The name is what the user typed at registration, and the action that
  // sends this mail needs no session: the mail can be sent to an address that
  // is not the sender's. In the HTML part no character of the name is markup.
  describe("a name that holds markup", () => {
    const NAME = `<img src=x onerror=alert(1)> & "B" O'C`;
    const ESCAPED =
      "&lt;img src=x onerror=alert(1)&gt; &amp; &quot;B&quot; O&#39;C";

    it.each(LOCALES)("%s: is text in the HTML part", (locale) => {
      const { html } = mail(locale, NAME);

      expect(html).toContain(ESCAPED);
      expect(html).not.toContain("<img");
      expect(html).not.toContain(NAME);
      // Nothing but the greeting carries the name, and the <h2> holds no
      // element.
      expect(greeting(html)).toContain(ESCAPED);
    });

    it.each(LOCALES)("%s: is as it was typed in the text part", (locale) => {
      const { text } = mail(locale, NAME);

      expect(firstLine(text)).toContain(NAME);
      expect(text).not.toContain("&lt;");
      expect(text).not.toContain("&amp;");
    });
  });

  // A name is one line. With its line breaks kept, the text part would hold
  // lines of the sender's choosing, set apart like the mail's own.
  describe("a name that holds line breaks", () => {
    const NAME = "Ada,\n\nYour account is blocked. Open https://evil.example/x";
    const ON_ONE_LINE =
      "Ada, Your account is blocked. Open https://evil.example/x";

    it.each(GREETINGS)(
      "%s: is one line in the text part, and every other line is the mail's own",
      (locale, withName) => {
        const own = (mail(locale, "Ada").text ?? "").split("\n");
        const lines = (mail(locale, NAME).text ?? "").split("\n");

        expect(lines[0]).toBe(withName.replace("Ada", ON_ONE_LINE));
        expect(lines.slice(1)).toEqual(own.slice(1));
        expect(own.length).toBeGreaterThan(5);
      },
    );

    it.each(GREETINGS)(
      "%s: is one line in the HTML part",
      (locale, withName) => {
        expect(greeting(mail(locale, NAME).html)).toBe(
          withName.replace("Ada", ON_ONE_LINE),
        );
      },
    );

    it("a tab, a carriage return, a control character and a line separator are white space too", () => {
      const name = [
        "Ada",
        "\t",
        "Lovelace",
        "\r\n",
        String.fromCharCode(0),
        "of",
        String.fromCharCode(0x85),
        String.fromCharCode(0x2028),
        "London",
        "  ",
      ].join("");
      const { html, text } = mail("en", name);

      expect(greeting(html)).toBe("Hello Ada Lovelace of London,");
      expect(firstLine(text)).toBe("Hello Ada Lovelace of London,");
    });
  });

  it("the link is escaped where it stands in the HTML, and as it is in the text part", () => {
    const link = `https://app.example.com/verify?a=1&b="2"<s>'`;
    const { html, text } = loadWithKey(
      undefined,
    ).createEmailVerificationTemplate("user@example.com", "Ada", link, "en");
    const escaped =
      "https://app.example.com/verify?a=1&amp;b=&quot;2&quot;&lt;s&gt;&#39;";

    expect(html).toContain(`<a href="${escaped}" class="button">`);
    expect(html).toContain(`<p class="link">${escaped}</p>`);
    expect(html).not.toContain(link);
    expect(text?.split("\n")).toContain(link);
  });

  // The text part has no button: the link stands on a line of its own, under
  // the words of the button, and no colon leads to it (French puts a
  // no-break space before a colon, and a shared template cannot).
  it.each(LOCALES)(
    "%s: the text part has the link on a line of its own, after no colon",
    (locale) => {
      const lines = (mail(locale, "Ada").text ?? "").split("\n");
      const at = lines.indexOf(LINK);

      expect(at).toBeGreaterThan(0);
      expect(lines[at - 1].trim()).not.toBe("");
      expect(lines[at - 1]).not.toMatch(/:\s*$/);
      expect(lines.filter((line) => line.includes(LINK))).toEqual([LINK]);
      // No line is indented, and none holds spaces only.
      expect(lines.filter((line) => /^\s|\s$/.test(line))).toEqual([]);
    },
  );
});

/**
 * createSecurityAlertTemplate(): English only. The name and the sentence
 * about what happened are handed in by the caller, and neither is markup in
 * the HTML.
 */
describe("createSecurityAlertTemplate", () => {
  const alert = (name: string, details: string) =>
    loadWithKey(undefined).createSecurityAlertTemplate(
      "user@example.com",
      name,
      "2fa_enabled",
      details,
    );
  const DETAILS = "Two-factor authentication has been enabled on your account";

  it("greets by name, and with the salutation alone when there is no name", () => {
    expect(alert("Ada", DETAILS).html).toContain("<p>Hello Ada,</p>");
    expect(alert("", DETAILS).html).toContain("<p>Hello,</p>");
    expect(alert("   ", DETAILS).html).toContain("<p>Hello,</p>");
  });

  it("a name with line breaks is one line (the alert has no text part)", () => {
    const mail = alert("Ada,\n\nOpen this\r\n\tlink", DETAILS);

    expect(mail.html).toContain("<p>Hello Ada, Open this link,</p>");
    expect(mail.text).toBeUndefined();
  });

  it("a name and a sentence that hold markup are text in the HTML", () => {
    const { html } = alert(
      `<b>Ada</b> & "Co"`,
      `<script>alert('x')</script> & more`,
    );

    expect(html).toContain(
      "<p>Hello &lt;b&gt;Ada&lt;/b&gt; &amp; &quot;Co&quot;,</p>",
    );
    expect(html).toContain(
      "<strong>&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt; &amp; more</strong>",
    );
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>");
  });

  it("the sentence is shown as it is when it holds no markup", () => {
    expect(alert("Ada", DETAILS).html).toContain(`<strong>${DETAILS}</strong>`);
  });
});
