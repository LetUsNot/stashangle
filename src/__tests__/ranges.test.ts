import { describe, expect, it } from "vitest";
import { findActiveMarkerAt, resolveMarkerRanges } from "../transforms";
import { getSceneRanges } from "../storageClient";

describe("resolveMarkerRanges", () => {
  it("creates half-open ranges for ranged markers", () => {
    const ranges = resolveMarkerRanges(
      [
        { id: "1", seconds: 10, end_seconds: 20 },
        { id: "2", seconds: 25, end_seconds: 40 }
      ],
      100
    );
    expect(findActiveMarkerAt(19.99, ranges)).toBe("1");
    expect(findActiveMarkerAt(20, ranges)).toBeNull();
    expect(findActiveMarkerAt(39.99, ranges)).toBe("2");
    expect(findActiveMarkerAt(40, ranges)).toBeNull();
  });

  it("extends point marker to next marker or duration", () => {
    const ranges = resolveMarkerRanges(
      [
        { id: "1", seconds: 10, end_seconds: null },
        { id: "2", seconds: 20, end_seconds: null }
      ],
      30
    );
    expect(findActiveMarkerAt(15, ranges)).toBe("1");
    expect(findActiveMarkerAt(20, ranges)).toBe("2");
    expect(findActiveMarkerAt(29.9, ranges)).toBe("2");
  });
});

describe("getSceneRanges cache", () => {
  const markers = [
    { id: "1", seconds: 10, end_seconds: 20 },
    { id: "2", seconds: 25, end_seconds: 40 }
  ];

  it("returns the same array reference when markers and duration are unchanged", () => {
    const first = getSceneRanges("cache-scene", markers, 100);
    const second = getSceneRanges("cache-scene", markers, 100);
    expect(second).toBe(first);
  });

  it("recomputes ranges when marker data changes", () => {
    const first = getSceneRanges("cache-scene-2", markers, 100);
    const updated = [
      { id: "1", seconds: 10, end_seconds: 20 },
      { id: "2", seconds: 30, end_seconds: 40 }
    ];
    const second = getSceneRanges("cache-scene-2", updated, 100);
    expect(second).not.toBe(first);
    expect(second[1]?.start).toBe(30);
  });
});
