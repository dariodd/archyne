/**
 * Vite's `?worker` import suffix, declared locally.
 *
 * `layout/autoLayout.ts` loads ELK's solver in a worker through it, and the
 * application typechecks that because it has Vite's client types. A published
 * package should not need a bundler's ambient types to emit its own
 * declarations, so the one form actually used is declared here instead.
 *
 * The import is inside a `try` with a main-thread fallback, so a consumer whose
 * bundler does not understand the suffix still lays diagrams out — slower, on
 * the main thread, exactly as under jsdom today.
 */
declare module "*?worker" {
  const WorkerConstructor: { new (): Worker };
  export default WorkerConstructor;
}
