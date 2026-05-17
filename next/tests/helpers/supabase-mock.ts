import { vi } from "vitest";

/**
 * Create a chainable Supabase query mock.
 * Each method returns `this` so calls can be chained,
 * and the final resolver (select/insert/update/upsert/delete/single/rpc)
 * can be configured to return specific data.
 */
export function createMockSupabaseClient(overrides: Record<string, unknown> = {}) {
  const queryResult = { data: null as unknown, error: null as unknown, count: null as number | null };

  const chainable: Record<string, unknown> = {};
  const chainMethods = [
    "select", "insert", "update", "upsert", "delete",
    "eq", "neq", "gt", "gte", "lt", "lte", "in", "is",
    "range", "order", "limit", "single", "maybeSingle",
  ];

  for (const method of chainMethods) {
    chainable[method] = vi.fn().mockReturnValue(chainable);
  }

  // Terminal methods resolve with the result
  chainable.then = undefined; // Make it thenable at the end
  const makeThenable = () => {
    // Return a promise-like that resolves to queryResult
    const result = { ...chainable, then: (fn: (val: unknown) => unknown) => Promise.resolve(queryResult).then(fn) };
    return result;
  };

  // Override select/insert/update etc. to be both chainable AND thenable
  for (const method of chainMethods) {
    const orig = chainable[method] as ReturnType<typeof vi.fn>;
    chainable[method] = vi.fn((...args: unknown[]) => {
      orig(...args);
      return chainable;
    });
  }

  // The `from` method returns the chainable query
  const from = vi.fn().mockReturnValue(chainable);
  const rpc = vi.fn().mockResolvedValue(queryResult);

  const client = { from, rpc, ...overrides };

  return {
    client,
    from,
    rpc,
    query: chainable,
    setResult(data: unknown, error: unknown = null, count: number | null = null) {
      queryResult.data = data;
      queryResult.error = error;
      queryResult.count = count;

      // Make the chain thenable with this result
      for (const method of chainMethods) {
        (chainable[method] as ReturnType<typeof vi.fn>).mockReturnValue({
          ...chainable,
          then: (resolve: (val: unknown) => unknown) =>
            Promise.resolve({ data, error, count }).then(resolve),
        });
      }

      // Also make `from` directly resolve for simple cases
      rpc.mockResolvedValue({ data, error, count });
    },
  };
}

/**
 * Mock the createAdminClient to return a controlled Supabase client.
 */
export function mockSupabaseServer() {
  const mock = createMockSupabaseClient();
  vi.mock("@/lib/supabase/server", () => ({
    createAdminClient: () => mock.client,
  }));
  return mock;
}
