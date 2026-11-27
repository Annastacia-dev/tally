export const DEMO_EMAIL = "demo@kumbuka.local";

export function googleEnabled() {
  return Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
}

/** Demo mode: on when DEMO_MODE=true, or automatically when Google is not configured. */
export function demoEnabled() {
  if (process.env.DEMO_MODE === "false") return false;
  return process.env.DEMO_MODE === "true" || !googleEnabled();
}
