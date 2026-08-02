import {
  alignableSelection,
  hasCustomSize,
  minSize,
  useGraphStore,
  type AlignEdge,
} from "../store";
import { useT } from "../i18n";
import { useIconPrefs } from "../iconPrefs";
import {
  C4_SHAPES,
  CLASS_MARKERS,
  ER_CARDS,
  ER_CARD_LABELS,
  SEQ_OPS,
  SEQ_OP_LABELS,
  SHAPES,
  SHAPE_LABELS,
  type AnyNode,
  type ArchDir,
  type ArrowType,
  type ClassMarker,
  type EdgeStroke,
  type EntityAttr,
  type ErCard,
  type FlowEdge,
  type SeqOp,
  type Shape,
} from "../model/types";

function parseAttrLine(line: string): EntityAttr | null {
  const commentMatch = line.match(/"([^"]*)"\s*$/);
  const comment = commentMatch?.[1] ?? "";
  const rest = commentMatch ? line.slice(0, commentMatch.index) : line;
  const tokens = rest
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean);
  if (tokens.length < 2) return null;
  const [type, name, ...keys] = tokens;
  return { type, name, keys: keys.map((k) => k.toUpperCase()), comment };
}

function attrToLine(a: EntityAttr): string {
  return [a.type, a.name, ...a.keys, a.comment ? `"${a.comment}"` : ""]
    .filter(Boolean)
    .join(" ");
}

/** Set or replace one `key:value` declaration in a style list. */
function withStyle(styles: string[] | undefined, key: string, value: string): string[] {
  const rest = (styles ?? []).filter((s) => !s.trim().startsWith(`${key}:`));
  return [...rest, `${key}:${value}`];
}

function styleValue(styles: string[] | undefined, key: string, fallback: string): string {
  const d = (styles ?? []).find((s) => s.trim().startsWith(`${key}:`));
  const v = d?.slice(d.indexOf(":") + 1).trim();
  return v && /^#[0-9a-fA-F]{6}$/.test(v) ? v : fallback;
}

function NodeFields({ node }: { node: AnyNode }) {
  const t = useT();
  const updateNodeData = useGraphStore((s) => s.updateNodeData);
  switch (node.type) {
    case "shape":
      return (
        <>
          <label>
            {t("insp.label")}
            <input
              id="inspector-label"
              value={node.data.label}
              onChange={(e) => updateNodeData(node.id, { label: e.target.value })}
            />
          </label>
          <label>
            {t("insp.shape")}
            <select
              value={node.data.shape}
              onChange={(e) => updateNodeData(node.id, { shape: e.target.value as Shape })}
            >
              {SHAPES.map((s) => (
                <option key={s} value={s}>
                  {SHAPE_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <div className="color-row">
            <label>
              {t("insp.fill")}
              <input
                type="color"
                value={styleValue(node.data.styles, "fill", "#232a3a")}
                onChange={(e) =>
                  updateNodeData(node.id, {
                    styles: withStyle(node.data.styles, "fill", e.target.value),
                  })
                }
              />
            </label>
            <label>
              {t("insp.border")}
              <input
                type="color"
                value={styleValue(node.data.styles, "stroke", "#5b8def")}
                onChange={(e) =>
                  updateNodeData(node.id, {
                    styles: withStyle(node.data.styles, "stroke", e.target.value),
                  })
                }
              />
            </label>
            <label>
              {t("insp.text")}
              <input
                type="color"
                value={styleValue(node.data.styles, "color", "#e6e9f0")}
                onChange={(e) =>
                  updateNodeData(node.id, {
                    styles: withStyle(node.data.styles, "color", e.target.value),
                  })
                }
              />
            </label>
            {(node.data.styles?.length ?? 0) > 0 && (
              <button className="mini" onClick={() => updateNodeData(node.id, { styles: [] })}>
                {t("insp.reset")}
              </button>
            )}
          </div>
          <label>
            CSS classes (classDef names, space-separated)
            <input
              defaultValue={(node.data.classes ?? []).join(" ")}
              onBlur={(e) =>
                updateNodeData(node.id, {
                  classes: e.target.value.split(/\s+/).filter(Boolean),
                })
              }
            />
          </label>
          <NodeSize node={node} />
        </>
      );
    case "state":
      return node.data.stateType === "normal" ? (
        <>
          <label>
            {t("insp.label")}
            <input
              value={node.data.label}
              onChange={(e) => updateNodeData(node.id, { label: e.target.value })}
            />
          </label>
          <NodeSize node={node} />
        </>
      ) : (
        <div className="inspector-empty">
          {t("insp.pseudoState", { type: node.data.stateType })}
        </div>
      );
    case "entity":
      return (
        <>
          <label>
            {t("insp.name")}
            <input
              id="inspector-label"
              value={node.data.label}
              onChange={(e) => updateNodeData(node.id, { label: e.target.value })}
            />
          </label>
          <label>
            {t("insp.attributes")} <code>type name PK &quot;comment&quot;</code>
            <textarea
              rows={Math.max(3, node.data.attributes.length + 1)}
              defaultValue={node.data.attributes.map(attrToLine).join("\n")}
              onBlur={(e) =>
                updateNodeData(node.id, {
                  attributes: e.target.value
                    .split("\n")
                    .map(parseAttrLine)
                    .filter((a): a is EntityAttr => a !== null),
                })
              }
            />
          </label>
          <NodeSize node={node} />
        </>
      );
    case "service":
      return (
        <>
          <label>
            {t("insp.label")}
            <input
              id="inspector-label"
              value={node.data.label}
              onChange={(e) => updateNodeData(node.id, { label: e.target.value })}
            />
          </label>
          <label>
            Icon — built-in (server, database, cloud…), "logos:aws-s3", or empty
            <input
              defaultValue={node.data.icon}
              onBlur={(e) => {
                const icon = e.target.value.trim();
                if (icon) useIconPrefs.getState().recordRecent(icon);
                updateNodeData(node.id, { icon });
              }}
            />
          </label>
          <NodeSize node={node} />
        </>
      );
    case "junction":
      return <div className="inspector-empty">{t("insp.junction")}</div>;
    case "note":
      return (
        <>
          <label>
            {t("insp.text")}
            <textarea
              id="inspector-label"
              key={node.id}
              rows={3}
              defaultValue={node.data.text}
              onBlur={(e) => updateNodeData(node.id, { text: e.target.value })}
            />
          </label>
          <label>
            Attached to (class name, optional)
            <input
              key={`t-${node.id}`}
              defaultValue={node.data.target ?? ""}
              onBlur={(e) =>
                updateNodeData(node.id, { target: e.target.value.trim() || undefined })
              }
            />
          </label>
          <NodeSize node={node} />
        </>
      );
    case "c4":
      return (
        <>
          <label>
            {t("insp.label")}
            <input
              id="inspector-label"
              value={node.data.label}
              onChange={(e) => updateNodeData(node.id, { label: e.target.value })}
            />
          </label>
          <label>
            {t("insp.elementType")}
            <select
              value={node.data.c4Shape}
              onChange={(e) => updateNodeData(node.id, { c4Shape: e.target.value })}
            >
              {C4_SHAPES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("insp.description")}
            <textarea
              rows={2}
              defaultValue={node.data.descr}
              onBlur={(e) => updateNodeData(node.id, { descr: e.target.value.trim() })}
            />
          </label>
          <NodeSize node={node} />
        </>
      );
    case "participant":
      return (
        <>
          <label>
            {t("insp.name")}
            <input
              id="inspector-label"
              value={node.data.label}
              onChange={(e) => updateNodeData(node.id, { label: e.target.value })}
            />
          </label>
          <label>
            {t("insp.kind")}
            <select
              value={node.data.ptype}
              onChange={(e) => updateNodeData(node.id, { ptype: e.target.value })}
            >
              <option value="participant">{t("insp.participantBox")}</option>
              <option value="actor">{t("insp.actorPerson")}</option>
            </select>
          </label>
        </>
      );
    case "class":
      return (
        <>
          <label>
            {t("insp.name")}
            <input
              id="inspector-label"
              value={node.data.label}
              onChange={(e) => updateNodeData(node.id, { label: e.target.value })}
            />
          </label>
          <label>
            Fields — one per line: <code>+int age</code>
            <textarea
              rows={Math.max(2, node.data.members.length + 1)}
              defaultValue={node.data.members.join("\n")}
              onBlur={(e) =>
                updateNodeData(node.id, {
                  members: e.target.value
                    .split("\n")
                    .map((l) => l.trim())
                    .filter(Boolean),
                })
              }
            />
          </label>
          <label>
            {t("insp.annotations")} <code>interface</code> {t("insp.annotationsHint")}
            <input
              defaultValue={(node.data.annotations ?? []).join(" ")}
              onBlur={(e) =>
                updateNodeData(node.id, {
                  annotations: e.target.value.split(/s+/).filter(Boolean),
                })
              }
            />
          </label>
          <label>
            Generic parameter — e.g. <code>T</code>
            <input
              defaultValue={node.data.generic ?? ""}
              onBlur={(e) =>
                updateNodeData(node.id, { generic: e.target.value.trim() || undefined })
              }
            />
          </label>
          <label>
            Methods — one per line: <code>+run() void</code>
            <textarea
              rows={Math.max(2, node.data.methods.length + 1)}
              defaultValue={node.data.methods.join("\n")}
              onBlur={(e) =>
                updateNodeData(node.id, {
                  methods: e.target.value
                    .split("\n")
                    .map((l) => l.trim())
                    .filter(Boolean),
                })
              }
            />
          </label>
          <NodeSize node={node} />
        </>
      );
    case "group":
      return (
        <>
          <label>
            {t("insp.label")}
            <input
              id="inspector-label"
              value={String(node.data.label)}
              onChange={(e) => updateNodeData(node.id, { label: e.target.value })}
            />
          </label>
          <NodeSize node={node} />
        </>
      );
    default:
      // Every member of the union is handled above — TypeScript narrows
      // `node` to `never` here — so this only guards a kind added later
      // without a branch, and does it by showing nothing rather than by
      // reading fields that may not exist.
      return null;
  }
}

/**
 * Width and height in numbers, for the nodes that can take one.
 *
 * The resize handles are a dragging gesture, and WCAG 2.5.7 asks for the
 * same functionality without one. Typing a size is also the only way to make
 * two boxes exactly equal, which dragging never quite manages.
 */
function NodeSize({ node }: { node: AnyNode }) {
  const t = useT();
  const resizeNode = useGraphStore((s) => s.resizeNode);
  const resetNodeSize = useGraphStore((s) => s.resetNodeSize);
  const min = minSize(node);
  const width = Math.round(Number(node.style?.width ?? node.measured?.width ?? min.width));
  const height = Math.round(Number(node.style?.height ?? node.measured?.height ?? min.height));

  return (
    <div className="size-row">
      <label>
        {t("insp.width")}
        <input
          type="number"
          min={min.width}
          step={10}
          value={width}
          onChange={(e) => resizeNode(node.id, Number(e.target.value), height)}
        />
      </label>
      <label>
        {t("insp.height")}
        <input
          type="number"
          min={min.height}
          step={10}
          value={height}
          onChange={(e) => resizeNode(node.id, width, Number(e.target.value))}
        />
      </label>
      {hasCustomSize(node) && (
        <button className="mini" onClick={() => resetNodeSize(node.id)}>
          {t("insp.autoSize")}
        </button>
      )}
    </div>
  );
}

function EdgeFields({ edge }: { edge: FlowEdge }) {
  const t = useT();
  const updateEdgeData = useGraphStore((s) => s.updateEdgeData);
  const moveMessage = useGraphStore((s) => s.moveMessage);
  const d = edge.data;
  if (!d) return null;

  return (
    <>
      <label>
        {t("insp.label")}
        <input
          id="inspector-label"
          value={d.label}
          onChange={(e) => updateEdgeData(edge.id, { label: e.target.value })}
        />
      </label>
      {d.seq && (
        <>
          <label>
            {t("insp.arrow")}
            <select
              value={d.seq.op}
              onChange={(e) =>
                updateEdgeData(edge.id, { seq: { op: e.target.value as SeqOp } })
              }
            >
              {SEQ_OPS.map((op) => (
                <option key={op} value={op}>
                  {op} — {SEQ_OP_LABELS[op]}
                </option>
              ))}
            </select>
          </label>
          <div className="color-row">
            <button className="mini" onClick={() => moveMessage(edge.id, -1)}>
              ↑ Move up
            </button>
            <button className="mini" onClick={() => moveMessage(edge.id, 1)}>
              ↓ Move down
            </button>
          </div>
        </>
      )}
      {d.stroke !== undefined && (
        <>
          <label>
            {t("insp.line")}
            <select
              value={d.stroke}
              onChange={(e) =>
                updateEdgeData(edge.id, { stroke: e.target.value as EdgeStroke })
              }
            >
              <option value="normal">{t("insp.lineSolid")}</option>
              <option value="dotted">{t("insp.lineDotted")}</option>
              <option value="thick">{t("insp.lineThick")}</option>
            </select>
          </label>
          <label>
            {t("insp.arrow")}
            <select
              value={d.arrow}
              onChange={(e) => updateEdgeData(edge.id, { arrow: e.target.value as ArrowType })}
            >
              <option value="arrow_point">{t("insp.arrowPoint")}</option>
              <option value="arrow_open">{t("insp.arrowNone")}</option>
              <option value="arrow_circle">{t("insp.arrowCircle")}</option>
              <option value="arrow_cross">{t("insp.arrowCross")}</option>
            </select>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={Boolean(d.both)}
              onChange={(e) => updateEdgeData(edge.id, { both: e.target.checked })}
            />
            {t("insp.bothEnds")}
          </label>
        </>
      )}
      {d.er && (
        <>
          <label>
            {edge.source} side
            <select
              value={d.er.cardB}
              onChange={(e) =>
                updateEdgeData(edge.id, { er: { ...d.er!, cardB: e.target.value as ErCard } })
              }
            >
              {ER_CARDS.map((c) => (
                <option key={c} value={c}>
                  {ER_CARD_LABELS[c]}
                </option>
              ))}
            </select>
          </label>
          <label>
            {edge.target} side
            <select
              value={d.er.cardA}
              onChange={(e) =>
                updateEdgeData(edge.id, { er: { ...d.er!, cardA: e.target.value as ErCard } })
              }
            >
              {ER_CARDS.map((c) => (
                <option key={c} value={c}>
                  {ER_CARD_LABELS[c]}
                </option>
              ))}
            </select>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={d.er.identifying}
              onChange={(e) =>
                updateEdgeData(edge.id, { er: { ...d.er!, identifying: e.target.checked } })
              }
            />
            {t("insp.identifying")}
          </label>
        </>
      )}
      {d.c4 && (
        <>
          <label>
            {t("insp.technology")}
            <input
              value={d.c4.techn}
              placeholder={t("insp.techPlaceholder")}
              onChange={(e) =>
                updateEdgeData(edge.id, { c4: { ...d.c4!, techn: e.target.value } })
              }
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={d.c4.relType === "birel"}
              onChange={(e) =>
                updateEdgeData(edge.id, {
                  c4: { ...d.c4!, relType: e.target.checked ? "birel" : "rel" },
                })
              }
            />
            {t("insp.bidirectional")}
          </label>
        </>
      )}
      {d.arch && (
        <>
          <label>
            Side at {edge.source}
            <select
              value={d.arch.lhsDir}
              onChange={(e) =>
                updateEdgeData(edge.id, {
                  arch: { ...d.arch!, lhsDir: e.target.value as ArchDir },
                })
              }
            >
              {(["L", "R", "T", "B"] as const).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label>
            Side at {edge.target}
            <select
              value={d.arch.rhsDir}
              onChange={(e) =>
                updateEdgeData(edge.id, {
                  arch: { ...d.arch!, rhsDir: e.target.value as ArchDir },
                })
              }
            >
              {(["L", "R", "T", "B"] as const).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={d.arch.rhsInto}
              onChange={(e) =>
                updateEdgeData(edge.id, { arch: { ...d.arch!, rhsInto: e.target.checked } })
              }
            />
            Arrow into {edge.target}
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={d.arch.lhsInto}
              onChange={(e) =>
                updateEdgeData(edge.id, { arch: { ...d.arch!, lhsInto: e.target.checked } })
              }
            />
            Arrow into {edge.source}
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={d.arch.lhsGroup}
              onChange={(e) =>
                updateEdgeData(edge.id, { arch: { ...d.arch!, lhsGroup: e.target.checked } })
              }
            />
            Attach at {edge.source}'s group border
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={d.arch.rhsGroup}
              onChange={(e) =>
                updateEdgeData(edge.id, { arch: { ...d.arch!, rhsGroup: e.target.checked } })
              }
            />
            Attach at {edge.target}'s group border
          </label>
        </>
      )}
      {d.cls && (
        <>
          <label>
            Marker at {edge.source}
            <select
              value={d.cls.left}
              onChange={(e) =>
                updateEdgeData(edge.id, {
                  cls: { ...d.cls!, left: e.target.value as ClassMarker },
                })
              }
            >
              {CLASS_MARKERS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label>
            Marker at {edge.target}
            <select
              value={d.cls.right}
              onChange={(e) =>
                updateEdgeData(edge.id, {
                  cls: { ...d.cls!, right: e.target.value as ClassMarker },
                })
              }
            >
              {CLASS_MARKERS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={d.cls.dotted}
              onChange={(e) =>
                updateEdgeData(edge.id, { cls: { ...d.cls!, dotted: e.target.checked } })
              }
            />
            {t("insp.dottedLine")}
          </label>
          <label>
            Cardinality at {edge.source}
            <input
              value={d.cls.card1 ?? ""}
              placeholder={t("insp.cardOnePlaceholder")}
              onChange={(e) =>
                updateEdgeData(edge.id, {
                  cls: { ...d.cls!, card1: e.target.value || undefined },
                })
              }
            />
          </label>
          <label>
            Cardinality at {edge.target}
            <input
              value={d.cls.card2 ?? ""}
              placeholder={t("insp.cardManyPlaceholder")}
              onChange={(e) =>
                updateEdgeData(edge.id, {
                  cls: { ...d.cls!, card2: e.target.value || undefined },
                })
              }
            />
          </label>
        </>
      )}
      {!d.seq && <EdgeCorners edge={edge} />}
    </>
  );
}

/**
 * The corners of a routed edge, as numbers.
 *
 * The canvas gesture is a drag, and WCAG 2.5.7 asks for the same
 * functionality without one. It is also the only way to put two corners at
 * exactly the same x, which is what makes a bent edge look deliberate rather
 * than approximate.
 *
 * Sequence messages are excluded: the overlay owns their geometry.
 */
function EdgeCorners({ edge }: { edge: FlowEdge }) {
  const t = useT();
  const appendWaypoint = useGraphStore((s) => s.appendWaypoint);
  const moveWaypoint = useGraphStore((s) => s.moveWaypoint);
  const removeWaypoint = useGraphStore((s) => s.removeWaypoint);
  const clearWaypoints = useGraphStore((s) => s.clearWaypoints);
  const points = edge.data?.points ?? [];

  return (
    <div className="corner-list">
      <span className="field-label">{t("insp.corners")}</span>
      {points.map((p, i) => (
        <div className="size-row" key={i}>
          <label>
            x
            <input
              type="number"
              step={10}
              value={Math.round(p.x)}
              onChange={(e) => moveWaypoint(edge.id, i, { x: Number(e.target.value), y: p.y })}
            />
          </label>
          <label>
            y
            <input
              type="number"
              step={10}
              value={Math.round(p.y)}
              onChange={(e) => moveWaypoint(edge.id, i, { x: p.x, y: Number(e.target.value) })}
            />
          </label>
          <button
            className="mini"
            aria-label={`${t("insp.removeCorner")} ${i + 1}`}
            onClick={() => removeWaypoint(edge.id, i)}
          >
            {t("insp.removeCorner")}
          </button>
        </div>
      ))}
      <div className="size-row">
        <button className="mini" onClick={() => appendWaypoint(edge.id)}>
          {t("insp.addCorner")}
        </button>
        {points.length > 0 && (
          <button className="mini" onClick={() => clearWaypoints(edge.id)}>
            {t("insp.straighten")}
          </button>
        )}
      </div>
    </div>
  );
}

export function Inspector() {
  const t = useT();
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);

  const node = nodes.find((n) => n.selected);
  const edge = edges.find((e) => e.selected);
  const selectedCount = nodes.filter((n) => n.selected).length;

  // With several nodes selected the panel used to show the fields of
  // whichever happened to be first, which is misleading — editing them
  // silently affected one node out of five. Arranging the selection is the
  // thing that actually applies to all of them.
  if (selectedCount > 1) {
    return (
      <section className="inspector">
        <div className="panel-title">
          {t("insp.selection", { count: String(selectedCount) })}
        </div>
        <SelectionFields nodes={nodes} />
      </section>
    );
  }

  if (node) {
    return (
      <section className="inspector">
        <div className="panel-title">
          {node.type === "group"
            ? t("insp.groupTitle", { id: node.id })
            : t("insp.nodeTitle", { id: node.id })}
        </div>
        <NodeFields node={node} />
      </section>
    );
  }
  if (edge) {
    return (
      <section className="inspector">
        <div className="panel-title">
          {t("insp.edgeTitle", { source: edge.source, target: edge.target })}
        </div>
        <EdgeFields edge={edge} />
      </section>
    );
  }
  return <DiagramMeta />;
}

/** Diagram-level properties, shown when nothing is selected. */
function DiagramMeta() {
  const t = useT();
  const kind = useGraphStore((s) => s.kind);
  const title = useGraphStore((s) => s.title);
  const accTitle = useGraphStore((s) => s.accTitle);
  const accDescr = useGraphStore((s) => s.accDescr);
  const setDiagramMeta = useGraphStore((s) => s.setDiagramMeta);

  return (
    <section className="inspector">
      <div className="panel-title">{t("insp.diagramTitle")}</div>
      {kind === "c4" && (
        <label>
          {t("insp.title")}
          <input
            defaultValue={title}
            key={`t-${title}`}
            onBlur={(e) => setDiagramMeta({ title: e.target.value.trim() })}
          />
        </label>
      )}
      <label>
        {t("inspector.accTitle")}
        <input
          defaultValue={accTitle}
          key={`at-${accTitle}`}
          onBlur={(e) => setDiagramMeta({ accTitle: e.target.value.trim() })}
        />
      </label>
      <label>
        {t("inspector.accDescr")}
        <textarea
          rows={2}
          defaultValue={accDescr}
          key={`ad-${accDescr}`}
          onBlur={(e) => setDiagramMeta({ accDescr: e.target.value.trim() })}
        />
      </label>
      <div className="inspector-empty">{t("inspector.empty")}</div>
    </section>
  );
}

/**
 * Arranging a multi-selection: align on an edge, or even out the gaps.
 *
 * Dragging gets two boxes nearly level; arithmetic gets them level. These
 * are also the way to arrange a diagram without dragging anything, which is
 * the same reason a group's size can be typed.
 */
function SelectionFields({ nodes }: { nodes: AnyNode[] }) {
  const t = useT();
  const alignSelection = useGraphStore((s) => s.alignSelection);
  const distributeSelection = useGraphStore((s) => s.distributeSelection);

  const targets = alignableSelection(nodes);
  const canAlign = targets.length >= 2;
  const canDistribute = targets.length >= 3;

  const ALIGN: Array<[AlignEdge, string]> = [
    ["left", "insp.alignLeft"],
    ["centerX", "insp.alignCenterX"],
    ["right", "insp.alignRight"],
    ["top", "insp.alignTop"],
    ["middleY", "insp.alignMiddleY"],
    ["bottom", "insp.alignBottom"],
  ];

  return (
    <>
      <div className="field-label">{t("insp.align")}</div>
      <div className="align-grid">
        {ALIGN.map(([edge, key]) => (
          <button
            key={edge}
            type="button"
            disabled={!canAlign}
            onClick={() => alignSelection(edge)}
          >
            {t(key as Parameters<typeof t>[0])}
          </button>
        ))}
      </div>

      <div className="field-label">{t("insp.distribute")}</div>
      <div className="align-grid two">
        <button
          type="button"
          disabled={!canDistribute}
          onClick={() => distributeSelection("x")}
        >
          {t("insp.distributeX")}
        </button>
        <button
          type="button"
          disabled={!canDistribute}
          onClick={() => distributeSelection("y")}
        >
          {t("insp.distributeY")}
        </button>
      </div>

      {/* Say why, rather than leaving dead buttons to be puzzled over. */}
      {!canAlign && <p className="field-hint">{t("insp.alignSameParent")}</p>}
      {canAlign && !canDistribute && (
        <p className="field-hint">{t("insp.distributeNeedsThree")}</p>
      )}
    </>
  );
}
