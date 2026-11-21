import { constants as bufferConstants } from "node:buffer";
import fs from "node:fs";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import zlib from "node:zlib";
import { refusal, said } from "../shared/i18n/index.mjs";

// Zip archives, as the export writes them and the import reads them (on Node's zlib). Written: each file deflated where that makes it smaller (more than 64 bytes),
// else stored; names UTF-8 (flag 0x0800); no zip64 (an export is far from 4 GB). Read: zip64 too
// (Notion's exports of a large workspace; the import takes 5 GB), from bytes in memory (a Word
// document, an EPUB) or from a file, a file at a time (an upload: openZip). A name written without
// the UTF-8 flag (Windows' Explorer and older tools in a Chinese locale) is read as UTF-8 when it
// reads as such, else as GBK. An entry is inflated no further than the size its directory declares
// (`inflated`, extract's `held`): a deflate stream that grows past it (a zip bomb: a kilobyte declared,
// gigabytes inflated) is refused once it passes it, never held whole in memory or written whole to disk,
// so the sizes a reader checks first (pack-source.mjs) are the sizes it gets.

const LOCAL = 0x04034b50;
const CENTRAL = 0x02014b50;
const END = 0x06054b50;
const END64 = 0x06064b50;
const LOCATOR64 = 0x07064b50;
const MAX32 = 0xffffffff;
const UTF8 = 0x0800;

// The current time as DOS writes it: [time, date].
function dosTime(at = new Date()) {
  const time = (at.getHours() << 11) | (at.getMinutes() << 5) | Math.floor(at.getSeconds() / 2);
  const date = ((Math.max(1980, at.getFullYear()) - 1980) << 9) | ((at.getMonth() + 1) << 5) | at.getDate();
  return [time, date];
}

/**
 * A zip of `files` ([{ name, data }]: a path with "/" between folders, a Buffer or a string), as a
 * Buffer, in their order.
 */
export function createZip(files) {
  const [time, date] = dosTime();
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const file of files) {
    const data = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data ?? "", "utf8");
    const name = Buffer.from(file.name, "utf8");
    const deflated = data.length > 64 ? zlib.deflateRawSync(data) : null;
    const packed = deflated && deflated.length < data.length ? deflated : data;
    const method = packed === data ? 0 : 8;
    const crc = zlib.crc32(data);
    if (data.length >= MAX32 || offset >= MAX32) throw new Error("压缩包太大（超过 4GB）");
    const head = Buffer.alloc(30);
    head.writeUInt32LE(LOCAL, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt16LE(UTF8, 6);
    head.writeUInt16LE(method, 8);
    head.writeUInt16LE(time, 10);
    head.writeUInt16LE(date, 12);
    head.writeUInt32LE(crc, 14);
    head.writeUInt32LE(packed.length, 18);
    head.writeUInt32LE(data.length, 22);
    head.writeUInt16LE(name.length, 26);
    head.writeUInt16LE(0, 28);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(CENTRAL, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(UTF8, 8);
    entry.writeUInt16LE(method, 10);
    entry.writeUInt16LE(time, 12);
    entry.writeUInt16LE(date, 14);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(packed.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(offset, 42);
    locals.push(head, name, packed);
    centrals.push(entry, name);
    offset += head.length + name.length + packed.length;
  }
  if (files.length >= 0xffff) throw new Error("压缩包里的文件太多");
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(END, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

const utf8 = new TextDecoder("utf-8", { fatal: true });
const gbk = new TextDecoder("gbk");
function nameOf(bytes, flags) {
  if (flags & UTF8) return bytes.toString("utf8");
  try {
    return utf8.decode(bytes);
  } catch {
    return gbk.decode(bytes);
  }
}

/** Whether `bytes` begin as a zip does. */
export const isZip = (bytes) => bytes.length >= 4 && bytes.readUInt32LE(0) === LOCAL;

const damaged = () => new Error("ZIP 文件已损坏");
const big = (buffer, at) => Number(buffer.readBigUInt64LE(at));

// The entries of a zip of `total` bytes read by `read(position, length)` (a Buffer): [{ name,
// method, packedSize, size, local }] in the order its directory has them, folders left out.
function directoryOf(read, total) {
  const tailLength = Math.min(total, 22 + 0xffff);
  const tail = read(total - tailLength, tailLength);
  let end = -1;
  for (let at = tail.length - 22; at >= 0; at -= 1) {
    if (tail.readUInt32LE(at) === END) {
      end = at;
      break;
    }
  }
  if (end < 0) throw new Error("不是有效的 ZIP 文件");
  let count = tail.readUInt16LE(end + 10);
  let size = tail.readUInt32LE(end + 12);
  let offset = tail.readUInt32LE(end + 16);
  if (count === 0xffff || size === MAX32 || offset === MAX32) { // zip64: its own end record, found by the locator right before this one
    const locator = read(total - tailLength + end - 20, 20);
    if (locator.readUInt32LE(0) !== LOCATOR64) throw damaged();
    const record = read(big(locator, 8), 56);
    if (record.readUInt32LE(0) !== END64) throw damaged();
    count = big(record, 32);
    size = big(record, 40);
    offset = big(record, 48);
  }
  const directory = read(offset, size);
  const entries = [];
  for (let at = 0, index = 0; index < count; index += 1) {
    if (directory.readUInt32LE(at) !== CENTRAL) throw damaged();
    const flags = directory.readUInt16LE(at + 8);
    const method = directory.readUInt16LE(at + 10);
    let packedSize = directory.readUInt32LE(at + 20);
    let fullSize = directory.readUInt32LE(at + 24);
    const nameLength = directory.readUInt16LE(at + 28);
    const extraLength = directory.readUInt16LE(at + 30);
    const commentLength = directory.readUInt16LE(at + 32);
    let local = directory.readUInt32LE(at + 42);
    const name = nameOf(directory.subarray(at + 46, at + 46 + nameLength), flags);
    // zip64's sizes and place in its extra field (0x0001): each one 32 bits could not hold, in this order.
    const extra = directory.subarray(at + 46 + nameLength, at + 46 + nameLength + extraLength);
    for (let field = 0; field + 4 <= extra.length; field += 4 + extra.readUInt16LE(field + 2)) {
      if (extra.readUInt16LE(field) !== 1) continue;
      let value = field + 4;
      if (fullSize === MAX32) { fullSize = big(extra, value); value += 8; }
      if (packedSize === MAX32) { packedSize = big(extra, value); value += 8; }
      if (local === MAX32) local = big(extra, value);
    }
    at += 46 + nameLength + extraLength + commentLength;
    if (name.endsWith("/")) continue;
    if (flags & 1) throw refusal(said("{0} 已加密", name));
    if (method !== 0 && method !== 8) throw refusal(said("{0}：不支持的压缩方式", name));
    entries.push({ name, method, packedSize, size: fullSize, local });
  }
  return entries;
}

// What an entry's bytes are refused with when they are not the size its directory declares.
const sizeRefused = (entry) => refusal(said("{0}：大小不符", entry.name), { code: "size" });

// An entry's deflated bytes inflated, up to the size it declares and no further (zlib's maxOutputLength,
// which stops the inflating as soon as the output passes it, at least 1 and at most what a Buffer holds).
function inflated(packed, entry) {
  try {
    return zlib.inflateRawSync(packed, { maxOutputLength: Math.min(bufferConstants.MAX_LENGTH, Math.max(1, entry.size)) });
  } catch (error) {
    if (error?.code === "ERR_BUFFER_TOO_LARGE") throw sizeRefused(entry);
    throw error;
  }
}

// Where an entry's data begins: after its local header (whose name and extra field may differ from the directory's).
function dataStart(read, entry) {
  const head = read(entry.local, 30);
  if (head.readUInt32LE(0) !== LOCAL) throw damaged();
  return entry.local + 30 + head.readUInt16LE(26) + head.readUInt16LE(28);
}

/**
 * The files of a zip in memory ([{ name, data: Buffer }], folders left out), in the order its
 * directory has them. Throws on what it cannot read (an encrypted file, a method but store and deflate).
 */
export function readZip(bytes) {
  const read = (position, length) => {
    if (position < 0 || position + length > bytes.length) throw damaged();
    return bytes.subarray(position, position + length);
  };
  return directoryOf(read, bytes.length).map((entry) => {
    const packed = read(dataStart(read, entry), entry.packedSize);
    const data = entry.method === 0 ? Buffer.from(packed) : inflated(packed, entry);
    if (data.length !== entry.size) throw sizeRefused(entry);
    return { name: entry.name, data };
  });
}

/**
 * A zip file on disk, read a file at a time: { entries ([{ name, size }]), read(entry) (its bytes),
 * extract(entry, file) (written to `file`, streamed: a file of any size), close() }.
 */
export function openZip(file) {
  const fd = fs.openSync(file, "r");
  const total = fs.fstatSync(fd).size;
  const read = (position, length) => {
    if (position < 0 || position + length > total) throw damaged();
    const buffer = Buffer.alloc(length);
    for (let done = 0; done < length;) {
      const count = fs.readSync(fd, buffer, done, length - done, position + done);
      if (count === 0) throw damaged();
      done += count;
    }
    return buffer;
  };
  let entries;
  try {
    entries = directoryOf(read, total);
  } catch (error) {
    fs.closeSync(fd);
    throw error;
  }
  return {
    entries,
    read(entry) {
      const packed = read(dataStart(read, entry), entry.packedSize);
      const data = entry.method === 0 ? packed : inflated(packed, entry);
      if (data.length !== entry.size) throw sizeRefused(entry);
      return data;
    },
    async extract(entry, to) {
      const start = dataStart(read, entry);
      if (entry.packedSize === 0) await fs.promises.writeFile(to, "");
      else {
        // A descriptor of its own: a stream broken off (a bomb refused, a damaged entry) closes its descriptor, never the zip's.
        const source = fs.createReadStream(file, { start, end: start + entry.packedSize - 1 });
        // The bytes counted as they go: past the declared size the stream stops, refused, the file left as far as it got.
        let count = 0;
        const held = new Transform({
          transform(chunk, encoding, done) {
            count += chunk.length;
            done(count > entry.size ? sizeRefused(entry) : null, chunk);
          },
        });
        await pipeline(...(entry.method === 0 ? [source] : [source, zlib.createInflateRaw()]), held, fs.createWriteStream(to));
      }
      if ((await fs.promises.stat(to)).size !== entry.size) throw sizeRefused(entry);
    },
    close: () => fs.closeSync(fd),
  };
}
