/**
 * E2E: the interface must stay usable — and reversible — in right-to-left.
 *
 * Regression guard for a bug that made the app a one-way trip: the overflow
 * panel was anchored to the physical right edge, but in RTL its trigger sits
 * at the far left of the toolbar, so the panel opened off-screen. The
 * language selector lives inside it, so once you switched to Arabic you could
 * not switch back.
 *
 * Run:  npm run dev, then npx tsx tests/e2e-rtl.mts
 */
import { chromium } from "playwright";
import { BASE, CHANNEL } from "./env.mts";

const browser = await chromium.launch({ channel: CHANNEL, headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
await page.goto(`${BASE}/`);
// The toolbar is the last chrome to settle; wait for it rather than guessing.
await page.locator(".overflow-menu > button").waitFor({ state: "visible", timeout: 30000 });
await page.waitForTimeout(600);

/** Geometry of every floating piece of chrome, relative to the viewport. */
const OFFSCREEN = `(() => {
  var out = [];
  ['.menu-popover', '.toasts', '.context-menu', '.modal'].forEach(function (sel) {
    document.querySelectorAll(sel).forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.width === 0) return;
      out.push({ sel: sel, x: Math.round(r.x), right: Math.round(r.right),
                 off: r.x < 0 || r.right > window.innerWidth });
    });
  });
  return { items: out, dir: document.documentElement.dir,
           overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth };
})()`;

interface Probe {
  items: Array<{ sel: string; x: number; right: number; off: boolean }>;
  dir: string;
  overflowX: boolean;
}

let failed = false;
const fail = (message: string) => {
  console.error(`✗ ${message}`);
  failed = true;
};

/** Idempotent: the trigger toggles, and selecting a locale leaves it open. */
async function openPanel() {
  const isOpen = await page.evaluate(`!!document.querySelector(".menu-popover")`);
  if (!isOpen) {
    await page.locator(".overflow-menu > button").click();
    await page.waitForTimeout(500);
  }
}

async function switchTo(locale: string) {
  await page.locator(".menu-popover select").nth(1).selectOption(locale);
  await page.waitForTimeout(1300);
}

// Into Arabic.
await openPanel();
await switchTo("ar");
await page.waitForTimeout(400);

const dir = await page.evaluate(`document.documentElement.dir`);
if (dir !== "rtl") fail(`expected dir="rtl" after switching to Arabic, got "${dir}"`);
else console.log("✓ document direction flips to rtl");

// The panel must still be reachable — this is the part that regressed.
await openPanel();
const rtl = (await page.evaluate(OFFSCREEN)) as Probe;
const panel = rtl.items.find((i) => i.sel === ".menu-popover");
if (!panel) fail("the overflow panel did not open in RTL");
else if (panel.off)
  fail(`the overflow panel is off-screen in RTL (x=${panel.x}, right=${panel.right})`);
else console.log(`✓ overflow panel stays on-screen in RTL (x=${panel.x}–${panel.right})`);
if (rtl.overflowX) fail("the page scrolls horizontally in RTL");
else console.log("✓ no horizontal overflow in RTL");

// And back out again, which is only possible if the panel is usable.
await switchTo("en");
await page.waitForTimeout(400);
const back = await page.evaluate(
  `document.documentElement.lang + "/" + document.documentElement.dir`,
);
if (back !== "en/ltr") fail(`could not return to English from Arabic (now ${back})`);
else console.log("✓ the language choice is reversible");

await browser.close();
console.log(failed ? "\nRTL check FAILED" : "\nRTL chrome is sound");
process.exit(failed ? 1 : 0);
