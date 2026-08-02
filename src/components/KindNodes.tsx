import { Handle, type NodeProps } from "@xyflow/react";
import type { ClassNode, EntityNode, StateNode } from "../model/types";
import { handlePositions } from "./ShapeNode";
import { NodeResize } from "./NodeResize";
import { useSized } from "./useSized";
import { useThemeStore } from "../theme";

export function StateNodeView({ id, data, selected }: NodeProps<StateNode>) {
  const { target, source } = handlePositions(data.direction);
  if (data.stateType === "choice") {
    return (
      <div className={`choice-state${selected ? " selected" : ""}`}>
        <Handle type="target" position={target} />
        <Handle type="source" position={source} />
      </div>
    );
  }
  if (data.stateType === "fork" || data.stateType === "join") {
    return (
      <div className={`forkjoin-state${selected ? " selected" : ""}`}>
        <Handle type="target" position={target} />
        <Handle type="source" position={source} />
      </div>
    );
  }
  if (data.stateType !== "normal") {
    return (
      <div className={`pseudo-state ${data.stateType}${selected ? " selected" : ""}`}>
        {data.stateType === "end" && <div className="pseudo-inner" />}
        <Handle type="target" position={target} />
        <Handle type="source" position={source} />
      </div>
    );
  }
  // Only ordinary states resize. A choice diamond, a fork bar and the start
  // and end markers are notation with a fixed meaning, not boxes.
  return (
    <SizedBox id={id} className="state-node" selected={selected}>
      {data.label}
      <Handle type="target" position={target} />
      <Handle type="source" position={source} />
    </SizedBox>
  );
}

/**
 * A node that fills the size it was given, and offers handles for changing
 * it. Without `sized` these boxes are as big as their content, between a
 * floor and (for some) a ceiling that would otherwise refuse the resize.
 */
function SizedBox({
  id,
  className,
  selected,
  children,
}: {
  id: string;
  className: string;
  selected: boolean;
  children: React.ReactNode;
}) {
  const sized = useSized(id);
  return (
    <div className={`${className}${selected ? " selected" : ""}${sized ? " sized" : ""}`}>
      <NodeResize id={id} visible={selected} />
      {children}
    </div>
  );
}

export function EntityNodeView({ id, data, selected }: NodeProps<EntityNode>) {
  const { target, source } = handlePositions(data.direction);
  return (
    <SizedBox id={id} className="table-node" selected={selected}>
      <div className="table-title">{data.label}</div>
      {data.attributes.length > 0 && (
        <div className="table-rows">
          {data.attributes.map((a, i) => (
            <div key={i} className="table-row">
              <span className="dim">{a.type}</span>
              <span>{a.name}</span>
              <span className="keys">{a.keys.join(",")}</span>
            </div>
          ))}
        </div>
      )}
      <Handle type="target" position={target} />
      <Handle type="source" position={source} />
    </SizedBox>
  );
}

export function ClassNodeView({ id, data, selected }: NodeProps<ClassNode>) {
  const { target, source } = handlePositions(data.direction);
  return (
    <SizedBox id={id} className="table-node" selected={selected}>
      <div className="table-title">
        {(data.annotations ?? []).map((a) => (
          <div key={a} className="class-annotation">
            «{a}»
          </div>
        ))}
        {data.label}
        {data.generic ? `<${data.generic}>` : ""}
      </div>
      {data.members.length > 0 && (
        <div className="table-rows">
          {data.members.map((m, i) => (
            <div key={i} className="table-row mono">
              {m}
            </div>
          ))}
        </div>
      )}
      {data.methods.length > 0 && (
        <div className="table-rows">
          {data.methods.map((m, i) => (
            <div key={i} className="table-row mono">
              {m}
            </div>
          ))}
        </div>
      )}
      <Handle type="target" position={target} />
      <Handle type="source" position={source} />
    </SizedBox>
  );
}

/**
 * SVG marker definitions for UML and crow's-foot arrowheads, referenced by
 * edges via `url(#id)`. Rendered once inside the canvas.
 */
export function MarkerDefs() {
  const resolved = useThemeStore((s) => s.resolved);
  const { stroke, hollowFill } =
    resolved === "light"
      ? { stroke: "#5f6673", hollowFill: "#ffffff" }
      : { stroke: "#8b91a3", hollowFill: "#12141a" };
  return (
    <svg style={{ position: "absolute", width: 0, height: 0 }}>
      <defs>
        <marker
          id="cls-extension"
          viewBox="0 0 14 14"
          refX="12"
          refY="7"
          markerWidth="14"
          markerHeight="14"
          orient="auto-start-reverse"
        >
          <path d="M1,1 L12,7 L1,13 Z" fill={hollowFill} stroke={stroke} strokeWidth="1.2" />
        </marker>
        <marker
          id="cls-composition"
          viewBox="0 0 16 12"
          refX="14"
          refY="6"
          markerWidth="16"
          markerHeight="12"
          orient="auto-start-reverse"
        >
          <path d="M1,6 L8,1 L15,6 L8,11 Z" fill={stroke} stroke={stroke} strokeWidth="1" />
        </marker>
        <marker
          id="cls-aggregation"
          viewBox="0 0 16 12"
          refX="14"
          refY="6"
          markerWidth="16"
          markerHeight="12"
          orient="auto-start-reverse"
        >
          <path
            d="M1,6 L8,1 L15,6 L8,11 Z"
            fill={hollowFill}
            stroke={stroke}
            strokeWidth="1.2"
          />
        </marker>
        <marker
          id="cls-dependency"
          viewBox="0 0 12 12"
          refX="10"
          refY="6"
          markerWidth="12"
          markerHeight="12"
          orient="auto-start-reverse"
        >
          <path d="M2,1 L10,6 L2,11" fill="none" stroke={stroke} strokeWidth="1.4" />
        </marker>
        <marker
          id="seq-arrow"
          viewBox="0 0 12 12"
          refX="10"
          refY="6"
          markerWidth="12"
          markerHeight="12"
          orient="auto-start-reverse"
        >
          <path d="M1,1 L11,6 L1,11 Z" fill={stroke} />
        </marker>
        <marker
          id="seq-open"
          viewBox="0 0 12 12"
          refX="10"
          refY="6"
          markerWidth="12"
          markerHeight="12"
          orient="auto-start-reverse"
        >
          <path d="M2,1 L10,6 L2,11" fill="none" stroke={stroke} strokeWidth="1.4" />
        </marker>
        <marker
          id="seq-cross"
          viewBox="0 0 12 12"
          refX="9"
          refY="6"
          markerWidth="12"
          markerHeight="12"
          orient="auto-start-reverse"
        >
          <path d="M3,2 L11,10 M11,2 L3,10" fill="none" stroke={stroke} strokeWidth="1.5" />
        </marker>
        <marker
          id="er-one"
          viewBox="0 0 12 12"
          refX="10"
          refY="6"
          markerWidth="12"
          markerHeight="12"
          orient="auto-start-reverse"
        >
          <path d="M5,1 L5,11" fill="none" stroke={stroke} strokeWidth="1.5" />
        </marker>
        <marker
          id="er-zero-one"
          viewBox="0 0 16 12"
          refX="14"
          refY="6"
          markerWidth="16"
          markerHeight="12"
          orient="auto-start-reverse"
        >
          <circle cx="4" cy="6" r="3" fill="none" stroke={stroke} strokeWidth="1.2" />
          <path d="M10,1 L10,11" fill="none" stroke={stroke} strokeWidth="1.5" />
        </marker>
        <marker
          id="er-zero-more"
          viewBox="0 0 18 12"
          refX="16"
          refY="6"
          markerWidth="18"
          markerHeight="12"
          orient="auto-start-reverse"
        >
          <circle cx="4" cy="6" r="3" fill="none" stroke={stroke} strokeWidth="1.2" />
          <path
            d="M9,6 L17,1 M9,6 L17,6 M9,6 L17,11"
            fill="none"
            stroke={stroke}
            strokeWidth="1.2"
          />
        </marker>
        <marker
          id="er-one-more"
          viewBox="0 0 18 12"
          refX="16"
          refY="6"
          markerWidth="18"
          markerHeight="12"
          orient="auto-start-reverse"
        >
          <path d="M4,1 L4,11" fill="none" stroke={stroke} strokeWidth="1.5" />
          <path
            d="M8,6 L17,1 M8,6 L17,6 M8,6 L17,11"
            fill="none"
            stroke={stroke}
            strokeWidth="1.2"
          />
        </marker>
      </defs>
    </svg>
  );
}
