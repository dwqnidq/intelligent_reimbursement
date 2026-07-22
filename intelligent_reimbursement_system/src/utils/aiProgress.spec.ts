import { describe, expect, it } from "vitest";
import {
  defaultProgressMessage,
  normalizeProgress,
  progressPercent,
} from "./aiProgress";

describe("normalizeProgress", () => {
  it("accepts finite non-negative progress values", () => {
    expect(normalizeProgress({ done: 2, total: 5 })).toEqual({
      done: 2,
      total: 5,
    });
  });

  it("keeps stage and message when present", () => {
    expect(
      normalizeProgress({
        done: 1,
        total: 3,
        stage: "extract",
        message: "字段提取中 · 第 2/3 张 · a.pdf",
      }),
    ).toEqual({
      done: 1,
      total: 3,
      stage: "extract",
      message: "字段提取中 · 第 2/3 张 · a.pdf",
    });
  });

  it("keeps file_index when positive", () => {
    expect(
      normalizeProgress({
        done: 2,
        total: 4,
        file_index: 3,
      }),
    ).toEqual({
      done: 2,
      total: 4,
      file_index: 3,
    });
  });

  it("drops non-positive file_index", () => {
    expect(
      normalizeProgress({
        done: 1,
        total: 2,
        file_index: 0,
      }),
    ).toEqual({
      done: 1,
      total: 2,
    });
  });

  it("rejects invalid progress payloads", () => {
    expect(normalizeProgress(null)).toBeNull();
    expect(normalizeProgress({ done: "x", total: 1 })).toBeNull();
    expect(normalizeProgress({ done: 1, total: Number.NaN })).toBeNull();
    expect(normalizeProgress({ done: -1, total: 5 })).toBeNull();
  });
});

describe("progressPercent", () => {
  it("computes and clamps percent values", () => {
    expect(progressPercent(0, 3)).toBe(0);
    expect(progressPercent(2, 5)).toBe(40);
    expect(progressPercent(5, 5)).toBe(100);
    expect(progressPercent(7, 5)).toBe(100);
    expect(progressPercent(1, 0)).toBe(0);
  });
});

describe("defaultProgressMessage", () => {
  it("prefers explicit message", () => {
    expect(
      defaultProgressMessage({
        done: 1,
        total: 3,
        stage: "ocr",
        message: "自定义文案",
      }),
    ).toBe("自定义文案");
  });

  it("builds fallback from stage", () => {
    expect(
      defaultProgressMessage({ done: 0, total: 5, stage: "prepare" }),
    ).toBe("准备识别… 共 5 个文件");
    expect(defaultProgressMessage({ done: 2, total: 5 })).toBe(
      "正在识别发票… 2/5",
    );
  });
});
