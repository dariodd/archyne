/**
 * E2E: drive the real app in Edge, run the PNG export pipeline, and save
 * the result for visual inspection.
 *
 * Run:  npx tsx tests/e2e-export.mts [output.png]
 */
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const OUT = process.argv[2] ?? "export-e2e.png";
const CODE = `architecture-beta
  group g1(cloud)[VPC]
  service web(internet)[Web] in g1
  service db(database)[Database] in g1

  web:R -[query]-> L:db
`;

const url = `http://localhost:5173/?code=${encodeURIComponent(CODE)}`;
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on("console", (m) => {
    if (m.type() === "error") console.error("[console]", m.text());
  });
  await page.goto(url);
  await page.waitForFunction(
    () => (window as unknown as { __graphTest?: { ready: () => boolean } }).__graphTest?.ready(),
    undefined,
    { timeout: 30000 },
  );
  await page.waitForTimeout(600); // icons/fonts settle
  const dataUrl = await page.evaluate(() =>
    (window as unknown as { __graphTest: { exportPng: () => Promise<string> } }).__graphTest.exportPng(),
  );
  if (!dataUrl.startsWith("data:image/png;base64,")) {
    throw new Error(`unexpected result: ${dataUrl.slice(0, 120)}`);
  }
  writeFileSync(OUT, Buffer.from(dataUrl.slice(22), "base64"));
  console.log(`saved ${OUT} (${Math.round(dataUrl.length / 1024)} KB b64)`);
} finally {
  await browser.close();
}
