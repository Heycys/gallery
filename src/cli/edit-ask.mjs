import { createEditService } from "../editor/service.mjs";
import { withNeededKitTags } from "../render/assets.mjs";
import { editStateDirectory, reportsDirectory } from "../shared/paths.mjs";
import { findPreviewServer } from "../shared/preview-server.mjs";
import { workspaceBase } from "../shared/service-location.mjs";

// What gallery revert and gallery history ask of the edit service (src/editor/service.mjs): the review
// of the Agent's changes (POST /__gallery/edit/changes: read, revert) and the recent versions (POST
// /__gallery/edit/history: list, show, restore). Through the workspace's running server when there is
// one, in the queue its pages' commits go through, so that an open page shows what it wrote at once;
// with none, here, by the same service on the same state directory (.gallery/state/), its versions and
// reviews on disk. A server is never gone around while it runs: one announced that takes the request
// and does not answer in `wait` ms may still write (timeout, nothing done here), and one that answers
// what is no answer of its own (an older Gallery's, without the history) is said, nothing done here.

let local = null;

/**
 * Ask the edit service `route` ("changes" or "history") with `body`: its answer ({ ok, … } or { ok: false,
 * reason, message }). `reason` "timeout": the server took it and did not answer; "older": the server
 * running is an older Gallery's, which has not got it (gallery stop, then the command again).
 */
export async function askEdits(route, body, { wait = 30000 } = {}) {
  const server = await findPreviewServer();
  if (server) {
    const host = `127.0.0.1:${server.port}`;
    let response = null;
    try {
      response = await fetch(`http://${host}${workspaceBase(reportsDirectory)}/__gallery/edit/${route}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: `http://${host}`, "X-Gallery-Token": server.token },
        body: JSON.stringify({ ...body, workspace: reportsDirectory }),
        signal: AbortSignal.timeout(wait),
      });
    } catch (error) {
      if (error.name === "TimeoutError") return { ok: false, reason: "timeout", message: `the workspace's Gallery server did not answer in ${Math.round(wait / 1000)}s` };
      response = null; // nothing listens there any more: done here
    }
    if (response) {
      const answer = await response.json().catch(() => null);
      if (answer === null || typeof answer.ok !== "boolean") return { ok: false, reason: "older", message: `the Gallery server running on port ${server.port} is an older one, which cannot do this: run gallery stop, then this command again` };
      // A server of another workspace's, or one whose token is not the announced one: not this workspace's; done here.
      if (!["elsewhere", "token", "host", "origin"].includes(answer.reason)) return answer;
    }
  }
  local ??= createEditService({ reportsDirectory, stateDirectory: editStateDirectory, finish: withNeededKitTags });
  const [, answer] = route === "history" ? await local.historyAction(body) : await local.changesAction(body);
  await local.stored();
  return answer;
}
