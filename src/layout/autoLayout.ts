import type { ElkNode } from "elkjs/lib/elk-api";
import type ELKType from "elkjs/lib/elk-api";
import type { AnyNode, Direction, FlowEdge } from "../model/types";
import { estimateSize, isGroup } from "../model/types";
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
 * Compute positions for every node with ELK's layered algorithm. Groups
 * become ELK hierarchy nodes, so child coordinates come back parent-relative
 * — exactly what React Flow expects.
 */
export async function autoLayout(
  nodes: AnyNode[],
  edges: FlowEdge[],
  direction: Direction,
): Promise<PositionMap> {
  const childrenOf = new Map<string | undefined, AnyNode[]>();
  for (const n of nodes) {
    const list = childrenOf.get(n.parentId) ?? [];
    list.push(n);
    childrenOf.set(n.parentId, list);
  }

  const toElk = (n: AnyNode): ElkNode => {
    if (isGroup(n)) {
      return {
        id: n.id,
        children: (childrenOf.get(n.id) ?? []).map(toElk),
        layoutOptions: { "elk.padding": "[top=40,left=16,bottom=16,right=16]" },
      };
    }
    const size = estimateSize(n);
    return {
      id: n.id,
      width: n.measured?.width ?? n.width ?? size.width,
      height: n.measured?.height ?? n.height ?? size.height,
    };
  };

  const graph: ElkNode = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": ELK_DIRECTION[statedDirection(edges) ?? direction],
      "elk.layered.spacing.nodeNodeBetweenLayers": "70",
      "elk.spacing.nodeNode": "40",
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
    },
    children: (childrenOf.get(undefined) ?? []).map(toElk),
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
