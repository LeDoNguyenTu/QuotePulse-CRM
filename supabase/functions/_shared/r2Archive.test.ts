import { afterEach, describe, expect, it, vi } from "vitest";
import {
  archiveObjectHeaders,
  assertWorkspaceArchivePointer,
  companyAttachmentBatchArchiveKey,
  companyAttachmentArchiveKey,
  dealBatchArchiveKey,
  dealArchiveKey,
  sha256Hex,
  verifyArchivePayload,
  workspaceArchiveManifestKey,
  workspaceArchiveObjectKey,
  crmWorkbookTemplateKey,
  assertCrmWorkbookPointer,
  assertWorkbookRowIndexPointer,
  crmWorkbookRowIndexKey,
  deleteArchiveObject,
} from "./r2Archive.ts";

function configureR2() {
  const values: Record<string, string> = {
    R2_ACCOUNT_ID: "account",
    R2_BUCKET: "bucket",
    R2_ACCESS_KEY_ID: "access",
    R2_SECRET_ACCESS_KEY: "secret",
  };
  vi.stubGlobal("Deno", { env: { get: (key: string) => values[key] } });
}

afterEach(() => vi.unstubAllGlobals());

describe("R2 cold archive keys and verification", () => {
  it("stores gzip bytes as an object payload without HTTP auto-decompression metadata", () => {
    expect(archiveObjectHeaders()).toEqual({
      "content-type": "application/gzip",
    });
  });

  it("keeps deal archives inside the owner scope", () => {
    expect(dealArchiveKey("owner-a", "deal-b", "2026-08-18T00:00:00Z")).toMatch(
      /^owners\/owner-a\/deals\/deal-b\//,
    );
  });

  it("uses one owner-scoped object for a migration batch", () => {
    expect(dealBatchArchiveKey("owner-a", "batch-b")).toBe(
      "owners/owner-a/deal-batches/batch-b.json.gz",
    );
  });

  it("keeps generic attachment manifests inside the owner and company scope", () => {
    expect(companyAttachmentArchiveKey("owner-a", "company-b", "batch-c")).toBe(
      "owners/owner-a/companies/company-b/generic-attachments/batch-c.json.gz",
    );
  });

  it("uses one owner-scoped object for a generic attachment migration batch", () => {
    expect(companyAttachmentBatchArchiveKey("owner-a", "batch-b")).toBe(
      "owners/owner-a/attachment-batches/batch-b.json.gz",
    );
  });

  it("contains workspace archives beneath the owner and workspace scope", () => {
    expect(
      workspaceArchiveObjectKey(
        "owner-a",
        "workspace-b",
        "archive-c",
        "deals",
        2,
      ),
    ).toBe(
      "owners/owner-a/workspaces/workspace-b/archives/archive-c/tables/deals/2.json.gz",
    );
    expect(
      workspaceArchiveManifestKey("owner-a", "workspace-b", "archive-c"),
    ).toBe(
      "owners/owner-a/workspaces/workspace-b/archives/archive-c/manifest.v1.json.gz",
    );
    expect(() =>
      assertWorkspaceArchivePointer(
        "owners/other/workspaces/workspace-b/archives/archive-c/manifest.v1.json.gz",
        "owner-a",
        "workspace-b",
        "archive-c",
      ),
    ).toThrow(/outside/);
  });

  it("keeps imported workbook templates inside the user and workspace scope", () => {
    expect(
      crmWorkbookTemplateKey(
        "owner-a",
        "workspace-b",
        "abc123",
        "Leads Database.xlsx",
      ),
    ).toBe(
      "owners/owner-a/workspaces/workspace-b/crm-imports/abc123/Leads%20Database.xlsx.json.gz",
    );
    expect(() =>
      assertCrmWorkbookPointer(
        "owners/other/workspaces/workspace-b/crm-imports/abc/template.json.gz",
        "owner-a",
        "workspace-b",
      ),
    ).toThrow(/outside/);
  });

  it("keeps workbook row indexes inside the exact source import scope", () => {
    expect(crmWorkbookRowIndexKey("owner-a", "workspace-b", "source-c", "revision-d")).toBe(
      "owners/owner-a/workspaces/workspace-b/crm-imports/source-c/revisions/revision-d/source-row-index.v2.json.gz",
    );
    expect(() =>
      assertWorkbookRowIndexPointer(
        "owners/other/workspaces/workspace-b/crm-imports/source-c/revisions/revision-d/source-row-index.v2.json.gz",
        "owner-a",
        "workspace-b",
        "source-c",
        "revision-d",
      ),
    ).toThrow(/outside/);
  });

  it("rejects an archive payload with a different checksum", async () => {
    await expect(
      verifyArchivePayload('{"a":1}', "wrong-checksum"),
    ).rejects.toThrow(/checksum/i);
  });

  it("accepts the checksum generated from the same payload", async () => {
    const payload = '{"a":1}';
    await expect(
      verifyArchivePayload(payload, await sha256Hex(payload)),
    ).resolves.toBeUndefined();
  });

  it("signs R2 object deletion and treats a missing object as already deleted", async () => {
    configureR2();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      deleteArchiveObject("owners/owner-a/recovery/item.json.gz"),
    ).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/bucket/owners/owner-a/recovery/item.json.gz"),
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("surfaces R2 deletion failures so the recovery manifest remains retryable", async () => {
    configureR2();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 503 })),
    );

    await expect(
      deleteArchiveObject("owners/owner-a/recovery/item.json.gz"),
    ).rejects.toThrow(/delete failed.*503/i);
  });
});
