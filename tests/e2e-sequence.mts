/**
 * Reordering sequence messages with the pointer.
 *
 * The arithmetic has unit tests (`src/seqLayout.test.ts`, `src/store.test.ts`);
 * this covers the part they cannot reach — that a press on the arrow actually
 * starts a drag, that the block frame lights up while the message is over it,
 * and that dropping between a block and its `end` is what writes the message
 * inside the loop.
 *
 * The click case is the one worth pinning. The whole arrow is a drag handle,
 * so a press that never moves has to fall through to React Flow and select the
 * edge; a threshold that fires too eagerly would take selection away from
 * every message in the diagram, which no test of the maths would notice.
 *
 * Run:  npm run dev, then npx tsx tests/e2e-sequence.mts
 */
import { chromium, type Page } from "playwright";
import { CHANNEL, codeUrl } from "./env.mts";

/** Rows 0..4: `first`, `loop`, `inner`, `end`, `last`. */
const CODE = `sequenceDiagram
  participant a
  participant b
  a->>b: first
  loop retry
    a->>b: inner
  end
  a->>b: last
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

const state = () =>
  page.evaluate(() => {
    const s = (
      window as unknown as { __graphTest: { store: { getState(): Record<string, never> } } }
    ).__graphTest.store.getState() as unknown as {
      edges: Array<{ id: string; data?: { label?: string }; selected?: boolean }>;
      code: string;
    };
    return {
      code: s.code,
      selected: s.edges.filter((e) => e.selected).map((e) => e.data?.label ?? ""),
      /** Grab strips in document order, which is the order of the edges. */
      rows: [...document.querySelectorAll(".seq-grab")].map((p) => {
        const r = p.getBoundingClientRect();
        return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
      }),
      dropping: document.querySelectorAll(".seq-block.dropping").length,
      dropRow: document.querySelectorAll(".seq-drop-row").length,
    };
  });

async function reload(): Promise<void> {
  await page.goto(codeUrl(CODE));
  await page.waitForFunction(
    () => (window as unknown as { __graphTest?: { ready(): boolean } }).__graphTest?.ready(),
    undefined,
    { timeout: 30000 },
  );
  await page.waitForSelector(".seq-block");
}

await reload();

/* ---------- a press that never moves still selects ---------- */

const start = await state();
check(
  "every message gets a grab strip",
  start.rows.length === 3,
  `${start.rows.length} strips`,
);

await page.mouse.click(start.rows[0].x, start.rows[0].y);
const clicked = await state();
check(
  "clicking an arrow selects it instead of reordering",
  clicked.selected.length === 1 && clicked.code === start.code,
  `selected ${JSON.stringify(clicked.selected)}, code changed: ${clicked.code !== start.code}`,
);

/* ---------- dragging into a block ---------- */

await reload();
const before = await state();
const [, inner, last] = before.rows;

await page.mouse.move(last.x, last.y);
await page.mouse.down();
await page.mouse.move(last.x, last.y - 20, { steps: 4 });
await page.mouse.move(inner.x, inner.y, { steps: 6 });

const held = await state();
check(
  "the block frame marks itself as the drop target",
  held.dropping === 1,
  `${held.dropping} lit`,
);
check("the landing row is drawn", held.dropRow === 1, `${held.dropRow} drawn`);
check("nothing is written until the drop", held.code === before.code, "code changed mid-drag");

await page.mouse.up();
const dropped = await state();
check(
  "the dropped message is written inside the loop",
  dropped.code.includes("  loop retry\n    a->>b: last\n    a->>b: inner\n  end\n"),
  `got:\n${dropped.code}`,
);
check(
  "the drop feedback goes away",
  dropped.dropping === 0 && dropped.dropRow === 0,
  `${dropped.dropping} lit, ${dropped.dropRow} rows`,
);

/* ---------- dragging back out ---------- */

// Only ever aim at where another row actually is: the lane is drawn in flow
// coordinates, so a distance in screen pixels means a different number of
// rows at every zoom, and the canvas fits itself to the window on load.
await reload();
const out = await state();
// Drag the message inside the loop down onto the row `last` occupies, which
// is below the `end` — the loop should come out empty.
await page.mouse.move(out.rows[1].x, out.rows[1].y);
await page.mouse.down();
await page.mouse.move(out.rows[1].x, out.rows[1].y + 20, { steps: 4 });
await page.mouse.move(out.rows[2].x, out.rows[2].y, { steps: 6 });
await page.mouse.up();
const outside = await state();
check(
  "dragging past the end takes the message out of the loop",
  outside.code.includes("  loop retry\n  end\n  a->>b: last\n  a->>b: inner\n"),
  `got:\n${outside.code}`,
);

/* ---------- Escape abandons the gesture ---------- */

await reload();
const cancel = await state();
await page.mouse.move(cancel.rows[2].x, cancel.rows[2].y);
await page.mouse.down();
await page.mouse.move(cancel.rows[1].x, cancel.rows[1].y, { steps: 6 });
const midCancel = await state();
check("the gesture was under way before Escape", midCancel.dropRow === 1, "no drag started");
await page.keyboard.press("Escape");
await page.mouse.up();
const cancelled = await state();
check(
  "Escape leaves the order alone",
  cancelled.code === cancel.code && cancelled.dropRow === 0,
  `code changed: ${cancelled.code !== cancel.code}, ${cancelled.dropRow} rows drawn`,
);

await browser.close();
process.exit(failed ? 1 : 0);
