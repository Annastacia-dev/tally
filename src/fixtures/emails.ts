import type { EmailInput } from "@/lib/extract";

// Fixture inbox for demo mode. Each template is anchored to "days ago" so the
// demo always looks current. Includes some noise (shipping, password reset,
// promos) that the extractor should ignore.

type Template = {
  from: string;
  subject: string;
  body: (d: string) => string;
  daysAgo: number[];
};

const monthly = (start: number, count: number) => Array.from({ length: count }, (_, i) => start + i * 30);

const TEMPLATES: Template[] = [
  {
    from: "Netflix <info@account.netflix.com>",
    subject: "Your Netflix receipt",
    daysAgo: monthly(12, 6),
    body: (d) => `Hi Anna,\nThanks for your payment. Your Netflix subscription has been renewed.\nPlan: Standard\nAmount: KES 1,100.00\nBilling date: ${d}\nYou are billed monthly. Manage your membership at netflix.com/account.`,
  },
  {
    from: "Spotify <no-reply@spotify.com>",
    subject: "Your Spotify Premium receipt",
    daysAgo: monthly(3, 6),
    body: (d) => `Thanks for being Premium.\nPlan: Premium Individual\nDate: ${d}\nTotal: KES 399.00 per month\nYour subscription renews automatically every month.`,
  },
  {
    from: "Apple <no_reply@email.apple.com>",
    subject: "Your receipt from Apple",
    daysAgo: monthly(20, 5),
    body: (d) => `Receipt\nDate: ${d}\niCloud+ with 50 GB storage (Monthly)\nRenews monthly\nSubscription total: USD 0.99\nBilled to Visa •••• 4821`,
  },
  {
    from: "OpenAI <noreply@tm.openai.com>",
    subject: "Your ChatGPT Plus subscription receipt",
    daysAgo: monthly(8, 4),
    body: (d) => `Receipt from OpenAI\nChatGPT Plus subscription\nPlan: Plus\nDate paid: ${d}\nAmount paid: $20.00 per month`,
  },
  {
    from: "Notion <team@makenotion.com>",
    subject: "Invoice for your Notion Plus plan",
    daysAgo: [40, 405],
    body: (d) => `Your Notion Plus subscription has been renewed for another year.\nPlan: Plus (annual)\nInvoice date: ${d}\nAmount: USD 96.00 billed yearly.`,
  },
  {
    from: "Google Play <googleplay-noreply@google.com>",
    subject: "Your Google Play Order Receipt",
    daysAgo: [220],
    body: (d) => `Thank you. You've made a purchase from Google Play.\nOrder date: ${d}\nItem: Duolingo Super (Duolingo) subscription\nPlan: Super annual\nPrice: USD 59.99/year\nAuto-renewing subscription. Cancel anytime in Google Play.`,
  },
  {
    from: "Canva <no-reply@canva.com>",
    subject: "Canva Pro receipt",
    daysAgo: [95, 125, 155, 185],
    body: (d) => `Thanks for your payment!\nYour Canva Pro subscription\nPlan: Pro monthly\nPaid on ${d}\nTotal: USD 14.99 per month`,
  },
  {
    from: "Showmax <hello@showmax.com>",
    subject: "Your Showmax subscription renews soon",
    daysAgo: [28],
    body: (d) => `Heads up! Your Showmax Premier League Mobile membership renews monthly.\nPlan: Mobile\nLast payment: ${d}\nAmount: KSh 1,099 via M-Pesa.`,
  },
  // Noise the extractor should reject.
  {
    from: "Jumia <orders@jumia.co.ke>",
    subject: "Your order has shipped",
    daysAgo: [14],
    body: () => `Good news! Your order #448812 (wireless earbuds, KES 2,450) has shipped and is out for delivery.`,
  },
  {
    from: "Spotify <no-reply@spotify.com>",
    subject: "Reset your password",
    daysAgo: [50],
    body: () => `Someone asked to reset the password for your account. If this was you, click the link below.`,
  },
  {
    from: "Bolt <promo@bolt.eu>",
    subject: "50% off your next 3 rides",
    daysAgo: [5],
    body: () => `This week only: 50% off rides up to KES 300. Sale ends Sunday. Unsubscribe from our newsletter anytime.`,
  },
];

export function fixtureEmails(now = new Date()): EmailInput[] {
  const out: EmailInput[] = [];
  TEMPLATES.forEach((t, ti) => {
    t.daysAgo.forEach((ago, i) => {
      const date = new Date(now.getTime() - ago * 86_400_000);
      const d = date.toISOString().slice(0, 10);
      out.push({ id: `fixture-${ti}-${i}`, from: t.from, subject: t.subject, date: date.toISOString(), body: t.body(d) });
    });
  });
  return out;
}
