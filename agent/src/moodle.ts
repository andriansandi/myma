/**
 * Moodle source checkout + installer abstractions.
 *
 * The agent checks out a Moodle release into the instance's host directory,
 * then runs the containerised one-shot installer.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { err, ok, type Result } from "@myma/types";
import type { DockerEngine } from "./docker.js";

const execFileAsync = promisify(execFile);

export interface MoodleSource {
  checkout(version: string, targetPath: string): Promise<Result<void>>;
}

export interface MoodleInstaller {
  install(project: string, container: string): Promise<Result<void>>;
}

export function branchFor(version: string): string {
  return `v${version}`;
}

export class GitMoodleSource implements MoodleSource {
  async checkout(version: string, targetPath: string): Promise<Result<void>> {
    try {
      const stat = await fs.stat(targetPath);
      if (stat.isDirectory()) {
        // Idempotent: if the checkout already exists, leave it alone.
        return ok(undefined);
      }
    } catch {
      // Directory does not exist; proceed to create parent and clone.
    }

    const parent = path.dirname(targetPath);
    await fs.mkdir(parent, { recursive: true });

    try {
      await execFileAsync(
        "git",
        [
          "clone",
          "--depth",
          "1",
          "--branch",
          branchFor(version),
          "https://github.com/moodle/moodle.git",
          targetPath,
        ],
        { timeout: 600_000 },
      );
      return ok(undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return err("AGENT_ERROR", `moodle checkout failed: ${message}`);
    }
  }
}

export class DockerMoodleInstaller implements MoodleInstaller {
  constructor(private docker: DockerEngine) {}

  async install(project: string, container: string): Promise<Result<void>> {
    const result = await this.docker.exec(project, container, [
      "/usr/local/bin/install-moodle.sh",
    ]);
    return result.ok
      ? ok(undefined)
      : err(result.error.code, result.error.message, result.error.details);
  }
}

export class FakeMoodleSource implements MoodleSource {
  readonly calls: Array<{ version: string; targetPath: string }> = [];

  async checkout(version: string, targetPath: string): Promise<Result<void>> {
    this.calls.push({ version, targetPath });
    return ok(undefined);
  }
}

export class FakeMoodleInstaller implements MoodleInstaller {
  readonly calls: Array<{ project: string; container: string }> = [];

  async install(project: string, container: string): Promise<Result<void>> {
    this.calls.push({ project, container });
    return ok(undefined);
  }
}
