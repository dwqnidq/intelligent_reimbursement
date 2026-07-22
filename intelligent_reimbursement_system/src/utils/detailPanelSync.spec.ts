import { describe, expect, it } from "vitest";
import { pickDetailAfterListRefresh } from "./detailPanelSync";

type Mini = {
  _id: string;
  status: string;
  reject_reason?: string | null;
  approver?: string | null;
  approved_at?: string | null;
};

describe("pickDetailAfterListRefresh", () => {
  it("clears detail when list is empty", () => {
    expect(
      pickDetailAfterListRefresh({ _id: "a", status: "approved" }, []),
    ).toEqual({ action: "clear" });
  });

  it("keeps detail when same record status unchanged", () => {
    const current: Mini = { _id: "a", status: "pending" };
    const list: Mini[] = [
      { _id: "a", status: "pending" },
      { _id: "b", status: "approved" },
    ];
    expect(pickDetailAfterListRefresh(current, list)).toEqual({
      action: "keep",
    });
  });

  it("reselects same record when status changes after withdraw", () => {
    const current: Mini = { _id: "a", status: "approved" };
    const refreshed: Mini = { _id: "a", status: "pending" };
    expect(pickDetailAfterListRefresh(current, [refreshed])).toEqual({
      action: "select",
      record: refreshed,
    });
  });

  it("reselects same record when status changes after approve/reject", () => {
    const current: Mini = { _id: "a", status: "pending" };
    const approved: Mini = {
      _id: "a",
      status: "approved",
      approver: "张三",
      approved_at: "2026-07-17",
    };
    expect(pickDetailAfterListRefresh(current, [approved])).toEqual({
      action: "select",
      record: approved,
    });

    const rejected: Mini = {
      _id: "a",
      status: "rejected",
      reject_reason: "缺发票",
    };
    expect(pickDetailAfterListRefresh(current, [rejected])).toEqual({
      action: "select",
      record: rejected,
    });
  });

  it("selects first record when current disappears from list", () => {
    const first: Mini = { _id: "b", status: "pending" };
    expect(
      pickDetailAfterListRefresh({ _id: "a", status: "approved" }, [first]),
    ).toEqual({ action: "select", record: first });
  });

  it("selects first record when there is no current detail", () => {
    const first: Mini = { _id: "b", status: "pending" };
    expect(pickDetailAfterListRefresh(null, [first])).toEqual({
      action: "select",
      record: first,
    });
  });

  it("keeps deep-linked detail when it is not on the current list page", () => {
    const current: Mini = { _id: "deep", status: "approved" };
    const first: Mini = { _id: "b", status: "pending" };
    expect(
      pickDetailAfterListRefresh(current, [first], {
        allowFallbackToFirst: false,
      }),
    ).toEqual({ action: "keep" });
  });

  it("still syncs deep-linked detail when it appears in list with new status", () => {
    const current: Mini = { _id: "deep", status: "approved" };
    const refreshed: Mini = { _id: "deep", status: "pending" };
    expect(
      pickDetailAfterListRefresh(current, [refreshed], {
        allowFallbackToFirst: false,
      }),
    ).toEqual({ action: "select", record: refreshed });
  });
});
