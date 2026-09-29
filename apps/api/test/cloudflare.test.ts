import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CloudflareDnsProvider, FakeDnsProvider } from "../src/cloudflare.js";

describe("FakeDnsProvider", () => {
  it("deleteRecord removes all matching records", async () => {
    const dns = new FakeDnsProvider();
    await dns.createRecord("sandi.myma.id", "192.0.2.1");
    await dns.createRecord("other.myma.id", "192.0.2.2");

    const result = await dns.deleteRecord("sandi.myma.id");
    expect(result.ok).toBe(true);
    expect(dns.records).toHaveLength(1);
    expect(dns.records[0]).toEqual({ hostname: "other.myma.id", target: "192.0.2.2" });
  });
});

describe("CloudflareDnsProvider", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status });
  }

  it("propagates listRecords errors instead of swallowing them", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));

    const provider = new CloudflareDnsProvider({
      CLOUDFLARE_API_TOKEN: "token",
      CLOUDFLARE_ZONE_ID: "zone",
    });

    const result = await provider.createRecord("sandi.myma.id", "192.0.2.1");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("DNS_ERROR");
    expect(result.error.message).toContain("network down");
  });

  it("deleteRecord removes all matching records returned by listRecords", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          errors: [],
          result: [
            { id: "record-a", name: "sandi.myma.id", type: "A", content: "192.0.2.1" },
            { id: "record-b", name: "sandi.myma.id", type: "A", content: "192.0.2.2" },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ success: true, errors: [], result: { id: "record-a" } }))
      .mockResolvedValueOnce(jsonResponse({ success: true, errors: [], result: { id: "record-b" } }));

    const provider = new CloudflareDnsProvider({
      CLOUDFLARE_API_TOKEN: "token",
      CLOUDFLARE_ZONE_ID: "zone",
    });

    const result = await provider.deleteRecord("sandi.myma.id");

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const deleteCalls = fetchMock.mock.calls.filter((call: unknown[]) =>
      String(call[0]).includes("/dns_records/record-"),
    );
    expect(deleteCalls).toHaveLength(2);
  });
});
