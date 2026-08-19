import type { ElkNode } from "elkjs/lib/elk-api";
import type ELKType from "elkjs/lib/elk-api";
import type { AnyNode, Direction, FlowEdge } from "../model/types";
import { isGroup } from "../model/types";
import { measureNode } from "../measureNode";
import type { PositionMap } from "../model/positions";

type Elk = InstanceType<typeof ELKType>;

// ELK's engine is ~1.4 MB — load it only when a layout is requested.
let elkPromise: Promise<Elk> | null = null;

/** A one-node graph is instant; anything slower means the worker is not there. */
const PROBE_TIMEOUT_MS = 5000;

/**
 * Layout in a worker, falling back to the main thread.
 *
 * ELK is a GWT-compiled solver: a big graph pins a core for a second or more,
 * and on the main thread that is a frozen canvas — no repaint, no scroll, no
 * cancel. In a worker the UI stays live.
 *
 * Why the fallback stays:
 *
 *   - jsdom, under Vitest, has no `Worker` at all;
 *   - `worker-src` is a CSP directive, and index.html's policy is only the
 *     floor — a self-hoster or reverse proxy can send a narrower header, and
 *     the intersection wins. Auto-layout must not be what breaks.
 *
 * The Electron shell is *not* one of those cases, though it looks like it
 * should be: it loads the build over `file://` (`desktop/main.cjs` uses
 * `loadFile`), and Chromium blocks workers from file URLs in a browser — but
 * Electron does not. This was measured, in the packaged build, both ways; the
 * worker runs there. Don't "fix" that assumption in either direction without
 * re-measuring.
 *
 * Both paths produce byte-identical positions, so the fallback is invisible
 * beyond the pause it reintroduces.
 */
async function createElk(): Promise<Elk> {
  if (typeof Worker !== "undefined") {
    let elk: Elk | undefined;
    try {
      const [{ default: ELK }, { default: ElkWorker }] = await Promise.all([
        import("elkjs/lib/elk-api"),
        import("elkjs/lib/elk-worker.min.js?worker"),
      ]);
      elk = new ELK({ workerFactory: () => new ElkWorker() });
      // Constructing a worker can succeed and still never answer — a blocked
      // `file://` worker fails on its error event, not at `new Worker()`. So
      // prove a round-trip, and bound it, rather than trusting the constructor.
      await Promise.race([
        elk.layout({ id: "probe", children: [{ id: "n", width: 1, height: 1 }] }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("ELK worker did not respond")), PROBE_TIMEOUT_MS),
        ),
      ]);
      return elk;
    } catch (err) {
      elk?.terminateWorker();
      console.warn("ELK worker unavailable; laying out on the main thread instead.", err);
    }
  }
  const { default: BundledELK } = await import("elkjs/lib/elk.bundled.js");
  return new BundledELK();
}

function getElk() {
  if (!elkPromise) elkPromise = createElk();
  return elkPromise;
}

/**
 * The arrangements on offer, as ELK names them.
 *
 * All four are already in the bundle — the engine ships every algorithm it
 * has, so this costs nothing to add and would cost nothing to extend.
 *
 *   - **layered** puts the graph in ranks along one direction. It is what a
 *     flowchart is for, and it stays the default.
 *   - **rectpacking** packs the boxes into a compact rectangle instead of
 *     ranking them. On a drawing that is mostly containers — an imported
 *     architecture diagram, a set of subnets — it is the one that reads like
 *     the original, because the containers sit side by side rather than in a
 *     column.
 *   - **mrtree** is a tree, for a graph that branches out from one root.
 *   - **force** settles the nodes as if the connections were springs, which
 *     suits a densely connected graph with no obvious direction.
 *
 * A *style* is not a *direction*: `flowchart LR` is Mermaid's own syntax and
 * belongs to the document, and Mermaid has nothing to say about arrangement.
 * So this is chosen when the rearranging is asked for and is not remembered —
 * what the file keeps is the positions it produced, exactly as before.
 */
export const LAYOUT_STYLES = ["layered", "bands", "rectpacking", "mrtree", "force"] as const;

export type LayoutStyle = (typeof LAYOUT_STYLES)[number];

/**
 * What each style asks of ELK, at the root and inside a container.
 *
 * Four of the five are a single ELK algorithm run over the whole graph, so
 * their entry is one line. **bands** is not an algorithm at all — it is a
 * shape, described to ELK a level at a time:
 *
 *   - a container holding boxes lays them out in a *row*, left to right;
 *   - a container holding containers *stacks* them, by packing them into a
 *     column so narrow that only one fits across;
 *   - and the hierarchy is laid out one level at a time (`SEPARATE_CHILDREN`)
 *     rather than flattened, because flattening is what discards a
 *     container's own idea of how its contents should sit.
 *
 * The shape is worth having a name for because it is the one an architecture
 * drawing arrives in: tiers as bands, the things in a tier side by side. It
 * is what a subnet diagram, a layered system diagram or a swimlane looks like
 * when a person draws it, and none of ELK's algorithms produces it on their
 * own — `layered` ranks by *connections*, and tiers that have no connections
 * between them all land in the same rank, side by side.
 *
 * Two details are what make it a swimlane rather than a stack of oddments.
 * `elk.expandNodes` widens every band to the container, so their edges line
 * up instead of ending wherever their contents happen to stop — a ragged
 * right margin is the difference between tiers and a pile. And `elk.priority`
 * fixes the order: left to itself the packer sorts the bands by size, which
 * put the data tier above the application tier that feeds it. Priority
 * descends with the order the containers appear in the document, so the
 * drawing keeps the order its author wrote.
 */
/**
 * Containers, one above the other and all the same width.
 *
 * An aspect ratio this narrow leaves room for one band across, so the packer
 * has no choice but to make a column of them; `expandNodes` then widens each
 * to the container so their edges line up, which is the difference between
 * tiers and a pile.
 */
const STACKED: Record<string, string> = {
  "elk.algorithm": "box",
  "elk.aspectRatio": "0.05",
  "elk.box.packingMode": "SIMPLE",
  "elk.expandNodes": "true",
};

const ELK_OPTIONS: Record<
  LayoutStyle,
  {
    /**
     * `holdsGroups` says whether the level being laid out contains containers.
     * The top level is a level like any other — a diagram whose subgraphs sit
     * at the top of the file, which is how most of them are written, has to
     * band them exactly as it would band subnets inside a VPC.
     */
    root: (holdsGroups: boolean) => Record<string, string>;
    /** `order` is the container's place among its siblings, first at zero. */
    group?: (holdsGroups: boolean, order: number) => Record<string, string>;
  }
> = {
  layered: {
    root: () => ({ "elk.algorithm": "layered", "elk.hierarchyHandling": "INCLUDE_CHILDREN" }),
  },
  rectpacking: {
    root: () => ({
      "elk.algorithm": "rectpacking",
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
    }),
  },
  mrtree: {
    root: () => ({ "elk.algorithm": "mrtree", "elk.hierarchyHandling": "INCLUDE_CHILDREN" }),
  },
  force: {
    root: () => ({ "elk.algorithm": "force", "elk.hierarchyHandling": "INCLUDE_CHILDREN" }),
  },
  bands: {
    root: (holdsGroups) => ({
      "elk.hierarchyHandling": "SEPARATE_CHILDREN",
      ...(holdsGroups ? STACKED : { "elk.algorithm": "layered" }),
    }),
    group: (holdsGroups, order): Record<string, string> => ({
      // Descending, because ELK places the most important first and the
      // containers should come out in the order they were written.
      "elk.priority": String(1000 - order),
      ...(holdsGroups ? STACKED : { "elk.algorithm": "layered", "elk.direction": "RIGHT" }),
    }),
  },
};

const ELK_DIRECTION: Record<Direction, string> = {
  TD: "DOWN",
  TB: "DOWN",
  BT: "UP",
  LR: "RIGHT",
  RL: "LEFT",
};

/**
 * The direction an architecture file has already stated, in the only way it
 * can state one.
 *
 * `architecture-beta` has no direction statement. What it has instead is a
 * side on every end of every edge — `web:R --> L:db` says web's right face
 * meets db's left face, which is to say db stands to the right of web. Laid
 * out downwards anyway, that edge has to leave rightwards, drop past the
 * target and come back into its left face, passing behind the very node it
 * points at: the starter diagram arrived with its one arrow apparently
 * detached, ending on one side of the box while the arrowhead sat on the
 * other. The sides were the layout, and the layout was ignoring them.
 *
 * The dominant axis decides, because one graph gets one direction: a file
 * that is mostly a left-to-right chain lays out left to right even if a
 * service or two hangs below. Files with no sides at all — every other
 * family — answer null and keep the direction they came with.
 */
export function statedDirection(edges: FlowEdge[]): Direction | null {
  let across = 0;
  let down = 0;
  for (const e of edges) {
    for (const side of [e.data?.arch?.lhsDir, e.data?.arch?.rhsDir]) {
      if (side === "L" || side === "R") across++;
      else if (side === "T" || side === "B") down++;
    }
  }
  if (across === 0 && down === 0) return null;
  return across >= down ? "LR" : "TB";
}

/**
 * Compute positions for every node with one of ELK's algorithms. Groups
 * become ELK hierarchy nodes, so child coordinates come back parent-relative
 * — exactly what React Flow expects.
 *
 * The spacing options below are named for the layered algorithm and ignored
 * by the others, which is ELK's own convention for options that do not apply.
 */
export async function autoLayout(
  nodes: AnyNode[],
  edges: FlowEdge[],
  direction: Direction,
  style: LayoutStyle = "layered",
): Promise<PositionMap> {
  const childrenOf = new Map<string | undefined, AnyNode[]>();
  for (const n of nodes) {
    const list = childrenOf.get(n.parentId) ?? [];
    list.push(n);
    childrenOf.set(n.parentId, list);
  }

  /** Where each node sits among its siblings, for the styles that care. */
  const order = new Map<string, number>();
  for (const list of childrenOf.values()) list.forEach((n, i) => order.set(n.id, i));

  const toElk = (n: AnyNode): ElkNode => {
    if (isGroup(n)) {
      const children = childrenOf.get(n.id) ?? [];
      return {
        id: n.id,
        children: children.map(toElk),
        layoutOptions: {
          "elk.padding": "[top=40,left=16,bottom=16,right=16]",
          ...(ELK_OPTIONS[style].group?.(children.some(isGroup), order.get(n.id) ?? 0) ?? {}),
        },
      };
    }
    // The width the node already has, if it has one — so a node given a width
    // but no height is measured at that width rather than at its natural one.
    // This is the site where sizes decide the picture: ELK reserves exactly the
    // room it is told to, so a number that is wrong here is a diagram that is
    // wrong everywhere.
    const stated = n.measured?.width ?? n.width;
    const size = measureNode(n, undefined, stated);
    return {
      id: n.id,
      width: stated ?? size.width,
      height: n.measured?.height ?? n.height ?? size.height,
    };
  };

  const top = childrenOf.get(undefined) ?? [];
  const graph: ElkNode = {
    id: "root",
    layoutOptions: {
      "elk.direction": ELK_DIRECTION[statedDirection(edges) ?? direction],
      "elk.layered.spacing.nodeNodeBetweenLayers": "70",
      "elk.spacing.nodeNode": "40",
      ...ELK_OPTIONS[style].root(top.some(isGroup)),
    },
    children: top.map(toElk),
    edges: edges.map((e, i) => ({
      id: e.id || `e${i}`,
      sources: [e.source],
      targets: [e.target],
    })),
  };

  const elk = await getElk();
  const result = await elk.layout(graph);
  const positions: PositionMap = {};
  const collect = (elkNode: ElkNode, isRoot: boolean) => {
    if (!isRoot) {
      positions[elkNode.id] = {
        x: elkNode.x ?? 0,
        y: elkNode.y ?? 0,
        ...(elkNode.children?.length ? { w: elkNode.width ?? 0, h: elkNode.height ?? 0 } : {}),
      };
    }
    for (const c of elkNode.children ?? []) collect(c, false);
  };
  collect(result, true);
  return positions;
}
