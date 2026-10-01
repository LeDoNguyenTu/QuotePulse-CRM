import { describe, expect, it, vi } from "vitest";
import { archiveThenDelete } from "./crmRecovery";
describe("archiveThenDelete", () => {
  it("never deletes hot rows when verification fails", async () => {
    const deps = {
      putArchive: vi.fn().mockResolvedValue({ key: "k", checksum: "a" }),
      verifyArchive: vi.fn().mockRejectedValue(new Error("checksum mismatch")),
      recordVerified: vi.fn(),
      deleteHotRows: vi.fn(),
    };
    await expect(
      archiveThenDelete(deps, { payload: { id: "x" } }),
    ).rejects.toThrow(/checksum/);
    expect(deps.deleteHotRows).not.toHaveBeenCalled();
  });
});
