import * as fs from "node:fs";
import yaml from "js-yaml";
import { BouncerMalformedFileError } from "./errors.js";

// Maximum bouncer file size before parsing is refused. A legitimate bouncer file
// will never approach this limit; exceeding it indicates a computational attack.
export const MAX_INPUT_BYTES = 512_000;

export interface ParsedFrontmatter {
  name: string;
  description: string;
  applies_to?: string[];
  [key: string]: unknown;
}

export interface ParsedControl {
  name: string;
  sections: Map<string, string>; // section heading → trimmed content
}

export interface ParsedFile {
  path: string;
  frontmatter: ParsedFrontmatter;
  controls: ParsedControl[];
}

export type ParseResult =
  | { ok: true; file: ParsedFile }
  | { ok: false; reason: string };

export function parseBouncerFile(filePath: string): ParseResult {
  let content: string;
  try {
    content = fs.readFileSync(filePath, "utf-8");
  } catch (e) {
    return { ok: false, reason: `cannot read file: ${String(e)}` };
  }

  if (Buffer.byteLength(content, "utf-8") > MAX_INPUT_BYTES) {
    throw new BouncerMalformedFileError(filePath, "input_too_large");
  }

  // Frontmatter must begin at the very start of the file
  if (!content.startsWith("---")) {
    return { ok: false, reason: "missing YAML frontmatter (file must start with ---)" };
  }

  const fmEnd = content.indexOf("\n---", 3);
  if (fmEnd === -1) {
    return { ok: false, reason: "unclosed YAML frontmatter (no closing ---)" };
  }

  const fmRaw = content.slice(3, fmEnd).trim();
  const body = content.slice(fmEnd + 4); // skip the closing \n---

  let rawFm: unknown;
  try {
    rawFm = yaml.load(fmRaw);
  } catch (e) {
    return { ok: false, reason: `YAML parse error in frontmatter: ${String(e)}` };
  }

  if (!rawFm || typeof rawFm !== "object" || Array.isArray(rawFm)) {
    return { ok: false, reason: "frontmatter must be a YAML mapping" };
  }

  const fm = rawFm as Record<string, unknown>;

  const rawName = fm["name"];
  if (typeof rawName !== "string" || rawName.trim() === "") {
    return { ok: false, reason: 'frontmatter missing required field "name"' };
  }
  const rawDescription = fm["description"];
  if (typeof rawDescription !== "string" || rawDescription.trim() === "") {
    return { ok: false, reason: 'frontmatter missing required field "description"' };
  }

  const rawAppliesTo = fm["applies_to"];
  if (
    rawAppliesTo !== undefined &&
    !(Array.isArray(rawAppliesTo) && rawAppliesTo.every((v) => typeof v === "string"))
  ) {
    return { ok: false, reason: '"applies_to" must be an array of strings if present' };
  }

  // rawName and rawDescription are narrowed to string; rawAppliesTo is string[] or undefined
  const name: string = rawName;
  const description: string = rawDescription;
  // rawAppliesTo is either undefined or string[] (verified by the guard above)
  const applies_to: string[] | undefined = Array.isArray(rawAppliesTo)
    ? rawAppliesTo.filter((v): v is string => typeof v === "string")
    : undefined;

  const frontmatter: ParsedFrontmatter = applies_to !== undefined
    ? { ...fm, name, description, applies_to }
    : { ...fm, name, description };

  const controls = parseControls(body);

  return { ok: true, file: { path: filePath, frontmatter, controls } };
}

// Parse control blocks from the markdown body (everything after frontmatter).
// Implements Rule 7: strips HTML comments and ### Note: sections.
function parseControls(body: string): ParsedControl[] {
  const lines = body.split("\n");
  const controls: ParsedControl[] = [];

  let controlName: string | null = null;
  let sections: Map<string, string> | null = null;
  let sectionName: string | null = null;
  let sectionLines: string[] = [];
  let inHtmlComment = false;

  function finalizeSection(): void {
    if (sectionName !== null && sections !== null) {
      sections.set(sectionName, sectionLines.join("\n").trim());
    }
    sectionLines = [];
    sectionName = null;
  }

  function finalizeControl(): void {
    finalizeSection();
    if (controlName !== null && sections !== null) {
      controls.push({ name: controlName, sections });
    }
    controlName = null;
    sections = null;
  }

  for (const line of lines) {
    // HTML comment stripping (Rule 7)
    if (inHtmlComment) {
      if (line.includes("-->")) inHtmlComment = false;
      continue;
    }
    if (line.trimStart().startsWith("<!--")) {
      if (!line.includes("-->")) inHtmlComment = true;
      continue;
    }

    // ## Control: <name> — starts a new control block
    const controlMatch = /^## Control:\s*(.+)$/.exec(line);
    if (controlMatch) {
      finalizeControl();
      controlName = (controlMatch[1] ?? "").trim();
      sections = new Map();
      continue;
    }

    // ## non-Control heading — ends the current control (e.g. semantic preamble ## Bouncer Policy)
    if (/^## (?!Control:)/.test(line)) {
      finalizeControl();
      continue;
    }

    if (controlName === null || sections === null) continue; // skip pre-control preamble

    // ### <Section> heading — starts a named section within the control block
    const sectionMatch = /^### (.+)$/.exec(line);
    if (sectionMatch) {
      finalizeSection();
      const heading = (sectionMatch[1] ?? "").trim();
      // Rule 7: strip ### Note: sections (non-structural content)
      sectionName = heading.startsWith("Note") ? null : heading;
      continue;
    }

    // Accumulate content for the current section
    if (sectionName !== null) {
      sectionLines.push(line);
    }
  }

  finalizeControl();
  return controls;
}

// Extract bullet-list items from a section's content.
export function parseListItems(content: string): string[] {
  return content
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("- ") || l.startsWith("* ") || l.startsWith("+ "))
    .map((l) => l.slice(2).trim())
    .filter(Boolean);
}
