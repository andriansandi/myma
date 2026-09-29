import {
  err,
  ok,
  type Result,
  type VpsNode,
} from "@myma/types";
import type {
  AgentBackupRequest,
  AgentBackupResponse,
  CreateInstanceRequest,
  AgentHealthResponse,
  AgentInstanceStatus,
  AgentJob,
  AgentMetrics,
  AgentRestoreRequest,
} from "@myma/types";
import { nowSeconds, randomNonce, signRequest } from "./signing.js";

interface SignedFetchResult {
  status: number;
  data: unknown;
}

export class AgentService {
  constructor(
    private readonly env: {
      AGENT_KEY_ID: string;
      AGENT_SIGNING_KEY: string;
    },
  ) {}

  async healthCheck(node: VpsNode): Promise<Result<AgentHealthResponse>> {
    const result = await this.signedFetch("GET", this.url(node, "/v1/health"));
    if (!result.ok) return result;
    return this.cast<AgentHealthResponse>(result.value.data);
  }

  async createInstance(
    node: VpsNode,
    request: CreateInstanceRequest,
  ): Promise<Result<AgentJob>> {
    const result = await this.signedFetch(
      "POST",
      this.url(node, "/v1/instances"),
      request,
    );
    if (!result.ok) return result;
    return this.cast<AgentJob>(result.value.data);
  }

  async getStatus(node: VpsNode, instanceId: string): Promise<Result<AgentInstanceStatus>> {
    const result = await this.signedFetch(
      "GET",
      this.url(node, `/v1/instances/${encodeURIComponent(instanceId)}/status`),
    );
    if (!result.ok) return result;
    return this.cast<AgentInstanceStatus>(result.value.data);
  }

  async start(node: VpsNode, instanceId: string): Promise<Result<{ status: string }>> {
    const result = await this.signedFetch(
      "POST",
      this.url(node, `/v1/instances/${encodeURIComponent(instanceId)}/start`),
    );
    if (!result.ok) return result;
    return this.cast<{ status: string }>(result.value.data);
  }

  async stop(node: VpsNode, instanceId: string): Promise<Result<{ status: string }>> {
    const result = await this.signedFetch(
      "POST",
      this.url(node, `/v1/instances/${encodeURIComponent(instanceId)}/stop`),
    );
    if (!result.ok) return result;
    return this.cast<{ status: string }>(result.value.data);
  }

  async restart(
    node: VpsNode,
    instanceId: string,
  ): Promise<Result<{ status: string }>> {
    const result = await this.signedFetch(
      "POST",
      this.url(node, `/v1/instances/${encodeURIComponent(instanceId)}/restart`),
    );
    if (!result.ok) return result;
    return this.cast<{ status: string }>(result.value.data);
  }

  async reset(
    node: VpsNode,
    instanceId: string,
    request: CreateInstanceRequest,
  ): Promise<Result<{ job_id: string }>> {
    const result = await this.signedFetch(
      "POST",
      this.url(node, `/v1/instances/${encodeURIComponent(instanceId)}/reset`),
      request,
    );
    if (!result.ok) return result;
    return this.cast<{ job_id: string }>(result.value.data);
  }

  async delete(node: VpsNode, instanceId: string): Promise<Result<{ job_id: string }>> {
    const result = await this.signedFetch(
      "POST",
      this.url(node, `/v1/instances/${encodeURIComponent(instanceId)}/delete`),
    );
    if (!result.ok) return result;
    return this.cast<{ job_id: string }>(result.value.data);
  }

  async backup(
    node: VpsNode,
    instanceId: string,
    uploadUrl: string,
    uploadHeaders: Record<string, string>,
  ): Promise<Result<AgentBackupResponse>> {
    const body: AgentBackupRequest = {
      instance_id: instanceId,
      upload_url: uploadUrl,
      upload_headers: uploadHeaders,
    };
    const result = await this.signedFetch(
      "POST",
      this.url(node, `/v1/instances/${encodeURIComponent(instanceId)}/backup`),
      body,
    );
    if (!result.ok) return result;
    return this.cast<AgentBackupResponse>(result.value.data);
  }

  async restore(
    node: VpsNode,
    instanceId: string,
    downloadUrl: string,
  ): Promise<Result<{ job_id: string }>> {
    const body: AgentRestoreRequest = { instance_id: instanceId, download_url: downloadUrl };
    const result = await this.signedFetch(
      "POST",
      this.url(node, `/v1/instances/${encodeURIComponent(instanceId)}/restore`),
      body,
    );
    if (!result.ok) return result;
    return this.cast<{ job_id: string }>(result.value.data);
  }

  async metrics(node: VpsNode, instanceId: string): Promise<Result<AgentMetrics>> {
    const result = await this.signedFetch(
      "GET",
      this.url(node, `/v1/instances/${encodeURIComponent(instanceId)}/metrics`),
    );
    if (!result.ok) return result;
    return this.cast<AgentMetrics>(result.value.data);
  }

  private url(node: VpsNode, path: string): string {
    const base = node.agent_url.replace(/\/$/, "");
    return `${base}${path}`;
  }

  private async signedFetch(
    method: string,
    fullUrl: string,
    body?: unknown,
  ): Promise<Result<SignedFetchResult>> {
    const url = new URL(fullUrl);
    const timestamp = String(nowSeconds());
    const nonce = randomNonce();
    const bodyText = body === undefined ? "" : JSON.stringify(body);

    try {
      const signature = await signRequest(
        method,
        url.pathname,
        timestamp,
        nonce,
        bodyText,
        this.env.AGENT_SIGNING_KEY,
      );

      const headers: Record<string, string> = {
        "X-Myma-Key-Id": this.env.AGENT_KEY_ID,
        "X-Myma-Timestamp": timestamp,
        "X-Myma-Nonce": nonce,
        "X-Myma-Signature": signature,
        Accept: "application/json",
      };
      if (bodyText) {
        headers["Content-Type"] = "application/json";
      }

      const response = await fetch(fullUrl, {
        method,
        headers,
        body: bodyText || undefined,
      });

      const data = (await response.json()) as unknown;
      if (!response.ok) {
        const message =
          data && typeof data === "object" && "error" in data && data.error && typeof data.error === "object" && "message" in data.error && typeof data.error.message === "string"
            ? data.error.message
            : `agent returned ${response.status}`;
        return err("AGENT_ERROR", message);
      }
      return ok({ status: response.status, data });
    } catch (e) {
      return err("AGENT_ERROR", e instanceof Error ? e.message : String(e));
    }
  }

  private cast<T extends object>(data: unknown): Result<T> {
    if (data && typeof data === "object") {
      return ok(data as T);
    }
    return err("AGENT_ERROR", "agent returned invalid response");
  }
}
