/**
 * @jest-environment node
 */
/**
 * What the server sends for the signed-out home page. The layout hands the
 * page what the server knows about Google sign-in (GoogleSignInProvider), so
 * the first HTML already holds the sentence about the ways to sign in and the
 * entry that goes with it: the e-mail form where Google is not configured,
 * the chooser where it is. Nothing is swapped once the browser runs the page.
 *
 * The page is rendered to a string, as the server renders it: no effect
 * runs, and the session is still "loading". The hook is the real one;
 * useTranslations (mocked in jest.setup.js) returns the message key.
 */
import { renderToString } from "react-dom/server";

const mockGetProviders = jest.fn();
jest.mock("next-auth/react", () => ({
  signIn: jest.fn(),
  signOut: jest.fn(),
  getProviders: () => mockGetProviders(),
  // What useSession() answers while a page is rendered on the server.
  useSession: () => ({ data: null, status: "loading" }),
}));
jest.mock("next/navigation", () => ({
  useParams: () => ({ locale: "en" }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

import HomePage from "../page";
import { GoogleSignInProvider } from "@/components/auth/google-sign-in-provider";

const firstHtml = (googleConfigured: boolean) =>
  renderToString(
    <GoogleSignInProvider enabled={googleConfigured}>
      <HomePage />
    </GoogleSignInProvider>,
  );

/** The text of the line under the title, as the HTML holds it. */
function subtitleIn(html: string): string | undefined {
  return /<p[^>]*data-testid="home-subtitle"[^>]*>([^<]*)<\/p>/.exec(html)?.[1];
}

beforeEach(() => jest.spyOn(console, "log").mockImplementation(() => {}));
afterEach(() => jest.restoreAllMocks());

it("without Google: holds the sentence without Google and the e-mail form, and no chooser", () => {
  const html = firstHtml(false);

  expect(subtitleIn(html)).toBe("subtitleWithoutGoogle");
  expect(html).toContain('id="email"');
  expect(html).not.toContain("sign-in-with-email-toggle");
  expect(html).not.toContain("signInWithGoogle");
});

it("with Google: holds the sentence that names Google and the chooser, and no e-mail form yet", () => {
  const html = firstHtml(true);

  expect(subtitleIn(html)).toBe("subtitle");
  expect(html).toContain("sign-in-with-email-toggle");
  expect(html).not.toContain('id="email"');
});

it("marks the page as signed out with the session status of the server: loading", () => {
  expect(firstHtml(false)).toMatch(
    /data-testid="signed-out-home"[^>]*data-session-status="loading"|data-session-status="loading"[^>]*data-testid="signed-out-home"/,
  );
});

it("without the layout's provider the same render holds neither sentence: that is what the provider is for", () => {
  const html = renderToString(<HomePage />);

  expect(subtitleIn(html)).toBe("");
  expect(mockGetProviders).not.toHaveBeenCalled();
});
