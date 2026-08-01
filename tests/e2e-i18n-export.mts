/**
 * E2E: check that non-Latin labels survive both export pipelines.
 *
 * Exports rasterize an SVG through a data URL, which is a separate document
 * with no access to the page's stylesheets. If a glyph's font is not resolved
 * in that context the text silently disappears — the export succeeds and the
 * labels are simply gone. This drives the real app and measures ink, so a
 * regression shows up as a number rather than a subjective look at a picture.
 *
 * Run:  npm run dev, then npx tsx tests/e2e-i18n-export.mts [outdir]
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CHANNEL, codeUrl } from "./env.mts";

const OUT = process.argv[2] ?? "e2e-out";
mkdirSync(OUT, { recursive: true });

/** Same shape every time; only the label script changes. */
const diagram = (a: string, b: string) => `flowchart TD\n  x["${a}"] --> y["${b}"]\n`;

const CASES = {
  latin: diagram("Order service", "Payment"),
  japanese: diagram("注文サービス", "支払い"),
  arabic: diagram("خدمة الطلبات", "الدفع"),
  cyrillic: diagram("Служба заказов", "Оплата"),
  korean: diagram("주문 서비스", "결제"),
  blank: diagram(" ", " "),
};

const browser = await chromium.launch({ channel: CHANNEL, headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });

/** Count pixels that are not the dark export background. */
async function ink(dataUrl: string): Promise<number> {
  return page.evaluate(async (url) => {
    const img = new Image();
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = rej;
      img.src = url;
    });
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, c.width, c.height);
    let n = 0;
    for (let i = 0; i < data.length; i += 4) {
      // Background is #12141a; count anything meaningfully lighter.
      if (data[i] + data[i + 1] + data[i + 2] > 140) n++;
    }
    return n;
  }, dataUrl);
}

const results: Record<string, { canvas: number; mermaid: number }> = {};

for (const [name, code] of Object.entries(CASES)) {
  await page.goto(codeUrl(code));
  await page.waitForFunction(
    () => (window as unknown as { __graphTest?: { ready(): boolean } }).__graphTest?.ready(),
    undefined,
    { timeout: 20000 },
  );
  await page.waitForTimeout(500);

  const shots: Record<string, number> = {};
  for (const source of ["canvas", "mermaid"] as const) {
    const dataUrl = await page.evaluate(
      (src) =>
        (
          window as unknown as {
            __graphTest: { exportWith(o: unknown): Promise<string> };
          }
        ).__graphTest.exportWith({ source: src, format: "png", background: "dark" }),
      source,
    );
    shots[source] = await ink(dataUrl);
    const b64 = dataUrl.split(",")[1];
    writeFileSync(join(OUT, `${name}-${source}.png`), Buffer.from(b64, "base64"));
  }
  results[name] = { canvas: shots.canvas, mermaid: shots.mermaid };
  console.log(`${name.padEnd(10)} canvas=${shots.canvas} mermaid=${shots.mermaid}`);
}

await browser.close();

// The shape is identical across cases, so a script whose glyphs were dropped
// lands near the blank baseline instead of near the Latin one.
const blank = results.blank;
let failed = false;
for (const [name, r] of Object.entries(results)) {
  if (name === "blank") continue;
  for (const source of ["canvas", "mermaid"] as const) {
    const margin = r[source] - blank[source];
    if (margin < blank[source] * 0.05) {
      console.error(
        `FAIL ${name}/${source}: only ${margin} px more ink than an empty label — glyphs are being dropped.`,
      );
      failed = true;
    }
  }
}
console.log(
  failed ? "\nnon-Latin export FAILED" : "\nnon-Latin labels render in both pipelines",
);
process.exit(failed ? 1 : 0);
