/**
 * src/io/log.test.ts — FR54 stdout/stderr discipline assertions.
 *
 * Spies on `process.stdout.write` and `process.stderr.write` to verify each
 * exported helper routes to its intended channel and never leaks into the
 * other (the load-bearing FR54 invariant).
 */

import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { error, info, json, warn } from "./log.ts";

describe("log.info", () => {
  afterEach(() => {
    // Spies are scoped per test via beforeEach below; nothing to clean here.
  });

  it("writes message + newline to stderr (not stdout)", () => {
    const stdoutSpy = spyOn(process.stdout, "write").mockImplementation(
      () => true,
    );
    const stderrSpy = spyOn(process.stderr, "write").mockImplementation(
      () => true,
    );
    try {
      info("hello");
      expect(stderrSpy).toHaveBeenCalledTimes(1);
      expect(stderrSpy).toHaveBeenCalledWith("hello\n");
      expect(stdoutSpy).not.toHaveBeenCalled();
    } finally {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
    }
  });
});

describe("log.warn", () => {
  it("writes message + newline to stderr (not stdout)", () => {
    const stdoutSpy = spyOn(process.stdout, "write").mockImplementation(
      () => true,
    );
    const stderrSpy = spyOn(process.stderr, "write").mockImplementation(
      () => true,
    );
    try {
      warn("careful");
      expect(stderrSpy).toHaveBeenCalledTimes(1);
      expect(stderrSpy).toHaveBeenCalledWith("careful\n");
      expect(stdoutSpy).not.toHaveBeenCalled();
    } finally {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
    }
  });
});

describe("log.error", () => {
  it("writes message + newline to stderr (not stdout)", () => {
    const stdoutSpy = spyOn(process.stdout, "write").mockImplementation(
      () => true,
    );
    const stderrSpy = spyOn(process.stderr, "write").mockImplementation(
      () => true,
    );
    try {
      error("boom");
      expect(stderrSpy).toHaveBeenCalledTimes(1);
      expect(stderrSpy).toHaveBeenCalledWith("boom\n");
      expect(stdoutSpy).not.toHaveBeenCalled();
    } finally {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
    }
  });
});

describe("log.json", () => {
  it("writes JSON-encoded payload + newline to stdout (not stderr)", () => {
    const stdoutSpy = spyOn(process.stdout, "write").mockImplementation(
      () => true,
    );
    const stderrSpy = spyOn(process.stderr, "write").mockImplementation(
      () => true,
    );
    try {
      json({ foo: 1 });
      expect(stdoutSpy).toHaveBeenCalledTimes(1);
      expect(stdoutSpy).toHaveBeenCalledWith('{"foo":1}\n');
      expect(stderrSpy).not.toHaveBeenCalled();
    } finally {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
    }
  });

  it("encodes non-object payloads as JSON lines too", () => {
    const stdoutSpy = spyOn(process.stdout, "write").mockImplementation(
      () => true,
    );
    const stderrSpy = spyOn(process.stderr, "write").mockImplementation(
      () => true,
    );
    try {
      json("plain-string");
      expect(stdoutSpy).toHaveBeenCalledTimes(1);
      expect(stdoutSpy).toHaveBeenCalledWith('"plain-string"\n');
      expect(stderrSpy).not.toHaveBeenCalled();
    } finally {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
    }
  });

  it("encodes arrays as JSON lines too", () => {
    const stdoutSpy = spyOn(process.stdout, "write").mockImplementation(
      () => true,
    );
    const stderrSpy = spyOn(process.stderr, "write").mockImplementation(
      () => true,
    );
    try {
      json([1, 2, 3]);
      expect(stdoutSpy).toHaveBeenCalledTimes(1);
      expect(stdoutSpy).toHaveBeenCalledWith("[1,2,3]\n");
      expect(stderrSpy).not.toHaveBeenCalled();
    } finally {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
    }
  });
});
