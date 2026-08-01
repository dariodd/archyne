/**
 * Browser-driven accessibility audit.
 *
 * The Vitest suite runs axe under jsdom, which has no layout engine — so the
 * `color-contrast` and `target-size` rules are disabled there and would pass
 * vacuously. This runs the same engine against the real, rendered app in both
 * themes, which is the only place those rules mean anything.
 *
 * Run:  npm run dev, then npx tsx tests/e2e-a11y.mts
 */
import { chromium, type Page } from "playwright";
import { createRequire } from "node:module";
import { CHANNEL, codeUrl } from "./env.mts";

const require = createRequire(import.meta.url);
const AXE_PATH = require.resolve("axe-core/axe.min.js");

const CODE = `flowchart TD
  start(["Start"]) --> check{"Valid?"}
  check -->|yes| work["Process request"]
  check -->|no| err["Show error"]
  work --> db[("Database")]
`;

interface Violation {
  id: string;
  impact: string | null;
  help: string;
  nodes: Array<{ target: string[]; failureSummary?: string }>;
}

/** Run axe over the page and return violations, worst impact first. */
async function audit(page: Page, context?: string): Promise<Violation[]> {
  await page.addScriptTag({ path: AXE_PATH });
  return page.evaluate(async (sel) => {
    const options = { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag22aa"] } };
    // @ts-expect-error axe is injected above, not imported.
    const results = await window.axe.run(sel ?? document, options);
    return results.violations.map((v: Violation) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.slice(0, 4).map((n) => ({
        target: n.target,
        failureSummary: n.failureSummary,
      })),
    }));
  }, context);
}

const browser = await chromium.launch({ channel: CHANNEL, headless: true });
// The app's CSP is `script-src 'self'`, which (correctly) blocks injecting
// axe. Bypassing it here is scoped to this audit context only — the policy
// itself is verified separately by tests/e2e-csp.mts.
const context = await browser.newContext({
  viewport: { width: 1500, height: 900 },
  bypassCSP: true,
});
// Pin the locale: this script drives the UI by English accessible name, and
// the app otherwise remembers the last language or follows the browser's.
await context.addInitScript(() => {
  try {
    localStorage.setItem("graph:locale", "en");
  } catch {
    // Storage unavailable; the default is English anyway.
  }
});
/**
 * Every surface to audit, and the element whose appearance means it is fully
 * open. Waiting on that element rather than on a timer is what lets this run
 * on a cold CI runner: `color-contrast` and `target-size` are measured from
 * real layout, so auditing mid-transition produces noise, not findings.
 */
const SURFACES: Array<{
  label: string;
  /** Toolbar button, by accessible name. */
  open?: string;
  /** Source-panel tab, by accessible name. */
  tab?: string;
  /** Keyboard shortcut that opens the surface. */
  key?: string;
  /** A second button, for surfaces reached through a menu. */
  then?: string;
  /** Must be visible before auditing, and gone again afterwards. */
  appears?: string;
}> = [
  { label: "editor" },
  { label: "outline", tab: "Outline", appears: "#panel-outline" },
  { label: "export dialog", open: "Export…", appears: ".modal" },
  { label: "about dialog", open: "About Archyne and licenses", appears: ".modal" },
  { label: "template gallery", open: "Templates", appears: ".modal" },
  { label: "overflow menu", open: "More", appears: ".menu-popover" },
  { label: "command palette", key: "Control+k", appears: ".modal.command-palette" },
  { label: "shortcuts sheet", key: "Shift+Slash", appears: ".modal" },
  // The document switcher and the two dialogs behind it. Its trigger carries
  // the document's name, so match on the stable part.
  { label: "document menu", open: "Diagram:", appears: ".doc-list" },
  { label: "rename dialog", open: "Diagram:", then: "Rename…", appears: ".modal" },
  { label: "delete confirmation", open: "Diagram:", then: "Delete", appears: ".modal" },
];

/** Long enough for the open/close transition, short enough to stay cheap. */
const TRANSITION_MS = 350;

let failed = false;

for (const theme of ["dark", "light"] as const) {
  const page = await context.newPage();
  await page.goto(codeUrl(CODE));
  await page.waitForFunction(
    () => (window as unknown as { __graphTest?: { ready(): boolean } }).__graphTest?.ready(),
    undefined,
    { timeout: 30000 },
  );

  // Theme now lives in the overflow panel, so it has to be opened first.
  await page.locator(".overflow-menu > button").click();
  await page.locator(".menu-popover").waitFor({ state: "visible", timeout: 15000 });
  await page.locator(".menu-popover select").first().selectOption(theme);
  await page.waitForFunction((t) => document.documentElement.dataset.theme === t, theme, {
    timeout: 15000,
  });
  await page.keyboard.press("Escape");
  await page.locator(".menu-popover").waitFor({ state: "hidden", timeout: 15000 });
  await page.waitForTimeout(TRANSITION_MS);

  for (const { label, open, tab, key, then, appears } of SURFACES) {
    if (tab) await page.getByRole("tab", { name: tab }).click();
    if (key) await page.keyboard.press(key);
    if (open) await page.getByRole("button", { name: open }).click();
    if (then) {
      await page.locator(".menu-popover").waitFor({ state: "visible", timeout: 15000 });
      await page
        .locator(".menu-popover")
        .getByRole("button", { name: then, exact: true })
        .click();
    }
    if (appears) {
      await page.locator(appears).first().waitFor({ state: "visible", timeout: 15000 });
      await page.waitForTimeout(TRANSITION_MS);
    }

    const violations = await audit(page);
    const tag = `${theme} / ${label}`;
    if (violations.length === 0) {
      console.log(`✓ ${tag}`);
    } else {
      failed = true;
      console.error(`✗ ${tag} — ${violations.length} violation(s)`);
      for (const v of violations) {
        console.error(`    [${v.impact}] ${v.id}: ${v.help}`);
        for (const n of v.nodes) {
          console.error(`        ${n.target.join(" ")}`);
          if (n.failureSummary) {
            console.error(
              `          ${n.failureSummary.replace(/\n/g, "\n          ").slice(0, 400)}`,
            );
          }
        }
      }
    }

    if (open || key) {
      await page.keyboard.press("Escape");
      if (appears) {
        await page.locator(appears).first().waitFor({ state: "hidden", timeout: 15000 });
      }
      await page.waitForTimeout(TRANSITION_MS);
    }
  }
  await page.close();
}

await browser.close();
console.log(failed ? "\naccessibility audit FAILED" : "\nno WCAG 2.2 AA violations found");
process.exit(failed ? 1 : 0);
