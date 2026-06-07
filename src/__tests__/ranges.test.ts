import { describe, expect, it } from "vitest";
import { findActiveMarkerAt, resolveMarkerRanges } from "../transforms";

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
