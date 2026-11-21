import { startup } from "../shared/startup.mjs";
import { commandArguments, UsageError } from "./arguments.mjs";

export async function run(argv) {
  const { positional } = commandArguments({ argv });
  const [action = "status"] = positional;
  if (positional.length > 1 || !["status", "enable", "disable", "run"].includes(action)) throw new UsageError("gallery startup status|enable|disable|run");
  if (action === "run") {
    const status = await startup().status();
    if (!status.available || !status.requested) return;
    const { serverFor } = await import("./server-process.mjs");
    const answer = await serverFor({ command: "gallery startup run" });
    if (!answer.ok) { console.error(answer.message); process.exitCode = 1; }
    return;
  }
  const result = action === "status" ? await startup().status() : await startup().set(action === "enable");
  console.log(JSON.stringify(result));
}
