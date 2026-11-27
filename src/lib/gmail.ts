import { prisma } from "./db";
import type { EmailInput } from "./extract";
import { gmailQuery } from "./services";

// Thin Gmail REST client. We only ever call read-only endpoints
// (scope: https://www.googleapis.com/auth/gmail.readonly).

const API = "https://gmail.googleapis.com/gmail/v1/users/me";

async function accessToken(userId: string): Promise<string> {
  const account = await prisma.account.findFirst({ where: { userId, provider: "google" } });
  if (!account?.access_token) throw new Error("No Google account linked. Sign in with Google first.");

  const fresh = account.expires_at && account.expires_at * 1000 > Date.now() + 60_000;
  if (fresh) return account.access_token;
  if (!account.refresh_token) throw new Error("Google token expired and no refresh token. Sign out and in again.");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.AUTH_GOOGLE_ID!,
      client_secret: process.env.AUTH_GOOGLE_SECRET!,
      grant_type: "refresh_token",
      refresh_token: account.refresh_token,
    }),
  });
  const json = (await res.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !json.access_token) throw new Error(`Google token refresh failed: ${json.error ?? res.status}`);

  await prisma.account.update({
    where: { provider_providerAccountId: { provider: "google", providerAccountId: account.providerAccountId } },
    data: { access_token: json.access_token, expires_at: Math.floor(Date.now() / 1000) + (json.expires_in ?? 3600) },
  });
  return json.access_token;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class GmailRateLimitError extends Error {}

// Gmail limits each user to a quota of units per minute and answers 429, or
// 403 with reason rateLimitExceeded, when we go over. Back off and retry:
// the window is one minute, so waits add up to a little over that.
const BACKOFF_MS = [2_000, 5_000, 10_000, 20_000, 30_000];

async function gget<T>(token: string, path: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) return res.json() as Promise<T>;
    const text = await res.text();
    const limited = res.status === 429 || (res.status === 403 && /rateLimitExceeded|RATE_LIMIT_EXCEEDED/.test(text));
    if (limited && attempt < BACKOFF_MS.length) {
      const retryAfter = Number(res.headers.get("retry-after")) * 1000;
      await sleep(retryAfter > 0 ? Math.min(retryAfter, 60_000) : BACKOFF_MS[attempt] + Math.random() * 1000);
      continue;
    }
    if (limited) throw new GmailRateLimitError("Gmail is limiting how fast we can read your inbox. Wait a minute and scan again; emails already read are kept.");
    throw new Error(`Gmail ${path.split("?")[0]} failed: ${res.status} ${text.slice(0, 300)}`);
  }
}

type Part = { mimeType?: string; body?: { data?: string }; parts?: Part[] };
type Message = {
  id: string;
  internalDate: string;
  payload: Part & { headers: { name: string; value: string }[] };
};

function decode(data: string) {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

export function htmlToText(html: string) {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#\d+;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

function bodyText(part: Part): string {
  const plain: string[] = [];
  const html: string[] = [];
  const walk = (p: Part) => {
    if (p.body?.data && p.mimeType === "text/plain") plain.push(decode(p.body.data));
    if (p.body?.data && p.mimeType === "text/html") html.push(decode(p.body.data));
    p.parts?.forEach(walk);
  };
  walk(part);
  return plain.length ? plain.join("\n") : htmlToText(html.join("\n"));
}

export async function listBillingMessageIds(userId: string, months = 18, max = 400) {
  const token = await accessToken(userId);
  const q = encodeURIComponent(gmailQuery(months));
  const ids: string[] = [];
  let pageToken = "";
  while (ids.length < max) {
    const page = await gget<{ messages?: { id: string }[]; nextPageToken?: string }>(
      token,
      `/messages?q=${q}&maxResults=100${pageToken ? `&pageToken=${pageToken}` : ""}`,
    );
    ids.push(...(page.messages ?? []).map((m) => m.id));
    if (!page.nextPageToken) break;
    pageToken = page.nextPageToken;
  }
  return { token, ids: ids.slice(0, max) };
}

export async function fetchEmail(token: string, id: string): Promise<EmailInput> {
  const msg = await gget<Message>(token, `/messages/${id}?format=full`);
  const header = (n: string) => msg.payload.headers.find((h) => h.name.toLowerCase() === n)?.value ?? "";
  return {
    id,
    from: header("from"),
    subject: header("subject"),
    date: new Date(Number(msg.internalDate)).toISOString(),
    body: bodyText(msg.payload),
  };
}
