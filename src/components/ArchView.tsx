import { useEffect, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { JunctionNode, ServiceNode } from "../model/types";
import { getIconHtml } from "../icons";
import { NodeResize } from "./NodeResize";
import { useSized } from "./useSized";

export function IconView({ name, size }: { name: string; size: number }) {
  const [html, setHtml] = useState("");
  useEffect(() => {
    let alive = true;
    void getIconHtml(name).then((svg) => {
      if (alive) setHtml(svg);
    });
    return () => {
      alive = false;
    };
  }, [name]);
  return (
    <div
      className="arch-icon"
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/**
 * One handle per side, ids matching mermaid's L/R/T/B. The canvas runs in
 * loose connection mode, so a single handle both starts and receives
 * connections — duplicate source/target ids would make React Flow drop the
 * edge entirely.
 */
function SideHandles() {
  return (
    <>
      <Handle type="source" position={Position.Left} id="L" />
      <Handle type="source" position={Position.Right} id="R" />
      <Handle type="source" position={Position.Top} id="T" />
      <Handle type="source" position={Position.Bottom} id="B" />
    </>
  );
}

export function ServiceNodeView({ id, data, selected }: NodeProps<ServiceNode>) {
  const sized = useSized(id);
  return (
    <div className={`service-node${selected ? " selected" : ""}${sized ? " sized" : ""}`}>
      <NodeResize id={id} visible={selected} />
      {data.icon && <IconView name={data.icon} size={44} />}
      <div className="service-label">{data.label || id}</div>
      <SideHandles />
    </div>
  );
}

export function JunctionNodeView({ selected }: NodeProps<JunctionNode>) {
  return (
    <div className={`junction-node${selected ? " selected" : ""}`}>
      <SideHandles />
    </div>
  );
}

const C4_TAGS: Record<string, string> = {
  person: "Person",
  external_person: "Person (ext)",
  system: "System",
  external_system: "System (ext)",
  system_db: "System DB",
  system_queue: "System Queue",
  container: "Container",
  external_container: "Container (ext)",
  container_db: "Container DB",
  container_queue: "Container Queue",
  component: "Component",
  external_component: "Component (ext)",
  component_db: "Component DB",
  component_queue: "Component Queue",
};

export function C4NodeView({ id, data, selected }: NodeProps<import("../model/types").C4Node>) {
  const external = data.c4Shape.startsWith("external_");
  const person = data.c4Shape.includes("person");
  const sized = useSized(id);
  return (
    <div
      className={`c4-node${external ? " external" : ""}${person ? " person" : ""}${selected ? " selected" : ""}${sized ? " sized" : ""}`}
    >
      <NodeResize id={id} visible={selected} />
      {person && <div className="c4-head" />}
      <div className="c4-tag">«{C4_TAGS[data.c4Shape] ?? data.c4Shape}»</div>
      <div className="c4-label">{data.label}</div>
      {data.descr && <div className="c4-descr">{data.descr}</div>}
      <SideHandles />
    </div>
  );
}
