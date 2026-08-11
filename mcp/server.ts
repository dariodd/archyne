/**
 * MCP server exposing Archyne's mermaid diagrams to LLM agents.
 *
 * Diagrams are plain .mmd files under GRAPH_DIR (default: cwd). Agents can
 * list, read, validate and write them; writes are parser-validated, and a
 * rewrite that drops the %% graph:positions line inherits the old manual
 * layout for nodes that still exist.
 *
 * Run:  npx tsx mcp/server.ts
 */
import { JSDOM } from "jsdom";

// mermaid needs DOM globals at module-evaluation time, so install them
// before any (dynamic) import of the model code.
const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
try {
  g.navigator = dom.window.navigator;
} catch {
  // Node ≥21 exposes a read-only global navigator; that one works too.
}

const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
const { z } = await import("zod");
const path = await import("node:path");
const fs = await import("node:fs/promises");
const { parseDiagram } = await import("../src/model/diagram.ts");
const { carryOverPositions, readPositions } = await import("../src/model/positions.ts");
const { carryOverWaypoints, waypointKeys } = await import("../src/model/waypoints.ts");

const ROOT = path.resolve(process.env.GRAPH_DIR ?? process.cwd());
const SKIP_DIRS = new Set(["node_modules", "dist", ".git"]);

function resolveSafe(rel: string): string {
  const abs = path.resolve(ROOT, rel);
  if (abs !== ROOT && !abs.startsWith(ROOT + path.sep)) {
    throw new Error(`Path escapes the diagram root (${ROOT}): ${rel}`);
  }
  return abs;
}

async function listMmd(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) out.push(...(await listMmd(path.join(dir, entry.name))));
    } else if (entry.name.endsWith(".mmd")) {
      out.push(path.relative(ROOT, path.join(dir, entry.name)));
    }
  }
  return out;
}

async function structureOf(code: string) {
  const parsed = await parseDiagram(code);
  return {
    kind: parsed.kind,
    direction: parsed.direction,
    nodes: parsed.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      parent: n.parentId,
      ...n.data,
      direction: undefined,
    })),
    edges: parsed.edges.map((e) => ({
      source: e.source,
      target: e.target,
      ...e.data,
    })),
    hasManualLayout: readPositions(code) !== null,
  };
}

function text(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof data === "string" ? data : JSON.stringify(data, null, 2),
      },
    ],
  };
}

function errorText(err: unknown) {
  return {
    isError: true,
    content: [
      { type: "text" as const, text: err instanceof Error ? err.message : String(err) },
    ],
  };
}

/**
 * Read from the manifest rather than written here. This string is what an MCP
 * client records and reports as the server it talked to, and a second copy of
 * a version number is a copy that stops being true — this one said 0.1.0
 * across three releases.
 */
const { version } = JSON.parse(
  await fs.readFile(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string };

const server = new McpServer({ name: "archyne", version });

server.registerTool(
  "list_diagrams",
  {
    title: "List diagrams",
    description: `List all mermaid diagram files (.mmd) under the diagram root (${ROOT}).`,
    inputSchema: {},
  },
  async () => text({ root: ROOT, diagrams: await listMmd(ROOT) }),
);

server.registerTool(
  "read_diagram",
  {
    title: "Read diagram",
    description:
      "Read a .mmd diagram file. Returns the raw mermaid source plus a parsed structural summary (nodes, edges, groups). The %% graph:positions comment holds the user's manual layout — preserve it verbatim unless you intend to move nodes.",
    inputSchema: { path: z.string().describe("Path relative to the diagram root") },
  },
  async ({ path: rel }) => {
    try {
      const code = await fs.readFile(resolveSafe(rel), "utf8");
      return text({ path: rel, code, structure: await structureOf(code) });
    } catch (err) {
      return errorText(err);
    }
  },
);

server.registerTool(
  "validate_mermaid",
  {
    title: "Validate mermaid code",
    description:
      "Validate mermaid diagram code (flowchart, stateDiagram-v2, erDiagram, classDiagram) without writing anything. Returns the parsed structure, or the parse error.",
    inputSchema: { code: z.string().describe("Mermaid diagram source") },
  },
  async ({ code }) => {
    try {
      return text({ valid: true, structure: await structureOf(code) });
    } catch (err) {
      return errorText(err);
    }
  },
);

server.registerTool(
  "write_diagram",
  {
    title: "Write diagram",
    description:
      "Create or overwrite a .mmd diagram file. The code is validated with mermaid's parser first — invalid code is rejected and nothing is written. If the file already had %% graph:positions or %% graph:waypoints lines and the new code has none, the layout is carried over for the nodes and edges that still exist, so the user's manual work survives your edit.",
    inputSchema: {
      path: z.string().describe("Path relative to the diagram root, e.g. docs/flow.mmd"),
      code: z.string().describe("Complete mermaid diagram source"),
    },
  },
  async ({ path: rel, code }) => {
    try {
      const abs = resolveSafe(rel);
      const parsed = await parseDiagram(code); // validate before touching disk
      let finalCode = code;
      try {
        const existing = await fs.readFile(abs, "utf8");
        finalCode = carryOverPositions(
          existing,
          code,
          parsed.nodes.map((n) => n.id),
        );
        // The same bargain for hand-routed edges: an edit that does not
        // mention the corners should not be read as removing them.
        finalCode = carryOverWaypoints(
          existing,
          finalCode,
          waypointKeys(parsed.edges).values(),
        );
      } catch {
        // new file — nothing to carry over
      }
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, finalCode, "utf8");
      return text({
        path: rel,
        written: true,
        layoutCarriedOver: finalCode !== code,
        structure: await structureOf(finalCode),
      });
    } catch (err) {
      return errorText(err);
    }
  },
);

await server.connect(new StdioServerTransport());
console.error(`archyne MCP server ready — diagram root: ${ROOT}`);
