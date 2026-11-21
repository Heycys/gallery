import { answerOf, readAnnouncement, stopServer } from "../shared/preview-server.mjs";
import { commandArguments, UsageError } from "./arguments.mjs";

// Stop the verified service announced by this data directory, from any document folder.
// It drains saves before exiting; dev servers are stopped from the terminal that owns them.

export async function run(argv) {
  const { positional } = commandArguments({ argv });
  if (positional.length > 0) throw new UsageError(`gallery stop takes no arguments: ${positional[0]}`);
  const found = await readAnnouncement();
  const answer = found ? await answerOf(found, 10_000) : "no";
  if (answer === "no") return void console.log(`No Gallery server runs.`);
  if (answer === "busy") {
    console.error(`The Gallery server on port ${found.port} (pid ${found.pid}) took the request and gave no answer in 10s: it is busy or stuck. Run gallery stop again in a while, or end process ${found.pid} yourself.`);
    process.exit(1);
  }
  if (found.kind === "dev") {
    console.error(`The shared Gallery server is npm run dev's (port ${found.port}, pid ${found.pid}): stop it where it runs.`);
    process.exit(1);
  }
  const stopped = await stopServer(found);
  if (!stopped.ok) {
    console.error(stopped.message);
    process.exit(1);
  }
  console.log(`Stopped the server on port ${found.port} (pid ${found.pid})${stopped.killed ? ": it did not stop by itself in 10s, so its process was ended" : ""}.`);
}
