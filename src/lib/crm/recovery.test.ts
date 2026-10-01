import { describe, expect, it } from "vitest";
import { confirmationMatches, planSourceDeletion } from "./recovery";
describe("CRM recovery planning", () => {
  it("detaches shared records and archives exclusive records", () => {
    const plan = planSourceDeletion({
      sourceId: "s1",
      records: [
        { id: "c1", sourceIds: ["s1", "s2"] },
        { id: "d1", sourceIds: ["s1"] },
      ],
    });
    expect(plan.detach).toEqual(["c1"]);
    expect(plan.archive).toEqual(["d1"]);
  });
  it("requires an exact case-sensitive confirmation", () => {
    expect(confirmationMatches("DELETE sales.xlsx", "DELETE sales.xlsx")).toBe(
      true,
    );
    expect(confirmationMatches("delete sales.xlsx", "DELETE sales.xlsx")).toBe(
      false,
    );
  });
});
