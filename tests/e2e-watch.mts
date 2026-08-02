/**
 * Noticing that an open file changed on disk.
 *
 * The logic is unit-tested (`src/diskWatch.test.ts`) against the same fake
 * handle used here. What only a browser can answer is whether the watcher is
 * *running* — an interval that nobody starts is invisible to every unit test,
 * and this is exactly the kind of wiring that survives a refactor by being
 * quietly dropped.
 *
 * The file is a stand-in: the File System Access API cannot be driven from a
 * test, so a document is stood on an object with the two methods the watcher
 * actually calls. Everything past that point is the real app — the real
 * interval, the real reload, the real toast.
 *
 * Run:  npm run dev, then npx tsx tests/e2e-watch.mts
 */
import { chromium, type Page } from "playwright";
import { CHANNEL, codeUrl } from "./env.mts";

const CODE = 'flowchart TD\n  a["Alpha"] --> b["Beta"]\n';
const CHANGED = 'flowchart TD\n  a["Rewritten by an agent"] --> b["Beta"]\n';

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
const context = await browser.newContext({ viewport: { width: 1500, height: 900 } });
await context.addInitScript(() => {
  try {
    localStorage.setItem("graph:locale", "en");
  } catch {
    // Storage unavailable; the default is English anyway.
  }
});
const page: Page = await context.newPage();
await page.goto(codeUrl(CODE));
await page.waitForFunction(
  () => (window as unknown as { __graphTest?: { ready(): boolean } }).__graphTest?.ready(),
  undefined,
  { timeout: 30000 },
);

/**
 * Stand the open document on a fake file, in sync with what is on screen.
 *
 * Passed as source text rather than a function: tsx compiles the functions in
 * this file with esbuild's name-preserving helper, which does not exist in
 * the page and fails the moment an object literal carries a method.
 */
await page.evaluate(`(() => {
  const g = window.__graphTest;
  const code = g.store.getState().code;
  const disk = { content: code, lastModified: Date.now() };
  window.__disk = disk;
  const handle = {
    name: "watched.mmd",
    getFile: function () {
      return Promise.resolve({
        lastModified: disk.lastModified,
        text: function () { return Promise.resolve(disk.content); },
      });
    },
  };
  const { activeId, docs } = g.workspace.getState();
  g.workspace.setState({
    docs: docs.map(function (d) {
      return d.id === activeId
        ? { ...d, name: "watched.mmd", handle: handle, savedCode: code }
        : d;
    }),
  });
  g.files.setState({ name: "watched.mmd", path: null, handle: handle, savedCode: code });
})()`);

// One poll interval is 2s; give it two, plus the reload.
await page.waitForTimeout(500);
await page.getByRole("button", { name: "More" }).click();
await page.locator(".menu-popover").waitFor({ state: "visible", timeout: 15000 });
check(
  "a file-backed document offers a way back to what is on disk",
  (await page.getByRole("button", { name: "Reload from disk" }).count()) === 1,
  "the menu item was not offered",
);
await page.keyboard.press("Escape");
await page.waitForTimeout(200);

const codeNow = () =>
  page.evaluate(
    () =>
      (
        window as unknown as { __graphTest: { store: { getState(): { code: string } } } }
      ).__graphTest.store.getState().code,
  );

check(
  "opening a file is not treated as the file changing",
  !(await codeNow()).includes("Rewritten"),
  "something reloaded before anything changed",
);

/** Something else — an agent, through MCP — rewrites the file. */
await page.evaluate((next) => {
  const disk = (window as unknown as { __disk: { content: string; lastModified: number } })
    .__disk;
  disk.content = next;
  disk.lastModified = Date.now() + 1000;
}, CHANGED);

await page
  .waitForFunction(
    () =>
      (
        window as unknown as { __graphTest: { store: { getState(): { code: string } } } }
      ).__graphTest.store
        .getState()
        .code.includes("Rewritten"),
    undefined,
    { timeout: 15000 },
  )
  .then(
    () => check("the change on disk reaches the canvas on its own", true, ""),
    () => check("the change on disk reaches the canvas on its own", false, "it never arrived"),
  );

check(
  "and says so",
  (await page.locator(".toast, [role=status]").allInnerTexts())
    .join(" ")
    .includes("watched.mmd"),
  "no message named the file",
);

/** Now with unsaved work in the way: the canvas must win. */
await page.evaluate(() => {
  const g = (
    window as unknown as {
      __graphTest: { store: { getState(): { updateNodeData(id: string, p: unknown): void } } };
    }
  ).__graphTest;
  g.store.getState().updateNodeData("a", { label: "Mine, unsaved" });
});
await page.waitForTimeout(600);
await page.evaluate(() => {
  const disk = (window as unknown as { __disk: { content: string; lastModified: number } })
    .__disk;
  disk.content = 'flowchart TD\n  a["Second agent pass"] --> b["Beta"]\n';
  disk.lastModified = Date.now() + 5000;
});
await page.waitForTimeout(5000);

const after = await codeNow();
check(
  "unsaved work is never overwritten by what is on disk",
  after.includes("Mine, unsaved") && !after.includes("Second agent pass"),
  "the canvas was replaced",
);

await browser.close();
console.log(
  failed ? "\ndisk watching FAILED" : "\nfile changes are noticed, and nothing is lost",
);
process.exit(failed ? 1 : 0);
