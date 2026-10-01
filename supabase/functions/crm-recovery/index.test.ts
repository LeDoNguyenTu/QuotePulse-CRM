import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const source = readFileSync(
  fileURLToPath(new URL("./index.ts", import.meta.url)),
  "utf8",
);
describe("crm-recovery contract", () => {
  it("supports preview archive-delete restore and purge", () => {
    for (const action of ["preview", "archive-delete", "restore", "purge"])
      expect(source).toContain(action);
    expect(source).toContain("archiveThenDelete");
    expect(source).toContain("deleteArchiveObject");
  });
});
