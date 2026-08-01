import { useState } from "react";
import { Handle, NodeResizer, Position, type NodeProps } from "@xyflow/react";
import type { Direction, Shape, ShapeNode as ShapeNodeType } from "../model/types";
import { defaultSize } from "../model/types";
import { GROUP_MIN, useGraphStore } from "../store";

function shapeSvg(shape: Shape, w: number, h: number) {
  const common = { className: "shape-fill", vectorEffect: "non-scaling-stroke" as const };
  switch (shape) {
    case "round":
      return <rect x={1} y={1} width={w - 2} height={h - 2} rx={8} {...common} />;
    case "stadium":
      return <rect x={1} y={1} width={w - 2} height={h - 2} rx={(h - 2) / 2} {...common} />;
    case "subroutine":
      return (
        <g>
          <rect x={1} y={1} width={w - 2} height={h - 2} {...common} />
          <line x1={9} y1={1} x2={9} y2={h - 1} className="shape-line" />
          <line x1={w - 9} y1={1} x2={w - 9} y2={h - 1} className="shape-line" />
        </g>
      );
    case "cylinder": {
      const ry = 8;
      return (
        <g>
          <path
            d={`M1 ${ry} A ${(w - 2) / 2} ${ry} 0 0 1 ${w - 1} ${ry} L ${w - 1} ${h - ry} A ${(w - 2) / 2} ${ry} 0 0 1 1 ${h - ry} Z`}
            {...common}
          />
          <path
            d={`M1 ${ry} A ${(w - 2) / 2} ${ry} 0 0 0 ${w - 1} ${ry}`}
            className="shape-line"
            fill="none"
          />
        </g>
      );
    }
    case "circle":
      return <ellipse cx={w / 2} cy={h / 2} rx={w / 2 - 1} ry={h / 2 - 1} {...common} />;
    case "doublecircle":
      return (
        <g>
          <ellipse cx={w / 2} cy={h / 2} rx={w / 2 - 1} ry={h / 2 - 1} {...common} />
          <ellipse
            cx={w / 2}
            cy={h / 2}
            rx={w / 2 - 6}
            ry={h / 2 - 6}
            className="shape-line"
            fill="none"
          />
        </g>
      );
    case "diamond":
      return (
        <polygon
          points={`${w / 2},1 ${w - 1},${h / 2} ${w / 2},${h - 1} 1,${h / 2}`}
          {...common}
        />
      );
    case "hexagon": {
      const c = Math.min(h / 2, w * 0.18);
      return (
        <polygon
          points={`${c},1 ${w - c},1 ${w - 1},${h / 2} ${w - c},${h - 1} ${c},${h - 1} 1,${h / 2}`}
          {...common}
        />
      );
    }
    case "odd":
      return (
        <polygon
          points={`1,${h / 2} 14,1 ${w - 1},1 ${w - 1},${h - 1} 14,${h - 1}`}
          {...common}
        />
      );
    case "trapezoid":
      return (
        <polygon
          points={`${w * 0.18},1 ${w * 0.82},1 ${w - 1},${h - 1} 1,${h - 1}`}
          {...common}
        />
      );
    case "inv_trapezoid":
      return (
        <polygon
          points={`1,1 ${w - 1},1 ${w * 0.82},${h - 1} ${w * 0.18},${h - 1}`}
          {...common}
        />
      );
    case "lean_right":
      return (
        <polygon
          points={`${w * 0.15},1 ${w - 1},1 ${w * 0.85},${h - 1} 1,${h - 1}`}
          {...common}
        />
      );
    case "lean_left":
      return (
        <polygon
          points={`1,1 ${w * 0.85},1 ${w - 1},${h - 1} ${w * 0.15},${h - 1}`}
          {...common}
        />
      );
    case "square":
      return <rect x={1} y={1} width={w - 2} height={h - 2} {...common} />;
  }
}

export function handlePositions(direction: Direction): { target: Position; source: Position } {
  switch (direction) {
    case "LR":
      return { target: Position.Left, source: Position.Right };
    case "RL":
      return { target: Position.Right, source: Position.Left };
    case "BT":
      return { target: Position.Bottom, source: Position.Top };
    default:
      return { target: Position.Top, source: Position.Bottom };
  }
}

/** Extract SVG-applicable props from mermaid style declarations. */
function styleProps(decls: string[]): {
  fill?: string;
  stroke?: string;
  color?: string;
  strokeWidth?: string;
  strokeDasharray?: string;
} {
  const out: Record<string, string> = {};
  for (const d of decls) {
    const idx = d.indexOf(":");
    if (idx < 0) continue;
    const key = d.slice(0, idx).trim();
    const value = d.slice(idx + 1).trim();
    if (key === "fill") out.fill = value;
    else if (key === "stroke") out.stroke = value;
    else if (key === "color") out.color = value;
    else if (key === "stroke-width") out.strokeWidth = value;
    else if (key === "stroke-dasharray") out.strokeDasharray = value;
  }
  return out;
}

export function ShapeNodeView({ id, data, selected }: NodeProps<ShapeNodeType>) {
  const updateNodeData = useGraphStore((s) => s.updateNodeData);
  const classDefs = useGraphStore((s) => s.classDefs);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const { width: w, height: h } = defaultSize(data.shape);
  const { target, source } = handlePositions(data.direction);
  const custom = styleProps([
    ...(data.classes ?? []).flatMap((c) => classDefs[c] ?? []),
    ...(data.styles ?? []),
  ]);

  const commit = () => {
    setEditing(false);
    const label = draft.trim();
    if (label && label !== data.label) updateNodeData(id, { label });
  };

  return (
    <div
      className={`shape-node${selected ? " selected" : ""}`}
      style={{ width: w, height: h }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        setDraft(data.label);
        setEditing(true);
      }}
    >
      <svg
        width={w}
        height={h}
        className="shape-svg"
        style={{
          ...(custom.fill ? ({ "--custom-fill": custom.fill } as React.CSSProperties) : {}),
          ...(custom.stroke
            ? ({ "--custom-stroke": custom.stroke } as React.CSSProperties)
            : {}),
        }}
      >
        {shapeSvg(data.shape, w, h)}
      </svg>
      {editing ? (
        <input
          className="shape-label-input nodrag"
          value={draft}
          // Legitimate autofocus: the inline editor is only rendered after
          // the user double-clicks to rename, so focus belongs here.
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setEditing(false);
          }}
        />
      ) : (
        <div className="shape-label" style={custom.color ? { color: custom.color } : undefined}>
          {data.label}
        </div>
      )}
      <Handle type="target" position={target} />
      <Handle type="source" position={source} />
    </div>
  );
}

export function GroupNodeView({
  id,
  data,
  selected,
}: NodeProps<import("../model/types").GroupNode>) {
  const resizeEnd = useGraphStore((s) => s.onNodeDragStop);
  const setNodeSize = useGraphStore((s) => s.setNodeSize);
  return (
    <div className={`group-node${selected ? " selected" : ""}`}>
      <NodeResizer
        isVisible={selected}
        minWidth={GROUP_MIN.width}
        minHeight={GROUP_MIN.height}
        onResize={(_, p) => setNodeSize(id, p.width, p.height, p.x, p.y)}
        onResizeEnd={() => resizeEnd()}
      />
      <div className="group-title">{data.label}</div>
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
