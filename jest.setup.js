// Learn more: https://github.com/testing-library/jest-dom
import "@testing-library/jest-dom";

// Polyfill for setImmediate (not available in jsdom environment)
if (typeof setImmediate === "undefined") {
  global.setImmediate = (callback, ...args) => {
    return setTimeout(callback, 0, ...args);
  };
}

if (typeof clearImmediate === "undefined") {
  global.clearImmediate = (id) => {
    return clearTimeout(id);
  };
}

// Mock next/server for middleware tests
jest.mock("next/server", () => {
  class MockNextRequest {
    constructor(url, init = {}) {
      this.url = url.toString();
      this.nextUrl = new URL(url);
      this.method = init.method || "GET";
      this.ip = "127.0.0.1";

      // Mock headers object
      const headersMap = new Map();
      if (init.headers) {
        for (const [key, value] of Object.entries(init.headers)) {
          headersMap.set(key.toLowerCase(), value);
        }
      }

      this.headers = {
        get: (name) => headersMap.get(name.toLowerCase()) || null,
        set: (name, value) => headersMap.set(name.toLowerCase(), value),
        has: (name) => headersMap.has(name.toLowerCase()),
      };

      // Mock cookies object
      const cookiesMap = new Map();
      this.cookies = {
        get: (name) => {
          const value = cookiesMap.get(name);
          return value ? { value } : undefined;
        },
        set: (name, value, options) => {
          cookiesMap.set(name, value);
        },
      };
    }
  }

  class MockNextResponse {
    constructor() {
      this.status = 200;

      // Mock headers object
      const headersMap = new Map();
      this.headers = {
        get: (name) => headersMap.get(name.toLowerCase()) || null,
        set: (name, value) => headersMap.set(name.toLowerCase(), value),
        has: (name) => headersMap.has(name.toLowerCase()),
      };

      // Mock cookies object
      const cookiesMap = new Map();
      this.cookies = {
        get: (name) => cookiesMap.get(name),
        set: (name, value, options) => {
          cookiesMap.set(name, { value, ...options });
          // Simulate set-cookie header with proper case
          const sameSite = options?.sameSite
            ? options.sameSite.toLowerCase() === "lax"
              ? "Lax"
              : options.sameSite.toLowerCase() === "strict"
                ? "Strict"
                : options.sameSite.toLowerCase() === "none"
                  ? "None"
                  : options.sameSite
            : "";
          const cookieString = `${name}=${value}; ${options?.httpOnly ? "HttpOnly; " : ""}${sameSite ? `SameSite=${sameSite}; ` : ""}${options?.maxAge ? `Max-Age=${options.maxAge}; ` : ""}`;
          this.headers.set("set-cookie", cookieString);
        },
      };
    }

    static next() {
      return new MockNextResponse();
    }

    static redirect(url) {
      const response = new MockNextResponse();
      response.status = 307;
      response.headers.set("location", url.toString());
      return response;
    }
  }

  return {
    NextRequest: MockNextRequest,
    NextResponse: MockNextResponse,
  };
});

// Mock next-intl for component tests
jest.mock("next-intl", () => ({
  useTranslations: () => (key) => key,
  useLocale: () => "en",
}));

// Mock next-intl/server for server-side utilities
jest.mock("next-intl/server", () => ({
  getTranslations: jest.fn().mockResolvedValue((key) => key),
  getLocale: jest.fn().mockResolvedValue("en"),
  getMessages: jest.fn().mockResolvedValue({}),
  getNow: jest.fn().mockResolvedValue(new Date()),
  getTimeZone: jest.fn().mockResolvedValue("UTC"),
  getRequestConfig: jest.fn().mockReturnValue({
    locale: "en",
    messages: {},
  }),
}));

// Mock the main i18n configuration
jest.mock("@/i18n", () => ({
  locales: ["en", "es", "fr", "it", "de"],
  default: {
    locale: "en",
    messages: {},
  },
}));

// Mock next/navigation
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    refresh: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    prefetch: jest.fn(),
  }),
  usePathname: () => "/test-path",
  useSearchParams: () => new URLSearchParams(),
}));

// Mock next-auth
jest.mock("next-auth/react", () => ({
  signIn: jest.fn(),
  signOut: jest.fn(),
  useSession: () => ({
    data: null,
    status: "unauthenticated",
  }),
}));

// Suppress console errors during tests (optional)
const originalError = console.error;
beforeAll(() => {
  console.error = (...args) => {
    if (
      typeof args[0] === "string" &&
      args[0].includes("Warning: ReactDOM.render is no longer supported")
    ) {
      return;
    }
    originalError.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
});
