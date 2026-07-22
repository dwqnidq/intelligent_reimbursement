import { describe, expect, it } from "vitest";
import {
  buildReimbursementDetailPath,
  getReimbursementIdFromNotification,
} from "./notificationNavigation";

describe("getReimbursementIdFromNotification", () => {
  it("returns reimbursement_id from payload", () => {
    expect(
      getReimbursementIdFromNotification({
        payload: { reimbursement_id: "abc123" },
      }),
    ).toBe("abc123");
  });

  it("returns null when payload missing or id invalid", () => {
    expect(getReimbursementIdFromNotification({})).toBeNull();
    expect(
      getReimbursementIdFromNotification({ payload: { reimbursement_id: "  " } }),
    ).toBeNull();
    expect(
      getReimbursementIdFromNotification({
        payload: { reimbursement_id: 1 as unknown as string },
      }),
    ).toBeNull();
  });
});

describe("buildReimbursementDetailPath", () => {
  it("appends id query to list path", () => {
    expect(buildReimbursementDetailPath("/reimbursement/list", "rid-1")).toBe(
      "/reimbursement/list?id=rid-1",
    );
  });

  it("uses & when path already has query", () => {
    expect(buildReimbursementDetailPath("/list?foo=1", "rid-1")).toBe(
      "/list?foo=1&id=rid-1",
    );
  });
});
