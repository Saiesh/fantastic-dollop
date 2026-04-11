import { vi } from "vitest";

/**
 * Mutable `Headers` instance returned by `headers()` so tests can set `x-forwarded-for` / `x-real-ip` for rate-limit keys.
 * Why: `joinGroupWithInvite` builds the limiter key from these headers; controlling them keeps tests deterministic.
 */
let mockHeaders: Headers = new Headers();

/**
 * Cookie store returned by `cookies()` — `get`/`set`/`delete` are spies tests can assert on.
 * Why: session actions read the JWT from cookies and may refresh or clear it; spies capture those calls without a real browser.
 */
function createCookieStore() {
  return {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  };
}

let cookieStore = createCookieStore();

export const nextHeadersMocks = {
  /**
   * Async factory matching Next’s `cookies()` return shape used by session helpers.
   */
  cookies: vi.fn(async () => cookieStore),

  /**
   * Async factory matching Next’s `headers()` — returns the mutable `mockHeaders` instance.
   */
  headers: vi.fn(async () => mockHeaders),

  /**
   * Replace the header bag (e.g. simulate client IP for rate limiting).
   */
  setHeaders(init: HeadersInit): void {
    mockHeaders = new Headers(init);
  },

  /**
   * Swap the cookie spy object when a test needs a fresh mock (same reference as `cookies()` resolves to).
   */
  replaceCookieStore(next: ReturnType<typeof createCookieStore>): void {
    cookieStore = next;
  },
};

/**
 * Reset header/cookie state between tests so order does not leak rate-limit keys or cookie assertions.
 */
export function resetNextHeadersMocks(): void {
  mockHeaders = new Headers();
  cookieStore = createCookieStore();
  nextHeadersMocks.cookies.mockClear();
  nextHeadersMocks.headers.mockClear();
}
