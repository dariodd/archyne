/**
 * E2E: drive the real app in Edge, run the PNG and PDF export pipelines, and
 * save the results for visual inspection.
 *
 * The PDF half only runs in a browser: the page is built from the pixels of a
 * rendered capture, which needs a canvas to read them back out of.
 *
 * Run:  npm run dev, then npx tsx tests/e2e-export.mts [output.png]
 */
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { CHANNEL, codeUrl } from "./env.mts";

const OUT = process.argv[2] ?? "export-e2e.png";
const CODE = `architecture-beta
  group g1(cloud)[VPC]
  service web(internet)[Web] in g1
  service db(database)[Database] in g1

  web:R -[query]-> L:db
`;

const url = codeUrl(CODE);
const browser = await chromium.launch({ channel: CHANNEL, headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on("console", (m) => {
    if (m.type() === "error") console.error("[console]", m.text());
  });
  await page.goto(url);
  await page.waitForFunction(
    () =>
      (window as unknown as { __graphTest?: { ready: () => boolean } }).__graphTest?.ready(),
    undefined,
    { timeout: 30000 },
  );
  await page.waitForTimeout(600); // icons/fonts settle
  const dataUrl = await page.evaluate(() =>
    (
      window as unknown as { __graphTest: { exportPng: () => Promise<string> } }
    ).__graphTest.exportPng(),
  );
  if (!dataUrl.startsWith("data:image/png;base64,")) {
    throw new Error(`unexpected result: ${dataUrl.slice(0, 120)}`);
  }
  writeFileSync(OUT, Buffer.from(dataUrl.slice(22), "base64"));
  console.log(`saved ${OUT} (${Math.round(dataUrl.length / 1024)} KB b64)`);

  // The last case is the one that exercises the soft mask: a see-through
  // background is the only way an alpha channel reaches the page.
  const cases = [
    { name: "fit", page: "fit", background: "dark" },
    { name: "a4", page: "a4", background: "light" },
    { name: "transparent", page: "fit", background: "transparent" },
  ] as const;

  for (const each of cases) {
    const pdfUrl = await page.evaluate(
      (opts) =>
        (
          window as unknown as {
            __graphTest: { exportWith: (o: Record<string, unknown>) => Promise<string> };
          }
        ).__graphTest.exportWith(opts),
      { format: "pdf", page: each.page, background: each.background },
    );
    const prefix = "data:application/pdf;base64,";
    if (!pdfUrl.startsWith(prefix)) {
      throw new Error(`unexpected PDF result: ${pdfUrl.slice(0, 120)}`);
    }
    const pdf = Buffer.from(pdfUrl.slice(prefix.length), "base64");
    if (!pdf.subarray(0, 8).equals(Buffer.from("%PDF-1.4"))) throw new Error("no PDF header");
    if (!pdf.subarray(-6).equals(Buffer.from("%%EOF\n"))) throw new Error("no PDF end marker");

    // The offsets in the cross-reference table are what a reader trusts, and
    // they can only be wrong once the real capture decides how big it is.
    const body = pdf.toString("latin1");
    const startxref = Number(/startxref\n(\d+)/.exec(body)![1]);
    if (body.slice(startxref, startxref + 4) !== "xref") {
      throw new Error("startxref does not point at the cross-reference table");
    }
    for (const [index, entry] of [...body.matchAll(/^(\d{10}) 00000 n $/gm)].entries()) {
      const at = Number(entry[1]);
      if (!body.startsWith(`${index + 1} 0 obj\n`, at)) {
        throw new Error(`cross-reference entry ${index + 1} points at the wrong byte`);
      }
    }

    const transparent = each.background === "transparent";
    if (body.includes("/SMask") !== transparent) {
      throw new Error(
        transparent
          ? "a transparent background produced no soft mask"
          : "an opaque background produced a soft mask",
      );
    }

    const out = `${OUT.replace(/\.png$/, "")}-${each.name}.pdf`;
    writeFileSync(out, pdf);
    console.log(`saved ${out} (${Math.round(pdf.length / 1024)} KB)`);
  }
} finally {
  await browser.close();
}
