import { spawn } from "node:child_process";
import path from "node:path";
import { build, versions } from "./prepare-combined.mjs";
function run(args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn("npm", args, {
      cwd,
      env: process.env,
      stdio: "inherit",
    });
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${cwd}: npm ${args.join(" ")} failed (${code})`)),
    );
    child.on("error", reject);
  });
}
await Promise.all(
  versions.map(async (v) => {
    const cwd = path.join(build, v.name);
    for (const args of [["ci"], ["test"], ["run", "build"]])
      await run(args, cwd);
  }),
);
