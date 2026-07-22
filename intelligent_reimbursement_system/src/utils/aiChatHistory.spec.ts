import { describe, expect, it } from "vitest";
import {
  resolveAiChatUserId,
  canPersistAiChatHistory,
} from "./aiChatHistory";

describe("resolveAiChatUserId", () => {
  it("returns user.id when present", () => {
    expect(resolveAiChatUserId({ id: "u1" })).toBe("u1");
  });
  it("returns null when missing or empty", () => {
    expect(resolveAiChatUserId(null)).toBeNull();
    expect(resolveAiChatUserId({ id: "" })).toBeNull();
    expect(resolveAiChatUserId({ id: "  " })).toBeNull();
  });
});

describe("canPersistAiChatHistory", () => {
  it("blocks when not loaded or user mismatch", () => {
    expect(
      canPersistAiChatHistory({
        historyLoaded: false,
        activeUserId: "a",
        writingUserId: "a",
      }),
    ).toBe(false);
    expect(
      canPersistAiChatHistory({
        historyLoaded: true,
        activeUserId: "a",
        writingUserId: "b",
      }),
    ).toBe(false);
    expect(
      canPersistAiChatHistory({
        historyLoaded: true,
        activeUserId: null,
        writingUserId: "a",
      }),
    ).toBe(false);
  });
  it("allows when loaded and ids match", () => {
    expect(
      canPersistAiChatHistory({
        historyLoaded: true,
        activeUserId: "a",
        writingUserId: "a",
      }),
    ).toBe(true);
  });
});
