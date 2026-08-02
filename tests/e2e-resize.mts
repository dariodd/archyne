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

  await page.close();
}

await browser.close();
console.log(failed ? "\nresizing FAILED" : "\nresizing is offered where it means something");
process.exit(failed ? 1 : 0);
