/**
 * Dependency-advisory gate for what Archyne actually ships.
 *
 * `npm audit` on its own is a poor gate: it reports the dev tree too (Electron,
 * Playwright, the toolchain — none of which reach a user), and a single new
 * transitive advisory turns every unrelated PR red until someone bumps a
 * lockfile. Both failure modes teach people to ignore it, which is worse than
 * having no gate.
 *
 * So this narrows the gate and makes the exceptions explicit:
 *
 *   - production dependencies only (`--omit=dev`)
 *   - fails on **high** and **critical**; anything lower is printed and passes
 *   - an advisory may be accepted in `audit-allow.json`, but only with a
 *     written reason and an expiry date. Expired entries fail — an exception
 *     you have to renew is an exception someone re-reads.
 *
 * Accept an advisory when it is genuinely unreachable from Archyne's code, not
 * because fixing it is inconvenient. Write down which of those it is.
 *
 * Run:  npm run audit
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BLOCKING = new Set(["high", "critical"]);

/**
 * `npm audit` exits non-zero as soon as it finds anything, so the report
 * arrives on stdout of a "failed" call — read it either way. Run through a
 * shell because npm is a `.cmd` shim on Windows; the command is a constant,
 * with nothing interpolated into it.
 */
function runAudit() {
  const cmd = "npm audit --json --omit=dev";
  const options = { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 };
  try {
    return execSync(cmd, options);
  } catch (err) {
    if (typeof err.stdout === "string" && err.stdout.trim()) return err.stdout;
    throw err;
  }
}

let report;
try {
  report = JSON.parse(runAudit());
} catch (err) {
  console.error(`Could not run \`npm audit\`: ${err.message}`);
  process.exit(1);
}

/**
 * Flatten to one row per advisory. npm nests them: a package's `via` holds
 * either advisory objects (the package is the source) or the names of other
 * packages (it is only affected downstream). Only the objects carry an id, and
 * the downstream entries are the same advisory reported again.
 */
const advisories = new Map();
for (const vuln of Object.values(report.vulnerabilities ?? {})) {
  for (const via of vuln.via ?? []) {
    if (typeof via !== "object") continue;
    const id = via.url?.match(/GHSA-[\w-]+/)?.[0] ?? `npm-${via.source}`;
    const existing = advisories.get(id);
    if (existing) {
      existing.affects.add(vuln.name);
      continue;
    }
    advisories.set(id, {
      id,
      severity: via.severity,
      title: via.title,
      url: via.url,
      package: via.name,
      range: via.range,
      affects: new Set([vuln.name]),
    });
  }
}

/** `{ allow: [{ id, reason, expires }] }` — see the docblock above. */
let allow = [];
try {
  allow = JSON.parse(readFileSync(join(root, "audit-allow.json"), "utf8")).allow ?? [];
} catch {
  // No allowlist is the normal state; only a malformed one is worth reporting.
}
const allowById = new Map(allow.map((a) => [a.id, a]));

const today = new Date().toISOString().slice(0, 10);
const blocking = [];
const accepted = [];
const informational = [];

for (const a of [...advisories.values()].sort((x, y) => x.id.localeCompare(y.id))) {
  if (!BLOCKING.has(a.severity)) {
    informational.push(a);
    continue;
  }
  const exception = allowById.get(a.id);
  if (!exception) {
    blocking.push({ ...a, why: "not accepted in audit-allow.json" });
  } else if (!exception.expires || exception.expires <= today) {
    blocking.push({
      ...a,
      why: exception.expires
        ? `acceptance expired on ${exception.expires} — re-check it or fix the advisory`
        : "acceptance has no `expires` date",
    });
  } else {
    accepted.push({ ...a, ...exception });
  }
}

const describe = (a) => `  ${a.severity.padEnd(8)} ${a.id}  ${a.package}@${a.range}`;

const counts = report.metadata?.vulnerabilities ?? {};
console.log(
  `Production dependencies: ${report.metadata?.dependencies?.prod ?? "?"} packages, ` +
    `${counts.total ?? 0} advisory/ies ` +
    `(${counts.critical ?? 0} critical, ${counts.high ?? 0} high, ` +
    `${counts.moderate ?? 0} moderate, ${counts.low ?? 0} low).`,
);

if (informational.length > 0) {
  console.log(`\nBelow the gate (reported, not blocking):`);
  for (const a of informational) {
    console.log(describe(a));
    console.log(`           ${a.title}`);
  }
}

if (accepted.length > 0) {
  console.log(`\nAccepted in audit-allow.json:`);
  for (const a of accepted) {
    console.log(describe(a));
    console.log(`           ${a.reason} (expires ${a.expires})`);
  }
}

if (blocking.length > 0) {
  console.error(`\n${blocking.length} blocking advisory/ies in production dependencies:`);
  for (const a of blocking) {
    console.error(describe(a));
    console.error(`           ${a.title}`);
    console.error(`           reaches: ${[...a.affects].join(", ")}`);
    console.error(`           ${a.url}`);
    console.error(`           ${a.why}`);
  }
  console.error(
    `\nFix them (\`npm audit fix\`, or bump the dependency that pulls them in), or — ` +
      `only if the advisory cannot be reached from Archyne's code — add an entry to ` +
      `audit-allow.json with a reason and an expiry date.`,
  );
  process.exit(1);
}

console.log(`\nNo blocking advisories.`);
