import { act, create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { CrmRecycleBin } from "./CrmRecycleBin";

vi.mock("../../hooks/useWorkspaces", () => ({
  useActiveWorkspace: () => ({ id: "workspace-a" }),
}));

vi.mock("../../hooks/crm/useCrmRecovery", () => ({
  useCrmRecovery: () => ({
    list: {
      data: [
        {
          id: "manifest-a",
          label: "customers.xlsx",
          target_kind: "workbook",
          expires_at: "2026-10-31T00:00:00.000Z",
          state: "verified",
        },
      ],
      error: null,
      isLoading: false,
    },
    restore: { error: null, isPending: false, mutate: vi.fn() },
    purge: { error: null, isPending: false, mutate: vi.fn() },
  }),
}));

describe("CRM recycle bin", () => {
  it("warns that early permanent deletion removes the R2 snapshot and cannot be undone", () => {
    const tree = create(<CrmRecycleBin />);
    const button = tree.root
      .findAllByType("button")
      .find((candidate) => candidate.children.join("") === "Delete permanently");

    act(() => button?.props.onClick());

    const rendered = JSON.stringify(tree.toJSON());
    expect(rendered).toContain("permanently deletes the R2 recovery snapshot");
    expect(rendered).toContain("cannot be undone");
    expect(rendered).toContain("DELETE PERMANENTLY ");
    expect(rendered).toContain("customers.xlsx");
  });
});
