import { useCallback, useMemo } from "react";
import { useReactFlow, type NodeChange } from "@xyflow/react";
import type { AnyNode } from "../model/types";
import { absoluteBoxes, useGraphStore } from "../store";
import {
  clearGuides,
  computeSnap,
  setGuides,
  threshold,
  type Box,
  type Guide,
} from "../guides";

/** The smallest box containing all of them. */
function union(boxes: Box[]): Box {
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  return {
    x,
    y,
    w: Math.max(...boxes.map((b) => b.x + b.w)) - x,
    h: Math.max(...boxes.map((b) => b.y + b.h)) - y,
  };
}

/**
 * Snapping and guides for a drag.
 *
 * `track` is for React Flow's `onNodeDrag`, which fires after the drag's own
 * position change has been applied — so the store already holds where the
 * pointer put the node, and this nudges it from there.
 *
 * `settle` is for `onNodeDragStop`, and it is not optional. React Flow ends a
 * drag from its *own* record of where the pointer went, which knows nothing
 * about the nudges above; without this the node visibly snaps to the guide
 * and then jumps back off it on release.
 */
export function useDragGuides() {
  const { getZoom } = useReactFlow();

  const apply = useCallback(
    (dragged: AnyNode[], dragging: boolean) => {
      const { nodes, kind, onNodesChange } = useGraphStore.getState();
      if (dragged.length === 0) return;

      const boxes = absoluteBoxes(nodes);
      const byId = new Map(nodes.map((n) => [n.id, n]));
      const moving = new Set(dragged.map((d) => d.id));

      // A group's children move with it, so they are being dragged too even
      // though React Flow only names the group. Aligning a group to its own
      // contents would snap it to itself.
      const carried = (n: AnyNode): boolean => {
        for (let p = n.parentId; p; p = byId.get(p)?.parentId) {
          if (moving.has(p)) return true;
        }
        return false;
      };

      const movingBoxes = dragged
        .map((d) => boxes.get(d.id))
        .filter((b): b is Box => b !== undefined);
      const statics = nodes
        .filter((n) => !moving.has(n.id) && !carried(n))
        .map((n) => boxes.get(n.id))
        .filter((b): b is Box => b !== undefined);
      if (movingBoxes.length === 0 || statics.length === 0) {
        setGuides([]);
        return;
      }

      const snap = computeSnap(union(movingBoxes), statics, threshold(getZoom()));

      // Participants are pinned to the top row, so a horizontal guide would
      // promise a move the store then refuses.
      const dy = kind === "sequence" ? 0 : snap.dy;
      const guides: Guide[] =
        kind === "sequence" ? snap.guides.filter((g) => g.axis === "x") : snap.guides;

      if (snap.dx !== 0 || dy !== 0) {
        const changes: NodeChange<AnyNode>[] = dragged.map((d) => ({
          type: "position",
          id: d.id,
          dragging,
          position: {
            x: (byId.get(d.id)?.position.x ?? d.position.x) + snap.dx,
            y: (byId.get(d.id)?.position.y ?? d.position.y) + dy,
          },
        }));
        onNodesChange(changes);
      }
      setGuides(dragging ? guides : []);
    },
    [getZoom],
  );

  return useMemo(
    () => ({
      track: (dragged: AnyNode[]) => apply(dragged, true),
      settle: (dragged: AnyNode[]) => {
        apply(dragged, false);
        clearGuides();
      },
    }),
    [apply],
  );
}
