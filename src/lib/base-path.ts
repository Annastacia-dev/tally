/**
 * The path Tally is served under, e.g. "/tally" for www.annastacia.dev/tally.
 * Empty when it runs at the root of its own domain. Set at build time with
 * NEXT_PUBLIC_BASE_PATH; next.config.ts reads the same value.
 */
export const BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/$/, "");

/** Prefixes a root-relative path with the base path, for places Next.js does not do it (images, the service worker, Auth.js redirects). */
export function withBase(path: string) {
  return `${BASE_PATH}${path}`;
}
