import { useEffect, useState } from "react";
import { useGraphStore } from "../store";
import { useIconPrefs } from "../iconPrefs";
import { SHAPES, SHAPE_LABELS, type NodeSeed, type Shape } from "../model/types";
import { BUILTIN_ICON_NAMES, ICON_COLLECTIONS, iconsByPrefix, searchIcons } from "../icons";
import { IconView } from "./ArchView";

/** Draggable icon cell with a favorite toggle. */
function IconCell({ name }: { name: string }) {
  const favorites = useIconPrefs((s) => s.favorites);
  const toggleFavorite = useIconPrefs((s) => s.toggleFavorite);
  const fav = favorites.includes(name);
  return (
    <div
      className="icon-cell"
      title={name}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(
          "application/x-graph-node",
          JSON.stringify({ type: "service", icon: name } satisfies NodeSeed),
        );
      }}
    >
      <IconView name={name} size={26} />
      <button
        className={`star${fav ? " active" : ""}`}
        title={fav ? "Remove from favorites" : "Add to favorites"}
        onClick={(e) => {
          e.stopPropagation();
          toggleFavorite(name);
        }}
      >
        {fav ? "★" : "☆"}
      </button>
    </div>
  );
}

const GROUP_PREVIEW = "M4,3 h40 v18 h-40 Z M4,3 v4 M8,3 h6";

const GROUP_ITEM: Item = {
  label: "Group",
  seed: { type: "group" },
  preview: GROUP_PREVIEW,
};

const SHAPE_PREVIEW: Record<Shape, string> = {
  square: "M2,2 h44 v20 h-44 Z",
  round: "M8,2 h32 a6,6 0 0 1 6,6 v8 a6,6 0 0 1 -6,6 h-32 a6,6 0 0 1 -6,-6 v-8 a6,6 0 0 1 6,-6",
  stadium: "M12,2 h24 a10,10 0 0 1 0,20 h-24 a10,10 0 0 1 0,-20",
  subroutine: "M2,2 h44 v20 h-44 Z M7,2 v20 M41,2 v20",
  cylinder: "M2,6 a22,4 0 0 1 44,0 v12 a22,4 0 0 1 -44,0 Z M2,6 a22,4 0 0 0 44,0",
  circle: "M24,2 a10,10 0 1 1 0,20 a10,10 0 1 1 0,-20",
  doublecircle: "M24,2 a10,10 0 1 1 0,20 a10,10 0 1 1 0,-20 M24,5 a7,7 0 1 1 0,14 a7,7 0 1 1 0,-14",
  diamond: "M24,1 L46,12 L24,23 L2,12 Z",
  hexagon: "M10,2 h28 l8,10 l-8,10 h-28 l-8,-10 Z",
  odd: "M2,12 L10,2 h36 v20 h-36 Z",
  trapezoid: "M10,2 h28 l8,20 h-44 Z",
  inv_trapezoid: "M2,2 h44 l-8,20 h-28 Z",
  lean_right: "M9,2 h37 l-7,20 h-37 Z",
  lean_left: "M2,2 h37 l7,20 h-37 Z",
};

interface Item {
  label: string;
  seed: NodeSeed;
  preview: string;
}

const STATE_ITEMS: Item[] = [
  { label: "State", seed: { type: "state", stateType: "normal" }, preview: SHAPE_PREVIEW.round },
  { label: "Start", seed: { type: "state", stateType: "start" }, preview: "M24,4 a8,8 0 1 1 0,16 a8,8 0 1 1 0,-16 Z" },
  { label: "End", seed: { type: "state", stateType: "end" }, preview: "M24,2 a10,10 0 1 1 0,20 a10,10 0 1 1 0,-20 M24,7 a5,5 0 1 1 0,10 a5,5 0 1 1 0,-10 Z" },
  { label: "Choice", seed: { type: "state", stateType: "choice" }, preview: "M24,1 L46,12 L24,23 L2,12 Z" },
  { label: "Fork / Join", seed: { type: "state", stateType: "fork" }, preview: "M6,9 h36 v6 h-36 Z" },
];
const ER_ITEMS: Item[] = [
  { label: "Entity", seed: { type: "entity" }, preview: "M2,2 h44 v20 h-44 Z M2,10 h44" },
];
const CLASS_ITEMS: Item[] = [
  { label: "Class", seed: { type: "class" }, preview: "M2,2 h44 v20 h-44 Z M2,9 h44 M2,16 h44" },
  { label: "Note", seed: { type: "note" }, preview: "M4,2 h32 l8,8 v12 h-40 Z M36,2 v8 h8" },
];
const C4_ITEMS: Item[] = [
  { label: "Person", seed: { type: "c4", c4Shape: "person" }, preview: "M24,3 a4,4 0 1 1 0,8 a4,4 0 1 1 0,-8 M14,22 v-3 a10,7 0 0 1 20,0 v3" },
  { label: "System", seed: { type: "c4", c4Shape: "system" }, preview: "M4,4 h40 v16 h-40 Z" },
  { label: "System (ext)", seed: { type: "c4", c4Shape: "external_system" }, preview: "M4,4 h40 v16 h-40 Z M8,8 h6" },
  { label: "System DB", seed: { type: "c4", c4Shape: "system_db" }, preview: "M6,7 a18,4 0 0 1 36,0 v10 a18,4 0 0 1 -36,0 Z" },
  { label: "Container", seed: { type: "c4", c4Shape: "container" }, preview: "M6,4 h36 a4,4 0 0 1 4,4 v8 a4,4 0 0 1 -4,4 h-36 a4,4 0 0 1 -4,-4 v-8 a4,4 0 0 1 4,-4" },
  { label: "Component", seed: { type: "c4", c4Shape: "component" }, preview: "M8,4 h36 v16 h-36 Z M4,8 h8 M4,14 h8" },
];

const SEQ_ITEMS: Item[] = [
  {
    label: "Participant",
    seed: { type: "participant", ptype: "participant" },
    preview: "M6,2 h36 v12 h-36 Z M24,14 v8",
  },
  {
    label: "Actor",
    seed: { type: "participant", ptype: "actor" },
    preview: "M24,2 a4,4 0 1 1 0,8 a4,4 0 1 1 0,-8 M24,10 v6 M16,13 h16 M24,16 l-6,6 M24,16 l6,6",
  },
  { label: "Note", seed: { type: "seqnote" }, preview: "M4,2 h32 l8,8 v12 h-40 Z M36,2 v8 h8" },
  { label: "Loop", seed: { type: "seqblock", op: "loop" }, preview: "M2,2 h44 v20 h-44 Z M2,9 h16 M2,2 v7" },
  { label: "Alt / Else", seed: { type: "seqblock", op: "alt" }, preview: "M2,2 h44 v20 h-44 Z M2,9 h14 M2,13 h44" },
  { label: "Opt", seed: { type: "seqblock", op: "opt" }, preview: "M2,2 h44 v20 h-44 Z M2,9 h12" },
];

function PaletteItem({ item }: { item: Item }) {
  return (
    <div
      className="palette-item"
      title={item.label}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("application/x-graph-node", JSON.stringify(item.seed));
        e.dataTransfer.effectAllowed = "move";
      }}
    >
      <svg width={48} height={24} viewBox="0 0 48 24">
        <path d={item.preview} className="palette-shape" />
      </svg>
      <span>{item.label}</span>
    </div>
  );
}

interface IconCategory {
  label: string;
  prefixes: string[];
  /** Restrict the category to specific collections (default: all). */
  collections?: string[];
}

const ICON_CATEGORIES: IconCategory[] = [
  { label: "AWS", prefixes: ["aws"] },
  { label: "Google", prefixes: ["google", "gcp", "firebase"] },
  { label: "Azure", prefixes: ["azure", "microsoft"], collections: ["logos", "devicon", "simple-icons"] },
  {
    label: "Generic",
    collections: ["carbon", "tabler"],
    prefixes: [
      "bare-metal-server",
      "load-balancer",
      "firewall",
      "gateway",
      "server",
      "data-base",
      "database",
      "user-multiple",
      "user",
      "devices",
      "mobile",
      "browser",
      "network",
      "queue",
      "api",
      "cloud",
      "shield",
      "mail",
      "lock",
      "world",
      "router",
    ],
  },
  {
    label: "Data",
    prefixes: [
      "postgresql",
      "mysql",
      "mariadb",
      "mongodb",
      "redis",
      "elastic",
      "kafka",
      "rabbitmq",
      "cassandra",
      "snowflake",
      "sqlite",
      "clickhouse",
      "influxdb",
      "neo4j",
    ],
  },
  {
    label: "DevOps",
    prefixes: [
      "kubernetes",
      "docker",
      "terraform",
      "ansible",
      "jenkins",
      "github",
      "gitlab",
      "argo",
      "prometheus",
      "grafana",
      "nginx",
      "helm",
      "vault",
      "consul",
      "istio",
    ],
  },
];

const COMMON_ICONS = [
  "logos:aws",
  "logos:aws-lambda",
  "logos:aws-s3",
  "logos:aws-rds",
  "logos:aws-ec2",
  "logos:aws-dynamodb",
  "logos:aws-sqs",
  "logos:aws-api-gateway",
  "logos:microsoft-azure",
  "logos:google-cloud",
  "logos:kubernetes",
  "logos:docker-icon",
  "logos:postgresql",
  "logos:mysql",
  "logos:redis",
  "logos:kafka-icon",
  "logos:nginx",
  "logos:rabbitmq-icon",
];

function ArchPalette() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [results, setResults] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    const q = query.trim();
    if (!q && !category) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      const fetch = q
        ? searchIcons(q)
        : (async () => {
            const cat = ICON_CATEGORIES.find((c) => c.label === category)!;
            const out: string[] = [];
            for (const collection of cat.collections ?? ICON_COLLECTIONS) {
              out.push(...(await iconsByPrefix(collection, cat.prefixes, 48)));
              if (out.length >= 144) break;
            }
            return out.slice(0, 144);
          })();
      void fetch.then((r) => {
        if (alive) setResults(r);
      });
    }, 200);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [query, category]);

  const icons = query.trim() || category ? results : COMMON_ICONS;
  const favorites = useIconPrefs((s) => s.favorites);
  const recents = useIconPrefs((s) => s.recents);
  const pinned = [...favorites, ...recents.filter((r) => !favorites.includes(r))];

  return (
    <aside className="palette palette-arch">
      <div className="panel-title">Base</div>
      <div className="palette-grid">
        {BUILTIN_ICON_NAMES.map((name) => (
          <div
            key={name}
            className="palette-item"
            title={name}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(
                "application/x-graph-node",
                JSON.stringify({ type: "service", icon: name } satisfies NodeSeed),
              );
            }}
          >
            <span className="palette-icon-slot">
              <IconView name={name} size={22} />
            </span>
            <span>{name}</span>
          </div>
        ))}
        <div
          className="palette-item"
          title="junction"
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData(
              "application/x-graph-node",
              JSON.stringify({ type: "junction" } satisfies NodeSeed),
            );
          }}
        >
          <span className="palette-icon-slot">
            <span className="junction-preview" />
          </span>
          <span>junction</span>
        </div>
        <PaletteItem item={GROUP_ITEM} />
      </div>
      {pinned.length > 0 && (
        <>
          <div className="panel-title">Recent &amp; favorites</div>
          <div className="icon-grid pinned">
            {pinned.map((name) => (
              <IconCell key={name} name={name} />
            ))}
          </div>
        </>
      )}
      <div className="panel-title">Vendor icons</div>
      <input
        className="icon-search"
        placeholder="Search 13000+ icons…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="chip-row">
        {ICON_CATEGORIES.map((c) => (
          <button
            key={c.label}
            className={`chip${category === c.label && !query.trim() ? " active" : ""}`}
            onClick={() => {
              setQuery("");
              setCategory(category === c.label ? null : c.label);
            }}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="icon-grid">
        {icons.map((name) => (
          <IconCell key={name} name={name} />
        ))}
        {query.trim() && icons.length === 0 && (
          <div className="palette-hint">No icons found</div>
        )}
      </div>
    </aside>
  );
}

export function Palette() {
  const kind = useGraphStore((s) => s.kind);

  if (kind === "architecture") return <ArchPalette />;

  const base: Item[] =
    kind === "flowchart"
      ? SHAPES.map((shape) => ({
          label: SHAPE_LABELS[shape],
          seed: { type: "shape", shape },
          preview: SHAPE_PREVIEW[shape],
        }))
      : kind === "state"
        ? STATE_ITEMS
        : kind === "er"
          ? ER_ITEMS
          : kind === "class"
            ? CLASS_ITEMS
            : kind === "c4"
              ? C4_ITEMS
              : SEQ_ITEMS;

  const groupLabel =
    kind === "flowchart"
      ? "Subgraph"
      : kind === "state"
        ? "Composite state"
        : kind === "c4"
          ? "Boundary"
          : kind === "class"
            ? "Namespace"
            : null;
  const items: Item[] = groupLabel
    ? [...base, { ...GROUP_ITEM, label: groupLabel }]
    : base;

  return (
    <aside className="palette">
      <div className="panel-title">Shapes</div>
      <div className="palette-hint">Drag onto the canvas</div>
      <div className="palette-grid">
        {items.map((item) => (
          <PaletteItem key={item.label} item={item} />
        ))}
      </div>
    </aside>
  );
}
