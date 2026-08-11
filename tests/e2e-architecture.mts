/**
 * Architecture diagrams lay out along the sides their edges name.
 *
 * `architecture-beta` has no direction statement. What it has is a side on
 * every end of every edge — `web:R --> L:db` says web's right face meets db's
 * left face, which is to say db stands to the right of web. Laid out downwards
 * regardless, that arrow has to leave rightwards, drop past its target and
 * come back into the left face, passing behind the very node it points at:
 * the starter diagram opened with its one arrow apparently detached, the line
 * ending against one side of the box and the arrowhead sitting outside the
 * group on the other.
 *
 * `statedDirection` has unit tests for the decision; this is the part they
 * cannot see — that the decision reaches ELK, and that what comes back is two
 * boxes side by side with a short arrow between them.
 *
 * Run:  npm run dev, then npx tsx tests/e2e-architecture.mts
 */
import { chromium, type Page } from "playwright";
import { CHANNEL, codeUrl } from "./env.mts";

/** What the New… menu makes: the file in `STARTERS.architecture`. */
const STARTER =
  "architecture-beta\n  group vpc(cloud)[VPC]\n  service web(internet)[Web] in vpc\n  service db(database)[Database] in vpc\n\n  web:R --> L:db\n";

/** The webapp template: a left-to-right chain with one service hanging below. */
const WEBAPP = `architecture-beta
  group cloud(cloud)[Cloud]
  group data(database)[Data] in cloud

  service users(internet)[Users]
  service cdn(server)[CDN] in cloud
  service api(server)[API] in cloud
  service db(database)[Postgres] in data
  service cache(disk)[Redis] in data

  users:R --> L:cdn
  cdn:R --> L:api
  api:R --> L:db
  api:B --> T:cache
`;

/** Sides that say "stacked", to check the other axis is read too. */
const STACK = `architecture-beta
  service a(server)[Top]
  service b(server)[Middle]
  service c(server)[Bottom]

  a:B --> T:b
  b:B --> T:c
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
const page: Page = await browser.newPage({ viewport: { width: 1300, height: 850 } });

/** Rendered boxes on screen, by node id, plus every edge path's extent. */
async function render(code: string) {
  await page.goto(codeUrl(code));
  await page.waitForFunction(
    () => (window as unknown as { __graphTest?: { ready(): boolean } }).__graphTest?.ready(),
    undefined,
    { timeout: 30000 },
  );
  // Attached, not visible: a horizontal arrow is a path of zero height, which
  // Playwright reports as hidden — and a horizontal arrow is the thing here.
  await page.waitForSelector(".react-flow__edge-path", { state: "attached" });
  // Layout is asynchronous — ELK runs in a worker and the boxes move once.
  await page.waitForTimeout(1200);
  return page.evaluate(() => {
    const boxes: Record<string, { l: number; t: number; r: number; b: number }> = {};
    for (const el of document.querySelectorAll<HTMLElement>(".react-flow__node[data-id]")) {
      const r = el.getBoundingClientRect();
      boxes[el.dataset.id ?? ""] = { l: r.left, t: r.top, r: r.right, b: r.bottom };
    }
    const paths = [...document.querySelectorAll<SVGPathElement>(".react-flow__edge-path")].map(
      (p) => {
        const r = p.getBoundingClientRect();
        return { l: r.left, t: r.top, r: r.right, b: r.bottom };
      },
    );
    return { boxes, paths };
  });
}

/* ---------- the starter, which is what the report was about ---------- */

const starter = await render(STARTER);
const web = starter.boxes.web;
const db = starter.boxes.db;

check(
  "the starter puts db to the right of web, as its sides say",
  Boolean(web && db) && db.l >= web.r - 1,
  `web ended at x=${Math.round(web?.r ?? 0)}, db began at x=${Math.round(db?.l ?? 0)}`,
);
check(
  "and level with it, rather than stacked",
  Boolean(web && db) && db.t < web.b && web.t < db.b,
  `web spans y ${Math.round(web?.t ?? 0)}–${Math.round(web?.b ?? 0)}, db ${Math.round(db?.t ?? 0)}–${Math.round(db?.b ?? 0)}`,
);

// A loop-around is visible without knowing anything about routing: the arrow
// leaves the gap between the two boxes it joins.
const arrow = starter.paths[0];
const gapLeft = Math.min(web?.r ?? 0, db?.r ?? 0);
const gapRight = Math.max(web?.l ?? 0, db?.l ?? 0);
check(
  "its arrow stays in the gap between the two, instead of going around",
  Boolean(arrow) && arrow.l >= gapLeft - 2 && arrow.r <= gapRight + 2,
  `the path spans x ${Math.round(arrow?.l ?? 0)}–${Math.round(arrow?.r ?? 0)}, the gap is ${Math.round(gapLeft)}–${Math.round(gapRight)}`,
);

/* ---------- the other axis, and a file that mixes them ---------- */

const stack = await render(STACK);
check(
  "a file whose sides say stacked is stacked",
  stack.boxes.b.t >= stack.boxes.a.b - 1 && stack.boxes.c.t >= stack.boxes.b.b - 1,
  `tops came out at ${["a", "b", "c"].map((id) => Math.round(stack.boxes[id].t)).join(", ")}`,
);

const webapp = await render(WEBAPP);
const chain = ["users", "cdn", "api", "db"].map((id) => webapp.boxes[id]);
check(
  "the webapp template reads left to right along its chain",
  chain.every((box, i) => i === 0 || box.l >= chain[i - 1].r - 1),
  `lefts came out at ${chain.map((b) => Math.round(b?.l ?? 0)).join(", ")}`,
);
check(
  "the service hanging below the chain sits below it",
  webapp.boxes.cache.t >= webapp.boxes.api.b - 1,
  `api ends at y=${Math.round(webapp.boxes.api?.b ?? 0)}, cache begins at y=${Math.round(webapp.boxes.cache?.t ?? 0)}`,
);

const services = ["users", "cdn", "api", "db", "cache"].map((id) => webapp.boxes[id]);
let overlaps = 0;
for (let i = 0; i < services.length; i++) {
  for (let j = i + 1; j < services.length; j++) {
    const a = services[i];
    const c = services[j];
    if (a.l < c.r && c.l < a.r && a.t < c.b && c.t < a.b) overlaps++;
  }
}
check(
  "and no two of its services land on top of each other",
  overlaps === 0,
  `${overlaps} pairs`,
);

await browser.close();
console.log(failed ? "\narchitecture layout FAILED" : "\narchitecture reads its own sides");
process.exit(failed ? 1 : 0);
