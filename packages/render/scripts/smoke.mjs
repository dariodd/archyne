/**
 * Install the tarball somewhere else, and use it.
 *
 * Everything else about this package is checked from inside the repository,
 * where every path resolves and every file exists. That is exactly the
 * condition under which the failures that matter are invisible: an `exports`
 * map naming a file the tarball does not carry, a type declaration pointing at
 * a directory `files` excludes, a dependency that was really a devDependency.
 * None of those can fail here; all of them fail for the first consumer.
 *
 * So this packs the package, installs it into a temporary directory outside the
 * tree, and imports it the way anybody would — by name, through its `exports`,
 * with no path back into this repository.
 *
 *   node scripts/smoke.mjs
 */
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const pkg = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(pkg, "..", "..");

let failed = false;
function check(label, ok, detail) {
  if (ok) {
    console.log(`✓ ${label}`);
  } else {
    failed = true;
    console.error(`✗ ${label} — ${detail}`);
  }
}

const work = await mkdtemp(join(tmpdir(), "archyne-render-smoke-"));
try {
  // `npm pack` produces exactly what a publish would upload, `files` and all.
  const { stdout } = await run("npm", ["pack", "--pack-destination", work], {
    cwd: pkg,
    shell: true,
  });
  const tarball = join(work, stdout.trim().split("\n").pop().trim());
  console.log(`  packed ${tarball}`);

  await writeFile(
    join(work, "package.json"),
    JSON.stringify({ name: "consumer", private: true, type: "module" }, null, 2),
  );
  // Mermaid is a peer, so the consumer supplies it — from this repository's own
  // install rather than the network, which keeps the test offline and pins the
  // version the rest of the suite runs against.
  await run(
    "npm",
    ["install", "--no-audit", "--no-fund", tarball, resolve(root, "node_modules/mermaid")],
    { cwd: work, shell: true },
  );

  /*
   * Two probes, because the two entry points genuinely differ.
   *
   * The main one runs in plain Node with nothing installed and no DOM — which
   * is the strongest claim this package makes, and the one that was false until
   * `boxes.ts`, `graph.ts` and `edgeTheme.ts` were pulled out of modules that
   * touch `window` on the way past the workspace.
   *
   * The `/mermaid` one cannot: Mermaid's parser runs every label through
   * DOMPurify, which wants a window, so a Node consumer has to provide one.
   * That is a fact about Mermaid rather than about this package, and pretending
   * otherwise would be the sort of thing a smoke test exists to prevent.
   */
  const core = join(work, "core.mjs");
  await writeFile(
    core,
    [
      'import { renderSvg, canRender } from "archyne-render";',
      "",
      "const nodes = [",
      '  { id: "a", type: "shape", position: { x: 0, y: 0 },',
      '    data: { label: "Start", shape: "square", direction: "TB" } },',
      '  { id: "b", type: "shape", position: { x: 0, y: 200 },',
      '    data: { label: "Finish", shape: "square", direction: "TB" } },',
      "];",
      'const svg = renderSvg(nodes, [], "flowchart");',
      "console.log(JSON.stringify({",
      '  canRender: canRender("flowchart"),',
      '  isSvg: svg.startsWith("<svg"),',
      '  hasText: svg.includes("Start"),',
      '  noForeignObject: !svg.includes("foreignObject"),',
      "}));",
    ].join("\n"),
  );

  const jsdomUrl = pathToFileURL(resolve(root, "node_modules/jsdom/lib/api.js")).href;
  const withMermaid = join(work, "mermaid.mjs");
  await writeFile(
    withMermaid,
    [
      `import { JSDOM } from ${JSON.stringify(jsdomUrl)};`,
      'const dom = new JSDOM("<!doctype html><html><body></body></html>");',
      "globalThis.window = dom.window;",
      "globalThis.document = dom.window.document;",
      "globalThis.DOMParser = dom.window.DOMParser;",
      "globalThis.Node = dom.window.Node;",
      "",
      'const { render } = await import("archyne-render/mermaid");',
      'const out = await render(\'flowchart TD\\n  a["One"] --> b["Two"]\\n\');',
      "console.log(JSON.stringify({",
      '  hasBoth: out.svg.includes("One") && out.svg.includes("Two"),',
      "  sized: out.width > 0 && out.height > 0,",
      '  noForeignObject: !out.svg.includes("foreignObject"),',
      "}));",
    ].join("\n"),
  );

  const { stdout: coreOut } = await run("node", [core], { cwd: work, shell: true });
  const seen = JSON.parse(coreOut.trim().split("\n").pop());

  check("the package installs from a tarball, outside the repository", true, "");
  check("its main entry renders in plain Node, with no DOM at all", seen.isSvg, coreOut);
  check("drawing labels as real text", seen.hasText, coreOut);
  check("and no foreignObject anywhere in the output", seen.noForeignObject, coreOut);
  check("`canRender` answers for a family it draws", seen.canRender === true, coreOut);

  const { stdout: mermaidOut } = await run("node", [withMermaid], { cwd: work, shell: true });
  const parsed = JSON.parse(mermaidOut.trim().split("\n").pop());
  check("its /mermaid entry parses and lays out a document", parsed.hasBoth, mermaidOut);
  check("reporting the size it drew at", parsed.sized, mermaidOut);

  // Types are half of what an `exports` map promises.
  const files = await readdir(join(work, "node_modules/archyne-render/dist/types/render"));
  check(
    "declarations ship for both entry points",
    files.includes("index.d.ts") && files.includes("mermaid.d.ts"),
    files.join(", "),
  );
} finally {
  await rm(work, { recursive: true, force: true });
}

console.log(
  failed ? "\narchyne-render is not consumable" : "\narchyne-render works from outside",
);
process.exit(failed ? 1 : 0);
