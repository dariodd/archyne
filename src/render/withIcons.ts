/**
 * `renderSvg`, with the icons resolved for you.
 *
 * The emitter takes icons already resolved, as markup, and that is deliberate:
 * looking one up is asynchronous — `getIconHtml` lazy-loads an Iconify
 * collection, which for a diagram using none is a load that never happens — and
 * a renderer that is `async` because of one family puts an `await` in front of
 * every caller and stops being a pure function of its inputs.
 *
 * But most callers do just want a picture. This is that convenience, kept in
 * its own module so the pure emitter does not import the icon machinery and the
 * bundle of somebody who never draws an architecture diagram does not carry it.
 */
import { getIconHtml } from "../icons";
import type { AnyNode, DiagramKind, FlowEdge } from "../model/types";
import { renderSvg, type RenderOptions } from "./renderSvg";
import { iconNames } from "./iconNames";

/**
 * Resolve every icon the diagram names, then draw it.
 *
 * An icon that cannot be resolved is left out rather than failing the render:
 * `getIconHtml` already falls back to a built-in for an unknown name, and a
 * diagram missing one logo is still a diagram.
 */
export async function renderSvgWithIcons(
  nodes: AnyNode[],
  edges: FlowEdge[],
  kind: DiagramKind,
  options: RenderOptions = {},
): Promise<string> {
  const names = iconNames(nodes);
  const resolved = await Promise.all(
    names.map(async (name) => {
      try {
        return [name, await getIconHtml(name)] as const;
      } catch {
        return [name, ""] as const;
      }
    }),
  );
  const icons = { ...options.icons };
  for (const [name, markup] of resolved) if (markup) icons[name] = markup;
  return renderSvg(nodes, edges, kind, { ...options, icons });
}

export { iconNames };
