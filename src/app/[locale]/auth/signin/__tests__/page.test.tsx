/**
 * /{locale}/auth/signin is where Auth.js sends a sign-in it refused
 * (`pages.signIn` in src/lib/auth-config.ts), with the reason in `error`. The
 * page shows nothing of its own: it forwards that reason to the error page of
 * the locale, or leaves for the home page when there is none.
 *
 * `error` comes from the address, so anybody can write it. It goes into the
 * next address as the value of one parameter, encoded: a `&`, a `#` or a `?`
 * in it must not become a second parameter or a fragment of that address.
 */
import { render, waitFor } from "@testing-library/react";
import SignInPage from "../page";

const mockRouter = { replace: jest.fn() };
let mockSearchParams = new URLSearchParams();

jest.mock("next/navigation", () => ({
  useParams: () => ({ locale: "fr" }),
  useRouter: () => mockRouter,
  useSearchParams: () => mockSearchParams,
}));

/** The address the page replaced itself with, once it has rendered. */
async function forwardedTo(query: string): Promise<string> {
  mockSearchParams = new URLSearchParams(query);
  render(<SignInPage />);
  await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledTimes(1));
  return mockRouter.replace.mock.calls[0][0];
}

beforeEach(() => {
  mockRouter.replace.mockClear();
});

it("forwards the error of Auth.js to the error page of the locale", async () => {
  await expect(forwardedTo("error=OAuthAccountNotLinked")).resolves.toBe(
    "/fr/auth/error?error=OAuthAccountNotLinked",
  );
});

it("puts the error into the address as one encoded value", async () => {
  const written = "a&next=/evil?x=1#part é";

  const address = await forwardedTo(`error=${encodeURIComponent(written)}`);

  expect(address).toBe(
    "/fr/auth/error?error=a%26next%3D%2Fevil%3Fx%3D1%23part%20%C3%A9",
  );
  // Read back as the error page reads it: one parameter, the value as it was
  // written, and no fragment.
  const url = new URL(address, "http://localhost:3000");
  expect(url.pathname).toBe("/fr/auth/error");
  expect([...url.searchParams]).toEqual([["error", written]]);
  expect(url.hash).toBe("");
});

it("leaves for the home page of the locale when there is no error", async () => {
  await expect(forwardedTo("callbackUrl=%2Fen%2Faccount")).resolves.toBe("/fr");
});
