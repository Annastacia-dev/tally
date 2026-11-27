// Dates are shown in Kenyan time regardless of where the server runs.
export const TZ = process.env.APP_TIMEZONE ?? "Africa/Nairobi";

export function fmtDate(d: Date, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }) {
  return d.toLocaleDateString("en-KE", { timeZone: TZ, ...opts });
}

export function isoDay(d: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
