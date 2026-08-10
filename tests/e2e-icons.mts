/**
 * Picking an icon, with a real pointer.
 *
 * This exists because of a bug nothing else could have caught. `IconView`
 * renders its SVG through `innerHTML`, so every re-render replaced the icon's
 * `<svg>` node — and the browser only fires a `click` when the press and the
 * release land on a node that is still in the document. Any re-render between
 * mousedown and mouseup (a hover, a store update, an icon finishing loading)
 * therefore ate the click: the icon you clicked simply did not apply, with no
 * error anywhere. Unit tests fire synthetic clicks and see none of that.
 *
 * So the clicks here are deliberately the ordinary, fast kind, and what is
 * asserted is that the diagram changed.
 *
 * Run:  npm run dev, then npx tsx tests/e2e-icons.mts
 */
import { chromium } from "playwright";
import { CHANNEL, codeUrl } from "./env.mts";

const CODE = `architecture-beta
  service svc(server)[Service]
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
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(String(e)));

interface TestNode {
  type: string;
  data: { icon?: string };
}
const nodes = () =>
  page.evaluate(
    () =>
      (
        window as unknown as {
          __graphTest: { store: { getState(): { nodes: TestNode[] } } };
        }
      ).__graphTest.store.getState().nodes,
  );

await page.goto(codeUrl(CODE));
await page.waitForSelector(".service-node");
await page.waitForTimeout(1500);

/* ---------- the picker ---------- */

await page.locator(".service-node").first().click();
await page.waitForTimeout(300);
await page.getByRole("button", { name: /Choose icon/i }).click();
await page.waitForTimeout(600);

const cells = page.locator(".modal .icon-add");
check("the picker offers icons", (await cells.count()) > 0, `${await cells.count()} cells`);

await cells.nth(0).hover();
await page.waitForTimeout(150);
const hoveredName = (await cells.nth(0).getAttribute("aria-label")) ?? "";
check(
  "hovering one says which one it is",
  (await page.locator(".icon-readout").innerText()) === hoveredName,
  `readout said "${await page.locator(".icon-readout").innerText()}", expected "${hoveredName}"`,
);

// Deliberately a cell the pointer has *not* been over, clicked in one go:
// arriving is what re-renders the grid, and the whole bug was that the
// re-render landed between the press and the release. Hovering first, then
// clicking, quietly avoids it and proves nothing.
await page.locator(".modal .icon-search").hover();
await page.waitForTimeout(150);
const cell = cells.nth(3);
const wanted = (await cell.getAttribute("aria-label")) ?? "";
await cell.click();
await page.waitForTimeout(500);
check(
  "clicking one closes the picker",
  (await page.locator(".modal").count()) === 0,
  "still open",
);
check(
  "and the node actually gets that icon",
  (await nodes())[0]?.data.icon === wanted,
  `node carries ${JSON.stringify((await nodes())[0]?.data.icon)}, expected ${wanted}`,
);
check(
  "which the reference field shows too",
  (await page.locator(".inspector input").nth(1).inputValue()) === wanted,
  await page.locator(".inspector input").nth(1).inputValue(),
);

/* ---------- taking it off again ---------- */

// If the pick above failed, the dialog is still up and everything after it
// would report the same failure as a timeout. Close it and carry on.
if ((await page.locator(".modal").count()) > 0) {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
}

await page.getByRole("button", { name: /Choose icon/i }).click();
await page.waitForTimeout(500);
await page.getByRole("button", { name: "No icon" }).click();
await page.waitForTimeout(500);
check(
  '"No icon" takes it off',
  !(await nodes())[0]?.data.icon,
  `node still carries ${JSON.stringify((await nodes())[0]?.data.icon)}`,
);

/* ---------- the palette, which clicks the same way ---------- */

const before = (await nodes()).length;
await page.locator(".palette .icon-cell .icon-add").first().click();
await page.waitForTimeout(800);
const after = await nodes();
check(
  "a click in the palette adds the node it drew",
  after.length === before + 1 && Boolean(after[after.length - 1]?.data.icon),
  `${before} nodes became ${after.length}`,
);

/* ---------- the picture shape on a flowchart node ---------- */

// Whether a picture fits inside the shape drawn around it is a question only
// a browser can answer: the box is a fixed width and height, and the picture
// is loaded from the network at its own size.
await page.goto(
  codeUrl(
    'flowchart TD\n  s["Start"] --> w@{ img: "https://api.iconify.design/logos/aws-dynamodb.svg", label: "Process request", pos: "b", w: 60, h: 60 }\n',
  ),
);
await page.waitForSelector(".shape-image");
await page.waitForTimeout(2000);

const spill = () =>
  page.evaluate(() => {
    const img = document.querySelector(".shape-image") as HTMLElement;
    const node = img.closest(".shape-node") as HTMLElement;
    const nb = node.getBoundingClientRect();
    const ib = img.getBoundingClientRect();
    const label = node.querySelector(".shape-label")!.getBoundingClientRect();
    const plain = document.querySelector(".shape-node") as HTMLElement;
    return {
      top: Math.round(nb.top - ib.top),
      bottom: Math.round(label.bottom - nb.bottom),
      imageHeight: Math.round(ib.height),
      nodeHeight: Math.round(nb.height),
      plainHeight: Math.round(plain.getBoundingClientRect().height),
    };
  });

const fitted = await spill();
check(
  "the picture stays inside the shape",
  fitted.top <= 0 && fitted.bottom <= 0 && fitted.imageHeight > 0,
  `${fitted.top}px out of the top, ${fitted.bottom}px out of the bottom`,
);
check(
  "and the shape is the size it would be without one",
  fitted.nodeHeight === fitted.plainHeight,
  `${fitted.nodeHeight}px against a plain node's ${fitted.plainHeight}px`,
);

// And a node made smaller than its picture shrinks the picture, rather than
// letting it hang out of the shape again.
await page.locator(".shape-node").nth(1).click();
await page.waitForTimeout(400);
const size = page.locator(".inspector .size-row").last().locator("input[type=number]");
await size.nth(0).fill("110");
await size.nth(0).blur();
await size.nth(1).fill("48");
await size.nth(1).blur();
await page.waitForTimeout(800);
const squeezed = await spill();
check(
  "and still fits when the node is made smaller than it",
  squeezed.top <= 0 && squeezed.bottom <= 0,
  `${squeezed.top}px out of the top, ${squeezed.bottom}px out of the bottom`,
);

check(
  "the picture shows on the button that changes it",
  await page.evaluate(() => {
    const swatch = document.querySelector(".icon-choose-preview");
    return Boolean(swatch?.querySelector("img")?.getAttribute("src"));
  }),
  "the preview swatch was empty",
);

check("nothing threw", errors.length === 0, errors.join(" | "));

await browser.close();
console.log(failed ? "\nicon picking FAILED" : "\npicking an icon picks it");
process.exit(failed ? 1 : 0);
