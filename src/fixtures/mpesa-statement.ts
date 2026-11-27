import PDFDocument from "pdfkit";

// Builds a sample M-Pesa full statement PDF that follows Safaricom's layout:
// Receipt No | Completion Time | Details | Transaction Status | Paid In | Withdrawn | Balance

type Row = { daysAgo: number; details: string; paidIn?: number; withdrawn?: number };

const monthly = (start: number, count: number, details: string, amount: number | ((i: number) => number)): Row[] =>
  Array.from({ length: count }, (_, i) => ({
    daysAgo: start + i * 30 + (i % 2),
    details,
    withdrawn: typeof amount === "function" ? amount(i) : amount,
  }));

export function sampleRows(): Row[] {
  return [
    ...monthly(28, 6, "Pay Bill Online to 444174 - SHOWMAX AFRICA Acc. 0712345678", 1099),
    ...monthly(9, 6, "Pay Bill to 150501 - SAFARICOM HOME FIBRE Acc. 2547123", 2999),
    ...monthly(2, 6, "Merchant Payment to 5123987 - IRON PARADISE GYM", (i) => (i === 5 ? 3500 : 4000)),
    ...monthly(17, 4, "Pay Bill Online to 200999 - ZUKU Acc. 99812", 2799),
    // One-offs and transfers: should not be detected as subscriptions.
    { daysAgo: 3, details: "Customer Transfer to 0722 *** 431 JOHN K", withdrawn: 1500 },
    { daysAgo: 7, details: "Merchant Payment to 882211 - JAVA HOUSE ABC PLACE", withdrawn: 870 },
    { daysAgo: 12, details: "Merchant Payment to 774455 - NAIVAS WESTLANDS", withdrawn: 6240 },
    { daysAgo: 21, details: "Buy Bundles Online", withdrawn: 250 },
    { daysAgo: 33, details: "Merchant Payment to 882211 - JAVA HOUSE ABC PLACE", withdrawn: 540 },
    { daysAgo: 1, details: "Funds received from 0711 *** 220 MARY W", paidIn: 5000 },
    { daysAgo: 15, details: "Business Payment from 220220 - ACME LTD SALARY", paidIn: 85000 },
    { daysAgo: 45, details: "Business Payment from 220220 - ACME LTD SALARY", paidIn: 85000 },
    { daysAgo: 75, details: "Business Payment from 220220 - ACME LTD SALARY", paidIn: 85000 },
  ];
}

function fmt(n?: number) {
  return n === undefined ? "0.00" : n.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function receipt(i: number) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";
  let s = "T";
  let x = (i + 7) * 2654435761;
  for (let k = 0; k < 9; k++) {
    s += chars[x % chars.length];
    x = Math.floor(x / chars.length) + 97 * k;
  }
  return s;
}

export function sampleStatementPdf(now = new Date()): Promise<Buffer> {
  const rows = sampleRows()
    .map((r) => ({ ...r, at: new Date(now.getTime() - r.daysAgo * 86_400_000 + (r.daysAgo % 9) * 3_600_000) }))
    .sort((a, b) => b.at.getTime() - a.at.getTime());

  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 30 });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const from = new Date(now.getTime() - 200 * 86_400_000).toISOString().slice(0, 10);
  doc.fontSize(16).text("M-PESA STATEMENT", { align: "left" });
  doc.fontSize(9).text("Customer Name: ANNA SAMPLE   Mobile Number: 0712345678");
  doc.text(`Statement Period: ${from} - ${now.toISOString().slice(0, 10)}`);
  doc.text("SAMPLE DATA FOR TESTING. NOT A REAL STATEMENT.");
  doc.moveDown();

  const cols = [30, 110, 215, 520, 590, 660, 730];
  const header = ["Receipt No.", "Completion Time", "Details", "Status", "Paid In", "Withdrawn", "Balance"];
  let y = doc.y;
  doc.font("Helvetica-Bold");
  header.forEach((h, i) => doc.text(h, cols[i], y, { lineBreak: false }));
  doc.font("Helvetica");
  y += 16;

  let balance = 24_310.55;
  rows.forEach((r, i) => {
    if (y > 560) {
      doc.addPage();
      y = 30;
    }
    const time = r.at.toISOString().replace("T", " ").slice(0, 19);
    const cells = [receipt(i), time, r.details, "Completed", fmt(r.paidIn), r.withdrawn ? `-${fmt(r.withdrawn)}` : "0.00", fmt(balance)];
    cells.forEach((c, ci) => doc.text(c, cols[ci], y, { lineBreak: false, width: ci === 2 ? 300 : 70 }));
    balance += (r.withdrawn ?? 0) - (r.paidIn ?? 0);
    y += 14;
  });

  doc.end();
  return done;
}
