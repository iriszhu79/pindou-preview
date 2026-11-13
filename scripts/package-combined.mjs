import {
  readFileSync,
  writeFileSync,
  readdirSync,
  mkdirSync,
  cpSync,
  rmSync,
} from "node:fs";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import path from "node:path";
import { root, build, versions } from "./prepare-combined.mjs";
const site = path.join(build, "site");
rmSync(site, { recursive: true, force: true });
mkdirSync(site, { recursive: true });
const hash = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
function files(dir, prefix = "") {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? files(path.join(dir, e.name), prefix + e.name + "/")
      : [prefix + e.name],
  );
}
const manifest = { versions: [] };
for (const v of versions) {
  const source = path.join(build, v.name, "dist-preview"),
    dest = path.join(site, v.base.slice("/pindou-preview/".length));
  assert.ok(
    readFileSync(path.join(source, "index.html"), "utf8").includes(
      v.base + "assets/",
    ),
  );
  mkdirSync(dest, { recursive: true });
  cpSync(source, dest, { recursive: true });
  const record = {
    ...v,
    applicationOverrides:
      v.name !== "v15"
        ? [
            `src/storage.ts: isolated ${v.name} key`,
            `vite.preview.config.ts: ${v.base} base`,
          ]
        : [],
    files: {},
  };
  for (const f of files(source)) {
    assert.equal(hash(path.join(source, f)), hash(path.join(dest, f)));
    record.files[f] = hash(path.join(source, f));
  }
  const js = files(source)
    .filter((f) => f.endsWith(".js"))
    .map((f) => readFileSync(path.join(source, f), "utf8"))
    .join("\n");
  assert.ok(js.includes(v.key));
  for (const other of [
    "pindou.projects.v1",
    "pindou.preview.v20b1.projects.v1",
    ...versions.filter((o) => o.key !== v.key).map((o) => o.key),
  ])
    assert.ok(
      !js.includes(other),
      `${v.name} contains foreign storage key ${other}`,
    );
  assert.equal(
    hash(path.join(source, "samples/sample-pattern.jpg")),
    "dd4adc3fd44257baf020725055e56371749d97259bf26f1c9ab08ef76be49a61",
  );
  manifest.versions.push(record);
}
assert.equal(manifest.versions.length, 3);
assert.deepEqual(
  manifest.versions.map((v) => v.base),
  ["/pindou-preview/", "/pindou-preview/v2-a/", "/pindou-preview/v2-b1-1/"],
);
assert.ok(manifest.versions.every((v) => Object.keys(v.files).length > 5));
// Fail before upload if any approved application file changes or disappears.
const approved = JSON.parse(
  readFileSync(path.join(root, "scripts/approved-preview-hashes.json"), "utf8"),
);
for (const previous of approved.versions) {
  const current = manifest.versions.find((v) => v.name === previous.name);
  for (const field of ["sha", "base", "key"])
    assert.equal(current[field], previous[field]);
  assert.deepEqual(
    current.files,
    previous.files,
    `${previous.name}: approved assets changed`,
  );
}
writeFileSync(
  path.join(site, "deployment-manifest.json"),
  JSON.stringify(manifest, null, 2),
);
console.log(
  "Combined artifact verified: all three complete applications, pinned sample, isolated keys, file hashes.",
);
