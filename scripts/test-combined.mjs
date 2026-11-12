import { spawn } from "node:child_process";
import path from "node:path";
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
// Both versions run the complete existing browser suite. Failure aborts artifact publication.
await Promise.all(
  versions.map(async (v) => {
    const cwd = path.join(build, v.name),
      env = { PINDOU_TEST_URL: `http://127.0.0.1:4400${v.base}` };
    for (const suite of [
      "test:browser",
      "test:preview",
      "test:round2",
      ...(v.name === "v20" ? ["test:recognition"] : []),
    ])
      await run("npm", ["run", suite], cwd, env);
  }),
);
