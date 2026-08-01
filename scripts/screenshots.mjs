/**
 * Regenerate the README screenshots from the real app.
 *
 * Hand-taken screenshots go stale the moment the toolbar moves, and nobody
 * notices until a reader points at a control that no longer exists. These are
 * scripted so refreshing them is one command, and so the theme, viewport and
 * diagram are pinned rather than being whatever was on screen that day.
 *
 * Run:  npm run build && npm start -- --port 4399 --no-open
 *       node scripts/screenshots.mjs
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.ARCHYNE_URL ?? "http://localhost:4399";
const CHANNEL = process.env.PLAYWRIGHT_CHANNEL ?? undefined;
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(root, "docs", "images");
mkdirSync(OUT, { recursive: true });

/** Wide enough for the three-panel layout, 2× so the image stays crisp. */
const VIEWPORT = { width: 1600, height: 940 };

const SHOTS = [
  {
    name: "editor-architecture-dark",
    theme: "dark",
    code: `architecture-beta
  service cdn(logos:cloudflare-icon)[CDN]
  group vpc(cloud)[Production VPC]
  service lb(logos:aws-elb)[Load balancer] in vpc
  service web(logos:nodejs-icon)[Web tier] in vpc
  service api(logos:nodejs-icon)[API tier] in vpc
  service worker(logos:python)[Workers] in vpc
  service queue(logos:aws-sqs)[Queue] in vpc
  service cache(logos:redis)[Redis] in vpc
  service db(logos:postgresql)[Postgres] in vpc

  cdn:R --> L:lb
  lb:R --> L:web
  lb:R --> L:api
  web:R --> L:cache
  api:R --> L:queue
  api:R --> L:db
  queue:R --> L:worker
  worker:R --> L:db
`,
  },
  {
    name: "editor-flowchart-light",
    theme: "light",
    code: `flowchart TD
  start(["Pull request opened"]) --> lint["Lint, typecheck, unit tests"]
  lint --> e2e["Browser end-to-end suite"]
  e2e --> gate{"All green?"}
  gate -->|yes| review["Human review"]
  gate -->|no| fix["Push a fix"]
  fix --> lint
  review --> merge[["Merge to main"]]
  merge --> release[("Tagged release")]

  classDef pass fill:#dcfce7,stroke:#16a34a,color:#14532d
  classDef fail fill:#fee2e2,stroke:#dc2626,color:#7f1d1d
  class merge,release pass
  class fix fail
`,
  },
  {
    name: "editor-sequence-dark",
    theme: "dark",
    code: `sequenceDiagram
  autonumber
  actor User
  participant Editor as Archyne
  participant FS as Your filesystem
  participant Agent as LLM agent

  User->>Editor: drag a node
  activate Editor
  Editor->>Editor: regenerate Mermaid text
  Editor-->>User: canvas and code in sync
  deactivate Editor

  User->>Editor: Ctrl+S
  Editor->>FS: write diagram.mmd

  Agent->>FS: read diagram.mmd (MCP)
  Agent->>FS: rewrite structure
  Note over FS,Agent: manual layout is carried over
  FS-->>Editor: reopened, positions intact
`,
  },
];

const browser = await chromium.launch({ channel: CHANNEL, headless: true });
const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
// Pin the locale: the app otherwise follows the browser's, and the README is
// in English.
await context.addInitScript(() => {
  try {
    localStorage.setItem("graph:locale", "en");
  } catch {
    // Storage unavailable; English is the default anyway.
  }
});

for (const shot of SHOTS) {
  const page = await context.newPage();
  await page.goto(`${BASE}/?code=${encodeURIComponent(shot.code)}`);
  await page.waitForSelector(".react-flow__node", { timeout: 30000 });

  await page.locator(".menu-button > button").click();
  await page.locator(".menu-popover").waitFor({ state: "visible", timeout: 15000 });
  await page.locator(".menu-popover select").first().selectOption(shot.theme);
  await page.waitForFunction((t) => document.documentElement.dataset.theme === t, shot.theme, {
    timeout: 15000,
  });
  await page.keyboard.press("Escape");
  await page.locator(".menu-popover").waitFor({ state: "hidden", timeout: 15000 });

  // Icons and fonts settle after the nodes exist; a screenshot taken too
  // early shows empty icon boxes.
  await page.waitForTimeout(2500);

  // Frame the whole diagram. Without this the shot is whatever happened to
  // be in view, which for a tall diagram means a cropped one.
  await page.locator(".react-flow__controls-fitview").click();
  await page.waitForTimeout(800);

  const file = join(OUT, `${shot.name}.png`);
  await page.screenshot({ path: file });
  console.log(`wrote ${file}`);
  await page.close();
}

await browser.close();
console.log(`\n${SHOTS.length} screenshots written to docs/images/`);
