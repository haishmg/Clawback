#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const command = process.argv[2];

if (!["apply", "rollback"].includes(command)) {
  usage(2);
}

const options = parseArgs(process.argv.slice(3));
const openclaw = options.openclaw || "openclaw";

if (command === "apply") applyUpdate(options, openclaw);
else rollbackUpdate(options, openclaw);

function applyUpdate(options, openclaw) {
  if (!options.target) fail("--target <version> is required");
  if (!options.report) fail("--report <path> is required");

  const report = readJson(options.report);
  validatePassingReport(report, options.target, { acceptLowFidelity: options.acceptLowFidelity });

  const currentVersion = detectVersion(openclaw);
  const runDir = createRunDir();
  const rollbackPath = path.join(runDir, "rollback.json");
  const dryRunPath = path.join(runDir, "dry-run.json");
  const updatePath = path.join(runDir, "update.json");

  const rollback = {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    previousVersion: currentVersion,
    targetVersion: options.target,
    report: path.resolve(options.report),
    openclaw,
    updateCommand: [openclaw, "update", "--tag", options.target, "--yes", "--json"],
    rollbackCommand: [openclaw, "update", "--tag", currentVersion, "--yes", "--json"],
  };
  fs.writeFileSync(rollbackPath, `${JSON.stringify(rollback, null, 2)}\n`);

  console.log(`[upgrade] Current OpenClaw: ${currentVersion}`);
  console.log(`[upgrade] Target OpenClaw: ${options.target}`);
  console.log(`[upgrade] Rehearsal report: ${path.resolve(options.report)}`);
  console.log(`[upgrade] Rollback plan: ${rollbackPath}`);

  const dryRun = runOpenClaw(openclaw, ["update", "--tag", options.target, "--dry-run", "--json"], options.timeoutSeconds);
  fs.writeFileSync(dryRunPath, `${JSON.stringify(dryRun, null, 2)}\n`);
  if (!commandSucceeded(dryRun)) {
    fail(`Dry-run failed. Details written to ${dryRunPath}`);
  }

  if (!options.yes) {
    console.log("");
    console.log("[upgrade] Dry-run passed. No update was applied.");
    console.log("[upgrade] Re-run with --yes to update the host:");
    const fidelityFlag = reportHasLowFidelityWarning(report) ? " --accept-low-fidelity" : "";
    console.log(`          npm run upgrade:apply -- --target ${shellWord(options.target)} --report ${shellWord(options.report)}${fidelityFlag} --yes`);
    return;
  }

  const update = runOpenClaw(openclaw, ["update", "--tag", options.target, "--yes", "--json"], options.timeoutSeconds);
  fs.writeFileSync(updatePath, `${JSON.stringify(update, null, 2)}\n`);
  if (!commandSucceeded(update)) {
    fail(`Update failed. Details written to ${updatePath}. Rollback plan remains at ${rollbackPath}`);
  }

  console.log(`[upgrade] Update command completed. Details: ${updatePath}`);
  console.log("[upgrade] Run post-upgrade validation now:");
  console.log("          npm run suite:post");
  console.log("[upgrade] If validation fails, roll back with:");
  console.log(`          npm run upgrade:rollback -- --plan ${shellWord(rollbackPath)} --yes`);
}

function rollbackUpdate(options, openclaw) {
  if (!options.plan) fail("--plan <rollback.json> is required");
  const plan = readJson(options.plan);
  if (!plan.previousVersion) fail(`Rollback plan is missing previousVersion: ${options.plan}`);

  const runDir = createRunDir("rollback");
  const dryRunPath = path.join(runDir, "rollback-dry-run.json");
  const rollbackPath = path.join(runDir, "rollback-update.json");

  console.log(`[rollback] Current target to restore: ${plan.previousVersion}`);
  console.log(`[rollback] Original attempted target: ${plan.targetVersion || "unknown"}`);

  const dryRun = runOpenClaw(openclaw, ["update", "--tag", plan.previousVersion, "--dry-run", "--json"], options.timeoutSeconds);
  fs.writeFileSync(dryRunPath, `${JSON.stringify(dryRun, null, 2)}\n`);
  if (!commandSucceeded(dryRun)) {
    fail(`Rollback dry-run failed. Details written to ${dryRunPath}`);
  }

  if (!options.yes) {
    console.log("");
    console.log("[rollback] Dry-run passed. No rollback was applied.");
    console.log("[rollback] Re-run with --yes to roll back the host:");
    console.log(`           npm run upgrade:rollback -- --plan ${shellWord(options.plan)} --yes`);
    return;
  }

  const result = runOpenClaw(openclaw, ["update", "--tag", plan.previousVersion, "--yes", "--json"], options.timeoutSeconds);
  fs.writeFileSync(rollbackPath, `${JSON.stringify(result, null, 2)}\n`);
  if (!commandSucceeded(result)) {
    fail(`Rollback update failed. Details written to ${rollbackPath}`);
  }
  console.log(`[rollback] Rollback command completed. Details: ${rollbackPath}`);
  console.log("[rollback] Run validation now:");
  console.log("           npm run suite:post");
}

function validatePassingReport(report, target, { acceptLowFidelity = false } = {}) {
  if (report.tool !== "openclaw-upgrade-guard") fail("Report is not an OpenClaw Upgrade Guard report");
  if (report.mode !== "container-rehearsal") fail(`Expected a container-rehearsal report, got ${report.mode}`);
  if (report.result !== "pass") fail(`Refusing update because rehearsal result is ${report.result}`);
  if ((report.summary?.errors || 0) > 0) fail("Refusing update because rehearsal report contains errors");
  if (reportHasLowFidelityWarning(report) && !acceptLowFidelity) {
    fail(
      "Refusing update because the passing report is a low-fidelity sanitized container rehearsal. Re-run with --accept-low-fidelity only if you understand that this does not replicate the live host service, credentials, workspaces, and runtime state.",
    );
  }

  const reportedVersion = report.commands?.status?.json?.runtimeVersion || extractVersion(report.commands?.version?.stdout);
  if (reportedVersion && normalizeVersion(reportedVersion) !== normalizeVersion(target)) {
    fail(`Report version ${reportedVersion} does not match requested target ${target}`);
  }
}

function reportHasLowFidelityWarning(report) {
  return (report.checks || []).some((check) => check.id === "container.fidelity.host_replica");
}

function detectVersion(openclaw) {
  const result = spawnSync(openclaw, ["--version"], { encoding: "utf8" });
  if (result.status !== 0) fail(`Could not detect current OpenClaw version: ${result.stderr || result.stdout}`);
  return extractVersion(result.stdout) || result.stdout.trim();
}

function runOpenClaw(openclaw, args, timeoutSeconds = 1200) {
  console.log(`[run] ${[openclaw, ...args].join(" ")}`);
  const result = spawnSync(openclaw, args, {
    encoding: "utf8",
    timeout: timeoutSeconds * 1000,
    env: { ...process.env, NO_COLOR: "1" },
  });
  return {
    command: [openclaw, ...args],
    exitCode: result.status,
    signal: result.signal,
    stdout: result.stdout?.trim() || "",
    stderr: result.stderr?.trim() || "",
    timedOut: result.error?.code === "ETIMEDOUT",
    error: result.error?.message || null,
  };
}

function commandSucceeded(result) {
  return result.exitCode === 0 && !result.signal && !result.timedOut && !result.error;
}

function parseArgs(args) {
  const options = { timeoutSeconds: 1200 };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const readValue = () => {
      const value = args[index + 1];
      if (!value || value.startsWith("-")) fail(`Missing value for ${arg}`);
      index += 1;
      return value;
    };

    if (arg === "--target") options.target = readValue();
    else if (arg === "--report") options.report = readValue();
    else if (arg === "--plan") options.plan = readValue();
    else if (arg === "--openclaw") options.openclaw = readValue();
    else if (arg === "--timeout") options.timeoutSeconds = Number(readValue());
    else if (arg === "--yes") options.yes = true;
    else if (arg === "--accept-low-fidelity") options.acceptLowFidelity = true;
    else if (arg === "--help" || arg === "-h") usage(0);
    else fail(`Unknown option: ${arg}`);
  }
  if (!Number.isFinite(options.timeoutSeconds) || options.timeoutSeconds < 1) fail("--timeout must be a positive number of seconds");
  return options;
}

function createRunDir(prefix = "upgrade") {
  const stamp = new Date().toISOString().replaceAll(":", "").replace(/\.\d+Z$/, "Z");
  const dir = path.resolve("reports", "updates", `${prefix}-${stamp}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function extractVersion(text = "") {
  return String(text).match(/\b\d{4}\.\d+\.\d+\b/)?.[0] || null;
}

function normalizeVersion(version) {
  return String(version).replace(/^openclaw@/i, "").trim();
}

function shellWord(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function fail(message) {
  console.error(`[error] ${message}`);
  process.exit(1);
}

function usage(code) {
  console.log(`Usage:
  npm run upgrade:apply -- --target <version> --report <report.json> [--yes]
  npm run upgrade:rollback -- --plan <rollback.json> [--yes]

The apply command refuses to update unless the target version has a passing
container-rehearsal report. Low-fidelity sanitized container reports also
require --accept-low-fidelity. Without --yes it performs only validation and
OpenClaw's update dry-run.`);
  process.exit(code);
}
