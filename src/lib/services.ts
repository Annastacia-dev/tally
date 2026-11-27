// A small catalog of well-known subscription services. It is used to
// normalise names ("NETFLIX.COM", "Netflix Inc" -> netflix), pick a brand
// colour for the card, and build the Gmail search query.

export type KnownService = {
  key: string;
  name: string;
  domain: string;
  color: string;
  category: string;
  aliases: string[];
  senders: string[];
};

export const KNOWN_SERVICES: KnownService[] = [
  { key: "netflix", name: "Netflix", domain: "netflix.com", color: "#E50914", category: "Streaming", aliases: ["netflix"], senders: ["netflix.com"] },
  { key: "spotify", name: "Spotify", domain: "spotify.com", color: "#1DB954", category: "Music", aliases: ["spotify"], senders: ["spotify.com"] },
  { key: "showmax", name: "Showmax", domain: "showmax.com", color: "#E4007C", category: "Streaming", aliases: ["showmax"], senders: ["showmax.com"] },
  { key: "youtube-premium", name: "YouTube Premium", domain: "youtube.com", color: "#FF0033", category: "Streaming", aliases: ["youtube premium", "youtube music", "youtube"], senders: ["youtube.com"] },
  { key: "apple", name: "Apple", domain: "apple.com", color: "#555555", category: "Apps", aliases: ["apple", "icloud", "apple music", "apple one", "itunes"], senders: ["apple.com", "email.apple.com"] },
  { key: "google-play", name: "Google Play", domain: "play.google.com", color: "#01875F", category: "Apps", aliases: ["google play"], senders: ["googleplay-noreply@google.com"] },
  { key: "google-one", name: "Google One", domain: "one.google.com", color: "#4285F4", category: "Cloud", aliases: ["google one", "google storage"], senders: ["google-one-noreply@google.com"] },
  { key: "dstv", name: "DStv", domain: "dstv.com", color: "#0071BC", category: "TV", aliases: ["dstv", "multichoice"], senders: ["dstv.com", "multichoice.com"] },
  { key: "gotv", name: "GOtv", domain: "gotvafrica.com", color: "#00A651", category: "TV", aliases: ["gotv"], senders: ["gotvafrica.com"] },
  { key: "zuku", name: "Zuku", domain: "zuku.co.ke", color: "#F7941D", category: "Internet", aliases: ["zuku", "wananchi"], senders: ["zuku.co.ke"] },
  { key: "safaricom-home", name: "Safaricom Home Fibre", domain: "safaricom.co.ke", color: "#43B02A", category: "Internet", aliases: ["safaricom home", "safaricom fibre", "home fibre"], senders: ["safaricom.co.ke"] },
  { key: "chatgpt", name: "ChatGPT", domain: "openai.com", color: "#10A37F", category: "Software", aliases: ["chatgpt", "openai"], senders: ["openai.com"] },
  { key: "claude", name: "Claude", domain: "claude.ai", color: "#D97757", category: "Software", aliases: ["claude", "anthropic"], senders: ["anthropic.com", "mail.anthropic.com"] },
  { key: "notion", name: "Notion", domain: "notion.so", color: "#111111", category: "Software", aliases: ["notion"], senders: ["notion.so", "makenotion.com"] },
  { key: "figma", name: "Figma", domain: "figma.com", color: "#A259FF", category: "Software", aliases: ["figma"], senders: ["figma.com"] },
  { key: "github", name: "GitHub", domain: "github.com", color: "#24292F", category: "Software", aliases: ["github"], senders: ["github.com"] },
  { key: "canva", name: "Canva", domain: "canva.com", color: "#00C4CC", category: "Software", aliases: ["canva"], senders: ["canva.com"] },
  { key: "adobe", name: "Adobe", domain: "adobe.com", color: "#FA0F00", category: "Software", aliases: ["adobe", "creative cloud"], senders: ["adobe.com"] },
  { key: "microsoft-365", name: "Microsoft 365", domain: "microsoft.com", color: "#0078D4", category: "Software", aliases: ["microsoft 365", "office 365", "microsoft"], senders: ["microsoft.com"] },
  { key: "dropbox", name: "Dropbox", domain: "dropbox.com", color: "#0061FF", category: "Cloud", aliases: ["dropbox"], senders: ["dropbox.com"] },
  { key: "amazon-prime", name: "Prime Video", domain: "primevideo.com", color: "#00A8E1", category: "Streaming", aliases: ["prime video", "amazon prime"], senders: ["amazon.com", "primevideo.com"] },
  { key: "disney-plus", name: "Disney+", domain: "disneyplus.com", color: "#113CCF", category: "Streaming", aliases: ["disney+", "disney plus"], senders: ["disneyplus.com"] },
  { key: "linkedin", name: "LinkedIn Premium", domain: "linkedin.com", color: "#0A66C2", category: "Software", aliases: ["linkedin"], senders: ["linkedin.com"] },
  { key: "duolingo", name: "Duolingo", domain: "duolingo.com", color: "#58CC02", category: "Learning", aliases: ["duolingo"], senders: ["duolingo.com"] },
  { key: "boomplay", name: "Boomplay", domain: "boomplay.com", color: "#2BB5F5", category: "Music", aliases: ["boomplay"], senders: ["boomplay.com"] },
];

export const SUBSCRIPTION_KEYWORDS = [
  "receipt",
  "invoice",
  "subscription",
  "renews",
  "renewal",
  "renewed",
  "\"payment received\"",
  "\"payment confirmation\"",
  "\"your plan\"",
  "membership",
  "billing",
];

function slug(s: string) {
  return s
    .toLowerCase()
    .replace(/\b(inc|ltd|limited|llc|plc|africa|kenya|ke|com|co|online|services?)\b/g, " ")
    .replace(/[^a-z0-9+]+/g, " ")
    .trim()
    .replace(/\s+/g, "-");
}

export function findKnownService(name: string): KnownService | undefined {
  const lower = name.toLowerCase();
  // Longest alias first, so "youtube premium" wins over "youtube".
  let best: { svc: KnownService; len: number } | undefined;
  for (const svc of KNOWN_SERVICES) {
    for (const alias of svc.aliases) {
      if (lower.includes(alias) && (!best || alias.length > best.len)) {
        best = { svc, len: alias.length };
      }
    }
  }
  return best?.svc;
}

// Words that describe the sender or the email, not the product.
const SENDER_SUFFIX =
  /\s+(billing team|billing|team|support|payments?|accounts?|receipts?|invoices?|notifications?|subscriptions?|renewals?|domains?|inc\.?|llc|ltd\.?|limited|pbc|corp\.?)$/i;

/**
 * "Supabase Billing Team" -> "Supabase",
 * "Namecheap Domain Renewal (example.org)" -> "Namecheap".
 */
export function cleanServiceName(name: string): string {
  let n = name.replace(/\s*\([^)]*\)\s*$/, "").replace(/[,.:;\s-]+$/, "").trim();
  for (let i = 0; i < 3; i++) {
    const next = n.replace(SENDER_SUFFIX, "").trim();
    if (next === n || !next) break;
    n = next;
  }
  return n || name.trim();
}

export function serviceKey(name: string): string {
  return findKnownService(name)?.key ?? (slug(name) || "unknown");
}

export function displayName(name: string): string {
  const known = findKnownService(name);
  if (known) return known.name;
  // Title-case shouty M-Pesa merchant names: "IRON PARADISE GYM" -> "Iron Paradise Gym".
  if (name === name.toUpperCase()) {
    return name.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).trim();
  }
  return name.trim();
}

const PALETTE = ["#7C5CFF", "#FF7A59", "#00B8A9", "#F6A609", "#E84393", "#3D8BFD", "#20C997", "#FD7E14"];

export function brandColor(key: string): string {
  const known = KNOWN_SERVICES.find((s) => s.key === key);
  if (known) return known.color;
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export function serviceMeta(key: string) {
  const known = KNOWN_SERVICES.find((s) => s.key === key);
  return { domain: known?.domain ?? null, category: known?.category ?? null };
}

export function gmailQuery(months: number): string {
  const senders = KNOWN_SERVICES.flatMap((s) => s.senders).map((s) => `from:${s}`);
  const subjects = SUBSCRIPTION_KEYWORDS.map((k) => `subject:${k}`);
  return `newer_than:${months}m -in:chats (${[...subjects, ...senders].join(" OR ")})`;
}
