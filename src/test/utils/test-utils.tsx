import {
  render as rtlRender,
  RenderOptions,
  RenderResult,
} from "@testing-library/react";
import { ReactElement, ReactNode } from "react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { SessionProvider } from "next-auth/react";
import { Session } from "next-auth";

/**
 * Extended render options for tests
 */
interface ExtendedRenderOptions extends Omit<RenderOptions, "wrapper"> {
  locale?: string;
  messages?: Record<string, any>;
  session?: Session | null;
  wrapper?: React.ComponentType<{ children: React.ReactNode }>;
}

/**
 * Custom render function with providers
 */
export function render(
  ui: ReactElement,
  {
    locale = "en",
    messages = {},
    session = null,
    wrapper,
    ...renderOptions
  }: ExtendedRenderOptions = {},
): RenderResult {
  const Wrapper = ({ children }: { children: ReactNode }) => {
    const Providers = (
      <SessionProvider session={session}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </SessionProvider>
    );

    if (wrapper) {
      const CustomWrapper = wrapper;
      return <CustomWrapper>{Providers}</CustomWrapper>;
    }

    return Providers;
  };

  return rtlRender(ui, { wrapper: Wrapper, ...renderOptions });
}

/**
 * Create a user event instance
 */
export function createUser() {
  return userEvent.setup();
}

/**
 * Wait for async operations
 */
export async function waitFor(
  callback: () => void | Promise<void>,
  options: { timeout?: number; interval?: number } = {},
): Promise<void> {
  const { timeout = 5000, interval = 50 } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      await callback();
      return;
    } catch (error) {
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
  }

  throw new Error(`Timeout after ${timeout}ms`);
}

/**
 * Create a deferred promise for testing
 */
export function createDeferredPromise<T = void>() {
  let resolve: (value: T) => void;
  let reject: (reason?: any) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return {
    promise,
    resolve: resolve!,
    reject: reject!,
  };
}

/**
 * Mock console methods for cleaner test output
 */
export function mockConsole() {
  const originalConsole = {
    log: console.log,
    error: console.error,
    warn: console.warn,
    info: console.info,
    debug: console.debug,
  };

  const restore = () => {
    console.log = originalConsole.log;
    console.error = originalConsole.error;
    console.warn = originalConsole.warn;
    console.info = originalConsole.info;
    console.debug = originalConsole.debug;
  };

  const mock = () => {
    console.log = jest.fn();
    console.error = jest.fn();
    console.warn = jest.fn();
    console.info = jest.fn();
    console.debug = jest.fn();
  };

  mock();

  return {
    restore,
    mock,
    logs: {
      get log() {
        return (console.log as jest.Mock).mock.calls;
      },
      get error() {
        return (console.error as jest.Mock).mock.calls;
      },
      get warn() {
        return (console.warn as jest.Mock).mock.calls;
      },
      get info() {
        return (console.info as jest.Mock).mock.calls;
      },
      get debug() {
        return (console.debug as jest.Mock).mock.calls;
      },
    },
  };
}

/**
 * Create a mock fetch response
 */
export function mockFetch(
  response: any,
  options: {
    status?: number;
    statusText?: string;
    headers?: Record<string, string>;
    delay?: number;
  } = {},
) {
  const {
    status = 200,
    statusText = "OK",
    headers = { "Content-Type": "application/json" },
    delay = 0,
  } = options;

  const mockResponse = {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    headers: new Headers(headers),
    json: jest.fn().mockResolvedValue(response),
    text: jest.fn().mockResolvedValue(JSON.stringify(response)),
    blob: jest.fn().mockResolvedValue(new Blob([JSON.stringify(response)])),
  };

  const fetchMock = jest.fn().mockImplementation(async () => {
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    return mockResponse;
  });

  global.fetch = fetchMock as any;

  return {
    mock: fetchMock,
    restore: () => {
      // @ts-ignore
      delete global.fetch;
    },
  };
}

/**
 * Test timing utilities
 */
export const timing = {
  /**
   * Measure execution time
   */
  async measure<T>(
    fn: () => Promise<T> | T,
    label?: string,
  ): Promise<{ result: T; duration: number }> {
    const start = performance.now();
    const result = await fn();
    const duration = performance.now() - start;

    if (label) {
      console.log(`${label}: ${duration.toFixed(2)}ms`);
    }

    return { result, duration };
  },

  /**
   * Assert execution time is within bounds
   */
  async assertDuration<T>(
    fn: () => Promise<T> | T,
    maxMs: number,
    label?: string,
  ): Promise<T> {
    const { result, duration } = await this.measure(fn, label);

    if (duration > maxMs) {
      throw new Error(
        `${label || "Operation"} took ${duration.toFixed(2)}ms, expected less than ${maxMs}ms`,
      );
    }

    return result;
  },
};

/**
 * Test data generation utilities
 */
export const generate = {
  /**
   * Generate random string
   */
  string(length: number = 10): string {
    return Math.random()
      .toString(36)
      .substring(2, length + 2);
  },

  /**
   * Generate random email
   */
  email(domain: string = "test.com"): string {
    return `${this.string()}@${domain}`;
  },

  /**
   * Generate random UUID
   */
  uuid(): string {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  },

  /**
   * Generate random number
   */
  number(min: number = 0, max: number = 100): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  },

  /**
   * Generate random boolean
   */
  boolean(): boolean {
    return Math.random() > 0.5;
  },

  /**
   * Generate random date
   */
  date(start?: Date, end?: Date): Date {
    const startDate = start || new Date(2020, 0, 1);
    const endDate = end || new Date();
    return new Date(
      startDate.getTime() +
        Math.random() * (endDate.getTime() - startDate.getTime()),
    );
  },
};

/**
 * Assertion helpers
 */
export const assert = {
  /**
   * Assert array contains items matching predicate
   */
  contains<T>(
    array: T[],
    predicate: (item: T) => boolean,
    message?: string,
  ): void {
    const found = array.some(predicate);
    if (!found) {
      throw new Error(message || "Array does not contain expected item");
    }
  },

  /**
   * Assert arrays are equal (deep equality)
   */
  arrayEqual<T>(actual: T[], expected: T[], message?: string): void {
    if (actual.length !== expected.length) {
      throw new Error(
        message ||
          `Array length mismatch: ${actual.length} !== ${expected.length}`,
      );
    }

    for (let i = 0; i < actual.length; i++) {
      if (JSON.stringify(actual[i]) !== JSON.stringify(expected[i])) {
        throw new Error(message || `Array items differ at index ${i}`);
      }
    }
  },

  /**
   * Assert object matches shape
   */
  shape<T extends Record<string, any>>(
    obj: T,
    shape: Partial<T>,
    message?: string,
  ): void {
    for (const [key, value] of Object.entries(shape)) {
      if (obj[key] !== value) {
        throw new Error(
          message ||
            `Object shape mismatch at key '${key}': ${obj[key]} !== ${value}`,
        );
      }
    }
  },
};

/**
 * Cleanup utilities
 */
export class TestCleanup {
  private cleanups: Array<() => void | Promise<void>> = [];

  /**
   * Register cleanup function
   */
  register(cleanup: () => void | Promise<void>): void {
    this.cleanups.push(cleanup);
  }

  /**
   * Run all cleanups
   */
  async run(): Promise<void> {
    for (const cleanup of this.cleanups.reverse()) {
      await cleanup();
    }
    this.cleanups = [];
  }
}

// Re-export commonly used testing utilities
export * from "@testing-library/react";
export { userEvent };
