/**
 * The app's version, substituted at build time from `package.json` by the
 * `define` in `vite.config.ts`. Declared rather than imported so the manifest
 * does not end up in the bundle for the sake of one string.
 */
declare const __APP_VERSION__: string;
