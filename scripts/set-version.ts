// semantic-release's prepare step: `bun scripts/set-version.ts 0.2.0` writes
// the release version into the root package.json.
import path from "node:path";

const version = process.argv.at(2);
if (version === undefined || !/^\d+\.\d+\.\d+(?:-[\w.]+)?$/u.test(version)) {
  console.error("usage: bun scripts/set-version.ts <semver>");
  process.exit(1);
}

const root = path.join(import.meta.dir, "..");

const setVersion = async (file: string) => {
  const target = Bun.file(path.join(root, file));
  const json: unknown = await target.json();
  if (typeof json !== "object" || json === null) {
    throw new Error(`${file} is not a JSON object`);
  }
  await Bun.write(target, `${JSON.stringify({ ...json, version }, null, 2)}\n`);
};

await setVersion("package.json");
console.info(`Version ${version} written to package.json`);
