import fs from "node:fs";
import path from "node:path";
import { ts } from "./typescript.mjs";
import { sdkDirectory } from "../shared/paths.mjs";

// The options the SDK's types declare (skills/gallery/sdk/*.d.ts), read from the files' syntax: what the component
// cards' option tables are made of (src/cli/component-cards.mjs), so that a card says what the
// checks hold a report to, in the SDK's own words (its JSDoc).

const SDK = sdkDirectory;
let read = null;
let readAt = ""; // the files' names and times of change when they were read

/**
 * Every interface of the SDK, by name: { bases (the names of those it extends), members (its
 * properties, each { name, type (as the SDK writes it, blanks as one), optional, note (its JSDoc,
 * one line) }) }. Read again only when a file of the SDK changed (a preview running while the SDK is
 * edited lists the options as they are now).
 */
export function sdkInterfaces() {
  const names = fs.readdirSync(SDK).filter((file) => file.endsWith(".d.ts"));
  const at = names.map((name) => `${name}:${fs.statSync(path.join(SDK, name)).mtimeMs}`).join("|");
  if (read && at === readAt) return read;
  read = new Map();
  readAt = at;
  for (const name of names) {
    const file = ts.createSourceFile(name, fs.readFileSync(path.join(SDK, name), "utf8"), ts.ScriptTarget.ES2022, true);
    file.forEachChild((node) => {
      if (!ts.isInterfaceDeclaration(node)) return;
      const bases = (node.heritageClauses ?? []).flatMap((clause) => clause.types.map((type) => type.expression.getText(file)));
      const members = node.members.filter(ts.isPropertySignature).map((member) => ({
        name: member.name.getText(file),
        type: member.type?.getText(file).replace(/\s+/g, " ") ?? "unknown",
        optional: Boolean(member.questionToken),
        note: ts.getJSDocCommentsAndTags(member).map((doc) => (typeof doc.comment === "string" ? doc.comment : "")).join(" ").replace(/\s+/g, " ").trim(),
      }));
      read.set(node.name.text, { bases, members });
    });
  }
  return read;
}

/**
 * The options of an interface of the SDK: those of the interfaces it extends first, then its own
 * (a name it declares again in its own place), each as sdkInterfaces has it; none for a name the SDK
 * has no interface of.
 */
export function sdkOptions(name, all = sdkInterfaces(), seen = new Set()) {
  const entry = all.get(name);
  if (!entry || seen.has(name)) return [];
  seen.add(name);
  const inherited = entry.bases.flatMap((base) => sdkOptions(base.replace(/<.*$/, ""), all, seen));
  const own = new Set(entry.members.map((member) => member.name));
  return [...inherited.filter((member) => !own.has(member.name)), ...entry.members];
}
