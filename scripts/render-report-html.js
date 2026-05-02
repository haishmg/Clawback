#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { renderHtml } from "../lib/html.js";

const input = process.argv[2];
const output = process.argv[3];

if (!input) {
  console.error("Usage: node scripts/render-report-html.js <report.json> [report.html]");
  process.exit(2);
}

const report = JSON.parse(fs.readFileSync(input, "utf8"));
const outputPath = output || path.join(path.dirname(input), "report.html");
fs.writeFileSync(outputPath, renderHtml(report));
console.log(`Wrote ${outputPath}`);
