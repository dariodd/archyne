/**
 * Run the recipes in the package README, as written.
 *
 * `packages/render/README.md` tells a reader how to plug the renderer into
 * whatever draws their Markdown. Documentation like that rots quietly: the API
 * moves, the snippet stops working, and nobody finds out until somebody wastes
 * an afternoon on it. So the snippets are not transcribed here — they are
 * **extracted from the README and executed**, which means a recipe that stopped
 * working fails a build.
 *
 * The three are not three tools. They are the three places the code can run,
 * and the difference between them is whether there is a DOM:
 *
 *   - a preview that runs your script — a webview, so a real browser;
 *   - Node, before the page is built — no DOM, so jsdom;
 *   - a build step writing `.svg` files — no DOM, and the output has to survive
 *     being loaded through `<img>`, with no page to help it.
 *
 * Run:  npx tsx tests/e2e-recipes.mts   (no server needed)
 */
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { chromium } from "playwright";
import { CHANNEL } from "./env.mts";

const run = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const README = join(root, "packages/render/README.md");

let failed = false;
function check(label: string, ok: boolean, detail: string): void {
  if (ok) {
    console.log(`✓ ${label}`);
  } else {
    failed = true;
    console.error(`✗ ${label} — ${detail}`);
  }
}

/**
 * The code block a `<!-- recipe:name -->` marker introduces.
 *
 * A marker rather than "the third code block": the README is prose that will
 * grow, and counting blocks would make this fail for the wrong reason the first
 * time somebody adds an example.
 */
async function recipe(name: string): Promise<string> {
  const text = await readFile(README, "utf8");
  const marker = `<!-- recipe:${name} -->`;
  const at = text.indexOf(marker);
  if (at < 0) throw new Error(`no recipe marked "${name}" in the README`);
  const open = text.indexOf("```js", at);
  if (open < 0) throw new Error(`recipe "${name}" has no js block after it`);
  const start = text.indexOf("\n", open) + 1;
  // The closing fence is at the start of a line. Searching for the delimiter
  // anywhere stops at the first one *inside* the code — a regex matching a
  // fence, most obviously — and hands back half a recipe, which fails to parse
  // with an error that points at the wrong thing entirely.
  const end = text.indexOf("\n```", start);
  if (end < 0) throw new Error(`recipe "${name}" has no closing fence`);
  return text.slice(start, end + 1);
}

const MARKDOWN = [
  "# Un documento",
  "",
  "Testo prima.",
  "",
  "```mermaid",
  "flowchart TD",
  '  a["Uno"] --> b["Due"]',
  "```",
  "",
  "Testo in mezzo.",
  "",
  "```mermaid",
  "stateDiagram-v2",
  "  [*] --> Pronto",
  "```",
  "",
].join("\n");

const work = await mkdtemp(join(tmpdir(), "archyne-recipes-"));
try {
  // A consumer's directory: the published package, by name, plus the jsdom two
  // of the three recipes tell the reader to install.
  await writeFile(
    join(work, "package.json"),
    JSON.stringify({ name: "consumer", private: true, type: "module" }, null, 2),
  );
  await run("npm", ["pack", "--pack-destination", work], {
    cwd: join(root, "packages/render"),
    shell: true,
  });
  const [tarball] = (await readdir(work)).filter((f) => f.endsWith(".tgz"));
  await run(
    "npm",
    [
      "install",
      "--no-audit",
      "--no-fund",
      join(work, tarball),
      resolve(root, "node_modules/mermaid"),
      // From the registry rather than from this checkout: installing a local
      // folder runs its `prepare` script, and jsdom's needs a build tool that
      // is not there. It is also what the recipe tells a reader to do.
      "jsdom",
    ],
    { cwd: work, shell: true },
  );

  /* ---------- 2. Node, before the page is built ---------- */

  const nodeRecipe = await recipe("node");
  const nodeFile = join(work, "node-recipe.mjs");
  await writeFile(
    nodeFile,
    `${nodeRecipe}\nconst out = await drawFences(${JSON.stringify(MARKDOWN)});\n` +
      `console.log(JSON.stringify({ svgs: (out.match(/<svg/g) || []).length, ` +
      `fencesLeft: (out.match(/\`\`\`mermaid/g) || []).length, ` +
      `hasText: out.includes("Uno") && out.includes("Pronto") }));`,
  );
  const { stdout: nodeOut } = await run("node", [nodeFile], { cwd: work, shell: true });
  const node = JSON.parse(nodeOut.trim().split("\n").pop()!);
  check("the Node recipe replaces every fence with a picture", node.svgs === 2, nodeOut);
  check("leaving no fence behind", node.fencesLeft === 0, nodeOut);
  check("with the labels in it", node.hasText, nodeOut);

  /* ---------- 3. Rendered to files, ahead of time ---------- */

  const filesRecipe = await recipe("files");
  const filesFile = join(work, "files-recipe.mjs");
  await writeFile(
    filesFile,
    `${filesRecipe}\nconst out = await extractFences(${JSON.stringify(MARKDOWN)}, "doc", ${JSON.stringify(work)});\n` +
      `console.log(JSON.stringify({ links: (out.match(/!\\[\\]\\(/g) || []).length }));`,
  );
  const { stdout: filesOut } = await run("node", [filesFile], { cwd: work, shell: true });
  const files = JSON.parse(filesOut.trim().split("\n").pop()!);
  check("the files recipe rewrites each fence to an image", files.links === 2, filesOut);

  const written = (await readdir(work)).filter((f) => f.endsWith(".svg")).sort();
  check("and writes one SVG per fence", written.length === 2, written.join(", "));

  /* ---------- the claim that route rests on ---------- */

  const browser = await chromium.launch({ channel: CHANNEL, headless: true });
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  const svg = await readFile(join(work, written[0]), "utf8");

  // Through `<img>`, which is how a Markdown reader shows a file — and the
  // mode where a `<foreignObject>`'s HTML is not painted at all.
  const asImage = await page.evaluate(async (markup: string) => {
    const img = new Image();
    const done = new Promise<boolean>((ok) => {
      img.onload = () => ok(true);
      img.onerror = () => ok(false);
    });
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
    if (!(await done)) return { ok: false, textPixels: 0 };
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let textPixels = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] > 200 && data[i + 1] > 200 && data[i + 2] > 200) textPixels++;
    }
    return { ok: true, textPixels };
  }, svg);

  check("a written file loads through <img>", asImage.ok, JSON.stringify(asImage));
  // "Some, not none" is the whole claim, and the margin is wide: a
  // `<foreignObject>` renders **zero** through `<img>`, and nothing else in the
  // picture comes near the label colour — the ground is #0f1014, a node #1c1f2b,
  // a stroke #7e8bdd, none of which pass a >200 threshold on every channel. Two
  // short words at 12px are worth about forty pixels, so the bar is set below
  // that rather than at a number a longer fixture happened to produce.
  check(
    "and its labels are painted there, which is what that whole route rests on",
    asImage.textPixels > 20,
    `${asImage.textPixels} pixels of label colour`,
  );

  /* ---------- 1. In a preview that runs your script ---------- */

  // Bundled, because a webview has no module resolution — which is the recipe's
  // own advice, and the step most likely to be skipped when reading it.
  const previewRecipe = await recipe("webview");
  const entry = join(work, "preview-entry.mjs");
  // Verbatim, with nothing added around it. An earlier version of this wrapped
  // the recipe in an `async function` so its `await` would be legal, which put
  // an `import` inside a function body — illegal — and the bundle failed. The
  // wrapper belongs in the recipe, not here: `iife` rejects top-level `await`
  // outright, so a recipe that needs one is a recipe a reader cannot ship.
  await writeFile(entry, previewRecipe);
  await run(
    "npx",
    [
      "esbuild",
      entry,
      "--bundle",
      "--format=iife",
      "--platform=browser",
      "--target=es2022",
      `--outfile=${join(work, "preview.js")}`,
    ],
    { cwd: root, shell: true },
  );

  const bundle = await readFile(join(work, "preview.js"), "utf8");
  await page.setContent(
    `<html><body><pre class="diagram">flowchart TD${String.fromCharCode(10)}  a["Nel webview"] --> b["disegnato"]</pre></body></html>`,
  );
  await page.addScriptTag({ content: bundle });
  await page.waitForFunction(() => !!document.querySelector("pre.diagram svg"), undefined, {
    timeout: 30000,
  });
  const drawn = await page.evaluate(() => {
    const el = document.querySelector("pre.diagram")!;
    const svgEl = el.querySelector("svg");
    return {
      width: svgEl ? svgEl.getBoundingClientRect().width : 0,
      text: el.textContent ?? "",
      redrawGuard: (el as HTMLElement).dataset.done !== undefined,
    };
  });

  check(
    "the webview recipe draws a fence in a real browser",
    drawn.width > 0,
    JSON.stringify(drawn),
  );
  check("with its labels", drawn.text.includes("Nel webview"), drawn.text);
  check("and marks it so a redraw does not repeat the work", drawn.redrawGuard, "");

  await browser.close();
  await rm(join(work, "preview.js"), { force: true });
} finally {
  await rm(work, { recursive: true, force: true });
}

console.log(
  failed ? "\nuna ricetta del README non funziona" : "\nevery recipe in the README runs",
);
process.exit(failed ? 1 : 0);
