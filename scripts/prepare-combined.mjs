import { execFileSync } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  rmSync,
} from "node:fs";
import assert from "node:assert/strict";
import path from "node:path";
export const V15 = "19a4cfbccc2eedcf70eab12db4512f6bc00ee57b";
export const V20 = "86f58afd93bac3ea3bcdd3339254185681fab602";
export const root = path.resolve(import.meta.dirname, "..");
export const build = path.join(root, ".combined");
export const versions = [
  {
    name: "v15",
    sha: V15,
    base: "/pindou-preview/",
    key: "pindou.preview.v15.projects.v1",
  },
  {
    name: "v20",
    sha: V20,
    base: "/pindou-preview/v2-a/",
    key: "pindou.preview.v20a.projects.v1",
  },
];
if (process.argv[1] === import.meta.filename) {
  mkdirSync(build, { recursive: true });
  for (const v of versions) {
    const dest = path.join(build, v.name);
    rmSync(dest, { recursive: true, force: true });
    mkdirSync(dest, { recursive: true });
    // Export only the immutable approved application tree, never the deployment branch's app.
    const tar = execFileSync("git", ["archive", v.sha], {
      cwd: root,
      maxBuffer: 50 * 1024 * 1024,
    });
    execFileSync("tar", ["-xf", "-", "-C", dest], { input: tar });
    if (v.name === "v20") {
      const storage = path.join(dest, "src/storage.ts");
      let s = readFileSync(storage, "utf8");
      assert.equal(s.split("pindou.preview.v15.projects.v1").length, 2);
      writeFileSync(
        storage,
        s.replace("pindou.preview.v15.projects.v1", v.key),
      );
      const config = path.join(dest, "vite.preview.config.ts");
      s = readFileSync(config, "utf8");
      assert.equal(s.split('base: "/pindou-preview/"').length, 2);
      writeFileSync(
        config,
        s.replace('base: "/pindou-preview/"', `base: "${v.base}"`),
      );
      // Adapt existing test fixtures/assertions to the deployment namespace and URL.
      for (const dir of ["tests", "src"])
        for (const file of readdirSync(path.join(dest, dir))) {
          if (
            !(dir === "tests" && file.endsWith(".mjs")) &&
            !(dir === "src" && file.endsWith(".test.ts"))
          )
            continue;
          const p = path.join(dest, dir, file);
          writeFileSync(
            p,
            readFileSync(p, "utf8")
              .replaceAll("pindou.preview.v15.projects.v1", v.key)
              .replaceAll("/pindou-preview/", v.base)
              .replaceAll(
                String.raw`\/pindou-preview\/`,
                String.raw`\/pindou-preview\/v2-a\/`,
              ),
          );
        }
    }
    // Audit every production source storage access. No clears/deletes/migrations are permitted.
    const accesses = [];
    for (const file of readdirSync(path.join(dest, "src"))) {
      if (file.includes(".test.")) continue;
      const text = readFileSync(path.join(dest, "src", file), "utf8");
      if (/(?:localStorage|sessionStorage|Storage\.prototype)/.test(text))
        accesses.push(file);
      if (file !== "storage.ts")
        for (const key of ["pindou.projects.v1", ...versions.map((o) => o.key)])
          assert.ok(!text.includes(key), "Unexpected storage literal");
    }
    assert.deepEqual(accesses.sort(), ["main.tsx", "model.ts"]);
    const model = readFileSync(path.join(dest, "src/model.ts"), "utf8"),
      main = readFileSync(path.join(dest, "src/main.tsx"), "utf8");
    assert.equal((model.match(/localStorage\./g) || []).length, 1);
    assert.ok(model.includes("localStorage.getItem(PROJECT_STORAGE_KEY)"));
    assert.equal((main.match(/localStorage\./g) || []).length, 1);
    assert.ok(main.includes("localStorage.setItem(PROJECT_STORAGE_KEY,"));
    assert.ok(
      readFileSync(path.join(dest, "src/storage.ts"), "utf8").includes(
        `"${v.key}"`,
      ),
    );
    console.log(`Prepared ${v.name}: ${v.sha} ${v.base} ${v.key}`);
  }
}
