#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const reportPath = process.argv[2];
if (!reportPath) process.exit(0);

let report;
try {
  report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
} catch {
  process.exit(0);
}

const target = report.commands?.status?.json?.runtimeVersion || extractVersion(report.commands?.version?.stdout);
if (!target || report.mode !== "container-rehearsal") process.exit(0);

const displayPath = path.resolve(reportPath);
if (report.result === "pass" && (report.summary?.errors || 0) === 0) {
  const fidelityFlag = hasLowFidelityWarning(report) ? " --accept-low-fidelity" : "";
  if (fidelityFlag) {
    console.log("[container] Host update requires explicit low-fidelity acknowledgement; this sanitized container is not a full host replica.");
  }
  console.log(`[container] Guarded update dry-run: npm run upgrade:apply -- --target ${shellWord(target)} --report ${shellWord(displayPath)}`);
  console.log(`[container] Guarded update apply:   npm run upgrade:apply -- --target ${shellWord(target)} --report ${shellWord(displayPath)}${fidelityFlag} --yes`);
} else {
  console.log(`[container] Guarded update blocked for ${target}: report result is ${report.result || "unknown"} with ${report.summary?.errors || 0} error(s).`);
}

function extractVersion(text = "") {
  return String(text).match(/\b\d{4}\.\d+\.\d+\b/)?.[0] || null;
}

function shellWord(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function hasLowFidelityWarning(report) {
  return (report.checks || []).some((check) => check.id === "container.fidelity.host_replica");
}
