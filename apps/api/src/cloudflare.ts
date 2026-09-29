import { err, ok, type Result } from "@myma/types";

export interface DnsProvider {
  createRecord(hostname: string, target: string): Promise<Result<void>>;
  deleteRecord(hostname: string): Promise<Result<void>>;
}

interface CloudflareDnsRecord {
  id: string;
  name: string;
  type: string;
  content: string;
}

interface CloudflareApiResult {
  success: boolean;
  errors: Array<{ code: number; message: string }>;
  result: unknown;
}

export class CloudflareDnsProvider implements DnsProvider {
  constructor(
    private readonly env: {
      CLOUDFLARE_API_TOKEN: string;
      CLOUDFLARE_ZONE_ID: string;
    },
  ) {}

  async createRecord(hostname: string, target: string): Promise<Result<void>> {
    try {
      const existing = await this.listRecords(hostname);
      if (!existing.ok) return existing;

      for (const record of existing.value) {
        const deleted = await this.deleteRecordById(record.id);
        if (!deleted.ok) return deleted;
      }

      const response = await this.api("/dns_records", {
        method: "POST",
        body: JSON.stringify({
          type: "A",
          name: hostname,
          content: target,
          ttl: 1,
          proxied: true,
        }),
      });

      if (!response.ok) {
        return err("DNS_ERROR", `failed to create DNS record: ${response.statusText}`);
      }

      const payload = (await response.json()) as CloudflareApiResult;
      if (!payload.success) {
        const message = payload.errors.map((e) => e.message).join(", ");
        return err("DNS_ERROR", message);
      }

      return ok(undefined);
    } catch (e) {
      return err("DNS_ERROR", e instanceof Error ? e.message : String(e));
    }
  }

  async deleteRecord(hostname: string): Promise<Result<void>> {
    try {
      const records = await this.listRecords(hostname);
      if (!records.ok) return records;

      for (const record of records.value) {
        const deleted = await this.deleteRecordById(record.id);
        if (!deleted.ok) return deleted;
      }

      return ok(undefined);
    } catch (e) {
      return err("DNS_ERROR", e instanceof Error ? e.message : String(e));
    }
  }

  private async deleteRecordById(id: string): Promise<Result<void>> {
    const response = await this.api(`/dns_records/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      return err("DNS_ERROR", `failed to delete DNS record: ${response.statusText}`);
    }

    const payload = (await response.json()) as CloudflareApiResult;
    if (!payload.success) {
      const message = payload.errors.map((e) => e.message).join(", ");
      return err("DNS_ERROR", message);
    }

    return ok(undefined);
  }

  private async listRecords(hostname: string): Promise<Result<CloudflareDnsRecord[]>> {
    const response = await this.api(
      `/dns_records?type=A&name=${encodeURIComponent(hostname)}`,
      { method: "GET" },
    );
    if (!response.ok) {
      return err("DNS_ERROR", `failed to list DNS records: ${response.statusText}`);
    }
    const payload = (await response.json()) as CloudflareApiResult;
    if (!payload.success) {
      const message = payload.errors.map((e) => e.message).join(", ");
      return err("DNS_ERROR", message);
    }
    if (!Array.isArray(payload.result)) {
      return err("DNS_ERROR", "invalid DNS records response");
    }
    return ok(payload.result as CloudflareDnsRecord[]);
  }

  private api(path: string, init: RequestInit = {}): Promise<Response> {
    const url = `https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(
      this.env.CLOUDFLARE_ZONE_ID,
    )}${path}`;
    return fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.env.CLOUDFLARE_API_TOKEN}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...init.headers,
      },
    });
  }
}

export class FakeDnsProvider implements DnsProvider {
  records: { hostname: string; target: string }[] = [];

  async createRecord(hostname: string, target: string): Promise<Result<void>> {
    this.records = this.records.filter((r) => r.hostname !== hostname);
    this.records.push({ hostname, target });
    return ok(undefined);
  }

  async deleteRecord(hostname: string): Promise<Result<void>> {
    this.records = this.records.filter((r) => r.hostname !== hostname);
    return ok(undefined);
  }
}
