/**
 * src/io/log.test.ts — FR54 stdout/stderr discipline assertions.
 *
 * Spies on `process.stdout.write` and `process.stderr.write` to verify each
 * exported helper routes to its intended channel and never leaks into the
 * other (the load-bearing FR54 invariant).
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { error, info, isTraceEnabled, json, traceLog, warn } from "./log.ts";

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

describe("log.traceLog", () => {
  const original = process.env.STEPPER_TRACE;

  beforeEach(() => {
    delete process.env.STEPPER_TRACE;
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.STEPPER_TRACE;
    } else {
      process.env.STEPPER_TRACE = original;
    }
  });

  it("emits nothing when STEPPER_TRACE is unset", () => {
    const stdoutSpy = spyOn(process.stdout, "write").mockImplementation(
      () => true,
    );
    const stderrSpy = spyOn(process.stderr, "write").mockImplementation(
      () => true,
    );
    try {
      traceLog("subsystem: hello");
      expect(stdoutSpy).not.toHaveBeenCalled();
      expect(stderrSpy).not.toHaveBeenCalled();
    } finally {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
    }
  });

  it("emits to stderr with [trace] prefix when STEPPER_TRACE=1", () => {
    process.env.STEPPER_TRACE = "1";
    const stdoutSpy = spyOn(process.stdout, "write").mockImplementation(
      () => true,
    );
    const stderrSpy = spyOn(process.stderr, "write").mockImplementation(
      () => true,
    );
    try {
      traceLog("dag: tier=seed step=bmad-brainstorming");
      expect(stderrSpy).toHaveBeenCalledTimes(1);
      expect(stderrSpy).toHaveBeenCalledWith(
        "[trace] dag: tier=seed step=bmad-brainstorming\n",
      );
      expect(stdoutSpy).not.toHaveBeenCalled();
    } finally {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
    }
  });

  it("treats STEPPER_TRACE=0 / false / empty as off", () => {
    const stderrSpy = spyOn(process.stderr, "write").mockImplementation(
      () => true,
    );
    try {
      for (const off of ["0", "false", ""]) {
        process.env.STEPPER_TRACE = off;
        traceLog("should be silent");
        expect(stderrSpy).not.toHaveBeenCalled();
      }
    } finally {
      stderrSpy.mockRestore();
    }
  });

  it("isTraceEnabled mirrors traceLog's gate", () => {
    expect(isTraceEnabled()).toBe(false);
    process.env.STEPPER_TRACE = "1";
    expect(isTraceEnabled()).toBe(true);
    process.env.STEPPER_TRACE = "true";
    expect(isTraceEnabled()).toBe(true);
    process.env.STEPPER_TRACE = "0";
    expect(isTraceEnabled()).toBe(false);
    process.env.STEPPER_TRACE = "false";
    expect(isTraceEnabled()).toBe(false);
    process.env.STEPPER_TRACE = "";
    expect(isTraceEnabled()).toBe(false);
  });
});
