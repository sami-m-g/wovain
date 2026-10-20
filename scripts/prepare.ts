// `bun install` runs this. Vercel builds from a copy without .git, where
// lefthook can't install hooks and agent skills aren't needed, so it stops there.
if (process.env["VERCEL"] !== "1") {
  for (const cmd of [
    ["lefthook", "install"],
    ["skills", "experimental_sync", "-y", "-a", "claude-code", "--copy"],
  ]) {
    const { exitCode } = Bun.spawnSync(cmd, {
      stdio: ["inherit", "inherit", "inherit"],
    });
    if (exitCode !== 0) {
      process.exit(1);
    }
  }
}
