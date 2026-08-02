import { NodeResizer } from "@xyflow/react";
import { NODE_MIN, useGraphStore } from "../store";

/**
 * The resize handles, and the store plumbing behind them.
 *
 * Shared because every box-shaped node wants the same three things, and
 * because the split between the live half of the drag (`setNodeSize`) and
 * the commit (`onNodeDragStop`) is easy to get subtly wrong per node type.
 *
 * Not every node gets one. A junction is a dot, a fork bar is a bar, and a
 * sequence participant's geometry belongs to the overlay — resizing those
 * would mean something different, or nothing at all.
 */
export function NodeResize({ id, visible }: { id: string; visible: boolean }) {
  const setNodeSize = useGraphStore((s) => s.setNodeSize);
  const resizeEnd = useGraphStore((s) => s.onNodeDragStop);
  return (
    <NodeResizer
      isVisible={visible}
      minWidth={NODE_MIN.width}
      minHeight={NODE_MIN.height}
      onResize={(_, p) => setNodeSize(id, p.width, p.height, p.x, p.y)}
      onResizeEnd={() => resizeEnd()}
    />
  );
}
