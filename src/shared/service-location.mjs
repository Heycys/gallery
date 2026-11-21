import path from "node:path";
import { userDirectory } from "./user-directory.mjs";
import { defaultWorkspace } from "./workspace.mjs";
import { workspaceId, workspaceKey } from "./workspace-registry.mjs";
import { projectBase } from "./workspace-address.mjs";

export const workspaceBase = root => workspaceKey(root) === workspaceKey(defaultWorkspace()) ? "" : projectBase(workspaceId(root));

// A service belongs to a Gallery data directory, never to a document storage directory.
export function serviceLocation() {
  const data = userDirectory("data");
  return {
    data,
    serverFile: path.join(data, "server.json"),
    lastPortFile: path.join(data, "last-port"),
    serverLog: path.join(data, "logs", "server.log"),
  };
}
