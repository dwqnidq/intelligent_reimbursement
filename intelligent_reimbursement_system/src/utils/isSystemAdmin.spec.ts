import { describe, expect, it } from "vitest";
import { isSystemAdmin } from "./isSystemAdmin";

describe("isSystemAdmin", () => {
  it("returns true when roles include admin", () => {
    expect(isSystemAdmin(["employee", "admin"])).toBe(true);
  });

  it("returns false for approver without admin role", () => {
    expect(isSystemAdmin(["employee", "manager"])).toBe(false);
  });

  it("returns false for empty or missing roles", () => {
    expect(isSystemAdmin([])).toBe(false);
    expect(isSystemAdmin(undefined)).toBe(false);
  });
});
