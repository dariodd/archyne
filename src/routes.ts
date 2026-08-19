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
import { absoluteBoxes } from "./boxes";
import { isGroup, type AnyNode, type DiagramKind, type FlowEdge } from "./model/types";
import {
  attachPoint,
  axisOfSide,
  bestSides,
  facesAway,
  orthogonalRoute,
  outward,
  STUB,
  tidy,
  withStubs,
  type Axis,
  type Side,
} from "./orthogonal";
import { blocked, routeAround, type Rect } from "./avoid";
import { spreadBerths } from "./berths";
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
 * How far a loop back to the same node stands off it.
 *
 * `STUB` is the step a connection takes away from a face before it turns,
 * and a loop is two of those with a corner between them: any less and the
 * line would run along the node's own edge.
 */
const LOOP = STUB;

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

  // A connection from a node to itself. `bestSides` compares two centres,
  // and for one box against itself every difference is zero — it answered
  // "leave the bottom, arrive at the top", which asks the router to get from
  // under the node to above it. It did: out of the bottom, down past the
  // label, around the outside of the group and back. Two adjacent faces are
  // what a loop wants, and the corner between them is where it goes.
  //
  // An architecture diagram writes its faces into the file, and they are the
  // author's here as much as anywhere — `db:B --> L:db` is a loop round the
  // bottom-left corner. Only when they are adjacent, though: two opposite
  // faces are the very request that produced the tour, and one face twice
  // has no corner to go round.
  if (edge.source === edge.target) {
    const authored =
      kind === "architecture"
        ? { from: AUTHORED[edge.sourceHandle ?? ""], to: AUTHORED[edge.targetHandle ?? ""] }
        : null;
    const usable =
      authored?.from &&
      authored.to &&
      axisOfSide(authored.from) !== axisOfSide(authored.to) &&
      (authored as { from: Side; to: Side });
    const sides = usable || { from: "right" as Side, to: "top" as Side };
    return {
      start: attachPoint(fromBox, sides.from),
      end: attachPoint(fromBox, sides.to),
      from: axisOfSide(sides.from),
      to: axisOfSide(sides.to),
      fromSide: sides.from,
      toSide: sides.to,
    };
  }

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
  ends: Ends | null,
): Point[] {
  if (!ends) return [];

  // A loop back to the same node: out of one face, round the corner it shares
  // with the other, and in again. Squared off like everything else here
  // rather than drawn as mermaid's little arc, because it is the same
  // connector as the rest and takes the same corners, hops and label. No
  // obstacle search either — it never leaves the node it belongs to, so
  // there is nothing on the way.
  if (edge.source === edge.target) {
    const away = outward(ends.fromSide);
    const back = outward(ends.toSide);
    const out = { x: ends.start.x + away.x * LOOP, y: ends.start.y + away.y * LOOP };
    const into = { x: ends.end.x + back.x * LOOP, y: ends.end.y + back.y * LOOP };
    // The faces are adjacent, so one leg is horizontal and the other
    // vertical: the corner is simply where the two stubs meet.
    const corner = { x: away.x !== 0 ? out.x : into.x, y: away.y !== 0 ? out.y : into.y };
    const user = edge.data?.points ?? [];
    return tidy([ends.start, out, ...user, ...(user.length ? [] : [corner]), into, ends.end]);
  }

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
  ends: Map<string, Ends>;
  routes: Map<string, Point[]>;
} | null = null;

/**
 * Where every connection meets its two nodes, with the ones sharing a face
 * given a place each along it.
 *
 * Separate from `allRoutes` because the canvas wants these on their own: the
 * corner-dragging magnet lines a new corner up with the point a connection
 * actually leaves from, and an edge working that out from `endsOf` alone would
 * aim at the middle of a face its line no longer touches.
 */
export function allEnds(
  nodes: AnyNode[],
  edges: FlowEdge[],
  kind: DiagramKind,
): Map<string, Ends> {
  return fill(nodes, edges, kind).ends;
}

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
  return fill(nodes, edges, kind).routes;
}

/** The whole pass: where the connections meet, and where they then go. */
function fill(
  nodes: AnyNode[],
  edges: FlowEdge[],
  kind: DiagramKind,
): { ends: Map<string, Ends>; routes: Map<string, Point[]> } {
  if (cached && cached.nodes === nodes && cached.edges === edges && cached.kind === kind) {
    return cached;
  }
  const boxes = absoluteBoxes(nodes);

  // Faces first. Which face a connection uses depends only on the two boxes,
  // but *where* along it depends on every other connection using the same
  // face, so the two are settled one after the other and before any routing:
  // a route drawn from the middle of a face and then moved would take its
  // corners with it.
  const meeting = new Map<string, Ends>();
  for (const edge of edges) {
    const at = endsOf(edge, boxes, kind);
    if (at) meeting.set(edge.id, at);
  }
  const ends = spreadBerths(edges, meeting, boxes);

  const drawn = new Map<string, Point[]>();
  for (const edge of edges) {
    drawn.set(edge.id, routeOf(edge, nodes, boxes, ends.get(edge.id) ?? null));
  }
  // Only now, with all of them in hand, can two that lie on top of each other
  // be told apart and moved aside. The group frames go in as lines that cannot
  // move: a connection flush with a container's border vanishes into it.
  const frames = nodes.filter(isGroup).map((n) => boxes.get(n.id));
  const routes = spreadRuns(
    drawn,
    frames.filter((b): b is Rect => !!b),
  );
  cached = { nodes, edges, kind, ends, routes };
  return cached;
}
