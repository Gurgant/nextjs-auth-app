/**
 * /{locale}/auth/error shows the reason in the `error` parameter. Two of its
 * cases are checked here:
 *
 *   - `LinkNotConfirmed`, the address the server sends a refused account link
 *     to (src/lib/auth/link-refusal.ts): its own texts, and one way on, to
 *     the account page, where a link is confirmed with the password. The two
 *     buttons of the other errors lead to the sign-in options, and this
 *     visitor is signed in.
 *   - every way out of the page leads to a page that exists. The page used to
 *     link to /{locale}/support, which has no page.
 *
 * useTranslations (mocked in jest.setup.js) returns the message key, so the
 * text on the screen is the key the page read.
 */
import fs from "fs";
import path from "path";
import { render, screen, fireEvent } from "@testing-library/react";
import AuthErrorPage from "../page";

const mockRouter = { push: jest.fn() };
let mockSearchParams = new URLSearchParams();

jest.mock("next/navigation", () => ({
  useParams: () => ({ locale: "de" }),
  useRouter: () => mockRouter,
  useSearchParams: () => mockSearchParams,
}));

function open(error: string | null) {
  mockSearchParams = new URLSearchParams(error === null ? "" : { error });
  return render(<AuthErrorPage />);
}

const buttonNames = () =>
  screen.getAllByRole("button").map((button) => button.textContent);

beforeEach(() => {
  mockRouter.push.mockClear();
});

describe("a refused account link (error=LinkNotConfirmed)", () => {
  it("shows its own title, description and details", () => {
    open("LinkNotConfirmed");

    for (const key of [
      "error.linkNotConfirmed",
      "error.linkNotConfirmedDescription",
      "error.linkNotConfirmedDetails",
    ]) {
      expect(screen.getByText(key)).toBeTruthy();
    }
    expect(screen.queryByText("error.authenticationError")).toBeNull();
  });

  it("offers the account page and the way back, not the sign-in options", () => {
    open("LinkNotConfirmed");

    expect(buttonNames()).toEqual([
      "error.goToAccountSettings",
      "error.goBack",
    ]);
  });

  it("leads to the account page of the locale", () => {
    open("LinkNotConfirmed");

    fireEvent.click(screen.getByTestId("link-refused-to-account"));

    expect(mockRouter.push.mock.calls).toEqual([["/de/account"]]);
  });
});

describe("the other errors", () => {
  it.each([
    ["Configuration", "error.configurationError", "error.tryAgain"],
    ["AccessDenied", "error.accessDenied", "error.tryAgain"],
    ["OAuthCallbackError", "error.oauthCallbackError", "error.tryAgain"],
    ["SomethingElse", "error.authenticationError", "error.tryAgain"],
    [null, "error.authenticationError", "error.tryAgain"],
    [
      "OAuthAccountNotLinked",
      "error.accountAlreadyExists",
      "error.tryDifferentAccount",
    ],
  ])("%s keeps its title and its two buttons", (error, title, second) => {
    open(error);

    expect(screen.getByText(title)).toBeTruthy();
    expect(buttonNames()).toEqual([
      "error.tryEmailSignIn",
      second,
      "error.goBack",
    ]);
    expect(screen.queryByTestId("link-refused-to-account")).toBeNull();
  });
});

describe("every way out of the page", () => {
  /** The routes of the page files under src/app/[locale]: "" for its own page. */
  function pagesUnderLocale(): string[] {
    const root = path.resolve(__dirname, "../../..");
    const routes = (directory: string, route: string): string[] =>
      fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        if (entry.isDirectory()) {
          return routes(
            path.join(directory, entry.name),
            `${route}/${entry.name}`,
          );
        }
        return /^page\.tsx?$/.test(entry.name) ? [route] : [];
      });
    return routes(root, "");
  }

  it.each([null, "Configuration", "OAuthAccountNotLinked", "LinkNotConfirmed"])(
    "of error=%s is a button to a page that exists, and no link",
    (error) => {
      const pages = pagesUnderLocale();
      // The check reads the page files: these two are among them.
      expect(pages).toEqual(expect.arrayContaining(["", "/account"]));
      expect(pages).not.toContain("/support");
      open(error);

      expect(screen.queryAllByRole("link")).toEqual([]);
      const buttons = screen.getAllByRole("button");
      for (const button of buttons) fireEvent.click(button);

      const targets: string[] = mockRouter.push.mock.calls.map(([to]) => to);
      expect(targets).toHaveLength(buttons.length);
      for (const target of targets) {
        expect(target.startsWith("/de")).toBe(true);
        expect(pages).toContain(target.slice("/de".length));
      }
    },
  );
});
