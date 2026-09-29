/**
 * Unit tests for Moodle source checkout + installer abstractions.
 *
 * node:child_process.execFile is mocked so no real git clone runs.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { execFile } from "node:child_process";
import { FakeDockerEngine } from "../src/docker.js";
import {
  branchFor,
  DockerMoodleInstaller,
  FakeMoodleInstaller,
  FakeMoodleSource,
  GitMoodleSource,
} from "../src/moodle.js";

vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
  return {
    ...actual,
    execFile: vi.fn((_command, _args, _options, callback) => {
      if (typeof callback === "function") {
        callback(null, "", "");
      }
    }),
  };
});

describe("branchFor", () => {
  it("prefixes a Moodle version with v", () => {
    expect(branchFor("4.5.1")).toBe("v4.5.1");
  });
});

describe("GitMoodleSource", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("invokes git clone with the v-prefixed branch and target path", async () => {
    const source = new GitMoodleSource();
    const targetPath = "/tmp/myma-test-instances/student-alpha/moodle";
    const result = await source.checkout("4.5.1", targetPath);
    expect(result.ok).toBe(true);

    expect(execFile).toHaveBeenCalledTimes(1);
    const call = vi.mocked(execFile).mock.calls[0]!;
    expect(call[0]).toBe("git");
    expect(call[1]).toEqual([
      "clone",
      "--depth",
      "1",
      "--branch",
      "v4.5.1",
      "https://github.com/moodle/moodle.git",
      targetPath,
    ]);
  });
});

describe("FakeMoodleSource", () => {
  it("records checkout calls", async () => {
    const source = new FakeMoodleSource();
    const result = await source.checkout("4.5.1", "/opt/myma/instances/a/moodle");
    expect(result.ok).toBe(true);
    expect(source.calls).toEqual([
      { version: "4.5.1", targetPath: "/opt/myma/instances/a/moodle" },
    ]);
  });
});

describe("DockerMoodleInstaller", () => {
  it("records the exec command on the fake docker engine", async () => {
    const docker = new FakeDockerEngine();
    const installer = new DockerMoodleInstaller(docker);
    const result = await installer.install("student-alpha", "moodle-student-alpha");
    expect(result.ok).toBe(true);

    const calls = docker.getExecCalls();
    expect(calls.length).toBe(1);
    expect(calls[0]?.project).toBe("student-alpha");
    expect(calls[0]?.container).toBe("moodle-student-alpha");
    expect(calls[0]?.command).toEqual(["/usr/local/bin/install-moodle.sh"]);
  });
});

describe("FakeMoodleInstaller", () => {
  it("records install calls", async () => {
    const installer = new FakeMoodleInstaller();
    const result = await installer.install("student-alpha", "moodle-student-alpha");
    expect(result.ok).toBe(true);
    expect(installer.calls).toEqual([
      { project: "student-alpha", container: "moodle-student-alpha" },
    ]);
  });
});
