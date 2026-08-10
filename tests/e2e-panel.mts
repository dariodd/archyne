/**
 * The side panel's width and the editor's type size.
 *
 * Both are stores with unit tests (`src/layoutStore.test.ts`,
 * `src/prefs.test.ts`), and both are worthless if the number never reaches
 * the screen: a width the stylesheet overrides, a font size CodeMirror's own
 * theme wins over, a divider whose hit area is behind the panel. None of that
 * is visible outside a browser.
 *
 * Formatting is covered from the other end too (`src/format.test.ts`); what
 * is checked here is that the command reaches the document — through the
 * button and through Shift+Alt+F.
 *
 * The folded `%% graph:…` section is here for a third reason: folding is a
 * view state, and every edit made on the canvas replaces the whole document.
 * Only a browser can say whether the section stays shut when a node moves.
 *
 * Run:  npm run dev, then npx tsx tests/e2e-panel.mts
 */
import { chromium } from "playwright";
import { CHANNEL, codeUrl } from "./env.mts";

const MESSY = `flowchart TD
subgraph edge [Edge]
a[Start] --> b[Work]
end
b --> c[Done]`;

const TIDY = `flowchart TD
  subgraph edge [Edge]
    a[Start] --> b[Work]
  end
  b --> c[Done]`;

let failed = false;

function check(label: string, ok: boolean, detail: string): void {
  if (ok) {
    console.log(`✓ ${label}`);
  } else {
    failed = true;
    console.error(`✗ ${label} — ${detail}`);
  }
}

const browser = await chromium.launch({ channel: CHANNEL, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(codeUrl(MESSY));
await page.waitForSelector(".side-resizer");
await page.waitForTimeout(1200);

const sideWidth = async () => (await page.locator(".side").boundingBox())?.width ?? 0;
const fontSize = () =>
  page.locator(".cm-editor").evaluate((el) => getComputedStyle(el).fontSize);
const source = () => page.locator(".cm-content").innerText();

/* ---------- the divider ---------- */

const initial = await sideWidth();
check("the panel starts at the width the stylesheet gives it", initial === 380, `${initial}px`);

const handle = (await page.locator(".side-resizer").boundingBox())!;
await page.mouse.move(handle.x + handle.width / 2, handle.y + 300);
await page.mouse.down();
await page.mouse.move(handle.x + handle.width / 2 - 160, handle.y + 300, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(200);
const dragged = await sideWidth();
check("dragging the divider widens the panel", dragged === initial + 160, `${dragged}px`);

await page.reload();
await page.waitForSelector(".side-resizer");
await page.waitForTimeout(1000);
check("the width survives a reload", (await sideWidth()) === dragged, `${await sideWidth()}px`);

// Narrow enough that the chosen width no longer fits beside a usable canvas,
// but still above the breakpoint where the panels become drawers.
await page.setViewportSize({ width: 1000, height: 900 });
await page.waitForTimeout(300);
const squeezed = await sideWidth();
check("a narrow window takes the space back", squeezed === 480, `${squeezed}px`);

await page.setViewportSize({ width: 1440, height: 900 });
await page.waitForTimeout(300);
check(
  "and the chosen width returns with the space",
  (await sideWidth()) === dragged,
  `${await sideWidth()}px, expected ${dragged}px`,
);

await page.locator(".side-resizer").focus();
await page.keyboard.press("ArrowLeft");
await page.keyboard.press("ArrowLeft");
const nudged = await sideWidth();
check("arrow keys move the divider", nudged === dragged + 32, `${nudged}px`);

await page.keyboard.press("Home");
await page.waitForTimeout(200);
check(
  "Home hands the width back to the stylesheet",
  (await sideWidth()) === 380,
  `${await sideWidth()}px`,
);

/* ---------- type size ---------- */

check(
  "the editor starts at its default size",
  (await fontSize()) === "12.5px",
  await fontSize(),
);

await page.getByRole("button", { name: "Larger text" }).click();
await page.getByRole("button", { name: "Larger text" }).click();
check("A+ grows the text", (await fontSize()) === "14.5px", await fontSize());

await page.locator(".cm-content").click();
await page.keyboard.press("Control+=");
check("Ctrl+= grows it from the keyboard", (await fontSize()) === "15.5px", await fontSize());

await page.keyboard.press("Control+0");
check("Ctrl+0 puts it back", (await fontSize()) === "12.5px", await fontSize());

/* ---------- formatting ---------- */

check(
  "the document arrives unformatted",
  (await source()) === MESSY,
  JSON.stringify(await source()),
);

await page.getByRole("button", { name: "Format", exact: true }).click();
await page.waitForTimeout(200);
check(
  "the Format button indents it",
  (await source()) === TIDY,
  JSON.stringify(await source()),
);

await page.goto(codeUrl(MESSY));
await page.waitForSelector(".cm-content");
await page.waitForTimeout(1200);
await page.locator(".cm-content").click();
await page.keyboard.press("Shift+Alt+F");
await page.waitForTimeout(200);
check("so does Shift+Alt+F", (await source()) === TIDY, JSON.stringify(await source()));

/* ---------- the metadata section ---------- */

// A diagram carrying the comments the app writes for itself.
const WITH_META = `flowchart TD
  a[Start] --> b[Done]
%% graph:positions {"a":{"x":0,"y":0},"b":{"x":0,"y":120}}
%% graph:styles {"a":{"fill":"#123456"}}
`;

await page.goto(codeUrl(WITH_META));
await page.waitForSelector(".cm-content");
await page.waitForTimeout(1500);

const placeholder = page.locator(".cm-metaFold");
check(
  "the metadata folds into one line that says what it is",
  (await placeholder.count()) === 1 &&
    (await placeholder.innerText()) === "%% graph: positions, styles …",
  `${await placeholder.count()} placeholders: ${await placeholder.innerText().catch(() => "—")}`,
);
check(
  "and the editor no longer shows the raw comments",
  !(await source()).includes("graph:positions {"),
  JSON.stringify(await source()),
);

const stored = await page.evaluate(
  () =>
    (
      window as unknown as { __graphTest: { store: { getState(): { code: string } } } }
    ).__graphTest.store.getState().code,
);
check(
  "folded is not deleted — the document still carries them",
  stored.includes("%% graph:positions") && stored.includes("%% graph:styles"),
  JSON.stringify(stored),
);

// Dragging rewrites `graph:positions`, which replaces the document.
const node = page.locator(".shape-node").first();
const nodeBox = (await node.boundingBox())!;
await page.mouse.move(nodeBox.x + nodeBox.width / 2, nodeBox.y + nodeBox.height / 2);
await page.mouse.down();
await page.mouse.move(nodeBox.x + nodeBox.width / 2 + 80, nodeBox.y + nodeBox.height / 2 + 40, {
  steps: 10,
});
await page.mouse.up();
await page.waitForTimeout(1000);
check(
  "moving a node does not make it spring open",
  (await placeholder.count()) === 1,
  `${await placeholder.count()} placeholders after the drag`,
);

await placeholder.first().click();
await page.waitForTimeout(200);
check(
  "clicking it shows the real lines",
  (await source()).includes("%% graph:positions {") && (await placeholder.count()) === 0,
  JSON.stringify(await source()),
);

await page.reload();
await page.waitForSelector(".cm-content");
await page.waitForTimeout(1500);
check(
  "and having opened it once, it opens that way again",
  (await placeholder.count()) === 0,
  `${await placeholder.count()} placeholders after the reload`,
);

await browser.close();
console.log(failed ? "\npanel FAILED" : "\nthe panel resizes and the editor obeys");
process.exit(failed ? 1 : 0);
