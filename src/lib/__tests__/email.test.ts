/**
 * @jest-environment node
 */

/**
 * sendEmail(): e-mail is only sent when a real RESEND_API_KEY is configured;
 * the .env.example placeholder counts as "not configured" (simulated), and a
 * provider error is reported as a failure (the Resend SDK never throws).
 */

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
    expect(html).toContain("Vérifiez votre adresse e-mail");
  });
});
