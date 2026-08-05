import type { InjectionToken } from '@nestjs/common';

/**
 * Stand-in for a constructor dependency a spec does not assert on.
 *
 * Every property resolves to a memoized `jest.fn()`, so the mock satisfies
 * whatever shape the service happens to call without the spec having to
 * describe it. Repeated access returns the same fn, so tests can still reach
 * in and assert on a call if they want to.
 */
export function createAutoMock(): any {
  const members = new Map<string | symbol, jest.Mock>();

  return new Proxy(
    {},
    {
      get(_target, prop) {
        // Never look like a Promise — Nest and jest both probe for `then`,
        // and a jest.fn() there makes the mock await forever.
        if (prop === 'then') return undefined;
        if (!members.has(prop)) members.set(prop, jest.fn());
        return members.get(prop);
      },
      has: () => true,
    },
  );
}

/**
 * Auto-mock every dependency a testing module did not explicitly provide.
 *
 * Services here take a lot of collaborators — MCPService alone takes 40 — and
 * hand-listing them means any refactor that adds one breaks every spec for
 * that service with an unresolved-dependency error rather than a real
 * failure. Pass this to `.useMocker()` and give explicit providers only for
 * the collaborators a test actually drives or asserts on.
 *
 *   const module = await Test.createTestingModule({
 *     providers: [MyService, { provide: ThingIcareAbout, useValue: mock }],
 *   })
 *     .useMocker(autoMocker)
 *     .compile();
 */
export const autoMocker = (_token: InjectionToken): any => createAutoMock();
