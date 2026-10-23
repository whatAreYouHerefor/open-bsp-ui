// Public connection settings only. Never add server credentials to this file.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const defaults = JSON.parse(
  readFileSync(new URL("./public-config.json", import.meta.url), "utf8"),
);
const env = { ...defaults, ...process.env };
for (const [command, args] of [
  [process.execPath, ["cmx/check-environment.mjs"]],
  ["npm", ["run", "build"]],
]) {
  const result = spawnSync(command, args, { env, stdio: "inherit" });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
