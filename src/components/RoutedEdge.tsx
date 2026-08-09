import { useRef } from "react";
import { BaseEdge, useReactFlow, type EdgeProps } from "@xyflow/react";
import type { FlowEdge } from "../model/types";
import {
  CORNER_RADIUS,
  curvedPolyline,
  nearestSegment,
  roundedPolyline,
  straightPolyline,
  type Point,
} from "../routing";
import { absoluteBoxes, useGraphStore } from "../store";
import { useGraphView } from "./useGraphView";
import { prune, segmentsOf, slideRun, type Axis } from "../orthogonal";
import { allRoutes, endsOf } from "../routes";
import { crossings } from "../jumps";
import { clearGuides, computeSnap, GRID, setGuides, type Box } from "../guides";
import { useT } from "../i18n";

/**
 * The ordinary edge, plus the corners a user can put in it.
 *
 * With no corners this is exactly React Flow's smooth-step edge, down to the
 * label position — which is the point. Being the normal edge type is what
 * makes the *first* corner reachable: the handles have to already be there
 * before there is anything to route through.
 *
 * There are two kinds of handle, and they appear only on a selected edge: a
 * filled one on each corner, which moves it or (double-clicked) removes it,
 * and a hollow one in the middle of each segment, which drags a new corner
 * out of the line. The line itself is draggable too, anywhere along it: in
 * draw.io and Visio you bend an edge by pulling on it, not by finding the dot
 * drawn halfway along, and having to aim for the dot was most of what made
 * this feel stiff next to them.
 *
 * A dragged corner follows the pointer. It briefly obeyed the node grid too,
 * for the sake of one canvas with one set of physics, and that was wrong: a
 * node occupies a cell, a corner is a place you are pointing at, and a corner
 * you cannot put *there* is a corner fighting you. What is left is a small
 * magnet towards the nodes and towards the two route points either side —
 * enough to square a bend off, since a corner sharing its x with the point
 * before it *is* a vertical segment — and Alt to switch even that off.
 *
 * Dragging is not the only way in — the inspector lists the same corners as
 * numbers, and can add and remove them (WCAG 2.5.7).
 */
export function RoutedEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  style,
  markerEnd,
  markerStart,
  selected,
  data,
  label,
  labelStyle,
  labelShowBg,
  labelBgStyle,
  labelBgPadding,
  labelBgBorderRadius,
}: EdgeProps<FlowEdge>) {
  const { screenToFlowPosition, getZoom } = useReactFlow();
  const addWaypoint = useGraphStore((s) => s.addWaypoint);
  const moveWaypoint = useGraphStore((s) => s.moveWaypoint);
  const removeWaypoint = useGraphStore((s) => s.removeWaypoint);
  const commitWaypoints = useGraphStore((s) => s.commitWaypoints);
  const setWaypoints = useGraphStore((s) => s.setWaypoints);
  const setEdgeStyle = useGraphStore((s) => s.setEdgeStyle);
  const t = useT();
  /** Which corner is being dragged, so pointermove knows what to move. */
  const dragging = useRef<number | null>(null);
  /**
   * A press on a hollow handle that has not yet travelled far enough to mean
   * anything. The corner used to be inserted on pointerdown, so brushing a
   * handle — press, release, no movement — bent the edge and wrote the
   * comment into the file. Now the gesture has to commit to being a drag.
   */
  const pending = useRef<{ index: number; x: number; y: number } | null>(null);
  /** Where the pointer took hold of the label, relative to its offset. */
  const labelDrag = useRef<Point | null>(null);

  const points = data?.points ?? [];

  /**
   * The route, and everyone else's.
   *
   * Both come from one place: an edge cannot decide where to hop over another
   * without knowing where that other one went, and working it out here, per
   * edge, per render, was also the thing that made dragging a node expensive.
   */
  // From the context when a canvas is drawing something other than the open
  // document — a preview — and from the store otherwise.
  const { nodes, edges, kind, editable, latest } = useGraphView();
  const routes = allRoutes(nodes, edges, kind);
  const drawn = routes.get(id) ?? [];
  // Not asserted: switching document replaces the graph, and React renders
  // this edge once more from the old id against the new arrays before it
  // unmounts. Insisting the edge is there threw, and took the whole
  // application down with it — an edge that has gone simply draws nothing.
  const edge = edges.find((e) => e.id === id);
  const ends = edge ? endsOf(edge, absoluteBoxes(nodes), kind) : null;
  const fromAxis = ends?.from ?? "x";
  const toAxis = ends?.to ?? "x";
  const startAt = ends?.start ?? { x: sourceX, y: sourceY };
  const endAt = ends?.end ?? { x: targetX, y: targetY };

  const runs = segmentsOf(drawn);
  /** Where the other connections cross this one, so it can hop them. */
  const hops = crossings(
    drawn,
    [...routes.entries()].filter(([other]) => other !== id).map(([, r]) => r),
  );
  /**
   * Orthogonal is squared off with rounded corners and hops; straight joins
   * its corners with plain lines; curved eases through them. A hop only makes
   * sense on a run that is level, so the other two do without.
   */
  const route = data?.style?.route ?? "orthogonal";
  const path =
    route === "orthogonal"
      ? roundedPolyline(drawn, CORNER_RADIUS, hops)
      : route === "curved"
        ? curvedPolyline(drawn)
        : straightPolyline(drawn);

  // The label goes on the middle of the route, not the midpoint of a straight
  // line between the endpoints — for a bent edge that is often nowhere near
  // the edge itself.
  const half = drawn.length / 2;
  const middle =
    drawn.length === 0
      ? { x: sourceX, y: sourceY }
      : drawn.length % 2 === 0
        ? {
            x: (drawn[half - 1].x + drawn[half].x) / 2,
            y: (drawn[half - 1].y + drawn[half].y) / 2,
          }
        : drawn[Math.floor(half)];
  // The label sits in the middle of the route unless it has been dragged off
  // it, and the offset is what the file remembers — the middle moves when the
  // nodes do, and the label should move with it rather than stay behind.
  const labelAt = data?.style?.label ?? { x: 0, y: 0 };
  const labelX = middle.x + labelAt.x;
  const labelY = middle.y + labelAt.y;

  /** How far a press has to travel before it counts as dragging a corner out. */
  const SLOP = 3;

  /**
   * Where the corner the pointer is dragging should actually land.
   *
   * The corner goes where the pointer goes. It used to be quantised to the
   * node grid first, on the reasoning that one canvas should have one set of
   * physics — but a corner is not a node. A node occupies a cell; a corner is
   * a place you are pointing at, and rounding it to the nearest 12 units
   * means you cannot nudge a line slightly clear of a label. So: free, with a
   * magnet.
   *
   * The magnet is small, and reaches only what is worth lining up with — the
   * nodes, and the two route points either side, which is what squares a bend
   * off. Six screen pixels, so it feels the same at every zoom, and Alt turns
   * it off for the placement that refuses to be tidy.
   *
   * `inserting` says whether the corner is still only intended: until the
   * drag commits, the route has one fewer point, so the neighbours to line up
   * with are the two ends of the segment being pulled out of.
   */
  const place = (
    client: { x: number; y: number },
    index: number,
    inserting: boolean,
    free = false,
  ): Point => {
    // `snapToGrid: false` is the whole of it. This helper quantises to the
    // canvas grid by default — the flow turns snapping on for nodes, and the
    // helper reads that setting rather than taking a view of its own — so
    // every corner arrived pre-rounded to the nearest 12 whatever this
    // function then did with it.
    const at = screenToFlowPosition(client, { snapToGrid: false });
    if (free) {
      clearGuides();
      return at;
    }

    // The corners either side, in the stored list — the ends included, since
    // lining up with the node you leave is exactly how a bend squares off.
    const anchors: Point[] = [startAt, ...points, endAt];
    const neighbours = inserting
      ? [anchors[index], anchors[index + 1]]
      : [anchors[index], anchors[index + 2]];
    const statics: Box[] = [
      ...absoluteBoxes(latest().nodes).values(),
      ...neighbours.filter(Boolean).map((p) => ({ x: p.x, y: p.y, w: 0, h: 0 })),
    ];

    // Deliberately not `threshold()`. That has a half-grid floor, which is
    // there because React Flow quantises a *node* before the guides ever see
    // it; nothing quantises a corner, so the floor would only make the magnet
    // grabby.
    const snap = computeSnap({ x: at.x, y: at.y, w: 0, h: 0 }, statics, 6 / getZoom());
    setGuides(snap.guides);
    return { x: at.x + snap.dx, y: at.y + snap.dy };
  };

  const onMove = (e: React.PointerEvent<SVGElement>) => {
    const start = pending.current;
    if (start) {
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < SLOP) return;
      e.stopPropagation();
      // Far enough to be a drag: now the corner exists, and the rest of the
      // gesture moves it like any other.
      addWaypoint(
        id,
        start.index,
        place({ x: e.clientX, y: e.clientY }, start.index, true, e.altKey),
        false,
      );
      dragging.current = start.index;
      pending.current = null;
      return;
    }
    if (dragging.current === null) return;
    e.stopPropagation();
    moveWaypoint(
      id,
      dragging.current,
      place({ x: e.clientX, y: e.clientY }, dragging.current, false, e.altKey),
      false,
    );
  };

  /**
   * Sliding a run of an orthogonal route, which is the gesture draw.io and
   * Visio are built around: the run follows the pointer on one axis only, and
   * the path stays square.
   *
   * The index is re-found on every move rather than trusted. Sliding the run
   * at either end inserts a corner beside the node — the endpoint cannot come
   * along — and that shifts every index after it.
   */
  const slide = useRef<{ index: number; axis: Axis; at: number } | null>(null);

  const onSlide = (e: React.PointerEvent<SVGElement>) => {
    const held = slide.current;
    if (!held) return;
    e.stopPropagation();
    const at = screenToFlowPosition({ x: e.clientX, y: e.clientY }, { snapToGrid: false });
    const value = held.axis === "x" ? at.y : at.x;

    // Find the run again by where it was last put, rather than trusting the
    // index: sliding the run at either end inserts a corner beside the node,
    // and that shifts every index after it.
    const now = segmentsOf(drawn);
    const found = now.findIndex(
      (r) =>
        r.axis === held.axis &&
        Math.abs((held.axis === "x" ? r.from.y : r.from.x) - held.at) < 0.5,
    );
    const index = found >= 0 ? found : held.index;

    setWaypoints(id, slideRun(points, drawn, index, value), false);
    slide.current = { index, axis: held.axis, at: value };
  };

  /**
   * On release, throw away every corner the router would have produced by
   * itself. Pinning a run takes two corners and creates runs that can be
   * pinned in their turn, so the list grows with each slide; kept up during
   * the drag it would pull points out from under the gesture, so it happens
   * once, at the end, before the route is written to the file.
   */
  const settle = () => {
    const live = latest().edges.find((e) => e.id === id)?.data?.points ?? [];
    const kept = prune(live, startAt, endAt, fromAxis, toAxis);
    if (kept.length !== live.length) setWaypoints(id, kept, false);
    commitWaypoints();
  };

  const endSlide = (e: React.PointerEvent<SVGElement>) => {
    if (!slide.current) return;
    e.stopPropagation();
    slide.current = null;
    settle();
  };

  /**
   * Move a corner from the keyboard.
   *
   * One unit a press, because the point of having this at all is placing a
   * corner exactly; a grid cell with Shift, for crossing distance. Delete
   * takes the corner away, which is the other half of what the mouse can do
   * here. Each press stands on its own in the undo history — a nudge is a
   * deliberate act, not a frame of a drag.
   */
  const nudge = (e: React.KeyboardEvent<SVGElement>, index: number, at: Point) => {
    const step = e.shiftKey ? GRID : 1;
    const by: Record<string, Point> = {
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step },
      ArrowDown: { x: 0, y: step },
    };
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      e.stopPropagation();
      removeWaypoint(id, index);
      return;
    }
    const delta = by[e.key];
    if (!delta) return;
    // Both, and in this order: React Flow moves the selection on the arrows,
    // and the canvas would scroll underneath.
    e.preventDefault();
    e.stopPropagation();
    moveWaypoint(id, index, { x: at.x + delta.x, y: at.y + delta.y });
  };

  const endDrag = (e: React.PointerEvent<SVGElement>) => {
    // A press that never travelled: the edge is left exactly as it was.
    pending.current = null;
    clearGuides();
    if (dragging.current === null) return;
    e.stopPropagation();
    dragging.current = null;
    settle();
  };

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={style}
        markerEnd={markerEnd}
        markerStart={markerStart}
        interactionWidth={14}
        label={label}
        labelX={labelX}
        labelY={labelY}
        labelStyle={labelStyle}
        labelShowBg={labelShowBg}
        labelBgStyle={labelBgStyle}
        labelBgPadding={labelBgPadding}
        labelBgBorderRadius={labelBgBorderRadius}
      />
      {/* Pull the line anywhere and the run under the pointer slides, which
          is the gesture in draw.io and Visio: a connector is not a rubber
          band with points pulled out of it, it is a run of pipes you shift.
          Nothing happens until the drag passes the threshold, so a plain
          click still reaches the edge underneath and selects it. */}
      <path
        className="edge-grab"
        d={path}
        fill="none"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          const at = screenToFlowPosition(
            { x: e.clientX, y: e.clientY },
            { snapToGrid: false },
          );
          const run = runs[nearestSegment(drawn, at)];
          if (!run) return;
          slide.current = {
            index: run.index,
            axis: run.axis,
            at: run.axis === "x" ? run.from.y : run.from.x,
          };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={onSlide}
        onPointerUp={endSlide}
        onPointerCancel={endSlide}
      />
      {/* Every affordance below edits the document, so none of them belongs
          on a canvas that is only showing one. */}
      {editable && label && (
        /* React Flow draws the label itself, from inside `BaseEdge`, and
           there is no way to hand it a pointer handler through the props.
           So a transparent patch is laid over it and takes the drag: the
           label follows, and what is stored is the offset from the middle of
           the route, so it keeps its place when the nodes move. */
        <rect
          className="edge-label-grab"
          x={labelX - 26}
          y={labelY - 11}
          width={52}
          height={22}
          rx={4}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.stopPropagation();
            const at = screenToFlowPosition(
              { x: e.clientX, y: e.clientY },
              { snapToGrid: false },
            );
            labelDrag.current = { x: at.x - labelAt.x, y: at.y - labelAt.y };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const held = labelDrag.current;
            if (!held) return;
            e.stopPropagation();
            const at = screenToFlowPosition(
              { x: e.clientX, y: e.clientY },
              { snapToGrid: false },
            );
            setEdgeStyle(id, { label: { x: at.x - held.x, y: at.y - held.y } }, false);
          }}
          onPointerUp={(e) => {
            if (!labelDrag.current) return;
            e.stopPropagation();
            labelDrag.current = null;
            commitWaypoints();
          }}
          onDoubleClick={(e) => {
            // Back to the middle, which is otherwise fiddly to hit by hand.
            e.stopPropagation();
            setEdgeStyle(id, { label: { x: 0, y: 0 } });
          }}
        >
          <title>{t("edge.moveLabel")}</title>
        </rect>
      )}
      {editable && selected && (
        <g className="edge-handles">
          {/* Hollow: drags a new corner out of this segment. On a straight
              edge the handle sits on the straight line rather than on the
              smooth-step path, which is where the corner will actually go. */}
          {runs.map((s) => (
            <g key={`run-${s.index}`}>
              <circle
                className={`edge-hit ${s.axis === "x" ? "ns" : "ew"}`}
                cx={s.mid.x}
                cy={s.mid.y}
                r={12}
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  e.stopPropagation();
                  slide.current = {
                    index: s.index,
                    axis: s.axis,
                    at: s.axis === "x" ? s.from.y : s.from.x,
                  };
                  e.currentTarget.setPointerCapture(e.pointerId);
                }}
                onPointerMove={onSlide}
                onPointerUp={endSlide}
                onPointerCancel={endSlide}
              >
                <title>{t("edge.moveSegment")}</title>
              </circle>
              {/* A bar lying along the run it moves, rather than a dot: the
                  shape says which way the thing under it travels. */}
              <rect
                className="edge-handle run"
                x={s.axis === "x" ? s.mid.x - 7 : s.mid.x - 2.5}
                y={s.axis === "x" ? s.mid.y - 2.5 : s.mid.y - 7}
                width={s.axis === "x" ? 14 : 5}
                height={s.axis === "x" ? 5 : 14}
                rx={2}
              />
            </g>
          ))}
          {points.map((p, i) => (
            <g key={`corner-${i}`}>
              <circle
                className="edge-hit"
                cx={p.x}
                cy={p.y}
                r={12}
                /* Reachable by Tab, and moved by the arrow keys once it is:
                   dragging a corner is a drag, and WCAG 2.5.7 asks that
                   everything a drag does be possible without one. */
                tabIndex={0}
                role="button"
                aria-label={t("edge.cornerNamed", { index: i + 1, total: points.length })}
                onKeyDown={(e) => nudge(e, i, p)}
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  e.stopPropagation();
                  dragging.current = i;
                  e.currentTarget.setPointerCapture(e.pointerId);
                }}
                onPointerMove={onMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  removeWaypoint(id, i);
                }}
              >
                <title>{t("edge.removeCorner")}</title>
              </circle>
              <circle className="edge-handle corner" cx={p.x} cy={p.y} r={6} />
            </g>
          ))}
        </g>
      )}
    </>
  );
}
