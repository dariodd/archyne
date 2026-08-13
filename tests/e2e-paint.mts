/**
 * The canvas and the emitter paint the same colours.
 *
 * `tests/e2e-measure.mts` already pins the *geometry* the two agree on. This
 * pins the paint, which is where the damage actually happened: four separate
 * defects in this area shipped past a full green suite, because every one of
 * them was invisible to an assertion about a string.
 *
 *   - `fill="#ff8800"` was in the exported file, readable, and painted nothing:
 *     a presentation attribute loses to the document's own `<style>` block.
 *   - `classDef` was dropped entirely — the emitter read `data.styles` and
 *     never the node's classes.
 *   - state, ER and class diagrams ignored their `style` statements.
 *   - labels went out as `<foreignObject>`, which is not painted through
 *     `<img>` at all, so the words simply were not there.
 *
 * So the question is not "is the colour in the output". It is **what colour
 * does a browser end up painting**, asked of both pictures, in the same
 * browser, with the same function. Both sides are read with `getComputedStyle`
 * on a real document; nothing here parses SVG text.
 *
 * The two pictures come from one graph: the app is loaded once per family, the
 * canvas is read from the live DOM, and the emitter's SVG comes from
 * `__graphTest.exportWith`, which is the app's real export path. There is no
 * second parse to disagree about.
 *
 * Four families, not seven, and that is the whole of them: `flowchart`,
 * `state`, `cls` and `er` are the adapters in `src/model/kinds/` that carry
 * styles at all. A C4, sequence or architecture node has no way to ask for a
 * colour, so there is nothing here for the two pictures to disagree about. If
 * one of them grows one, it belongs in the list below.
 *
 * Run:  npx tsx tests/e2e-paint.mts   (needs the app served — see env.mts)
 */
import { chromium, type Page } from "playwright";
import { CHANNEL, codeUrl } from "./env.mts";

/** `#ff8800` as the browser reports it, so the two sides compare as strings. */
function asRgb(hex: string): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * A family, a document that asks for colours by hand, and the colours it asks
 * for.
 *
 * The colours are deliberately nothing like the palette — a diagram that came
 * back entirely in the default theme would still contain plenty of greys, and
 * a test that could be satisfied by those is not testing anything.
 */
const CASES: { kind: string; code: string; wants: string[] }[] = [
  {
    kind: "flowchart",
    // Both routes to a custom colour, because they are read by different code:
    // `class` goes through `classDefs`, which the exporter has to be handed
    // separately and once forgot to, and `style` rides on the node itself.
    code: `flowchart TD
  classDef warm fill:#ff8800,stroke:#00e5ff
  a["Start"] --> b["Finish"]
  class a warm
  style b fill:#7cff00
`,
    wants: ["#ff8800", "#00e5ff", "#7cff00"],
  },
  {
    kind: "state",
    code: `stateDiagram-v2
  [*] --> Idle
  Idle --> Busy
  style Idle fill:#ff8800,stroke:#00e5ff
`,
    wants: ["#ff8800", "#00e5ff"],
  },
  {
    kind: "class",
    code: `classDiagram
  class Account {
    +int id
  }
  class Ledger
  Account <|-- Ledger
  style Account fill:#ff8800,stroke:#00e5ff
`,
    wants: ["#ff8800", "#00e5ff"],
  },
  {
    kind: "er",
    code: `erDiagram
  CUSTOMER {
    string name PK
  }
  ORDER {
    int id PK
  }
  CUSTOMER ||--o{ ORDER : "places"
  style CUSTOMER fill:#ff8800,stroke:#00e5ff
`,
    wants: ["#ff8800", "#00e5ff"],
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
const page: Page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const svgPage: Page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

/**
 * Every colour a document actually paints.
 *
 * Written as one inline body with no named inner function: `tsx` compiles a
 * named one with esbuild's `keepNames`, which injects a `__name` helper that
 * does not exist in the page the body is shipped to.
 */
const PAINTED = (rootSelector: string) => {
  const roots = document.querySelectorAll(rootSelector);
  const found = new Set<string>();
  for (const root of roots) {
    const els = [root, ...root.querySelectorAll("*")];
    for (const el of els) {
      // React Flow's connection handles are chrome, not picture: they are
      // painted on the canvas and have no counterpart in an exported file,
      // so counting them would make every family fail for a false reason.
      if ((el as HTMLElement).closest?.(".react-flow__handle")) continue;
      const s = getComputedStyle(el as Element);
      for (const v of [s.fill, s.stroke, s.color, s.backgroundColor, s.borderTopColor]) {
        if (v && v.startsWith("rgb(")) found.add(v);
      }
    }
  }
  return [...found];
};

try {
  for (const { kind, code, wants } of CASES) {
    await page.goto(codeUrl(code));
    await page.waitForFunction(
      () => (window as unknown as { __graphTest?: { ready(): boolean } }).__graphTest?.ready(),
      undefined,
      { timeout: 30000 },
    );
    await page.waitForTimeout(500);

    const onCanvas = await page.evaluate(PAINTED, ".react-flow__node");

    // The app's own export path, on the graph already in the store — not a
    // second parse of the same text, which could differ and hide the point.
    const dataUrl: string = await page.evaluate(() =>
      (
        window as unknown as {
          __graphTest: { exportWith(o: Record<string, unknown>): Promise<string> };
        }
      ).__graphTest.exportWith({ format: "svg", source: "canvas", background: "dark" }),
    );
    const svg = decodeURIComponent(dataUrl.replace(/^data:image\/svg\+xml;charset=utf-8,/, ""));

    // Opened as a document of its own, so the browser resolves the `<style>`
    // the emitter shipped inside it — which is the block that beat the
    // presentation attributes and made the custom colours do nothing.
    await svgPage.setContent(svg, { waitUntil: "load" });
    const onSvg = await svgPage.evaluate(PAINTED, "svg");

    for (const hex of wants) {
      const rgb = asRgb(hex);
      check(
        `${kind}: the canvas paints ${hex}`,
        onCanvas.includes(rgb),
        `canvas painted ${onCanvas.join(" ")}`,
      );
      check(
        `${kind}: and so does the exported SVG`,
        onSvg.includes(rgb),
        `the file painted ${onSvg.join(" ")}`,
      );
    }
  }
} finally {
  await browser.close();
}

console.log(
  failed
    ? "\nthe canvas and the emitter disagree about the paint"
    : "\nboth pictures paint what the document asked for",
);
process.exit(failed ? 1 : 0);
