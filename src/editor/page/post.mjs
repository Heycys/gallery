import { workspaceAddress } from "../../shared/workspace-address.mjs";
import { t, told } from "../../shared/i18n/index.mjs";
// The page's one way to talk to the preview server: a POST of JSON with the report's token
// (postJson: the request, a network error rejecting as fetch does; postAnswer: its answer read, a
// failure an answer too, what the editor's requests use), and what goes over it: what a refusal
// says (failure) and how an upload carries a file (blobBase64).

/** POST `body` as JSON to `route` with `token` (the map's); resolves with the Response. */
export const postJson = (route, token, body, { keepalive = false } = {}) => fetch(workspaceAddress(route), {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Gallery-Token": token },
  body: JSON.stringify(body),
  keepalive,
});

/**
 * POST `body` as JSON to `route` and read the answer, never throwing: a server that cannot be
 * reached answers `{ ok: false, reason: "offline" }`, one that answers with no JSON `{ ok: false }`.
 */
export async function postAnswer(route, token, body) {
  let response;
  try {
    response = await postJson(route, token, body);
  } catch {
    return { ok: false, reason: "offline" };
  }
  return response.json().catch(() => ({ ok: false }));
}

/**
 * What a refused request says: the server's own words in the UI's language (told: its template with its
 * values, or its whole message), else that it could not be reached, else `fallback`.
 */
export const failure = (answer, fallback) => told(answer) ?? (answer.reason === "offline" ? t("连不上本地服务") : fallback);

/** A blob's bytes as base64, how an upload carries them. */
export const blobBase64 = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(",")[1]);
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(blob);
});
