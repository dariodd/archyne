/**
 * Which node families can be resized, and which deliberately cannot.
 *
 * The store round-trips are unit-tested (`src/resize.test.ts`); what those
 * cannot see is whether the handles are actually rendered, and whether the
 * box on screen grows when they are dragged. A `max-width` in the stylesheet
 * is enough to make a resize silently do nothing, and nothing outside a
 * browser notices.
 *
 * The negative cases matter as much: a junction is a dot, a start marker is
 * notation, and a sequence participant's geometry belongs to the overlay.
 * Handles on those would be an invitation to break the diagram.
 *
 * Run:  npm run dev, then npx tsx tests/e2e-resize.mts
 */
import { chromium, type Page } from "playwright";
import { CHANNEL, codeUrl } from "./env.mts";

interface Case {
  label: string;
  code: string;
  /** The rendered element to select. */
  target: string;
  resizable: boolean;
}

const CASES: Case[] = [
  {
    label: "flowchart shape",
    code: 'flowchart TD\n  a["Alpha"] --> b["Beta"]\n',
    target: ".shape-node",
    resizable: true,
  },
  {
    label: "state",
    code: "stateDiagram-v2\n  [*] --> Idle\n  Idle --> Working : start\n",
    target: ".state-node",
    resizable: true,
  },
  {
    label: "entity",
    code: "erDiagram\n  CUSTOMER {\n    string name PK\n  }\n  CUSTOMER ||--o{ ORDER : places\n",
    target: ".table-node",
    resizable: true,
  },
  {
    label: "class",
    code: "classDiagram\n  class Animal {\n    +int age\n    +makeSound() void\n  }\n",
    target: ".table-node",
    resizable: true,
  },
  {
    label: "service",
    code: "architecture-beta\n  service web(internet)[Web]\n  service db(database)[Database]\n  web:R --> L:db\n",
    target: ".service-node",
    resizable: true,
  },
  {
    label: "C4 element",
    code: 'C4Context\n  Person(user, "User")\n  System(app, "Application")\n  Rel(user, app, "Uses")\n',
    target: ".c4-node",
    resizable: true,
  },
  {
    label: "state start marker",
    code: "stateDiagram-v2\n  [*] --> Idle\n",
    target: ".pseudo-state",
    resizable: false,
  },
  {
    label: "junction",
    code: "architecture-beta\n  service web(internet)[Web]\n  junction j1\n  web:R --> L:j1\n",
    target: ".junction-node",
    resizable: false,
  },
  {
    label: "sequence participant",
    code: "sequenceDiagram\n  actor U as User\n  participant S as Server\n  U->>S: request\n",
    target: ".react-flow__node-participant",
    resizable: false,
  },
];

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

for (const c of CASES) {
  const page: Page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
  await page.goto(codeUrl(c.code));
  await page.waitForFunction(
    () => (window as unknown as { __graphTest?: { ready(): boolean } }).__graphTest?.ready(),
    undefined,
    { timeout: 30000 },
  );
  await page.waitForTimeout(250);

  const zoom = await page.evaluate(() => {
    const el = document.querySelector(".react-flow__viewport") as HTMLElement;
    return new DOMMatrixReadOnly(getComputedStyle(el).transform).a;
  });

  const node = page.locator(c.target).first();
  if ((await node.count()) === 0) {
    check(c.label, false, `nothing matched ${c.target}`);
    await page.close();
    continue;
  }

  // Forced: several of these sit under a neighbour's box, and the question
  // here is what selecting them offers, not whether they are clickable.
  await node.click({ position: { x: 4, y: 4 }, force: true });
  await page.waitForTimeout(250);

  const handles = await page.locator(".react-flow__resize-control.handle").count();
  const fields = await page.locator(".size-row input[type=number]").count();

  if (!c.resizable) {
    check(
      `${c.label} is not resizable, and says so consistently`,
      handles === 0 && fields === 0,
      `${handles} handles and ${fields} fields were offered`,
    );
    await page.close();
    continue;
  }

  check(
    `${c.label} offers handles and typed fields`,
    handles === 4 && fields === 2,
    `${handles} handles, ${fields} fields`,
  );

  const before = await node.boundingBox();
  const handle = page.locator(".react-flow__resize-control.handle.bottom.right").first();
  const hb = await handle.boundingBox();
  if (hb) {
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.mouse.move(hb.x + hb.width / 2 + 70 * zoom, hb.y + hb.height / 2 + 40 * zoom, {
      steps: 8,
    });
    await page.mouse.up();
    await page.waitForTimeout(600);
  }
  const after = await node.boundingBox();
  check(
    `${c.label} actually grows when dragged`,
    (after?.width ?? 0) > (before?.width ?? 0) && (after?.height ?? 0) > (before?.height ?? 0),
    `${Math.round(before?.width ?? 0)}x${Math.round(before?.height ?? 0)} did not change`,
  );

  const stored = await page.evaluate(() => {
    const s = (
      window as unknown as { __graphTest: { store: { getState(): unknown } } }
    ).__graphTest.store.getState() as {
      nodes: Array<{ selected?: boolean; style?: { width?: number } }>;
      code: string;
    };
    const n = s.nodes.find((x) => x.selected);
    return { width: n?.style?.width, code: s.code };
  });
  check(
    `${c.label} writes its size into the source`,
    typeof stored.width === "number" &&
      new RegExp(`"w":${Math.round(stored.width)}`).test(stored.code),
    `style width was ${stored.width}, comment was ${stored.code.split("\n").find((l) => l.includes("graph:positions"))}`,
  );

  // Shrinking is the direction that broke. Each family declares a `min-width`
  // for how an *unsized* node picks its own width, and that floor used to beat
  // the size chosen by hand: the frame, the handles and the stored size went
  // down to 48 while the drawn box stopped at 90, 140, 170 or 180 and hung out
  // of its own selection. Anything but a perfect fit here is that bug back.
  const shrunk = await page.evaluate(() => {
    const s = (
      window as unknown as { __graphTest: { store: { getState(): unknown } } }
    ).__graphTest.store.getState() as {
      nodes: Array<{ id: string; selected?: boolean }>;
      resizeNode(id: string, width: number, height: number): void;
    };
    const n = s.nodes.find((x) => x.selected);
    if (!n) return null;
    // `NODE_MIN` in src/store.ts — the smallest a handle can drag anything to.
    s.resizeNode(n.id, 48, 28);
    return n.id;
  });
  await page.waitForTimeout(250);
  const overflow = await page.evaluate((id) => {
    const wrap = document.querySelector<HTMLElement>(`.react-flow__node[data-id="${id}"]`);
    const drawn = wrap?.firstElementChild as HTMLElement | null;
    if (!wrap || !drawn) return null;
    return [drawn.offsetWidth - wrap.offsetWidth, drawn.offsetHeight - wrap.offsetHeight];
  }, shrunk);
  check(
    `${c.label} shrinks all the way to the frame it is given`,
    overflow?.[0] === 0 && overflow?.[1] === 0,
    `drawn box overflowed the frame by ${overflow?.join(" × ") ?? "?"} px`,
  );

  // A flowchart shape draws its box as an SVG, so the box was never the thing
  // that overflowed — its label was, wrapping to four lines and standing well
  // clear of the shape it names. Families with no `.shape-label` skip this.
  const spill = await page.evaluate((id) => {
    const wrap = document.querySelector<HTMLElement>(`.react-flow__node[data-id="${id}"]`);
    const label = wrap?.querySelector<HTMLElement>(".shape-label");
    if (!wrap || !label) return null;
    const f = wrap.getBoundingClientRect();
    const l = label.getBoundingClientRect();
    return Math.round(
      Math.max(0, f.top - l.top, l.bottom - f.bottom, f.left - l.left, l.right - f.right),
    );
  }, shrunk);
  if (spill !== null) {
    check(
      `${c.label} keeps its label inside the shape`,
      spill === 0,
      `label stood ${spill}px outside the frame`,
    );
  }

  // And the point of all of it: drag the handle as far as it will go, and
  // everything in the node is still there to read. The floor a handle stops
  // at is this node's own — what its icon, its name and its padding need —
  // so "smallest" can never mean "with the label cut off".
  await page.evaluate(() => {
    const s = (
      window as unknown as { __graphTest: { store: { getState(): unknown } } }
    ).__graphTest.store.getState() as {
      resetNodeSize(id: string): void;
      nodes: Array<{ id: string; selected?: boolean }>;
    };
    const n = s.nodes.find((x) => x.selected);
    if (n) s.resetNodeSize(n.id);
  });
  await page.waitForTimeout(400);
  const floorHandle = page.locator(".react-flow__resize-control.handle.bottom.right").first();
  const fb = await floorHandle.boundingBox();
  if (fb) {
    await page.mouse.move(fb.x + fb.width / 2, fb.y + fb.height / 2);
    await page.mouse.down();
    // Far past any possible floor, so the drag ends wherever the node stops.
    await page.mouse.move(fb.x - 500, fb.y - 500, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(500);
  }
  const clipped = await page.evaluate((id) => {
    const wrap = document.querySelector<HTMLElement>(`.react-flow__node[data-id="${id}"]`);
    const drawn = wrap?.firstElementChild as HTMLElement | null;
    if (!wrap || !drawn) return null;
    const f = drawn.getBoundingClientRect();
    return [...drawn.querySelectorAll<HTMLElement>("*")]
      .filter(
        (el) =>
          !el.closest(".react-flow__handle") && !el.closest(".react-flow__resize-control"),
      )
      .filter((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        return (
          r.left < f.left - 1 ||
          r.right > f.right + 1 ||
          r.top < f.top - 1 ||
          r.bottom > f.bottom + 1
        );
      })
      .map((el) => `${el.tagName.toLowerCase()}.${el.className || "?"}`);
  }, shrunk);
  if (clipped !== null) {
    check(
      `${c.label} is still readable at the smallest the handle allows`,
      clipped.length === 0,
      `cut off: ${clipped.join(", ")}`,
    );
  }

  // Typing a size has to stop in the same place the handle does. Two controls
  // for one property that disagree are two ways to get different diagrams out
  // of the same intention — and the fields are the accessible way in (2.5.7),
  // so a floor they do not honour is a floor keyboard users do not have.
  await page.locator(".size-row input[type=number]").first().fill("10");
  await page.waitForTimeout(400);
  const typed = await page.evaluate(() => {
    const s = (
      window as unknown as { __graphTest: { store: { getState(): unknown } } }
    ).__graphTest.store.getState() as {
      nodes: Array<{ selected?: boolean; style?: { width?: number } }>;
    };
    return s.nodes.find((x) => x.selected)?.style?.width ?? 0;
  });
  check(
    `${c.label} refuses a typed size below that floor too`,
    typed > 10,
    `a typed width of 10 was taken as ${typed}`,
  );

  await page.close();
}

await browser.close();
console.log(failed ? "\nresizing FAILED" : "\nresizing is offered where it means something");
process.exit(failed ? 1 : 0);
