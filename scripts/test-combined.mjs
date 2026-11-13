import { spawn } from "node:child_process";
import path from "node:path";
import { mkdirSync, cpSync } from "node:fs";
import { build, versions } from "./prepare-combined.mjs";
function run(command, args, cwd, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: "inherit",
    });
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error(`${cwd}: ${command} ${args.join(" ")} failed (${code})`),
          ),
    );
    child.on("error", reject);
  });
}
// All versions run the complete existing browser suite. Failure aborts artifact publication.
await Promise.all(
  versions.map(async (v) => {
    const cwd = path.join(build, v.name),
      env = {
        PINDOU_TEST_URL: `http://127.0.0.1:4400${v.base}`,
        PINDOU_QA_DIR: path.join(build, "verification", v.name),
      };
    for (const suite of [
      "test:browser",
      "test:preview",
      "test:round2",
      ...(v.name !== "v15" ? ["test:recognition"] : []),
      ...(v.name === "v211"
        ? [
            "test:cells",
            "test:crop",
            "test:real-grids",
            "test:grid-compression",
            "test:cell-workspace",
          ]
        : []),
    ])
      await run("npm", ["run", suite], cwd, env);
    if (v.name === "v211") {
      const dest = path.join(build, "verification", "v211", "cell-validation");
      mkdirSync(dest, { recursive: true });
      cpSync(
        path.join(cwd, "docs/previews/v20b11/cell-validation/results.json"),
        path.join(dest, "results.json"),
      );
    }
  }),
);
