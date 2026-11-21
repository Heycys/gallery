import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

// Write a sibling temp file, then rename it over the report. Windows can refuse the rename while
// another process (editor, antivirus, indexer) holds the file, so retry briefly before failing.
// With `expect`, the file must still hold exactly that text right before each rename attempt;
// otherwise nothing is written and the result is false. That is a check, not a lock: a writer
// that does not go through this service can still change the file between it and the rename.
export async function writeAtomic(file, text, { expect } = {}) {
  const temp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  await fs.writeFile(temp, text);
  for (let attempt = 0; ; attempt++) {
    try {
      if (expect !== undefined && (await fs.readFile(file, "utf8").catch(() => null)) !== expect) {
        await fs.rm(temp, { force: true });
        return false;
      }
      await fs.rename(temp, file);
      return true;
    } catch (error) {
      if (attempt >= 9 || !["EPERM", "EBUSY", "EACCES"].includes(error.code)) {
        await fs.rm(temp, { force: true });
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 40 * (attempt + 1)));
    }
  }
}
