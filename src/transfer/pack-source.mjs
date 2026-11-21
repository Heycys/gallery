import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { folderFiles } from "../shared/block-packs.mjs";
import { refusal, said } from "../shared/i18n/index.mjs";
import { isZip, openZip } from "./zip.mjs";

// What a block pack to install holds (shared/block-packs.mjs: a pack is shared as its folder or a zip of
// it), read for gallery block pack install (src/cli/component.mjs) and 设置 › 组件列表's 导入
// (src/server/component-settings.mjs) alike: [{ name, data }], each file by its path in the pack, which
// installPack then checks (a name that points out of it refused, "path"). A zip's sizes are read from its
// directory before any file of it is: one that would hold more than a pack may is refused, never inflated.

const MOST_BYTES = 64 * 1024 * 1024;
const MOST_FILES = 2000;

// A zip on disk read whole, its sizes checked first.
function zipFiles(file) {
  let zip;
  try {
    zip = openZip(file);
  } catch {
    throw refusal(said("{0} 读不出来：不是完好的 zip", path.basename(file)), { code: "kind" });
  }
  try {
    const entries = zip.entries;
    if (entries.length > MOST_FILES || entries.reduce((total, { size }) => total + size, 0) > MOST_BYTES) throw refusal(said("块包太大：最多 {0} 个文件、{1} MB", MOST_FILES, MOST_BYTES / 1024 / 1024), { code: "size" });
    return entries.map((entry) => ({ name: entry.name, data: Buffer.from(zip.read(entry)) }));
  } catch (error) {
    if (error.code) throw error;
    throw refusal(said("{0} 读不出来：不是完好的 zip", path.basename(file)), { code: "kind" });
  } finally {
    zip.close();
  }
}

/**
 * The files of the pack at `written` (a path: its folder, or a .zip), [{ name, data }]. Refused (said()'s,
 * a code): nothing there ("missing"), neither a folder nor a zip ("kind"), too large ("size").
 */
export function packFilesAt(written) {
  const where = path.resolve(String(written ?? "").trim().replace(/^"(.*)"$/, "$1"));
  let stat;
  try {
    stat = fs.statSync(where);
  } catch {
    throw refusal(said("找不到 {0}", where), { code: "missing" });
  }
  if (stat.isDirectory()) return folderFiles(where);
  if (!stat.isFile()) throw refusal(said("{0} 不是文件夹，也不是 zip", where), { code: "kind" });
  const head = Buffer.alloc(4);
  const fd = fs.openSync(where, "r");
  try {
    fs.readSync(fd, head, 0, 4, 0);
  } finally {
    fs.closeSync(fd);
  }
  if (!isZip(head)) throw refusal(said("{0} 不是文件夹，也不是 zip", where), { code: "kind" });
  return zipFiles(where);
}

/** The files of a pack's zip given as bytes (设置 › 组件列表's 选择文件…), as packFilesAt reads one on disk. */
export function packFilesOfZip(bytes) {
  if (!isZip(bytes)) throw refusal(said("选的文件不是 zip"), { code: "kind" });
  if (bytes.length > MOST_BYTES) throw refusal(said("块包太大：最多 {0} 个文件、{1} MB", MOST_FILES, MOST_BYTES / 1024 / 1024), { code: "size" });
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "gallery-pack-"));
  const file = path.join(folder, "pack.zip");
  try {
    fs.writeFileSync(file, bytes);
    return zipFiles(file);
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
}
