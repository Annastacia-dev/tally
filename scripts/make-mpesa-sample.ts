// Writes fixtures/sample-mpesa-statement.pdf (dates relative to today).
import { writeFileSync } from "node:fs";
import { sampleStatementPdf } from "../src/fixtures/mpesa-statement";

sampleStatementPdf().then((buf) => {
  writeFileSync("fixtures/sample-mpesa-statement.pdf", buf);
  console.log(`Wrote fixtures/sample-mpesa-statement.pdf (${buf.length} bytes)`);
});
