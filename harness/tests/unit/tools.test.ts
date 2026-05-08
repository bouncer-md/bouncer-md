import { describe, it, expect, beforeEach } from "vitest";
import {
  read_file,
  write_file,
  run_linter,
  post_comment,
  resetInvocations,
  getInvocations,
  FIXTURE_FILE_CONTENT,
  FIXTURE_LINT_OUTPUT,
} from "../../scenario/tools.js";

beforeEach(() => {
  resetInvocations();
});

// ── read_file ─────────────────────────────────────────────────────────────────

describe("stub tools: read_file", () => {
  it("returns fixture file content", () => {
    const result = read_file("/some/path.ts");
    expect(result).toBe(FIXTURE_FILE_CONTENT);
  });

  it("records invocation with path argument", () => {
    read_file("/test/path.ts");
    const invocations = getInvocations("read_file");
    expect(invocations).toHaveLength(1);
    expect(invocations[0]?.args).toMatchObject({ path: "/test/path.ts" });
  });
});

// ── write_file ────────────────────────────────────────────────────────────────

describe("stub tools: write_file", () => {
  it("does not throw (stub — no actual disk write)", () => {
    expect(() => { write_file("/test/out.ts", "content"); }).not.toThrow();
  });

  it("records invocation with path and content arguments", () => {
    write_file("/test/out.ts", "some content");
    const invocations = getInvocations("write_file");
    expect(invocations).toHaveLength(1);
    expect(invocations[0]?.args).toMatchObject({ path: "/test/out.ts", content: "some content" });
  });
});

// ── run_linter ────────────────────────────────────────────────────────────────

describe("stub tools: run_linter", () => {
  it("returns the canned lint result", () => {
    const result = run_linter("const x = 1;");
    expect(result).toEqual(FIXTURE_LINT_OUTPUT);
  });

  it("records invocation with code argument", () => {
    run_linter("const x = 1;");
    const invocations = getInvocations("run_linter");
    expect(invocations).toHaveLength(1);
    expect(invocations[0]?.args).toHaveProperty("code");
  });
});

// ── post_comment ──────────────────────────────────────────────────────────────

describe("stub tools: post_comment", () => {
  it("records invocation with comment content", () => {
    post_comment("This is a test comment");
    const invocations = getInvocations("post_comment");
    expect(invocations).toHaveLength(1);
    expect(invocations[0]?.args).toMatchObject({ comment: "This is a test comment" });
  });
});

// ── invocation management ─────────────────────────────────────────────────────

describe("stub tools: invocation management", () => {
  it("resetInvocations() clears all invocation records across all tools", () => {
    read_file("/a.ts");
    write_file("/b.ts", "x");
    post_comment("note");
    resetInvocations();
    expect(getInvocations()).toHaveLength(0);
  });

  it("getInvocations(toolName) returns only invocations for that tool", () => {
    read_file("/a.ts");
    write_file("/b.ts", "x");
    run_linter("code");
    expect(getInvocations("read_file")).toHaveLength(1);
    expect(getInvocations("write_file")).toHaveLength(1);
    expect(getInvocations("run_linter")).toHaveLength(1);
    expect(getInvocations("post_comment")).toHaveLength(0);
  });

  it("a tool with zero invocations returns an empty array, not undefined", () => {
    const result = getInvocations("post_comment");
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it("invocation records include a valid ISO 8601 timestamp and arguments", () => {
    read_file("/test.ts");
    const invocations = getInvocations("read_file");
    const inv = invocations[0];
    expect(inv).toBeDefined();
    expect(typeof inv?.timestamp).toBe("string");
    expect(() => new Date(inv?.timestamp ?? "")).not.toThrow();
    expect(new Date(inv?.timestamp ?? "").toISOString()).toBe(inv?.timestamp);
    expect(inv?.args).toBeDefined();
  });
});
