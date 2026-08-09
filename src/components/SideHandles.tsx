import { Handle, Position } from "@xyflow/react";

/**
 * A connection point on each face of a node.
 *
 * Nodes used to offer two, placed by the diagram's direction: in a
 * left-to-right flowchart, one on the left to arrive at and one on the right
 * to leave from. That was the same reasoning that made connections leave on
 * the wrong side, and once the router began choosing faces from the geometry
 * it left the dots contradicting the lines — a dot on the right of a node the
 * line left from underneath.
 *
 * Four faces, and you may connect from any of them, which is what draw.io
 * does. The architecture diagrams have worked this way all along; this is
 * their arrangement, moved somewhere the rest of the families can share it.
 *
 * One handle per side rather than a source and a target on top of each other:
 * the canvas runs in loose connection mode, so a single handle both starts
 * and receives connections, and duplicate ids would make React Flow drop the
 * edge entirely.
 *
 * The ids match the letters mermaid uses for architecture diagrams, where the
 * side is written into the file (`web:R --> L:db`). Elsewhere they are not
 * saved: the geometry decides where a line meets a box, and a handle is only
 * somewhere to start dragging one.
 */
export function SideHandles() {
  return (
    <>
      <Handle type="source" position={Position.Left} id="L" />
      <Handle type="source" position={Position.Right} id="R" />
      <Handle type="source" position={Position.Top} id="T" />
      <Handle type="source" position={Position.Bottom} id="B" />
    </>
  );
}
