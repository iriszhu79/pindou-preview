import { validateDataset } from "./validate.mjs";
import { runBenchmark } from "./run.mjs";
const [command, ...args] = process.argv.slice(2),
  options = {};
const usage =
  "Usage: npm run benchmark:validate|benchmark:run -- [--manifest <root-relative JSON>] [--root <dataset root>] [--previous <prior manifest>] [--sample <pattern-id>] [--split all|development|held-out] [--out <report parent>] [--diagnostics summary|cells] [--include-images] [--json]";
try {
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (key === "--help") {
      console.log(usage);
      process.exit(0);
    }
    if (key === "--fail-on-recognition") options.failOnRecognition = true;
    else if (key === "--include-images") options.includeImages = true;
    else if (key === "--json") options.json = true;
    else {
      const names = {
        "--manifest": "manifest",
        "--sample": "sample",
        "--previous": "previous",
        "--root": "root",
        "--out": "out",
        "--split": "split",
        "--diagnostics": "diagnosticLevel",
        "--mode": "mode",
      };
      if (!names[key] || !args[i + 1] || args[i + 1].startsWith("--"))
        throw new Error("Unknown option or missing value: " + key);
      options[names[key]] = args[++i];
    }
  }
  if (
    options.split &&
    !["all", "development", "held-out"].includes(options.split)
  )
    throw new Error("Invalid --split");
  if (options.mode && !["automatic", "both"].includes(options.mode))
    throw new Error("--mode must be automatic or both");
  if (
    options.diagnosticLevel &&
    !["summary", "cells"].includes(options.diagnosticLevel)
  )
    throw new Error("--diagnostics must be summary or cells");
  if (command === "validate") {
    const result = await validateDataset(
      options.manifest ?? "tests/benchmark/manifests/smoke-v1.json",
      options,
    );
    const errors = result.issues.filter((i) => i.level === "error").length;
    if (options.json)
      console.log(
        JSON.stringify(
          {
            datasetId: result.dataset?.datasetId,
            samples: result.samples.length,
            errors,
            warnings: result.issues.length - errors,
            issues: result.issues,
          },
          null,
          2,
        ),
      );
    else {
      for (const i of result.issues)
        console.log(`${i.level.toUpperCase()} ${i.at}: ${i.message}`);
      console.log(
        `${result.samples.length} samples; ${errors} errors; ${result.issues.length - errors} warnings`,
      );
    }
    process.exitCode = errors ? 1 : 0;
  } else if (command === "run") {
    if (options.json)
      throw new Error(
        "--json is validate-only; benchmark:run writes report.json",
      );
    const { report, runDir } = await runBenchmark(options);
    console.log("Report: " + runDir + "/index.html");
    console.log(JSON.stringify(report.coverage, null, 2));
    // Evaluation failures remain records; callers may explicitly opt into a recognition-success CI gate.
    if (
      options.failOnRecognition &&
      report.samples.some((s) => s.modes.some((m) => m.failure))
    )
      process.exitCode = 2;
  } else throw new Error(usage);
} catch (e) {
  console.error(e.message);
  if (e.issues)
    for (const i of e.issues)
      console.error(`${i.level.toUpperCase()} ${i.at}: ${i.message}`);
  process.exitCode = 1;
}
