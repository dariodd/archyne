import { useRef } from "react";
import { BaseEdge, getSmoothStepPath, useReactFlow, type EdgeProps } from "@xyflow/react";
import type { FlowEdge } from "../model/types";
import { roundedPolyline, segmentMidpoints, type Point } from "../routing";
import { useGraphStore } from "../store";
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
 * out of the line. That is the draw.io gesture, and people arrive knowing it.
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
  sourcePosition,
  targetPosition,
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
  const { screenToFlowPosition } = useReactFlow();
  const addWaypoint = useGraphStore((s) => s.addWaypoint);
  const moveWaypoint = useGraphStore((s) => s.moveWaypoint);
  const removeWaypoint = useGraphStore((s) => s.removeWaypoint);
  const commitWaypoints = useGraphStore((s) => s.commitWaypoints);
  const t = useT();
  /** Which corner is being dragged, so pointermove knows what to move. */
  const dragging = useRef<number | null>(null);

  const points = data?.points ?? [];
  const route: Point[] = [{ x: sourceX, y: sourceY }, ...points, { x: targetX, y: targetY }];

  const [stepPath, stepLabelX, stepLabelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  // The label goes on the middle of the route, not the midpoint of a straight
  // line between the endpoints — for a bent edge that is often nowhere near
  // the edge itself.
  const half = route.length / 2;
  const bentLabel =
    route.length % 2 === 0
      ? {
          x: (route[half - 1].x + route[half].x) / 2,
          y: (route[half - 1].y + route[half].y) / 2,
        }
      : route[Math.floor(half)];

  const bent = points.length > 0;
  const path = bent ? roundedPolyline(route) : stepPath;
  const labelX = bent ? bentLabel.x : stepLabelX;
  const labelY = bent ? bentLabel.y : stepLabelY;

  const onMove = (e: React.PointerEvent<SVGCircleElement>) => {
    if (dragging.current === null) return;
    e.stopPropagation();
    moveWaypoint(
      id,
      dragging.current,
      screenToFlowPosition({ x: e.clientX, y: e.clientY }),
      false,
    );
  };

  const endDrag = (e: React.PointerEvent<SVGCircleElement>) => {
    if (dragging.current === null) return;
    e.stopPropagation();
    dragging.current = null;
    commitWaypoints();
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
      {selected && (
        <g className="edge-handles">
          {/* Hollow: drags a new corner out of this segment. On a straight
              edge the handle sits on the straight line rather than on the
              smooth-step path, which is where the corner will actually go. */}
          {segmentMidpoints(route).map((m) => (
            <circle
              key={`add-${m.index}`}
              className="edge-handle add"
              cx={m.x}
              cy={m.y}
              r={5}
              onPointerDown={(e) => {
                e.stopPropagation();
                addWaypoint(
                  id,
                  m.index,
                  screenToFlowPosition({ x: e.clientX, y: e.clientY }),
                  false,
                );
                dragging.current = m.index;
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={onMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              <title>{t("edge.addCorner")}</title>
            </circle>
          ))}
          {points.map((p, i) => (
            <circle
              key={`corner-${i}`}
              className="edge-handle corner"
              cx={p.x}
              cy={p.y}
              r={6}
              onPointerDown={(e) => {
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
          ))}
        </g>
      )}
    </>
  );
}
