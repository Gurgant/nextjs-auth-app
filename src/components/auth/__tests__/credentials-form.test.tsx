/**
 * The second step of the sign-in form (credentials-form.tsx). For an account
 * with two-factor authentication Auth.js answers the password with the code
 * "2fa_required", and the form then asks for the code of the authenticator
 * app; a wrong code is answered with "2fa_invalid". The label of the field,
 * the hint, the button and the answer to a wrong code are texts of
 * messages/<locale>.json, like the rest of the form: they used to be English
 * in every language.
 *
 * The step also takes a backup code, for a user who has lost the
 * authenticator: a control switches the field, the form sends `backupCode`
 * in place of `totpCode` (authorize() in src/lib/auth-config.ts reads both,
 * checks the backup code and removes it), and a control leads back. A backup
 * code is eight letters and digits, written XXXX-XXXX in the downloaded
 * file; the field takes it as a person types it.
 *
 * signIn (mocked in jest.setup.js) is given the answers of Auth.js; the
 * translator stand-in reads messages/<locale>.json.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { signIn } from "next-auth/react";
import enMessages from "../../../../messages/en.json";
import esMessages from "../../../../messages/es.json";
import frMessages from "../../../../messages/fr.json";
import itMessages from "../../../../messages/it.json";
import deMessages from "../../../../messages/de.json";

let mockLocale = "en";
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useParams: () => ({ locale: mockLocale }),
  useRouter: () => ({ push: mockPush, refresh: jest.fn() }),
}));
jest.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string) =>
    jest.requireActual(`../../../../messages/${mockLocale}.json`)[namespace][
      key
    ],
}));

import { CredentialsForm } from "../credentials-form";

const MESSAGES = {
  en: enMessages,
  es: esMessages,
  fr: frMessages,
  it: itMessages,
  de: deMessages,
};
type Locale = keyof typeof MESSAGES;
const LOCALES = Object.keys(MESSAGES) as Locale[];

// The texts of the step: four for the code of the authenticator, four for a
// backup code.
const STEP_KEYS = [
  "twoFactorCodeLabel",
  "twoFactorCodeHint",
  "verifyCodeButton",
  "invalidTwoFactorCode",
  "useBackupCode",
  "useAuthenticatorCode",
  "backupCodeLabel",
  "backupCodeHint",
] as const;

const mockSignIn = signIn as jest.Mock;
const EMAIL = "reader@example.com";
const PASSWORD = "Correct-Horse-1";

const submitButton = () =>
  document.querySelector('button[type="submit"]') as HTMLButtonElement;

/** Renders the form under `locale` and submits the e-mail and the password. */
async function submitPassword(locale: Locale) {
  mockLocale = locale;
  const form = MESSAGES[locale].CredentialsForm;
  render(<CredentialsForm />);
  fireEvent.change(screen.getByLabelText(form.emailLabel), {
    target: { value: EMAIL },
  });
  fireEvent.change(screen.getByLabelText(form.passwordLabel), {
    target: { value: PASSWORD },
  });
  expect(submitButton().textContent).toBe(form.signInButton);
  fireEvent.click(submitButton());
  await waitFor(() => expect(mockSignIn).toHaveBeenCalledTimes(1));
}

beforeEach(() => {
  jest.clearAllMocks();
  // Also the answers a test queued and did not use.
  mockSignIn.mockReset();
});

describe.each(LOCALES)("%s", (locale) => {
  const form = MESSAGES[locale].CredentialsForm;

  it("after the password of an account with 2FA, asks for the code in the language of the page", async () => {
    mockSignIn.mockResolvedValue({
      error: "CredentialsSignin",
      code: "2fa_required",
    });

    await submitPassword(locale);

    // The password step sent no code.
    expect(mockSignIn).toHaveBeenCalledWith("credentials", {
      email: EMAIL,
      password: PASSWORD,
      redirect: false,
    });
    const code = await screen.findByLabelText(form.twoFactorCodeLabel);
    expect(code).toHaveAttribute("id", "totpCode");
    expect(screen.getByText(form.twoFactorCodeHint)).toBeInTheDocument();
    expect(submitButton().textContent).toBe(form.verifyCodeButton);
    // Six digits make a code; until then the button stays disabled.
    expect(submitButton()).toBeDisabled();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("answers a wrong code in the language of the page and keeps the step open", async () => {
    mockSignIn.mockResolvedValueOnce({
      error: "CredentialsSignin",
      code: "2fa_required",
    });
    mockSignIn.mockResolvedValueOnce({
      error: "CredentialsSignin",
      code: "2fa_invalid",
    });

    await submitPassword(locale);
    fireEvent.change(await screen.findByLabelText(form.twoFactorCodeLabel), {
      target: { value: "12a3b4c5d6" },
    });
    // The field keeps digits only.
    expect(screen.getByLabelText(form.twoFactorCodeLabel)).toHaveValue(
      "123456",
    );
    fireEvent.click(submitButton());

    expect((await screen.findByRole("alert")).textContent).toBe(
      form.invalidTwoFactorCode,
    );
    expect(mockSignIn).toHaveBeenLastCalledWith("credentials", {
      email: EMAIL,
      password: PASSWORD,
      totpCode: "123456",
      redirect: false,
    });
    expect(screen.getByLabelText(form.twoFactorCodeLabel)).toBeInTheDocument();
    expect(submitButton().textContent).toBe(form.verifyCodeButton);
    // The alert stands where the hint stood.
    expect(screen.queryByText(form.twoFactorCodeHint)).toBeNull();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("with a right code, goes to the account page of the locale", async () => {
    mockSignIn.mockResolvedValueOnce({
      error: "CredentialsSignin",
      code: "2fa_required",
    });
    mockSignIn.mockResolvedValueOnce({ ok: true, error: undefined });

    await submitPassword(locale);
    fireEvent.change(await screen.findByLabelText(form.twoFactorCodeLabel), {
      target: { value: "123456" },
    });
    fireEvent.click(submitButton());

    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith(`/${locale}/account`),
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  describe("a backup code in place of the code of the authenticator", () => {
    const button = (name: string) => screen.queryByRole("button", { name });

    /** Opens the code step and switches it to the backup code. */
    async function openBackupCodeField() {
      mockSignIn.mockResolvedValueOnce({
        error: "CredentialsSignin",
        code: "2fa_required",
      });
      await submitPassword(locale);
      await screen.findByLabelText(form.twoFactorCodeLabel);
      fireEvent.click(screen.getByRole("button", { name: form.useBackupCode }));
      return screen.getByLabelText(form.backupCodeLabel);
    }

    it("is offered in the code step, and the field, its hint and the way back are in the language of the page", async () => {
      const field = await openBackupCodeField();

      expect(field).toHaveAttribute("id", "backupCode");
      expect(screen.getByText(form.backupCodeHint)).toBeInTheDocument();
      expect(button(form.useAuthenticatorCode)).toBeInTheDocument();
      // One kind of code at a time.
      expect(screen.queryByLabelText(form.twoFactorCodeLabel)).toBeNull();
      expect(screen.queryByText(form.twoFactorCodeHint)).toBeNull();
      expect(button(form.useBackupCode)).toBeNull();
      expect(submitButton().textContent).toBe(form.verifyCodeButton);
      expect(submitButton()).toBeDisabled();
    });

    it("is taken as a person types it, and sent as backupCode with no totpCode", async () => {
      mockSignIn.mockResolvedValue({ ok: true, error: undefined });
      const field = await openBackupCodeField();

      // Seven characters are no code yet.
      fireEvent.change(field, { target: { value: "abcd123" } });
      expect(field).toHaveValue("ABCD-123");
      expect(submitButton()).toBeDisabled();
      // Lower case, spaces, the hyphen in another place, a character too
      // many: the eight letters and digits, as the file writes them.
      fireEvent.change(field, { target: { value: " ab-cd 12 34x" } });
      expect(field).toHaveValue("ABCD-1234");
      expect(submitButton()).toBeEnabled();
      fireEvent.click(submitButton());

      await waitFor(() => expect(mockSignIn).toHaveBeenCalledTimes(2));
      expect(mockSignIn).toHaveBeenLastCalledWith("credentials", {
        email: EMAIL,
        password: PASSWORD,
        backupCode: "ABCD-1234",
        redirect: false,
      });
      await waitFor(() =>
        expect(mockPush).toHaveBeenCalledWith(`/${locale}/account`),
      );
    });

    it("when it is wrong, is answered like a wrong code, and the field stays", async () => {
      const field = await openBackupCodeField();
      mockSignIn.mockResolvedValueOnce({
        error: "CredentialsSignin",
        code: "2fa_invalid",
      });

      fireEvent.change(field, { target: { value: "WXYZ-9876" } });
      fireEvent.click(submitButton());

      expect((await screen.findByRole("alert")).textContent).toBe(
        form.invalidTwoFactorCode,
      );
      expect(screen.getByLabelText(form.backupCodeLabel)).toHaveValue(
        "WXYZ-9876",
      );
      expect(button(form.useAuthenticatorCode)).toBeInTheDocument();
      expect(mockPush).not.toHaveBeenCalled();
    });

    it("and the way back: each switch empties the field that is left and takes the alert away", async () => {
      mockSignIn.mockResolvedValueOnce({
        error: "CredentialsSignin",
        code: "2fa_required",
      });
      await submitPassword(locale);
      fireEvent.change(await screen.findByLabelText(form.twoFactorCodeLabel), {
        target: { value: "123456" },
      });

      // To the backup code: what was typed of the other code is gone when
      // the visitor comes back.
      fireEvent.click(screen.getByRole("button", { name: form.useBackupCode }));
      fireEvent.change(screen.getByLabelText(form.backupCodeLabel), {
        target: { value: "ABCD1234" },
      });
      mockSignIn.mockResolvedValueOnce({
        error: "CredentialsSignin",
        code: "2fa_invalid",
      });
      fireEvent.click(submitButton());
      await screen.findByRole("alert");

      fireEvent.click(
        screen.getByRole("button", { name: form.useAuthenticatorCode }),
      );
      expect(screen.getByLabelText(form.twoFactorCodeLabel)).toHaveValue("");
      expect(screen.queryByLabelText(form.backupCodeLabel)).toBeNull();
      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.getByText(form.twoFactorCodeHint)).toBeInTheDocument();
      expect(submitButton()).toBeDisabled();

      // And to the backup code again: that field is empty as well.
      fireEvent.click(screen.getByRole("button", { name: form.useBackupCode }));
      expect(screen.getByLabelText(form.backupCodeLabel)).toHaveValue("");

      // The code of the authenticator is then sent as before, alone.
      fireEvent.click(
        screen.getByRole("button", { name: form.useAuthenticatorCode }),
      );
      fireEvent.change(screen.getByLabelText(form.twoFactorCodeLabel), {
        target: { value: "654321" },
      });
      mockSignIn.mockResolvedValueOnce({ ok: true, error: undefined });
      fireEvent.click(submitButton());
      await waitFor(() => expect(mockSignIn).toHaveBeenCalledTimes(3));
      expect(mockSignIn).toHaveBeenLastCalledWith("credentials", {
        email: EMAIL,
        password: PASSWORD,
        totpCode: "654321",
        redirect: false,
      });
    });
  });
});

it("the eight texts of the step are in every file, and translated", () => {
  for (const locale of LOCALES) {
    const form: Record<string, string> = MESSAGES[locale].CredentialsForm;

    for (const key of STEP_KEYS) {
      expect([locale, key, typeof form[key]]).toEqual([locale, key, "string"]);
      expect(form[key].trim()).not.toBe("");
    }
  }
  const english: Record<string, string> = enMessages.CredentialsForm;
  for (const locale of LOCALES.filter((other) => other !== "en")) {
    const form: Record<string, string> = MESSAGES[locale].CredentialsForm;
    const untranslated = STEP_KEYS.filter((key) => form[key] === english[key]);

    expect([locale, untranslated]).toEqual([locale, []]);
  }
});
