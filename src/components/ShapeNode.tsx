import { Label } from "./Label";
import { useRename } from "./useRename";
import { labelStyleOf, styleProps } from "../model/nodeStyle";
import { NodeResizer, useInternalNode, type NodeProps } from "@xyflow/react";
import type { Shape, ShapeNode as ShapeNodeType } from "../model/types";
import { IMG_SIZE, defaultSize } from "../model/types";
import { GROUP_MIN, useGraphStore } from "../store";
import { NodeResize } from "./NodeResize";
import { IconView } from "./ArchView";
import { SideHandles } from "./SideHandles";

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

export function ShapeNodeView({ id, data, selected }: NodeProps<ShapeNodeType>) {
  const classDefs = useGraphStore((s) => s.classDefs);
  // The shape is drawn from real numbers rather than stretched, so a resized
  // diamond keeps its points sharp instead of scaling its strokes with it.
  //
  // Read from the node's own style, not from the `width` prop: that one is
  // the *measured* size, which is measured from the box this style produces.
  // Feeding it back in would make the element its own input, and one stray
  // pixel of rounding would then compound on every render.
  const style = useInternalNode(id)?.style;
  // A picture does not enlarge the box: it is fitted into whatever size the
  // node has, default or chosen. See `.shape-image` in the stylesheet.
  const fallback = defaultSize(data.shape);
  const w = Number(style?.width ?? fallback.width);
  const h = Number(style?.height ?? fallback.height);
  const custom = styleProps([
    ...(data.classes ?? []).flatMap((c) => classDefs[c] ?? []),
    ...(data.styles ?? []),
  ]);
  // A picture with its frame switched off has no box to be fitted into, so
  // the node is the size of what it shows rather than a 160×54 rectangle
  // standing 50px clear of a 60px logo — which is also where the selection
  // outline and the arriving edges would otherwise stop. A size actually
  // chosen for the node still wins; dragging a handle chooses one.
  const bare = Boolean(data.img) && custom.fill === "none" && custom.stroke === "none";
  const fitted = bare && style?.width == null;
  // What the label is drawn with — and the rename field too, since it stands
  // in for the label and a field two sizes off the text it replaces is a
  // node that changes shape the moment you double-click it.
  const labelStyle = labelStyleOf(custom);

  // Renaming, shared with every other family. A flowchart label may hold a
  // second line, and mermaid spells one `<br>`.
  const rename = useRename(id, data.label, { multiline: true, style: labelStyle });

  return (
    <div
      className={`shape-node${selected ? " selected" : ""}${bare ? " bare" : ""}`}
      style={fitted ? undefined : { width: w, height: h }}
      onDoubleClick={rename.begin}
    >
      <NodeResize id={id} visible={selected} />
      {/* Nothing to draw when the frame is off — and drawing it anyway would
          put a shape back on selection, since `.shape-node.selected` colours
          the outline the fill and stroke had blanked. */}
      {!bare && (
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
      )}
      {/* A node with a picture keeps it while its name is being typed: the
          field stands in for the words, not for the whole node. Renaming one
          used to blank the picture and, with no frame to hold the shape open,
          leave a lone text box where the icon had been.

          A node without a picture keeps the field as it was, a sibling of the
          label rather than inside it — there is nothing to hold in place, and
          the label's own padding would only narrow the field. */}
      {rename.editing && !data.img ? (
        rename.field
      ) : (
        <div
          className={`shape-label${data.img ? ` with-image pos-${data.imgPos ?? "b"}` : ""}`}
          style={labelStyle}
        >
          {/* Mermaid's image shape, drawn the way mermaid draws it: the
              picture from its URL, the label above or below. Loaded from the
              network on purpose — that URL is the whole point of the shape,
              since it is what makes the icon appear in other tools too. */}
          {data.img && (
            <img
              className="shape-image"
              src={data.img}
              alt=""
              width={data.imgWidth ?? IMG_SIZE}
              height={data.imgHeight ?? IMG_SIZE}
              draggable={false}
            />
          )}
          {rename.editing ? (
            rename.field
          ) : (
            <span>
              <Label text={data.label} />
            </span>
          )}
        </div>
      )}
      <SideHandles />
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
  // A container's name is a flowchart subgraph title, which mermaid lets
  // hold a `<br>` like any other flowchart label.
  const rename = useRename(id, data.label, { multiline: true });
  return (
    <div
      className={
        `group-node${selected ? " selected" : ""}` +
        (data.style?.look && data.style.look !== "boxed" ? ` ${data.style.look}` : "")
      }
    >
      <NodeResizer
        isVisible={selected}
        minWidth={GROUP_MIN.width}
        minHeight={GROUP_MIN.height}
        onResize={(_, p) => setNodeSize(id, p.width, p.height, p.x, p.y)}
        onResizeEnd={() => resizeEnd()}
      />
      {/* A container names itself in a header strip, and carries the icon
          mermaid already lets it declare — `group vnet(logos:azure)[VNet]`.
          It is how draw.io labels an Azure or AWS container, and without it
          the only difference between two nested boxes was their wording. */}
      {/* Double-clicking the strip renames the container; double-clicking
          its middle is a click on the canvas inside it, which is where a new
          node goes. */}
      <div className="group-title" onDoubleClick={rename.begin}>
        {data.icon && <IconView name={data.icon} size={15} />}
        {rename.editing ? (
          rename.field
        ) : (
          <span>
            <Label text={data.label} />
          </span>
        )}
      </div>
      <SideHandles />
    </div>
  );
}
