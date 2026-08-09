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
  "selecting a straight edge offers the bar for its single run",
  (await handles()) === 1 && (await page.locator(".edge-handle.run").count()) === 1,
  `${await handles()} handles`,
);
check(
  "selecting it does not move the line",
  (await pathOf()) === straight,
  "the path changed when the edge was selected",
);

// Pull the run sideways: this is how the first corner is made. There is no
// dot to pull a point out of any more — on an orthogonal connector the
// gesture is moving a run, as it is in draw.io and Visio.
const bar = page.locator(".edge-handle.run").first();
const box = (await bar.boundingBox())!;
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + box.width / 2 + 90 * zoom, box.y + box.height / 2, { steps: 8 });
await page.waitForTimeout(150);

const mid = await edgeState(page);
check("dragging the run bends the edge", (mid.points?.length ?? 0) >= 1, "no corner appeared");
check(
  "nothing is written to the file until the pointer is released",
  mid.line === null,
  `the comment was already there mid-drag: ${mid.line}`,
);

await page.mouse.up();
await page.waitForTimeout(800);

const after = await edgeState(page);
check(
  "releasing writes the corners into the source",
  // Holding a run where it was put takes a corner at each of its ends —
  // one alone would leave the router free to move it back.
  /graph:waypoints \{"a>b":\[(\[\d+,\d+\],?){2}\]\}/.test(after.line ?? ""),
  `comment was ${after.line}`,
);
check(
  "the bent path curves through the corner",
  (await pathOf())?.includes("Q") === true,
  `path was ${await pathOf()}`,
);
// One dot per corner the user placed, one bar per run of the squared path.
// It used to be the corner plus a dot either side of it; the runs replaced
// those when the route became orthogonal, because on such a path the useful
// gesture is sliding a run rather than pulling a new point out of a midpoint.
const corners = await page.locator(".edge-handle.corner").count();
const bars = await page.locator(".edge-handle.run").count();
check(
  "a bent edge offers a dot for every corner and a bar for every run",
  corners === 2 && bars >= 2 && corners + bars === (await handles()),
  `${corners} corner(s), ${bars} run bar(s), ${await handles()} handles in all`,
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

// The paths that do not involve dragging. The corner list in the side panel
// used to be this; the context menu replaced it, on the grounds that pointing
// at the place you mean beats typing its coordinates.
/** A point genuinely on the stroke; the bounding box's corners are not. */
const onLine = (fraction: number) =>
  page.evaluate((f) => {
    const path = document.querySelector(".edge-grab") as SVGPathElement;
    const at = path.getPointAtLength(path.getTotalLength() * f);
    const m = path.getScreenCTM()!;
    return { x: at.x * m.a + at.y * m.c + m.e, y: at.x * m.b + at.y * m.d + m.f };
  }, fraction);

// Right-clicking the corner itself offers to take that one away. The dots
// are only drawn on a selected edge, so select it first.
const anywhere = await onLine(0.3);
await page.mouse.click(anywhere.x, anywhere.y);
await page.waitForTimeout(400);
const dot = (await page.locator(".edge-handle.corner").first().boundingBox())!;
await page.mouse.click(dot.x + dot.width / 2, dot.y + dot.height / 2, { button: "right" });
await page.waitForTimeout(400);
await page.getByRole("menuitem", { name: /remove this corner/i }).click();
await page.waitForTimeout(600);
check(
  "the menu removes the corner it was opened on",
  (await edgeState(page)).points?.length === 1,
  "the corner is still there",
);

// Right-clicking anywhere else on the line offers to put one there.
const spot = await onLine(0.5);
await page.mouse.click(spot.x, spot.y, { button: "right" });
await page.waitForTimeout(400);
await page.getByRole("menuitem", { name: /add a corner here/i }).click();
await page.waitForTimeout(600);
check(
  "and adds one where the line was pointed at, without a drag",
  (await edgeState(page)).points?.length === 2,
  "no corner appeared",
);

// And without a pointer at all: the corner takes focus and the arrow keys
// move it. This is the WCAG 2.5.7 path — everything a drag does here has to
// be possible without dragging.
await page.evaluate(`document.querySelector('[role="button"][aria-label^="Corner"]').focus()`);
const wasAt = (await edgeState(page)).points?.[0];
await page.keyboard.press("ArrowRight");
await page.waitForTimeout(300);
await page.keyboard.press("Shift+ArrowDown");
await page.waitForTimeout(300);
const nowAt = (await edgeState(page)).points?.[0];
check(
  "the arrow keys move a corner, a unit at a time and a cell with Shift",
  !!wasAt && !!nowAt && nowAt.x === wasAt.x + 1 && nowAt.y === wasAt.y + 12,
  `${JSON.stringify(wasAt)} became ${JSON.stringify(nowAt)}`,
);

// Near the start of the line, clear of the corners now on it: the menu
// offers to straighten whatever it is opened on.
const middle = await onLine(0.12);
await page.mouse.click(middle.x, middle.y, { button: "right" });
await page.waitForTimeout(400);
await page.getByRole("menuitem", { name: /straighten the line/i }).click();
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
