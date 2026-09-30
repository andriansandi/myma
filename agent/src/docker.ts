/**
 * DockerEngine abstraction for the MyMA Agent.
 *
 * The real engine shells out to the `docker` CLI talking to the local Unix
 * socket. It never accepts arbitrary shell commands — only whitelisted verbs
 * and array arguments.
 *
 * The fake engine is an in-memory implementation for tests.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ContainerState } from "@myma/types";
import { err, ok, type Result } from "@myma/types";

const execFileAsync = promisify(execFile);

export interface DockerEngineConfig {
  instancesDir: string;
}

export interface DockerEngine {
  createProject(project: string): Promise<Result<void>>;
  removeProject(project: string): Promise<Result<void>>;
  start(project: string): Promise<Result<void>>;
  stop(project: string): Promise<Result<void>>;
  restart(project: string): Promise<Result<void>>;
  /** Verify the Docker daemon is reachable (used by /v1/health). */
  ping(): Promise<Result<void>>;
  status(project: string): Promise<Result<{ running: boolean; containers: ContainerState[] }>>;
  metrics(project: string): Promise<Result<{ cpu_usage: number; memory_usage: number }>>;
  exec(project: string, container: string, command: string[]): Promise<Result<void>>;
  volumeExists(name: string): Promise<Result<boolean>>;
  createVolume(name: string): Promise<Result<void>>;
  removeVolume(name: string): Promise<Result<void>>;
}

function composePath(instancesDir: string, project: string): string {
  return `${instancesDir}/${project}/compose.yml`;
}

function voidFromResult<T>(result: Result<T>): Result<void> {
  return result.ok ? ok(undefined) : err(result.error.code, result.error.message, result.error.details);
}

async function runDocker(
  args: string[],
): Promise<Result<{ stdout: string; stderr: string }>> {
  try {
    const { stdout, stderr } = await execFileAsync("docker", args, { timeout: 120_000 });
    return ok({ stdout: stdout ?? "", stderr: stderr ?? "" });
  } catch (error) {
    const stderr =
      error && typeof error === "object" && "stderr" in error
        ? String(error.stderr ?? "")
        : "";
    const message = error instanceof Error ? error.message : String(error);
    return err("AGENT_ERROR", `docker command failed: ${message}`, { stderr });
  }
}

export class CliDockerEngine implements DockerEngine {
  private instancesDir: string;

  constructor(config: DockerEngineConfig) {
    this.instancesDir = config.instancesDir;
  }

  private composeArgs(project: string): string[] {
    return ["compose", "-p", project, "-f", composePath(this.instancesDir, project)];
  }

  async createProject(project: string): Promise<Result<void>> {
    return voidFromResult(await runDocker([...this.composeArgs(project), "up", "-d"]));
  }

  async removeProject(project: string): Promise<Result<void>> {
    return voidFromResult(await runDocker([...this.composeArgs(project), "down", "--volumes"]));
  }

  async start(project: string): Promise<Result<void>> {
    return voidFromResult(await runDocker([...this.composeArgs(project), "start"]));
  }

  async stop(project: string): Promise<Result<void>> {
    return voidFromResult(await runDocker([...this.composeArgs(project), "stop"]));
  }

  async restart(project: string): Promise<Result<void>> {
    return voidFromResult(await runDocker([...this.composeArgs(project), "restart"]));
  }

  async ping(): Promise<Result<void>> {
    return voidFromResult(await runDocker(["version", "--format", "{{.Server.Version}}"]));
  }

  async status(project: string): Promise<Result<{ running: boolean; containers: ContainerState[] }>> {
    const psRes = await runDocker([...this.composeArgs(project), "ps", "--format", "json"]);
    if (!psRes.ok) return psRes;

    const containers: ContainerState[] = [];
    const out = psRes.value.stdout.trim();
    if (out.length > 0) {
      const lines = out.startsWith("[") ? [out] : out.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed) as unknown;
          const entries = Array.isArray(parsed) ? parsed : [parsed];
          for (const obj of entries) {
            if (!obj || typeof obj !== "object") continue;
            const name = String("Name" in obj ? obj.Name : "Service" in obj ? obj.Service : "");
            const state = String("State" in obj ? obj.State : "");
            containers.push({
              name,
              status: String("Health" in obj ? obj.Health : state),
              running: state.toLowerCase() === "running",
            });
          }
        } catch {
          // ignore unparseable lines
        }
      }
    }
    return ok({ running: containers.some((c) => c.running), containers });
  }

  async metrics(project: string): Promise<Result<{ cpu_usage: number; memory_usage: number }>> {
    const idRes = await runDocker([...this.composeArgs(project), "ps", "-q"]);
    if (!idRes.ok) {
      return err(idRes.error.code, idRes.error.message, idRes.error.details);
    }
    const ids = idRes.value.stdout
      .trim()
      .split("\n")
      .filter((id) => id.length > 0);
    if (ids.length === 0) {
      return ok({ cpu_usage: 0, memory_usage: 0 });
    }
    const statsArgs = ["stats", "--no-stream", "--format", "{{.CPUPerc}}|{{.MemUsage}}", ...ids];
    const statsRes = await runDocker(statsArgs);
    if (!statsRes.ok) {
      return err(statsRes.error.code, statsRes.error.message, statsRes.error.details);
    }

    let totalCpu = 0;
    let totalMemBytes = 0;
    for (const line of statsRes.value.stdout.split("\n")) {
      const parts = line.split("|");
      if (parts.length < 2) continue;
      const cpuStr = (parts[0] ?? "").trim().replace("%", "");
      const cpu = Number.parseFloat(cpuStr);
      if (Number.isFinite(cpu)) totalCpu += cpu;

      const memParts = (parts[1] ?? "").trim().split("/");
      const memStr = memParts[0]?.trim() ?? "";
      totalMemBytes += parseMemToBytes(memStr);
    }
    return ok({ cpu_usage: totalCpu, memory_usage: totalMemBytes });
  }

  async exec(project: string, container: string, command: string[]): Promise<Result<void>> {
    return voidFromResult(
      await runDocker([...this.composeArgs(project), "exec", "-T", container, ...command]),
    );
  }

  async volumeExists(name: string): Promise<Result<boolean>> {
    const res = await runDocker(["volume", "inspect", name]);
    return ok(res.ok);
  }

  async createVolume(name: string): Promise<Result<void>> {
    return voidFromResult(await runDocker(["volume", "create", name]));
  }

  async removeVolume(name: string): Promise<Result<void>> {
    return voidFromResult(await runDocker(["volume", "rm", name]));
  }
}

function parseMemToBytes(mem: string): number {
  const match = mem.match(/^(\d+(?:\.\d+)?)\s*(b|k|m|g|t|kb|mb|gb|tb)?$/i);
  if (!match) return 0;
  const value = Number.parseFloat(match[1] ?? "0");
  if (!Number.isFinite(value)) return 0;
  const unit = (match[2] ?? "").toLowerCase();
  const multipliers: Record<string, number> = {
    "": 1,
    b: 1,
    k: 1024,
    kb: 1024,
    m: 1024 * 1024,
    mb: 1024 * 1024,
    g: 1024 * 1024 * 1024,
    gb: 1024 * 1024 * 1024,
    t: 1024 * 1024 * 1024 * 1024,
    tb: 1024 * 1024 * 1024 * 1024,
  };
  const multiplier = multipliers[unit];
  return multiplier !== undefined ? Math.floor(value * multiplier) : 0;
}

interface FakeContainer {
  name: string;
  service: string;
  status: string;
  running: boolean;
}

interface FakeProject {
  running: boolean;
  containers: FakeContainer[];
  cpu_usage: number;
  memory_usage: number;
  volumes: Set<string>;
}

export class FakeDockerEngine implements DockerEngine {
  private projects = new Map<string, FakeProject>();
  private volumes = new Set<string>();
  private execCalls: Array<{ project: string; container: string; command: string[] }> = [];

  private ensureProject(project: string): FakeProject {
    let p = this.projects.get(project);
    if (!p) {
      p = {
        running: false,
        containers: [{ name: `moodle-${project}`, service: "moodle", status: "created", running: false }],
        cpu_usage: 0,
        memory_usage: 0,
        volumes: new Set<string>(),
      };
      this.projects.set(project, p);
    }
    return p;
  }

  async createProject(project: string): Promise<Result<void>> {
    const p = this.ensureProject(project);
    p.running = true;
    for (const c of p.containers) {
      c.running = true;
      c.status = "running";
    }
    return ok(undefined);
  }

  async removeProject(project: string): Promise<Result<void>> {
    this.projects.delete(project);
    return ok(undefined);
  }

  async start(project: string): Promise<Result<void>> {
    const p = this.ensureProject(project);
    p.running = true;
    for (const c of p.containers) {
      c.running = true;
      c.status = "running";
    }
    return ok(undefined);
  }

  async stop(project: string): Promise<Result<void>> {
    const p = this.projects.get(project);
    if (p) {
      p.running = false;
      for (const c of p.containers) {
        c.running = false;
        c.status = "exited";
      }
    }
    return ok(undefined);
  }

  async restart(project: string): Promise<Result<void>> {
    await this.stop(project);
    return this.start(project);
  }

  async ping(): Promise<Result<void>> {
    return ok(undefined);
  }

  async status(project: string): Promise<Result<{ running: boolean; containers: ContainerState[] }>> {
    const p = this.projects.get(project);
    if (!p) return ok({ running: false, containers: [] });
    const containers = p.containers.map((c) => ({
      name: c.name,
      status: c.status,
      running: c.running,
    }));
    return ok({ running: p.running, containers });
  }

  async metrics(project: string): Promise<Result<{ cpu_usage: number; memory_usage: number }>> {
    const p = this.projects.get(project);
    if (!p) return ok({ cpu_usage: 0, memory_usage: 0 });
    return ok({ cpu_usage: p.cpu_usage, memory_usage: p.memory_usage });
  }

  async exec(project: string, container: string, command: string[]): Promise<Result<void>> {
    this.execCalls.push({ project, container, command });
    return ok(undefined);
  }

  async volumeExists(name: string): Promise<Result<boolean>> {
    return ok(this.volumes.has(name));
  }

  async createVolume(name: string): Promise<Result<void>> {
    this.volumes.add(name);
    const p = this.projects.get(name.replace(/^moodledata-/, ""));
    p?.volumes.add(name);
    return ok(undefined);
  }

  async removeVolume(name: string): Promise<Result<void>> {
    this.volumes.delete(name);
    return ok(undefined);
  }

  /** Test helper to simulate container metrics. */
  setMetrics(project: string, cpu: number, memory: number): void {
    const p = this.ensureProject(project);
    p.cpu_usage = cpu;
    p.memory_usage = memory;
  }

  /** Test accessor for recorded exec calls. */
  getExecCalls(): ReadonlyArray<{ project: string; container: string; command: string[] }> {
    return this.execCalls;
  }

  /** Test accessor to check whether a named volume was created. */
  hasVolume(name: string): boolean {
    return this.volumes.has(name);
  }
}
