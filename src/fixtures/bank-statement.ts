import PDFDocument from "pdfkit";

// Builds a sample bank account statement PDF in a common Kenyan layout:
// Txn Date | Value Date | Narration | Debit | Credit | Balance, oldest first,
// dates as dd/mm/yyyy. Netflix and Spotify line up with the demo inbox
// receipts, so the demo shows the same payment merged across sources.

type Row = { daysAgo: number; narration: string; debit?: number; credit?: number };

const monthly = (start: number, count: number, narration: string, amount: number | ((i: number) => number)): Row[] =>
  Array.from({ length: count }, (_, i) => ({
    daysAgo: start + i * 30 + (i % 2),
    narration,
    debit: typeof amount === "function" ? amount(i) : amount,
  }));

export function sampleBankRows(): Row[] {
  return [
    ...monthly(12, 6, "POS PURCHASE NETFLIX.COM 866-579-7172 NL 441234******9012", 1100),
    ...monthly(3, 6, "CARD PURCHASE SPOTIFY P2F8C1A9E STOCKHOLM 441234******9012", 399),
    ...monthly(14, 3, "CARD PURCHASE APPLE.COM/BILL CORK IE 441234******9012", 129.95),
    ...monthly(3, 6, "STANDING ORDER S/O 00231 IRON PARADISE GYM", 4000),
    ...monthly(20, 4, "DIRECT DEBIT JUBILEE INSURANCE POLICY 88123", 3250),
    // One-offs and money in: should not be detected as subscriptions.
    { daysAgo: 2, narration: "POS PURCHASE CARREFOUR TRM 441234******9012", debit: 7480.25 },
    { daysAgo: 9, narration: "POS PURCHASE NAIVAS WESTLANDS 441234******9012", debit: 5212.0 },
    { daysAgo: 16, narration: "ATM WITHDRAWAL WESTGATE ATM 0045", debit: 10000 },
    { daysAgo: 24, narration: "MPESA B2C TRANSFER TO 0722XXX431", debit: 2500 },
    { daysAgo: 41, narration: "POS PURCHASE JAVA HOUSE ABC PLACE 441234******9012", debit: 960 },
    { daysAgo: 26, narration: "SALARY ACME LTD NOV", credit: 185000 },
    { daysAgo: 56, narration: "SALARY ACME LTD OCT", credit: 185000 },
    { daysAgo: 86, narration: "SALARY ACME LTD SEP", credit: 185000 },
    { daysAgo: 116, narration: "SALARY ACME LTD AUG", credit: 185000 },
    { daysAgo: 146, narration: "SALARY ACME LTD JUL", credit: 185000 },
    { daysAgo: 176, narration: "SALARY ACME LTD JUN", credit: 185000 },
    { daysAgo: 33, narration: "REVERSAL POS NAIVAS WESTLANDS", credit: 820 },
  ];
}

const fmt = (n?: number) => (n === undefined ? "" : n.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

function ddmmyyyy(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

export function sampleBankStatementPdf(now = new Date()): Promise<Buffer> {
  const rows = sampleBankRows()
    .map((r) => ({ ...r, at: new Date(now.getTime() - r.daysAgo * 86_400_000) }))
    .sort((a, b) => a.at.getTime() - b.at.getTime());

  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 30 });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const opening = 42_615.8;
  const from = new Date(now.getTime() - 190 * 86_400_000);
  doc.fontSize(16).text("SAMPLE BANK LTD", { align: "left" });
  doc.fontSize(10).text("ACCOUNT STATEMENT");
  doc.fontSize(9).text("Account Name: ANNA SAMPLE   Account No: 0100XXXXXX123   Currency: KES");
  doc.text(`Period: ${ddmmyyyy(from)} to ${ddmmyyyy(now)}`);
  doc.text("SAMPLE DATA FOR TESTING. NOT A REAL STATEMENT.");
  doc.text(`Opening Balance: ${fmt(opening)}`);
  doc.moveDown();

  const cols = [30, 100, 170, 520, 600, 690];
  const header = ["Txn Date", "Value Date", "Narration", "Debit", "Credit", "Balance"];
  let y = doc.y;
  doc.font("Helvetica-Bold");
  header.forEach((h, i) => doc.text(h, cols[i], y, { lineBreak: false }));
  doc.font("Helvetica");
  y += 16;

  let balance = opening;
  for (const r of rows) {
    if (y > 560) {
      doc.addPage();
      y = 30;
    }
    balance = Math.round((balance - (r.debit ?? 0) + (r.credit ?? 0)) * 100) / 100;
    const date = ddmmyyyy(r.at);
    const cells = [date, date, r.narration, fmt(r.debit), fmt(r.credit), fmt(balance)];
    cells.forEach((c, ci) => doc.text(c, cols[ci], y, { lineBreak: false, width: ci === 2 ? 340 : 80 }));
    y += 14;
  }
  doc.moveDown();
  doc.text(`Closing Balance: ${fmt(balance)}`, 30, y + 6);

  doc.end();
  return done;
}
