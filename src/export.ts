import { toPng, toSvg } from "html-to-image";
import type { AnyNode } from "./model/types";
import { estimateSize, isGroup } from "./model/types";
import { stripPositions } from "./model/positions";
import { withMermaid } from "./model/fromMermaid";

export interface ExportOptions {
  /** What to render: the canvas as-is, or mermaid's own renderer. */
  source: "canvas" | "mermaid";
  format: "png" | "svg";
  background: "dark" | "light" | "transparent";
  /** PNG pixel density. */
  scale: 1 | 2 | 3;
  /** Margin around the diagram (canvas source only). */
  padding: number;
  /** mermaid theme (mermaid source only). */
  theme: "default" | "dark" | "neutral" | "forest" | "base";
}

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  source: "canvas",
  format: "png",
  background: "dark",
  scale: 2,
  padding: 48,
  theme: "dark",
};

const BG: Record<ExportOptions["background"], string | undefined> = {
  dark: "#12141a",
  light: "#ffffff",
  transparent: undefined,
};

/* ---------- canvas source ---------- */

/**
 * Bounds of all nodes in absolute coordinates. Child positions are
 * parent-relative in our store, so walk the parent chain ourselves.
 */
function computeBounds(nodes: AnyNode[]) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const n of nodes) {
    let x = n.position.x;
    let y = n.position.y;
    let p = n.parentId;
    while (p) {
      const pn = byId.get(p);
      if (!pn) break;
      x += pn.position.x;
      y += pn.position.y;
      p = pn.parentId;
    }
    const est = estimateSize(n);
    const w = n.measured?.width ?? (isGroup(n) ? Number(n.style?.width ?? 320) : est.width);
    const h = n.measured?.height ?? (isGroup(n) ? Number(n.style?.height ?? 220) : est.height);
    x1 = Math.min(x1, x);
    y1 = Math.min(y1, y);
    x2 = Math.max(x2, x + w);
    y2 = Math.max(y2, y + h);
  }
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

function frameFor(nodes: AnyNode[], padding: number) {
  const bounds = computeBounds(nodes);
  const MAX = 4000;
  // 1:1 scale with a fixed pixel margin; only scale down if the diagram
  // would exceed the size cap.
  const zoom = Math.min(
    1,
    (MAX - padding * 2) / bounds.width,
    (MAX - padding * 2) / bounds.height,
  );
  return {
    width: Math.max(240, Math.ceil(bounds.width * zoom + padding * 2)),
    height: Math.max(160, Math.ceil(bounds.height * zoom + padding * 2)),
    viewport: { x: -bounds.x * zoom + padding, y: -bounds.y * zoom + padding, zoom },
  };
}

/**
 * Capture the React Flow viewport re-framed around the given transform.
 * Marker defs living outside the viewport are temporarily cloned in so
 * arrowheads survive the capture.
 */
/**
 * The stylesheet rules that paint SVG, gathered from the live document.
 *
 * html-to-image inlines each element's computed style, but only for HTML
 * elements — SVG children are cloned without one. It does not copy
 * stylesheets either, so a rule like `.shape-fill { fill: … }` simply
 * vanished from the export, and every node shape fell back to the SVG
 * default fill: **black**. Boxes came out solid black on any background.
 *
 * Rather than restate those rules here, where they would drift from the ones
 * that actually paint the app, this collects any rule that sets `fill`,
 * `stroke` or `stroke-width`. That is exactly the set html-to-image drops,
 * and it stays correct as the stylesheet changes.
 */
function svgPaintRules(): string {
  const out: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      // A cross-origin stylesheet cannot be read. Ours is same-origin; a
      // browser extension's is not, and is not ours to export anyway.
      continue;
    }
    for (const rule of Array.from(rules)) {
      if (!(rule instanceof CSSStyleRule)) continue;
      const s = rule.style;
      if (s.fill || s.stroke || s.strokeWidth) out.push(rule.cssText);
    }
  }
  return out.join("\n");
}

async function captureCanvas(
  format: "png" | "svg",
  width: number,
  height: number,
  viewport: { x: number; y: number; zoom: number },
  background: string | undefined,
  scale: number,
): Promise<string> {
  const el = document.querySelector<HTMLElement>(".react-flow__viewport");
  if (!el) return "";

  const SVG_NS = "http://www.w3.org/2000/svg";
  const temp = document.createElementNS(SVG_NS, "svg");
  temp.setAttribute("width", "0");
  temp.setAttribute("height", "0");
  const defs = document.createElementNS(SVG_NS, "defs");
  document.querySelectorAll("marker").forEach((m) => defs.appendChild(m.cloneNode(true)));
  temp.appendChild(defs);
  el.appendChild(temp);

  // Carried inside the captured element so it is cloned along with it; the
  // custom properties it relies on are already inlined onto the ancestors.
  const paint = document.createElement("style");
  paint.textContent = svgPaintRules();
  el.appendChild(paint);

  try {
    const options = {
      ...(background ? { backgroundColor: background } : {}),
      width,
      height,
      style: {
        width: `${width}px`,
        height: `${height}px`,
        transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
      },
      filter: (node: HTMLElement) =>
        !node.classList?.contains("react-flow__handle") &&
        !node.classList?.contains("react-flow__resize-control"),
      ...(format === "png" ? { pixelRatio: scale } : {}),
    };
    return format === "png" ? await toPng(el, options) : await toSvg(el, options);
  } finally {
    temp.remove();
    paint.remove();
  }
}

/* ---------- mermaid source ---------- */

function prepareSvg(svg: string, background: string | undefined) {
  let width = 800;
  let height = 600;
  const vb = svg.match(/viewBox="([\d.\s-]+)"/);
  if (vb) {
    const p = vb[1].trim().split(/\s+/).map(Number);
    if (p.length === 4 && p[2] > 0 && p[3] > 0) {
      width = Math.ceil(p[2]);
      height = Math.ceil(p[3]);
    }
  }
  const out = svg.replace(/<svg([^>]*)>/, (_m, attrs: string) => {
    const cleaned = attrs
      .replace(/\s(width|height)="[^"]*"/g, "")
      .replace(/\sstyle="[^"]*"/g, "");
    const bgStyle = background ? ` style="background:${background}"` : "";
    return `<svg${cleaned} width="${width}" height="${height}"${bgStyle}>`;
  });
  return { svg: out, width, height };
}

function svgToPng(
  svgText: string,
  width: number,
  height: number,
  scale: number,
  background: string | undefined,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(width * scale);
      canvas.height = Math.ceil(height * scale);
      const ctx = canvas.getContext("2d")!;
      if (background) {
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("could not rasterize the mermaid SVG"));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
  });
}

async function renderMermaid(opts: ExportOptions, code: string): Promise<string> {
  const src = `%%{init: {"theme": "${opts.theme}"}}%%\n${stripPositions(code)}`;
  const raw = await withMermaid(async (m) => (await m.render(`export-${Date.now()}`, src)).svg);
  const { svg, width, height } = prepareSvg(raw, BG[opts.background]);
  if (opts.format === "svg") {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }
  return svgToPng(svg, width, height, opts.scale, BG[opts.background]);
}

/* ---------- public API ---------- */

/** Build the export as a data URL, per the given options. */
export async function buildExport(
  opts: ExportOptions,
  nodes: AnyNode[],
  code: string,
): Promise<string> {
  if (opts.source === "mermaid") return renderMermaid(opts, code);
  if (nodes.length === 0) return "";
  const { width, height, viewport } = frameFor(nodes, opts.padding);
  return captureCanvas(opts.format, width, height, viewport, BG[opts.background], opts.scale);
}

export function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

/** Test hook: canvas PNG with default options. */
export async function exportDataUrlForTest(nodes: AnyNode[]): Promise<string> {
  if (nodes.length === 0) return "";
  const { width, height, viewport } = frameFor(nodes, 48);
  return captureCanvas("png", width, height, viewport, BG.dark, 2);
}
