import os from "node:os";
import path from "node:path";

// What a Gallery skill says of itself, and where the agents read skills: shared by gallery skill
// install (./skill.mjs, which writes a skill there), the packager (./package-skill.mjs, which writes
// the version into a skill's SKILL.md) and gallery --version (./updates.mjs, which reads it back and
// so imports nothing heavier than Node's own modules: --version stays as fast as Node's start).

/** The agents a skill is written for: their name, their home (the env's, else the user's folder) and their folder in a project. */
export const AGENTS = {
  claude: { name: "Claude Code", home: (env) => env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude"), project: ".claude" },
  codex: { name: "Codex", home: (env) => env.CODEX_HOME || path.join(os.homedir(), ".codex"), project: ".codex" },
};

/** The `name` of a SKILL.md's front matter (its text), or null. */
export function skillNameOf(text) {
  const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text.replace(/^﻿/, ""));
  return front ? (/^name:\s*["']?([\w.-]+)["']?\s*$/m.exec(front[1])?.[1] ?? null) : null;
}

/**
 * The words in SKILL.md's first section that say which Gallery made the skill (`This skill is Gallery
 * 0.1.2's`): the packager writes package.json's version there as it writes the range (withRange), and
 * gallery --version compares its own version with it. A skill made before the words were there has none.
 */
export const RECORD = /\bThis skill is Gallery (\d+\.\d+\.\d+(?:-[\w.]+)?)'s\b/;
export const recordOf = (version) => `This skill is Gallery ${version}'s`;

/** The Gallery version a SKILL.md's text says made it, or null. */
export const recordedVersion = (text) => RECORD.exec(text)?.[1] ?? null;
