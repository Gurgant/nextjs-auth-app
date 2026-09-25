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
