/**
 * Every connection's route, worked out once.
 *
 * Each edge used to route itself while it rendered. That was tolerable while
 * a route depended only on its own two nodes, and stopped being so for two
 * reasons at once. The obstacle search is not cheap, and running it inside a
 * render meant running it again for every frame of a node drag. And an edge
 * cannot know where to hop over another edge without knowing where that other
 * edge went — which it cannot ask, because the other edge is deciding the
 * same thing at the same moment.
 *
 * So the routing happens here, for all of them together, and the answer is
 * kept until the nodes or the edges change. React renders every edge in one
 * pass from the same arrays, so the first edge to ask pays and the rest read.
 */
import { absoluteBoxes } from "./store";
import { isGroup, type AnyNode, type DiagramKind, type FlowEdge } from "./model/types";
import {
  attachPoint,
  axisOfSide,
  bestSides,
  facesAway,
  orthogonalRoute,
  tidy,
  withStubs,
  type Axis,
  type Side,
} from "./orthogonal";
import { blocked, routeAround, type Rect } from "./avoid";
import { spreadRuns } from "./spread";
import type { Point } from "./routing";

/** The letters mermaid writes into an architecture diagram, as faces. */
const AUTHORED: Record<string, Side> = {
  L: "left",
  R: "right",
  T: "top",
  B: "bottom",
};

/**
 * The whole connection routed around what is in its way, leg by leg.
 *
 * Leg by leg rather than end to end because the corners the user placed are
 * not suggestions: the line goes through them, and only the way it gets from
 * one to the next is the router's business. A leg with no way round is left
 * as it was — a line through a box is poor, a line that vanishes is worse.
 */
function aroundObstacles(anchors: Point[], from: Axis, to: Axis, obstacles: Rect[]): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i];
    const b = anchors[i + 1];
    const first = i === 0 ? from : Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? "x" : "y";
    const last =
      i === anchors.length - 2 ? to : Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? "x" : "y";
    const leg =
      routeAround(a, b, first, last, obstacles) ?? orthogonalRoute([a, b], first, last);
    out.push(...(out.length ? leg.slice(1) : leg));
  }
  return tidy(out);
}

/** Where a connection meets its two nodes, and by which faces. */
export interface Ends {
  start: Point;
  end: Point;
  from: Axis;
  to: Axis;
  fromSide: Side;
  toSide: Side;
}

/**
 * The faces a connection uses.
 *
 * An architecture diagram writes them into the file (`web:R --> L:db`), where
 * they are the author's decision and not a guess of ours. Everywhere else
 * they follow the geometry, which is Visio's dynamic glue.
 */
export function endsOf(
  edge: FlowEdge,
  boxes: Map<string, Rect>,
  kind: DiagramKind,
): Ends | null {
  const fromBox = boxes.get(edge.source);
  const toBox = boxes.get(edge.target);
  if (!fromBox || !toBox) return null;

  const named =
    kind === "architecture"
      ? {
          from: AUTHORED[edge.sourceHandle ?? ""] ?? "right",
          to: AUTHORED[edge.targetHandle ?? ""] ?? "left",
        }
      : null;

  // A named face is the author's decision and is kept — unless the nodes have
  // since been arranged so that it points away from the other one. Obeying it
  // then sends the line back across a node's own box, which is how an
  // arrowhead ends up hidden behind a block.
  const stale =
    named !== null &&
    (facesAway(fromBox, named.from, toBox) || facesAway(toBox, named.to, fromBox));
  const sides = named && !stale ? named : bestSides(fromBox, toBox);

  return {
    start: attachPoint(fromBox, sides.from),
    end: attachPoint(toBox, sides.to),
    from: axisOfSide(sides.from),
    to: axisOfSide(sides.to),
    fromSide: sides.from,
    toSide: sides.to,
  };
}

/** One connection's route: squared off, and around whatever is in the way. */
function routeOf(
  edge: FlowEdge,
  nodes: AnyNode[],
  boxes: Map<string, Rect>,
  kind: DiagramKind,
): Point[] {
  const ends = endsOf(edge, boxes, kind);
  if (!ends) return [];

  // A connector leaves a face perpendicular to it before it turns; without
  // that, two nodes joined side to side down a column produced a line flat
  // against both of them, arrowhead included.
  const anchors = withStubs(
    [ends.start, ...(edge.data?.points ?? []), ends.end],
    ends.fromSide,
    ends.toSide,
  );

  // Straight and curved both go directly from corner to corner; only the
  // drawing differs, and that is the edge's business, not the router's. They
  // also skip the obstacle search, since a line the user asked to be direct
  // is not one to send round the houses.
  if (edge.data?.style?.route === "straight" || edge.data?.style?.route === "curved") {
    return tidy(anchors);
  }

  const squared = orthogonalRoute(anchors, ends.from, ends.to);

  // Every node except the two it joins, which it must be able to touch.
  // Groups are left out — a connection between two members of one would
  // otherwise be walled in by its own container.
  const obstacles = [...boxes.entries()]
    .filter(([id]) => id !== edge.source && id !== edge.target)
    .filter(([id]) => !isGroup(nodes.find((n) => n.id === id)!))
    .map(([, b]) => b);

  // Cheap, and it decides whether the expensive thing runs at all.
  const obstructed = squared.some((q, i) => i > 0 && blocked(squared[i - 1], q, obstacles));
  return obstructed ? aroundObstacles(anchors, ends.from, ends.to, obstacles) : squared;
}

let cached: {
  nodes: AnyNode[];
  edges: FlowEdge[];
  kind: DiagramKind;
  routes: Map<string, Point[]>;
} | null = null;

/**
 * Every edge's route, by id.
 *
 * Held by the identity of the arrays it was worked out from, which is what
 * makes it free for the second edge to ask and every one after: the store
 * hands out the same arrays until something actually changes.
 */
export function allRoutes(
  nodes: AnyNode[],
  edges: FlowEdge[],
  kind: DiagramKind,
): Map<string, Point[]> {
  if (cached && cached.nodes === nodes && cached.edges === edges && cached.kind === kind) {
    return cached.routes;
  }
  const boxes = absoluteBoxes(nodes);
  const drawn = new Map<string, Point[]>();
  for (const edge of edges) drawn.set(edge.id, routeOf(edge, nodes, boxes, kind));
  // Only now, with all of them in hand, can two that lie on top of each other
  // be told apart and moved aside.
  const routes = spreadRuns(drawn);
  cached = { nodes, edges, kind, routes };
  return routes;
}
