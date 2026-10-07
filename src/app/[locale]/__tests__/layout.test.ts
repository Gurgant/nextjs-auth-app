/**
 * What the layout does with the one thing the server knows and the browser
 * does not: whether Google sign-in is configured (isGoogleConfigured in
 * src/lib/auth-config.ts).
 *   - The default meta description is the sentence of the home page about
 *     the ways to sign in, and names Google only where the button exists. It
 *     is the description of the pages that set none themselves (the terms,
 *     privacy, verification and account pages set their own).
 *   - The pages get the answer with their first HTML: the layout hands it to
 *     GoogleSignInProvider, so no page has to ask for it.
 * The translator stand-in answers "<locale>:<Namespace>.<key>".
 */
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { getTranslations } from "next-intl/server";

let mockGoogleConfigured = false;
jest.mock("@/lib/auth-config", () => ({
  get isGoogleConfigured() {
    return mockGoogleConfigured;
  },
}));

import LocaleLayout, { generateMetadata } from "../layout";
import { GoogleSignInProvider } from "@/components/auth/google-sign-in-provider";

beforeEach(() => {
  (getTranslations as unknown as jest.Mock).mockImplementation(
    async (asked: string | { locale: string; namespace: string }) =>
      (key: string) =>
        typeof asked === "string"
          ? `${asked}.${key}`
          : `${asked.locale}:${asked.namespace}.${key}`,
  );
});

describe("the default meta description", () => {
  const metadataOf = (locale: string) =>
    generateMetadata({ params: Promise.resolve({ locale }) });

  it("is the sentence that names Google where Google is configured", async () => {
    mockGoogleConfigured = true;

    await expect(metadataOf("en")).resolves.toEqual({
      title: "en:Layout.appTitle",
      description: "en:Home.subtitle",
    });
  });

  it("is the sentence without Google where Google is not configured", async () => {
    mockGoogleConfigured = false;

    await expect(metadataOf("en")).resolves.toEqual({
      title: "en:Layout.appTitle",
      description: "en:Home.subtitleWithoutGoogle",
    });
  });

  it("comes from the locale of the address, in both cases", async () => {
    mockGoogleConfigured = false;
    const withoutGoogle = await metadataOf("de");
    mockGoogleConfigured = true;
    const withGoogle = await metadataOf("it");

    expect(withoutGoogle.description).toBe("de:Home.subtitleWithoutGoogle");
    expect(withGoogle.description).toBe("it:Home.subtitle");
  });
});

describe("what the pages are handed", () => {
  /** Every element of a tree that the layout returns (not rendered). */
  function elementsIn(
    node: ReactNode,
  ): ReactElement<{ children?: ReactNode }>[] {
    if (Array.isArray(node)) return node.flatMap(elementsIn);
    if (!isValidElement<{ children?: ReactNode }>(node)) return [];
    return [node, ...elementsIn(node.props.children)];
  }

  async function providerOfLayout(page: ReactNode) {
    const tree = await LocaleLayout({
      children: page,
      params: Promise.resolve({ locale: "en" }),
    });
    const providers = elementsIn(tree).filter(
      (element) => element.type === GoogleSignInProvider,
    ) as ReactElement<{ enabled: boolean; children?: ReactNode }>[];
    expect(providers).toHaveLength(1);
    return providers[0];
  }

  it.each([true, false])(
    "the provider above the page says %s when that is what the server knows",
    async (configured) => {
      mockGoogleConfigured = configured;

      const provider = await providerOfLayout("the page");

      expect(provider.props.enabled).toBe(configured);
      // The page is what the provider holds.
      expect(provider.props.children).toBe("the page");
    },
  );
});
