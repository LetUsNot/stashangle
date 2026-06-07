import { describe, expect, it } from "vitest";
import { timestampToSeconds } from "../timeUtils";

describe("timestampToSeconds", () => {
  it("parses m:ss timestamps used when hours are zero", () => {
    expect(timestampToSeconds("5:30")).toBe(330);
    expect(timestampToSeconds("0:05")).toBe(5);
  });

  it("parses h:mm:ss and fractional seconds", () => {
    expect(timestampToSeconds("1:02:03")).toBe(3723);
    expect(timestampToSeconds("1:02:03.500")).toBeCloseTo(3723.5, 3);
  });
});
