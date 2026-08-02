/**
 * Alignment guides and snapping, driven by a real pointer.
 *
 * The arithmetic has unit tests (`src/guides.test.ts`); this covers the part
 * they cannot reach — that the lines actually appear, that the snapped
 * position survives the drop, and that the guides go away afterwards.
 *
 * The drop is the one worth pinning. React Flow ends a drag from its own
 * record of where the pointer went, which knows nothing about the snap, so
 * without the handler that re-applies it the node visibly lands on the guide
 * and then jumps back off it. That is invisible to any test of the maths.
 *
 * Run:  npm run dev, then npx tsx tests/e2e-drag.mts
 */
import { chromium, type Page } from "playwright";
import { CHANNEL, codeUrl } from "./env.mts";

/**
 * Alpha sits at x = 100, which is deliberately *not* on the 12px grid: a
 * grid-snapped drag can reach 96 or 108 but never 100, so landing exactly on
 * 100 can only be the guide's doing.
 */
const CODE = `flowchart TD
  a["Alpha"]
  b["Beta"]
  c["Gamma"]
%% graph:positions {"a":{"x":100,"y":0},"b":{"x":400,"y":0},"c":{"x":0,"y":250}}
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

const browser = await chromium.launch({ channel: CHANNEL, headless: true });
const page: Page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
await page.goto(codeUrl(CODE));
await page.waitForFunction(
  () => (window as unknown as { __graphTest?: { ready(): boolean } }).__graphTest?.ready(),
  undefined,
  { timeout: 30000 },
);

const state = () =>
  page.evaluate(() => {
    const s = (
      window as unknown as { __graphTest: { store: { getState(): Record<string, never> } } }
    ).__graphTest.store.getState() as unknown as {
      nodes: Array<{ id: string; position: { x: number; y: number } }>;
      code: string;
    };
    return {
      positions: Object.fromEntries(
        s.nodes.map((n) => [
          n.id,
          { x: Math.round(n.position.x), y: Math.round(n.position.y) },
        ]),
      ),
      code: s.code,
    };
  });

const guideCount = () => page.locator(".guide-line").count();

const zoom = await page.evaluate(() => {
  const el = document.querySelector(".react-flow__viewport") as HTMLElement;
  return new DOMMatrixReadOnly(getComputedStyle(el).transform).a;
});

check("no guides before a drag", (await guideCount()) === 0, "a guide was already on screen");

// Drag Gamma from x = 0 to just short of Alpha's left edge.
const gamma = page.locator(".react-flow__node").filter({ hasText: "Gamma" });
const box = (await gamma.boundingBox())!;
const startX = box.x + box.width / 2;
const startY = box.y + box.height / 2;
await page.mouse.move(startX, startY);
await page.mouse.down();
await page.mouse.move(startX + 70 * zoom, startY, { steps: 6 });
await page.mouse.move(startX + 104 * zoom, startY, { steps: 6 });
await page.waitForTimeout(150);
const midGuides = await guideCount();
const mid = await state();
check("a guide appears when the edges nearly line up", midGuides > 0, "no guide was drawn");
check(
  "the node snaps to the guide while dragging",
  mid.positions.c.x === 100,
  `x was ${mid.positions.c.x}, expected 100`,
);

await page.mouse.up();
await page.waitForTimeout(700);

const after = await state();
check(
  "the snapped position survives the drop",
  after.positions.c.x === 100,
  `x was ${after.positions.c.x} after release, expected 100`,
);
check("the guides go away on release", (await guideCount()) === 0, "a guide was left behind");
check(
  "the position reaches the Mermaid source",
  /"c":\{"x":100,/.test(after.code),
  `positions comment was ${after.code.split("\n").find((l) => l.includes("graph:positions"))}`,
);

// Dragging clear of everything must not invent an alignment. Diagonally:
// straight down would keep the left edges lined up, and the guide would be
// right to stay.
await page.mouse.move(startX + 104 * zoom, startY);
await page.mouse.down();
await page.mouse.move(startX + 140 * zoom, startY + 264 * zoom, { steps: 8 });
await page.waitForTimeout(150);
check(
  "no guide where nothing lines up",
  (await guideCount()) === 0,
  "a guide was drawn for an unaligned position",
);
await page.mouse.up();
await page.waitForTimeout(700);

/*
 * The counter-control for the fix this suite forced.
 *
 * Dragging rewrites the source, which pushes text into the editor, which used
 * to come back as if it had been typed — re-parsing 400ms later and undoing
 * the drag in flight. The editor now ignores its own catch-up edits, and the
 * risk in a change like that is silencing real typing along with them. So:
 * type, and the canvas must follow.
 */
await page.locator(".cm-content").click();
await page.keyboard.press("Control+End");
await page.keyboard.type('\n  d["Delta"]');
await page.waitForTimeout(1200);
const typed = await page.evaluate(() => {
  const s = (
    window as unknown as {
      __graphTest: { state(): { nodes: number; parseError: string | null } };
    }
  ).__graphTest.state();
  return { nodes: s.nodes, parseError: s.parseError };
});
check(
  "typing in the editor still reaches the canvas",
  typed.nodes === 4 && !typed.parseError,
  `${typed.nodes} nodes, parseError ${typed.parseError}`,
);

await browser.close();
console.log(failed ? "\ndrag guides FAILED" : "\nalignment guides behave");
process.exit(failed ? 1 : 0);
