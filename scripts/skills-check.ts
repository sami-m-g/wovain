import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

// Fails when a vendored skill in .agents/skills/ no longer matches the
// computedHash that `skills add` wrote to skills-lock.json. Vendored skills
// change only by re-running `skills add`, never by hand. The hash is the one
// skills 1.7.2 computes (computeSkillFolderHash): every file's relative path
// and bytes, sorted by path.
const VENDORED_SOURCES = new Set(["AgriciDaniel/claude-ads"]);

const root = path.join(import.meta.dirname, "..");

interface LockEntry {
  computedHash: string;
  source: string;
}

const filesOf = async (dir: string) => {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return await Promise.all(
    entries
      .filter((entry) => entry.isFile())
      .map(async (entry) => {
        const full = path.join(entry.parentPath, entry.name);
        return {
          content: await readFile(full),
          relativePath: path.relative(dir, full).split(path.sep).join("/"),
        };
      })
  );
};

const hashOf = async (dir: string) => {
  const files = await filesOf(dir);
  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(file.relativePath);
    hash.update(file.content);
  }
  return hash.digest("hex");
};

const isEntry = (value: unknown): value is LockEntry =>
  typeof value === "object" &&
  value !== null &&
  "computedHash" in value &&
  typeof value.computedHash === "string" &&
  "source" in value &&
  typeof value.source === "string";

const lock: unknown = JSON.parse(
  await readFile(path.join(root, "skills-lock.json"), "utf-8")
);
const skills =
  typeof lock === "object" && lock !== null && "skills" in lock
    ? Object.entries(lock.skills ?? {})
    : [];

const vendored = skills.flatMap(([name, entry]: [string, unknown]) =>
  isEntry(entry) && VENDORED_SOURCES.has(entry.source)
    ? [[name, entry] as const]
    : []
);

const drifted = await Promise.all(
  vendored.map(async ([name, entry]) => {
    const dir = path.join(root, ".agents", "skills", name);
    const actual = await hashOf(dir).catch(() => "missing");
    return actual === entry.computedHash ? [] : [name];
  })
);

const names = drifted.flat();
if (names.length > 0) {
  process.stderr.write(
    `Vendored skills changed or missing: ${names.join(", ")}. Restore them with \`skills add\` and keep wovain's changes in .agents/skills/wovain-pod-ads/.\n`
  );
  process.exit(1);
}
process.stdout.write(
  `${vendored.length} vendored skills match skills-lock.json\n`
);
