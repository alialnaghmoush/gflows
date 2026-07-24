/**
 * Thin stdio MCP server exposing gflows tools for coding agents.
 * @module commands/mcp
 */

import { EXIT_OK } from "../constants.js";
import type { ParsedArgs } from "../types.js";
import { getVersion } from "../version.js";

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

const TOOLS = [
  {
    name: "gflows_status",
    description: "Show current branch flow info (non-interactive).",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string", description: "Repo path" }, json: { type: "boolean" } },
    },
  },
  {
    name: "gflows_doctor",
    description: "Run repo health checks.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" } },
    },
  },
  {
    name: "gflows_info",
    description: "Describe repo layout (monolith/monorepo), package versions, and stacks.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" } },
    },
  },
  {
    name: "gflows_list",
    description: "List workflow branches.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        type: { type: "string" },
        includeRemote: { type: "boolean" },
      },
    },
  },
  {
    name: "gflows_start",
    description: "Create a workflow branch. Requires type and name.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        type: { type: "string" },
        name: { type: "string" },
        from: { type: "string" },
        push: { type: "boolean" },
      },
      required: ["type", "name"],
    },
  },
  {
    name: "gflows_sync",
    description: "Sync current workflow branch from its base.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        rebase: { type: "boolean" },
        force: { type: "boolean" },
      },
    },
  },
  {
    name: "gflows_finish",
    description: "Finish a workflow branch (non-interactive; pass -y and push flag).",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        branch: { type: "string" },
        type: { type: "string" },
        push: { type: "boolean" },
        noDelete: { type: "boolean" },
        preview: { type: "boolean" },
      },
    },
  },
  {
    name: "gflows_schema",
    description: "Return the gflows command schema JSON.",
    inputSchema: { type: "object", properties: {} },
  },
] as const;

function respond(id: string | number | null | undefined, result: unknown): void {
  const msg = { jsonrpc: "2.0", id: id ?? null, result };
  console.log(JSON.stringify(msg));
}

function respondError(id: string | number | null | undefined, message: string): void {
  console.log(
    JSON.stringify({
      jsonrpc: "2.0",
      id: id ?? null,
      error: { code: -32000, message },
    }),
  );
}

async function runTool(
  name: string,
  args: Record<string, unknown>,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const cliPath = new URL("../cli.ts", import.meta.url).pathname;
  const path = typeof args.path === "string" ? args.path : process.cwd();
  const argv: string[] = ["-C", path, "-y"];

  switch (name) {
    case "gflows_status":
      argv.push("status");
      if (args.json !== false) argv.push("--json");
      break;
    case "gflows_doctor":
      argv.push("doctor", "--json");
      break;
    case "gflows_info":
      argv.push("info", "--json");
      break;
    case "gflows_list":
      argv.push("list", "-q");
      if (typeof args.type === "string") argv.push(args.type);
      if (args.includeRemote) argv.push("-r");
      break;
    case "gflows_start":
      argv.push("start", String(args.type), String(args.name));
      if (typeof args.from === "string") argv.push("-o", args.from);
      if (args.push) argv.push("-p");
      else argv.push("-P");
      break;
    case "gflows_sync":
      argv.push("sync");
      if (args.rebase) argv.push("--rebase");
      if (args.force) argv.push("--force");
      break;
    case "gflows_finish":
      argv.push("finish");
      if (typeof args.type === "string") argv.push(args.type);
      if (typeof args.branch === "string") argv.push("-B", args.branch);
      if (args.preview) argv.push("--preview");
      if (args.noDelete) argv.push("-N");
      if (args.push) argv.push("-p");
      else argv.push("-P");
      break;
    case "gflows_schema":
      argv.push("schema");
      break;
    default:
      return { stdout: "", stderr: `Unknown tool ${name}`, exitCode: 1 };
  }

  const proc = Bun.spawn(["bun", cliPath, ...argv], {
    cwd: path,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env },
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  return { stdout, stderr, exitCode };
}

/**
 * Starts a minimal JSON-RPC MCP-like stdio loop.
 */
export async function run(_args: ParsedArgs): Promise<void> {
  console.error(
    "gflows mcp: listening on stdio (JSON-RPC). Tools: status, doctor, info, list, start, sync, finish, schema.",
  );

  const decoder = new TextDecoder();
  let buffer = "";

  for await (const chunk of Bun.stdin.stream()) {
    buffer += decoder.decode(chunk);
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let req: JsonRpcRequest;
      try {
        req = JSON.parse(trimmed) as JsonRpcRequest;
      } catch {
        continue;
      }

      if (req.method === "initialize") {
        respond(req.id, {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "gflows", version: getVersion() },
        });
        continue;
      }
      if (req.method === "notifications/initialized") {
        continue;
      }
      if (req.method === "tools/list") {
        respond(req.id, { tools: TOOLS });
        continue;
      }
      if (req.method === "tools/call") {
        const params = req.params ?? {};
        const name = String(params.name ?? "");
        const toolArgs = (params.arguments ?? {}) as Record<string, unknown>;
        try {
          const result = await runTool(name, toolArgs);
          respond(req.id, {
            content: [
              {
                type: "text",
                text: JSON.stringify(result),
              },
            ],
            isError: result.exitCode !== 0,
          });
        } catch (err) {
          respondError(req.id, err instanceof Error ? err.message : String(err));
        }
        continue;
      }
      if (req.method === "ping") {
        respond(req.id, {});
      }
    }
  }

  process.exit(EXIT_OK);
}
