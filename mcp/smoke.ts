/**
 * End-to-end smoke test: spawns the MCP server over stdio and exercises
 * every tool, including the layout carry-over on rewrite.
 *
 * Run:  npx tsx mcp/smoke.ts
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";

const root = await mkdtemp(join(tmpdir(), "graph-mcp-"));
const transport = new StdioClientTransport({
  command: process.platform === "win32" ? "npx.cmd" : "npx",
  args: ["tsx", "mcp/server.ts"],
  env: { ...process.env, GRAPH_DIR: root },
});
const client = new Client({ name: "smoke", version: "0.0.0" });

function firstText(res: Awaited<ReturnType<Client["callTool"]>>): string {
  const c = (res.content as Array<{ type: string; text?: string }>)[0];
  assert.equal(c.type, "text");
  return c.text ?? "";
}

try {
  await client.connect(transport);

  const tools = await client.listTools();
  const names = tools.tools.map((t) => t.name).sort();
  assert.deepEqual(names, ["list_diagrams", "read_diagram", "validate_mermaid", "write_diagram"]);
  console.log("✓ tools listed:", names.join(", "));

  // invalid code is rejected
  const bad = await client.callTool({
    name: "validate_mermaid",
    arguments: { code: "flowchart TD\n  a --> --> b\n" },
  });
  assert.equal(bad.isError, true);
  console.log("✓ invalid mermaid rejected");

  // write a diagram with a manual layout
  const v1 = `flowchart TD
  a["Alpha"] --> b{"Beta?"}

%% graph:positions {"a":{"x":100,"y":50},"b":{"x":100,"y":200}}
`;
  const w1 = JSON.parse(
    firstText(await client.callTool({ name: "write_diagram", arguments: { path: "demo/flow.mmd", code: v1 } })),
  );
  assert.equal(w1.written, true);
  assert.equal(w1.structure.hasManualLayout, true);
  console.log("✓ diagram written with manual layout");

  // LLM-style rewrite without positions: layout must be carried over
  const v2 = `flowchart TD
  a["Alpha"] --> b{"Beta?"}
  b -->|"yes"| c["Gamma"]
`;
  const w2 = JSON.parse(
    firstText(await client.callTool({ name: "write_diagram", arguments: { path: "demo/flow.mmd", code: v2 } })),
  );
  assert.equal(w2.layoutCarriedOver, true);
  const onDisk = await readFile(join(root, "demo", "flow.mmd"), "utf8");
  assert.match(onDisk, /graph:positions/);
  assert.match(onDisk, /"a":\{"x":100,"y":50\}/);
  assert.ok(!/"c":/.test(onDisk), "new node c has no stale position");
  console.log("✓ rewrite without positions carried the old layout over");

  // read it back with structure
  const r = JSON.parse(
    firstText(await client.callTool({ name: "read_diagram", arguments: { path: "demo/flow.mmd" } })),
  );
  assert.equal(r.structure.nodes.length, 3);
  assert.equal(r.structure.edges.length, 2);
  console.log("✓ read_diagram returns code + structure");

  // listing
  const l = JSON.parse(firstText(await client.callTool({ name: "list_diagrams", arguments: {} })));
  assert.deepEqual(l.diagrams, [join("demo", "flow.mmd")]);
  console.log("✓ list_diagrams finds the file");

  // path escape is refused
  const esc = await client.callTool({
    name: "read_diagram",
    arguments: { path: "../outside.mmd" },
  });
  assert.equal(esc.isError, true);
  console.log("✓ path traversal refused");

  console.log("\nAll MCP smoke checks passed.");
} finally {
  await client.close().catch(() => {});
  await rm(root, { recursive: true, force: true });
}
