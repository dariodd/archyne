/**
 * Read the numbers a node is drawn with out of `src/styles.css`.
 *
 * `measureNode` has to work out how big a node is without a browser, which
 * means restating padding, borders, floors and type sizes that a stylesheet
 * already states. Restating them by hand is a duplication that drifts silently:
 * change a padding in the CSS and the measurement is wrong until somebody
 * notices a diagram looks off.
 *
 * So they are not restated. They are extracted, into
 * `src/render/boxModel.generated.ts`, and CI runs this with `--check` so an
 * edit to the stylesheet that is not reflected there fails the build.
 *
 *   node scripts/build-box-model.mjs           # write
 *   node scripts/build-box-model.mjs --check   # fail if it would change
 *
 * Deliberately a small targeted reader rather than a CSS parser: it wants
 * fifteen known declarations from fifteen known selectors, and every one it
 * cannot find is an error rather than a default. A silent default here is the
 * very failure the file exists to prevent.
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const CSS = resolve(here, "..", "src", "styles.css");
const OUT = resolve(here, "..", "src", "render", "boxModel.generated.ts");

// Normalised to LF on the way in. One selector here spans two lines
// (the `body` / `#root` pair), and a checkout with CRLF endings — which is
// what Windows and a Prettier pass both produce — would otherwise make that
// rule unfindable and fail the build for a reason that has nothing to do
// with the stylesheet.
const css = (await readFile(CSS, "utf8"))
  .replace(/\r\n/g, "\n")
  // Comments go too. Declarations are split on ";" and read up to the first
  // ":", and this stylesheet explains itself at length — one comment inside
  // `:root` contains a colon ("saturation: the logo stays vivid"), which
  // swallowed the declaration after it and made `--bg` look absent.
  .replace(/\/\*[\s\S]*?\*\//g, "");

/** The declarations of one rule, by exact selector. */
function rule(selector) {
  // Anchored at a line start so `.table-row` does not match `.table-row .dim`.
  const re = new RegExp(
    `^${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`,
    "m",
  );
  const m = css.match(re);
  if (!m) throw new Error(`no rule for "${selector}" in styles.css`);
  const out = {};
  for (const decl of m[1].split(";")) {
    const i = decl.indexOf(":");
    if (i < 0) continue;
    out[decl.slice(0, i).trim()] = decl.slice(i + 1).trim();
  }
  return { selector, decls: out };
}

function need(r, prop) {
  const v = r.decls[prop];
  if (v === undefined) throw new Error(`"${r.selector}" has no ${prop}`);
  return v;
}

/** A `12px` sort of value, as a number. */
function px(r, prop) {
  const v = need(r, prop);
  const m = /^(-?\d+(?:\.\d+)?)px$/.exec(v);
  if (!m) throw new Error(`"${r.selector}" has ${prop}: ${v}, which is not a px length`);
  return Number(m[1]);
}

function num(r, prop) {
  const v = need(r, prop);
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`"${r.selector}" has ${prop}: ${v}, not a number`);
  return n;
}

/**
 * A `padding` shorthand, as the totals across and down.
 *
 * One, two, three or four values, in CSS's own order — and the three-value form
 * is not academic: `.note-node` uses it.
 */
function padding(r, prop = "padding") {
  const parts = need(r, prop)
    .split(/\s+/)
    .map((p) => {
      // A bare `0` is a length CSS takes without a unit, and `.table-rows`
      // writes one.
      if (p === "0") return 0;
      const m = /^(-?\d+(?:\.\d+)?)px$/.exec(p);
      if (!m) throw new Error(`"${r.selector}" has ${prop}: ${p}, which is not a px length`);
      return Number(m[1]);
    });
  const [top, right, bottom, left] =
    parts.length === 1
      ? [parts[0], parts[0], parts[0], parts[0]]
      : parts.length === 2
        ? [parts[0], parts[1], parts[0], parts[1]]
        : parts.length === 3
          ? [parts[0], parts[1], parts[2], parts[1]]
          : parts;
  return { padX: left + right, padY: top + bottom };
}

/** The width off a `border: 1.5px solid …` shorthand. */
function borderWidth(r) {
  const m = /^(-?\d+(?:\.\d+)?)px\b/.exec(need(r, "border"));
  if (!m) throw new Error(`"${r.selector}" has no px width in its border`);
  return Number(m[1]);
}

const body = rule("body,\n#root");
const shapeLabel = rule(".shape-label");
const stateNode = rule(".state-node");
const tableNode = rule(".table-node");
const tableTitle = rule(".table-title");
const tableRows = rule(".table-rows");
const tableRow = rule(".table-row");
const erType = rule(".table-row .dim");
const tableKeys = rule(".table-row .keys");
const tableMono = rule(".table-row.mono");
const classAnnotation = rule(".class-annotation");
const participantHead = rule(".participant-head");
const serviceNode = rule(".service-node");
const serviceLabel = rule(".service-label");
const c4Node = rule(".c4-node");
const c4Head = rule(".c4-head");
const c4Tag = rule(".c4-tag");
const c4Label = rule(".c4-label");
const c4Descr = rule(".c4-descr");
const noteNode = rule(".note-node");
// Two rules share this selector; the first is the one carrying the numbers.
const groupTitle = rule(".group-title");

/** `.c4-head`'s `margin: 0 auto 4px` — only the bottom is a length we want. */
function marginBottom(r) {
  const parts = need(r, "margin").split(/\s+/);
  const last = parts[parts.length - 1];
  const m = /^(-?\d+(?:\.\d+)?)px$/.exec(last);
  if (!m) throw new Error(`"${r.selector}" has margin: ${parts.join(" ")}, with no px bottom`);
  return Number(m[1]);
}

/**
 * The custom properties of one theme block.
 *
 * A rendered SVG has no document, so it cannot resolve `var(--node-fill)` —
 * the value has to be baked in. Both palettes are read here so that changing a
 * colour in the stylesheet changes the picture the renderer paints, instead of
 * changing only the editor and leaving the exported file behind.
 */
function palette(selector) {
  const r = rule(selector);
  const want = {
    bg: "--bg",
    text: "--text",
    nodeFill: "--node-fill",
    nodeStroke: "--node-stroke",
    edge: "--edge",
    edgeLabel: "--edge-label",
    edgeLabelBg: "--edge-label-bg",
    markerHollow: "--marker-hollow",
  };
  const out = {};
  for (const [key, prop] of Object.entries(want)) {
    const v = need(r, prop);
    if (!/^#[0-9a-f]{3,8}$/i.test(v)) {
      throw new Error(`"${selector}" has ${prop}: ${v}, which is not a plain colour`);
    }
    out[key] = v;
  }
  return out;
}

/** A colour off a `background:` or `border:` declaration that states one. */
function colour(r, prop) {
  const m = /#[0-9a-f]{3,8}\b/i.exec(need(r, prop));
  if (!m) throw new Error(`"${r.selector}" has no plain colour in its ${prop}`);
  return m[0];
}

const model = {
  fontFamily: need(body, "font-family"),
  palette: {
    dark: palette(":root"),
    light: palette(':root[data-theme="light"]'),
  },
  // A C4 element is the one family painted in its own colours rather than the
  // theme's — the same navy in both, as the stylesheet has it.
  c4: {
    fill: colour(c4Node, "background"),
    stroke: colour(c4Node, "border"),
    text: "#ffffff",
  },
  // Every bordered node uses the same width; taken from one of them so that
  // changing it in the stylesheet is caught rather than assumed.
  borderWidth: borderWidth(stateNode),
  shapeLabel: padding(shapeLabel),
  stateNode: {
    ...padding(stateNode),
    minWidth: px(stateNode, "min-width"),
    fontSize: px(stateNode, "font-size"),
  },
  tableNode: {
    minWidth: px(tableNode, "min-width"),
    fontSize: px(tableNode, "font-size"),
  },
  tableTitle: { ...padding(tableTitle), fontWeight: num(tableTitle, "font-weight") },
  tableRows: padding(tableRows),
  tableRow: { ...padding(tableRow), gap: px(tableRow, "gap") },
  erTypeColumn: { minWidth: px(erType, "min-width") },
  tableRowKeys: { fontSize: px(tableKeys, "font-size") },
  tableRowMono: {
    fontFamily: need(tableMono, "font-family"),
    fontSize: px(tableMono, "font-size"),
  },
  classAnnotation: { fontSize: px(classAnnotation, "font-size") },
  participantHead: {
    ...padding(participantHead),
    minWidth: px(participantHead, "min-width"),
  },
  serviceNode: {
    ...padding(serviceNode),
    minWidth: px(serviceNode, "min-width"),
    gap: px(serviceNode, "gap"),
  },
  serviceLabel: {
    fontSize: px(serviceLabel, "font-size"),
    maxWidth: px(serviceLabel, "max-width"),
  },
  c4Node: {
    ...padding(c4Node),
    minWidth: px(c4Node, "min-width"),
    maxWidth: px(c4Node, "max-width"),
  },
  c4Head: { size: px(c4Head, "width"), marginBottom: marginBottom(c4Head) },
  c4Tag: { fontSize: px(c4Tag, "font-size") },
  c4Label: { fontSize: px(c4Label, "font-size"), fontWeight: num(c4Label, "font-weight") },
  c4Descr: { fontSize: px(c4Descr, "font-size") },
  groupTitle: { ...padding(groupTitle), fontSize: px(groupTitle, "font-size") },
  noteNode: {
    ...padding(noteNode),
    minWidth: px(noteNode, "min-width"),
    maxWidth: px(noteNode, "max-width"),
    fontSize: px(noteNode, "font-size"),
    lineHeight: num(noteNode, "line-height"),
  },
};

const banner = `/**
 * Generated from \`src/styles.css\` by \`scripts/build-box-model.mjs\`. Do not edit.
 *
 * These are the declarations \`measureNode\` and \`renderSvg\` need in order to
 * work out a node's box without a browser. Change the stylesheet and re-run the
 * script; CI runs it with \`--check\` and fails if the two have drifted.
 */
`;

const text = `${banner}export const BOX_MODEL = ${JSON.stringify(model, null, 2)} as const;\n`;

if (process.argv.includes("--check")) {
  let current = "";
  try {
    current = await readFile(OUT, "utf8");
  } catch {
    console.error(`${OUT} is missing. Run: node scripts/build-box-model.mjs`);
    process.exit(1);
  }
  if (current !== text) {
    console.error(
      "src/render/boxModel.generated.ts is out of date with src/styles.css.\n" +
        "Run: node scripts/build-box-model.mjs",
    );
    process.exit(1);
  }
  console.log("box model matches the stylesheet");
} else {
  await writeFile(OUT, text, "utf8");
  console.log(`wrote ${OUT}`);
}
