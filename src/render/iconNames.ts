/**
 * Which icons a diagram asks for.
 *
 * Pure, and in a module of its own for a reason worth stating: it used to live
 * beside `renderSvgWithIcons`, which imports the icon machinery, which reaches
 * the bundled Iconify collections. Exporting this one function from the package
 * therefore pulled **1.8 MB of icon data** into a renderer whose main entry is
 * ten kilobytes.
 *
 * It reads node data and returns strings. Nothing about it needs to know how an
 * icon is found, which is precisely why a consumer can use it to find out what
 * to resolve and hand the markup back through `RenderOptions.icons`.
 */
import type { AnyNode } from "../model/types";

/** The icon names a set of nodes actually asks for, deduplicated. */
export function iconNames(nodes: AnyNode[]): string[] {
  const names = new Set<string>();
  for (const node of nodes) {
    if (node.type === "service" && node.data.icon) names.add(node.data.icon);
    if (node.type === "group" && node.data.icon) names.add(node.data.icon);
  }
  return [...names];
}
