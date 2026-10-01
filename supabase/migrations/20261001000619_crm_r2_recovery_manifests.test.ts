import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const sql = readFileSync(
  fileURLToPath(
    new URL("./20261001000619_crm_r2_recovery_manifests.sql", import.meta.url),
  ),
  "utf8",
);
describe("CRM recovery manifests", () => {
  it("uses constrained states and 30 day expiry", () => {
    expect(sql).toContain("interval '30 days'");
    for (const state of [
      "building",
      "verified",
      "restoring",
      "restored",
      "purging",
      "failed",
    ])
      expect(sql).toContain(`'${state}'`);
  });
  it("deletes exclusive source records and preserves shared lineage", () => {
    expect(sql).toContain("other.source_import_id<>m.target_id");
    expect(sql).toContain("crm_apply_recovery_delete");
    expect(sql).toContain("hot_deleted_at=coalesce(hot_deleted_at,now())");
  });
});
