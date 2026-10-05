/**
 * The Google card of the account page (oauth-account-linking.tsx) at the
 * boundary with the two link routes: it shows a refusal in the language of
 * the page, chosen by the `code` of the answer, and never the English `error`
 * text that the routes send for readers of the API; and it starts the Google
 * sign-in only after the route accepted the password.
 *
 * useTranslations (mocked in jest.setup.js) returns the message key, so the
 * text on the screen is the key the component read. fetch and signIn are
 * mocks; the routes themselves have their own tests.
 */
import fs from "fs";
import path from "path";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { signIn } from "next-auth/react";
import { LINK_ACCOUNT_ERROR_CODES } from "@/lib/auth/link-account-errors";
import { OAuthAccountLinking } from "../oauth-account-linking";

jest.mock("next/navigation", () => ({
  useParams: () => ({ locale: "it" }),
}));
jest.mock("@/hooks/use-google-sign-in", () => ({
  useGoogleSignInEnabled: () => true,
}));

const mockSignIn = signIn as jest.Mock;
const mockFetch = jest.fn();
const onAccountLinked = jest.fn();

/** What the route answers: a status and a JSON body. */
const answer = (status: number, body: unknown) =>
  Promise.resolve({ ok: status < 400, status, json: async () => body });

const PASSWORD = "Correct-Horse-1";

/** The key the component shows for each code, per operation. */
const TEXT_OF: Record<
  (typeof LINK_ACCOUNT_ERROR_CODES)[number],
  { link: string; unlink: string }
> = {
  authentication_required: both("linkErrors.authenticationRequired"),
  too_many_attempts: both("linkErrors.tooManyAttempts"),
  invalid_request: both("linkErrors.invalidRequest"),
  missing_fields: both("linkErrors.invalidRequest"),
  unsupported_provider: both("linkErrors.unsupportedProvider"),
  // The session's user is gone: the session has ended.
  user_not_found: both("linkErrors.authenticationRequired"),
  password_not_set: both("linkErrors.passwordNotSet"),
  invalid_password: both("linkErrors.invalidPassword"),
  already_linked: both("linkErrors.alreadyLinked"),
  not_linked: both("linkErrors.notLinked"),
  // Nothing more can be said than that the operation failed.
  internal_error: {
    link: "failedToInitiateAccountLinking",
    unlink: "failedToUnlinkAccount",
  },
};

function both(key: string) {
  return { link: key, unlink: key };
}

/** Opens the password prompt of the card, types the password and submits. */
function submitPassword(operation: "link" | "unlink") {
  render(
    <OAuthAccountLinking
      accountInfo={{
        hasGoogleAccount: operation === "unlink",
        hasEmailAccount: true,
      }}
      onAccountLinked={onAccountLinked}
    />,
  );
  // The card's button; the prompt's button of the same name comes after it.
  fireEvent.click(
    screen.getByRole("button", {
      name: operation === "link" ? "linkAccount" : "unlink",
    }),
  );
  fireEvent.change(screen.getByLabelText("currentPassword"), {
    target: { value: PASSWORD },
  });
  const submit = screen.getAllByRole("button", {
    name: operation === "link" ? "linkAccount" : "unlinkAccount",
  });
  fireEvent.click(submit[submit.length - 1]);
}

const shownAlert = () => screen.findByRole("alert");

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = mockFetch as unknown as typeof fetch;
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("a refusal of the link route", () => {
  it.each(LINK_ACCOUNT_ERROR_CODES)(
    "with the code %s is shown as its translated text, not as the English error",
    async (code) => {
      mockFetch.mockReturnValue(
        answer(400, { error: "English text of the API", code }),
      );

      submitPassword("link");

      expect((await shownAlert()).textContent).toBe(TEXT_OF[code].link);
      expect(screen.queryByText("English text of the API")).toBeNull();
      expect(mockSignIn).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["a code this version does not know", { error: "English", code: "later" }],
    ["no code (an answer of an older server)", { error: "English" }],
    ["a code that is no string", { error: "English", code: 7 }],
    ["neither success nor an error", {}],
  ])("with %s is shown as the general failure text", async (_, body) => {
    mockFetch.mockReturnValue(answer(400, body));

    submitPassword("link");

    expect((await shownAlert()).textContent).toBe(
      "failedToInitiateAccountLinking",
    );
    expect(screen.queryByText("English")).toBeNull();
    expect(mockSignIn).not.toHaveBeenCalled();
  });
});

describe("a refusal of the unlink route", () => {
  it.each(LINK_ACCOUNT_ERROR_CODES)(
    "with the code %s is shown as its translated text, not as the English error",
    async (code) => {
      mockFetch.mockReturnValue(
        answer(400, { error: "English text of the API", code }),
      );

      submitPassword("unlink");

      expect((await shownAlert()).textContent).toBe(TEXT_OF[code].unlink);
      expect(screen.queryByText("English text of the API")).toBeNull();
      expect(onAccountLinked).not.toHaveBeenCalled();
    },
  );

  it("with a code this version does not know is shown as the general failure text", async () => {
    mockFetch.mockReturnValue(answer(400, { error: "English", code: "later" }));

    submitPassword("unlink");

    expect((await shownAlert()).textContent).toBe("failedToUnlinkAccount");
    expect(screen.queryByText("English")).toBeNull();
  });
});

describe("an accepted password", () => {
  it("sends the password and the provider to the link route, then starts the Google sign-in back to the account page", async () => {
    mockFetch.mockReturnValue(
      answer(200, { success: true, provider: "google" }),
    );
    mockSignIn.mockResolvedValue(undefined);

    submitPassword("link");

    await waitFor(() => expect(mockSignIn).toHaveBeenCalledTimes(1));
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith("/api/auth/link-account/initiate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: PASSWORD, provider: "google" }),
    });
    // The account page of the visitor's locale, with no parameter: nothing
    // reads one.
    expect(mockSignIn).toHaveBeenCalledWith("google", {
      redirect: false,
      callbackUrl: "/it/account",
    });
  });

  it("unlinks through the unlink route, shows the success text and asks for the account data again", async () => {
    mockFetch.mockReturnValue(
      answer(200, { success: true, provider: "google" }),
    );

    submitPassword("unlink");

    await waitFor(() => expect(onAccountLinked).toHaveBeenCalledTimes(1));
    expect(mockFetch).toHaveBeenCalledWith("/api/auth/link-account/unlink", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: PASSWORD, provider: "google" }),
    });
    expect(mockSignIn).not.toHaveBeenCalled();
  });
});

// The keys above are shown as they are only in this test: on the page each
// is a text of messages/<locale>.json.
describe("the texts of the codes", () => {
  const MESSAGES_DIRECTORY = path.resolve(__dirname, "../../../../messages");
  const keys = [
    ...new Set(
      Object.values(TEXT_OF).flatMap(({ link, unlink }) => [link, unlink]),
    ),
  ];

  it.each(["en", "es", "fr", "it", "de"])(
    "messages/%s.json has a text for every code",
    (locale) => {
      const { Account } = JSON.parse(
        fs.readFileSync(
          path.join(MESSAGES_DIRECTORY, `${locale}.json`),
          "utf8",
        ),
      ) as { Account: Record<string, unknown> };
      const textOf = (key: string) =>
        key
          .split(".")
          .reduce<unknown>(
            (node, part) => (node as Record<string, unknown>)?.[part],
            Account,
          );

      expect(keys.length).toBeGreaterThan(8);
      for (const key of keys) {
        expect(typeof textOf(key)).toBe("string");
        expect(String(textOf(key)).trim()).not.toBe("");
      }
    },
  );
});
