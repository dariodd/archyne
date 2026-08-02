/**
 * Routing an edge by hand, driven by a real pointer.
 *
 * The arithmetic is unit-tested (`src/routing.test.ts`) and so is the store
 * (`src/edgeRouting.test.ts`). What neither can reach is the gesture: that
 * the handles are on screen at all, that dragging one out of a straight line
 * bends the edge, and — the one worth pinning — that nothing is written to
 * the file until the pointer is released. Writing at 60fps would put one undo
 * entry per frame on the stack, and no unit test notices the difference.
 *
 * Run:  npm run dev, then npx tsx tests/e2e-waypoints.mts
 */
import { chromium, type Page } from "playwright";
import { CHANNEL, codeUrl } from "./env.mts";

const CODE = `flowchart TD
  a["Alpha"] --> b["Beta"]
%% graph:positions {"a":{"x":0,"y":0},"b":{"x":0,"y":300}}
`;

let failed = false;

function check(label: string, ok: boolean, detail: string): void {
  if (ok) {
    console.log(`✓ ${label}`);
  } else {
    failed = true;
    console.error(`✗ ${label} — ${detail}`);
  }
}

interface EdgeState {
  type: string;
  points: Array<{ x: number; y: number }> | null;
  line: string | null;
}

const browser = await chromium.launch({ channel: CHANNEL, headless: true });
const context = await browser.newContext({ viewport: { width: 1500, height: 900 } });
// The inspector is driven by English accessible name below.
await context.addInitScript(() => {
  try {
    localStorage.setItem("graph:locale", "en");
  } catch {
    // Storage unavailable; the default is English anyway.
  }
});
const page: Page = await context.newPage();

const ready = (p: Page) =>
  p.waitForFunction(
    () => (window as unknown as { __graphTest?: { ready(): boolean } }).__graphTest?.ready(),
    undefined,
    { timeout: 30000 },
  );

const edgeState = (p: Page): Promise<EdgeState> =>
  p.evaluate(() => {
    const s = (
      window as unknown as { __graphTest: { store: { getState(): unknown } } }
    ).__graphTest.store.getState() as {
      edges: Array<{ type?: string; data?: { points?: Array<{ x: number; y: number }> } }>;
      code: string;
    };
    const e = s.edges[0];
    return {
      type: e.type ?? "",
      points: e.data?.points ?? null,
      line: s.code.split("\n").find((l) => l.includes("graph:waypoints")) ?? null,
    };
  });

await page.goto(codeUrl(CODE));
await ready(page);
await page.waitForTimeout(300);

const zoom = await page.evaluate(() => {
  const el = document.querySelector(".react-flow__viewport") as HTMLElement;
  return new DOMMatrixReadOnly(getComputedStyle(el).transform).a;
});

const handles = () => page.locator(".edge-handle").count();
const pathOf = () => page.locator(".react-flow__edge-path").first().getAttribute("d");

const straight = await pathOf();
check("an unbent edge has no handles on it", (await handles()) === 0, "handles were drawn");

await page.locator(".react-flow__edge").first().click({ force: true });
await page.waitForTimeout(250);
check(
  "selecting the edge offers one place to put a corner",
  (await handles()) === 1,
  `${await handles()} handles`,
);
check(
  "selecting it does not move the line",
  (await pathOf()) === straight,
  "the path changed when the edge was selected",
);

// Drag the hollow handle sideways: this is how the first corner is made.
const add = page.locator(".edge-handle.add").first();
const box = (await add.boundingBox())!;
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + box.width / 2 + 90 * zoom, box.y + box.height / 2, { steps: 8 });
await page.waitForTimeout(150);

const mid = await edgeState(page);
check("dragging it bends the edge", (mid.points?.length ?? 0) === 1, "no corner appeared");
check(
  "nothing is written to the file until the pointer is released",
  mid.line === null,
  `the comment was already there mid-drag: ${mid.line}`,
);

await page.mouse.up();
await page.waitForTimeout(800);

const after = await edgeState(page);
check(
  "releasing writes the corner into the source",
  /graph:waypoints \{"a>b":\[\[\d+,\d+\]\]\}/.test(after.line ?? ""),
  `comment was ${after.line}`,
);
check(
  "the bent path curves through the corner",
  (await pathOf())?.includes("Q") === true,
  `path was ${await pathOf()}`,
);
check(
  "a bent edge offers three handles: the corner and a place either side",
  (await handles()) === 3,
  `${await handles()} handles`,
);

// Reload from the code the app produced.
const code = await page.evaluate(
  () =>
    (
      window as unknown as { __graphTest: { store: { getState(): { code: string } } } }
    ).__graphTest.store.getState().code,
);
const reloaded = await context.newPage();
await reloaded.goto(codeUrl(code));
await ready(reloaded);
const back = await edgeState(reloaded);
check(
  "the corner survives a round-trip through the file",
  JSON.stringify(back.points) === JSON.stringify(after.points),
  `${JSON.stringify(back.points)} came back, ${JSON.stringify(after.points)} went in`,
);
await reloaded.close();

// The pointer-free path, which is what WCAG 2.5.7 asks for.
await page.getByRole("button", { name: "Add corner" }).click();
await page.waitForTimeout(600);
check(
  "the inspector can add a corner without a drag",
  (await edgeState(page)).points?.length === 2,
  "the corner count did not go up",
);

await page.getByRole("button", { name: "Straighten" }).click();
await page.waitForTimeout(600);
const flat = await edgeState(page);
check("straightening drops every corner", flat.points === null, "corners were left behind");
check(
  "and takes the comment out of the file with them",
  flat.line === null,
  `the comment was left behind: ${flat.line}`,
);

await browser.close();
console.log(failed ? "\nedge routing FAILED" : "\nedges route by hand");
process.exit(failed ? 1 : 0);
