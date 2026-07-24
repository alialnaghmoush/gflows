/**
 * Repo inspection for `gflows info`: layout, versions, and stack detection.
 * @module repo-inspect
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { resolveConfig } from "./config.js";
import { getCurrentBranch, runGit } from "./git.js";
import { findPackageRoots, type PackageJsonFields, readPackageJson } from "./packages.js";

/** Layout classification. */
export type RepoLayout = "monolith" | "monorepo";

/** One detected stack entry. */
export interface StackHit {
  id: string;
  name: string;
  packages: string[];
}

/** One package.json summary row. */
export interface PackageVersionRow {
  path: string;
  name: string | null;
  version: string | null;
  private: boolean;
}

/** Structured report for CLI, hub, and tests. */
export interface InfoReport {
  root: string;
  layout: RepoLayout;
  layoutReasons: string[];
  name: string | null;
  version: string | null;
  description: string | null;
  packages: PackageVersionRow[];
  stacks: {
    frontend: StackHit[];
    fullstack: StackHit[];
    backend: StackHit[];
  };
  packageManager: string | null;
  remoteUrl: string | null;
  branch: string | null;
  gflows: { main: string; dev: string; remote: string };
  runtimes: string[];
}

type StackKind = "frontend" | "fullstack" | "backend";

interface StackRule {
  id: string;
  name: string;
  kind: StackKind;
  keys: string[];
  /** When set, all keys must be present (AND). Otherwise any key matches (OR). */
  requireAll?: boolean;
}

const STACK_RULES: StackRule[] = [
  // Frontend
  { id: "react", name: "React", kind: "frontend", keys: ["react"] },
  { id: "vue", name: "Vue", kind: "frontend", keys: ["vue"] },
  { id: "angular", name: "Angular", kind: "frontend", keys: ["@angular/core"] },
  { id: "svelte", name: "Svelte", kind: "frontend", keys: ["svelte"] },
  { id: "solid", name: "Solid", kind: "frontend", keys: ["solid-js"] },
  { id: "qwik", name: "Qwik", kind: "frontend", keys: ["@builder.io/qwik"] },
  { id: "preact", name: "Preact", kind: "frontend", keys: ["preact"] },
  { id: "alpine", name: "Alpine.js", kind: "frontend", keys: ["alpinejs"] },
  { id: "lit", name: "Lit", kind: "frontend", keys: ["lit", "lit-element"] },
  { id: "expo", name: "Expo", kind: "frontend", keys: ["expo"] },
  { id: "react-native", name: "React Native", kind: "frontend", keys: ["react-native"] },
  // Fullstack
  { id: "next", name: "Next.js", kind: "fullstack", keys: ["next"] },
  { id: "nuxt", name: "Nuxt", kind: "fullstack", keys: ["nuxt", "nuxt3"] },
  { id: "sveltekit", name: "SvelteKit", kind: "fullstack", keys: ["@sveltejs/kit"] },
  { id: "astro", name: "Astro", kind: "fullstack", keys: ["astro"] },
  {
    id: "remix",
    name: "Remix",
    kind: "fullstack",
    keys: ["remix", "@remix-run/node", "@remix-run/react", "@remix-run/serve"],
  },
  {
    id: "react-router",
    name: "React Router (framework)",
    kind: "fullstack",
    keys: ["@react-router/node", "@react-router/dev", "@react-router/serve"],
  },
  {
    id: "tanstack-start",
    name: "TanStack Start",
    kind: "fullstack",
    keys: ["@tanstack/react-start", "@tanstack/solid-start"],
  },
  { id: "solidstart", name: "SolidStart", kind: "fullstack", keys: ["@solidjs/start"] },
  {
    id: "analog",
    name: "Analog",
    kind: "fullstack",
    keys: ["@analogjs/platform", "@analogjs/vite-plugin-angular"],
  },
  {
    id: "redwood",
    name: "RedwoodJS",
    kind: "fullstack",
    keys: ["@redwoodjs/core", "@redwoodjs/api"],
  },
  { id: "blitz", name: "Blitz", kind: "fullstack", keys: ["blitz"] },
  { id: "quasar", name: "Quasar", kind: "fullstack", keys: ["quasar"] },
  { id: "gatsby", name: "Gatsby", kind: "fullstack", keys: ["gatsby"] },
  // Backend
  { id: "express", name: "Express", kind: "backend", keys: ["express"] },
  { id: "nestjs", name: "NestJS", kind: "backend", keys: ["@nestjs/core"] },
  { id: "fastify", name: "Fastify", kind: "backend", keys: ["fastify"] },
  { id: "hono", name: "Hono", kind: "backend", keys: ["hono"] },
  { id: "elysia", name: "Elysia", kind: "backend", keys: ["elysia"] },
  { id: "koa", name: "Koa", kind: "backend", keys: ["koa"] },
  { id: "oak", name: "Oak", kind: "backend", keys: ["@oak/oak", "oak"] },
  { id: "hapi", name: "Hapi", kind: "backend", keys: ["@hapi/hapi"] },
  { id: "restify", name: "Restify", kind: "backend", keys: ["restify"] },
  { id: "trpc", name: "tRPC", kind: "backend", keys: ["@trpc/server"] },
  { id: "nitro", name: "Nitro", kind: "backend", keys: ["nitropack", "nitro"] },
  { id: "encore", name: "Encore.ts", kind: "backend", keys: ["encore.dev"] },
  { id: "adonis", name: "AdonisJS", kind: "backend", keys: ["@adonisjs/core"] },
  { id: "feathers", name: "Feathers", kind: "backend", keys: ["@feathersjs/feathers"] },
  { id: "socketio", name: "Socket.IO", kind: "backend", keys: ["socket.io"] },
];

const WORKSPACE_MARKER_FILES = [
  "pnpm-workspace.yaml",
  "lerna.json",
  "nx.json",
  "turbo.json",
  "rush.json",
  "go.work",
] as const;

/**
 * Collects direct dependency names from a package.json.
 */
function directDepNames(pkg: PackageJsonFields): Set<string> {
  const names = new Set<string>();
  for (const block of [pkg.dependencies, pkg.devDependencies, pkg.peerDependencies]) {
    if (!block) continue;
    for (const key of Object.keys(block)) names.add(key);
  }
  return names;
}

/**
 * Detects package manager from lockfiles at repo root.
 */
function detectPackageManager(root: string): string | null {
  if (existsSync(join(root, "bun.lockb")) || existsSync(join(root, "bun.lock"))) return "bun";
  if (existsSync(join(root, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(root, "yarn.lock"))) return "yarn";
  if (existsSync(join(root, "package-lock.json"))) return "npm";
  return null;
}

/**
 * Detects monorepo vs monolith and returns reasons.
 */
function detectLayout(
  root: string,
  rootPkg: PackageJsonFields | null,
  packageRoots: string[],
): { layout: RepoLayout; reasons: string[] } {
  const reasons: string[] = [];

  if (rootPkg?.workspaces !== undefined) {
    reasons.push("package.json workspaces");
  }
  for (const file of WORKSPACE_MARKER_FILES) {
    if (existsSync(join(root, file))) {
      reasons.push(file);
    }
  }
  if (existsSync(join(root, "Cargo.toml"))) {
    try {
      const cargo = readFileSync(join(root, "Cargo.toml"), "utf-8");
      if (/\[workspace\]/.test(cargo)) reasons.push("Cargo.toml [workspace]");
    } catch {
      /* ignore */
    }
  }
  if (packageRoots.length > 1) {
    reasons.push(`${packageRoots.length} package.json files`);
  }

  if (reasons.length > 0) {
    return { layout: "monorepo", reasons };
  }
  return { layout: "monolith", reasons: ["single package root"] };
}

/**
 * Matches stack rules against direct deps of one package.
 */
function matchStacks(
  depNames: Set<string>,
  packageLabel: string,
  acc: Map<string, StackHit>,
): void {
  for (const rule of STACK_RULES) {
    const hit = rule.requireAll
      ? rule.keys.every((k) => depNames.has(k))
      : rule.keys.some((k) => depNames.has(k));
    if (!hit) continue;
    const existing = acc.get(rule.id);
    if (existing) {
      if (!existing.packages.includes(packageLabel)) {
        existing.packages.push(packageLabel);
      }
    } else {
      acc.set(rule.id, {
        id: rule.id,
        name: rule.name,
        packages: [packageLabel],
      });
    }
  }
}

/**
 * When NestJS is present, drop Express/Fastify if they only appear as Nest platforms.
 */
function suppressNestPlatformNoise(hits: Map<string, StackHit>): void {
  if (!hits.has("nestjs")) return;
  for (const id of ["express", "fastify"] as const) {
    const nest = hits.get("nestjs");
    const platform = hits.get(id);
    if (!nest || !platform) continue;
    const onlyNestPkgs = platform.packages.every((p) => nest.packages.includes(p));
    if (onlyNestPkgs) hits.delete(id);
  }
}

/**
 * Detects non-JS runtimes / frameworks from root manifests.
 */
function detectNonJsRuntimes(root: string): string[] {
  const out: string[] = [];
  if (existsSync(join(root, "go.mod"))) out.push("Go");
  if (existsSync(join(root, "Cargo.toml"))) out.push("Rust");
  if (
    existsSync(join(root, "pyproject.toml")) ||
    existsSync(join(root, "requirements.txt")) ||
    existsSync(join(root, "Pipfile"))
  ) {
    out.push("Python");
    for (const file of ["pyproject.toml", "requirements.txt", "Pipfile"] as const) {
      const path = join(root, file);
      if (!existsSync(path)) continue;
      try {
        const text = readFileSync(path, "utf-8").toLowerCase();
        if (text.includes("django")) out.push("Django");
        if (text.includes("flask")) out.push("Flask");
        if (text.includes("fastapi")) out.push("FastAPI");
      } catch {
        /* ignore */
      }
    }
  }
  if (existsSync(join(root, "Gemfile"))) {
    out.push("Ruby");
    try {
      const gem = readFileSync(join(root, "Gemfile"), "utf-8").toLowerCase();
      if (/\brails\b/.test(gem)) out.push("Rails");
    } catch {
      /* ignore */
    }
  }
  if (existsSync(join(root, "composer.json"))) {
    out.push("PHP");
    try {
      const composer = readFileSync(join(root, "composer.json"), "utf-8");
      if (composer.includes("laravel/framework")) out.push("Laravel");
    } catch {
      /* ignore */
    }
  }
  if (hasFileWithExt(root, ".csproj") || hasFileWithExt(root, ".sln")) {
    out.push(".NET");
  }
  if (
    existsSync(join(root, "pom.xml")) ||
    existsSync(join(root, "build.gradle")) ||
    existsSync(join(root, "build.gradle.kts"))
  ) {
    out.push("JVM");
  }
  return [...new Set(out)];
}

/**
 * Returns true if any file in `dir` (non-recursive) ends with `ext`.
 */
function hasFileWithExt(dir: string, ext: string): boolean {
  try {
    const entries = readdirSync(dir);
    return entries.some((name) => name.endsWith(ext));
  } catch {
    return false;
  }
}

/**
 * Formats package path relative to root (`.` for root).
 */
function packageLabel(root: string, dir: string): string {
  const rel = relative(root, dir);
  return rel === "" ? "." : rel;
}

/**
 * Collects a full info report for a git/repo root directory.
 */
export async function collectInfoReport(repoRoot: string): Promise<InfoReport> {
  const rootPkg = readPackageJson(repoRoot);
  let packageRoots = findPackageRoots(repoRoot);
  packageRoots = [...packageRoots].sort((a, b) => {
    if (a === repoRoot && b !== repoRoot) return -1;
    if (a !== repoRoot && b === repoRoot) return 1;
    return a.localeCompare(b);
  });

  const { layout, reasons } = detectLayout(repoRoot, rootPkg, packageRoots);

  const packages: PackageVersionRow[] = [];
  const stackAcc = new Map<string, StackHit>();
  const kindById = new Map(STACK_RULES.map((r) => [r.id, r.kind]));

  for (const dir of packageRoots) {
    const pkg = readPackageJson(dir);
    const label = packageLabel(repoRoot, dir);
    packages.push({
      path: label,
      name: typeof pkg?.name === "string" ? pkg.name : null,
      version: typeof pkg?.version === "string" ? pkg.version : null,
      private: pkg?.private === true,
    });
    if (pkg) {
      matchStacks(directDepNames(pkg), label, stackAcc);
    }
  }

  suppressNestPlatformNoise(stackAcc);

  const frontend: StackHit[] = [];
  const fullstack: StackHit[] = [];
  const backend: StackHit[] = [];
  for (const hit of stackAcc.values()) {
    const kind = kindById.get(hit.id);
    if (kind === "frontend") frontend.push(hit);
    else if (kind === "fullstack") fullstack.push(hit);
    else if (kind === "backend") backend.push(hit);
  }
  const byName = (a: StackHit, b: StackHit) => a.name.localeCompare(b.name);
  frontend.sort(byName);
  fullstack.sort(byName);
  backend.sort(byName);

  const gflows = resolveConfig(repoRoot, {}, {});
  let remoteUrl: string | null = null;
  try {
    const remoteResult = await runGit(["remote", "get-url", gflows.remote], {
      cwd: repoRoot,
      verbose: false,
    });
    const url = remoteResult.stdout.trim();
    if (url) remoteUrl = url;
  } catch {
    remoteUrl = null;
  }

  let branch: string | null = null;
  try {
    branch = await getCurrentBranch(repoRoot, { verbose: false });
  } catch {
    branch = null;
  }

  return {
    root: repoRoot,
    layout,
    layoutReasons: reasons,
    name: typeof rootPkg?.name === "string" ? rootPkg.name : null,
    version: typeof rootPkg?.version === "string" ? rootPkg.version : null,
    description: typeof rootPkg?.description === "string" ? rootPkg.description : null,
    packages,
    stacks: { frontend, fullstack, backend },
    packageManager: detectPackageManager(repoRoot),
    remoteUrl,
    branch,
    gflows: { main: gflows.main, dev: gflows.dev, remote: gflows.remote },
    runtimes: detectNonJsRuntimes(repoRoot),
  };
}

/**
 * Formats an InfoReport as human-readable lines.
 */
export function formatInfoReport(report: InfoReport): string[] {
  const lines: string[] = [];
  const title = report.name ?? (relative(process.cwd(), report.root) || report.root);
  lines.push(`Repo: ${title}  (${report.layout})`);
  if (report.version) {
    lines.push(`Version: ${report.version} (root)`);
  } else if (report.packages.length === 0) {
    lines.push("Version: (no package.json)");
  } else {
    lines.push("Version: (none at root)");
  }
  if (report.description) {
    lines.push(`Description: ${report.description}`);
  }

  const nested = report.packages.filter((p) => p.path !== ".");
  if (nested.length > 0) {
    lines.push("Packages:");
    for (const p of nested) {
      const ver = p.version ?? "—";
      const nm = p.name ? ` ${p.name}` : "";
      lines.push(`  ${p.path.padEnd(24)} ${ver}${nm}`);
    }
  }

  const fmt = (hits: StackHit[]) => hits.map((h) => h.name).join(", ");
  if (report.stacks.frontend.length > 0) {
    lines.push(`Frontend:  ${fmt(report.stacks.frontend)}`);
  }
  if (report.stacks.fullstack.length > 0) {
    lines.push(`Fullstack: ${fmt(report.stacks.fullstack)}`);
  }
  if (report.stacks.backend.length > 0) {
    lines.push(`Backend:   ${fmt(report.stacks.backend)}`);
  }
  if (
    report.stacks.frontend.length === 0 &&
    report.stacks.fullstack.length === 0 &&
    report.stacks.backend.length === 0 &&
    report.runtimes.length === 0
  ) {
    lines.push("Stacks:    (none detected)");
  }
  if (report.runtimes.length > 0) {
    lines.push(`Runtimes:  ${report.runtimes.join(", ")}`);
  }

  const meta: string[] = [];
  if (report.packageManager) meta.push(report.packageManager);
  meta.push(`${report.gflows.main}/${report.gflows.dev}`);
  if (report.branch) meta.push(`branch ${report.branch}`);
  if (meta.length > 0) {
    lines.push(`PM: ${meta.join(" · ")}`);
  }
  if (report.remoteUrl) {
    lines.push(`Remote: ${report.remoteUrl}`);
  }
  return lines;
}
