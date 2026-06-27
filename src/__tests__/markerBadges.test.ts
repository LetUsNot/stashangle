import { describe, expect, it } from "vitest";
import {
  createTransformBadge,
  findMarkerBySeconds,
  findMarkerIdFromWallItem,
  markerFromTimelinePosition,
  markerTimelineBadgePosition,
  findPlacardHostForMarker,
  findPrimaryCardBadgeRow,
  findPreviewBadgeHost,
  secondsToDisplayTimestamp,
  parsePercentFromStyle,
  parseTimestampRangeStart,
  TRANSFORM_SYMBOLS
} from "../markerBadges";
import { BADGE_MARKER_ATTR, BADGE_TRANSFORM_ATTR } from "../constants";

describe("markerBadges helpers", () => {
  it("maps transforms to clockwise and counter-clockwise symbols", () => {
    expect(TRANSFORM_SYMBOLS.rotate_left_scale).toBe("↺");
    expect(TRANSFORM_SYMBOLS.rotate_right_scale).toBe("↻");
  });

  it("creates a badge element with marker metadata", () => {
    const badge = createTransformBadge("42", "rotate_right_scale", "timeline");
    expect(badge.className).toContain("stashangle-badge--timeline");
    expect(badge.getAttribute(BADGE_MARKER_ATTR)).toBe("42");
    expect(badge.getAttribute(BADGE_TRANSFORM_ATTR)).toBe("rotate_right_scale");
    expect(badge.textContent).toBe("↻");
  });

  it("parses calc and percent left styles", () => {
    expect(parsePercentFromStyle("calc(12.5% - 3px)")).toBe(12.5);
    expect(parsePercentFromStyle("33%")).toBe(33);
  });

  it("matches markers from timeline position", () => {
    const markers = [
      { id: "1", seconds: 10 },
      { id: "2", seconds: 50 }
    ];

    const marker = markerFromTimelinePosition(markers, "calc(10% - 3px)", 100);
    expect(marker?.id).toBe("1");
  });

  it("finds markers by seconds with tolerance", () => {
    const markers = [
      { id: "1", seconds: 10.2 },
      { id: "2", seconds: 40 }
    ];

    expect(findMarkerBySeconds(markers, 10, 0.5)?.id).toBe("1");
    expect(findMarkerBySeconds(markers, 10, 0.1)).toBeNull();
  });

  it("parses timestamp range starts for list placards", () => {
    expect(parseTimestampRangeStart("00:11:15 - 00:12:30")).toBe(675);
    expect(parseTimestampRangeStart("5:30")).toBe(330);
  });

  it("resolves wall item marker id from timestamp text when urls are absent", () => {
    document.body.innerHTML = `
      <div class="wall-item">
        <div class="wall-item-text"><div>11:15 - 12:30</div></div>
      </div>
    `;
    const wallItem = document.querySelector(".wall-item")!;
    const markers = [{ id: "415", seconds: 675 }];

    expect(findMarkerIdFromWallItem(wallItem, markers)).toBe("415");
  });

  it("positions timeline badge just below the marker bar", () => {
    document.body.innerHTML = `
      <div id="container" style="position: relative; width: 200px; height: 10px;">
        <div id="marker" style="position: absolute; left: 80px; width: 20px; height: 10px;"></div>
      </div>
    `;
    const container = document.getElementById("container") as HTMLElement;
    const marker = document.getElementById("marker") as HTMLElement;

    const position = markerTimelineBadgePosition(marker, container);
    expect(position.left).toBe("80px");
    expect(Number.parseInt(position.top, 10)).toBeGreaterThan(0);
  });

  it("finds placard host by timestamp text when media urls are absent", () => {
    document.body.innerHTML = `
      <div class="wall-item">
        <div class="wall-item-container">
          <div class="wall-item-text"><div>11:15 - 12:30</div></div>
        </div>
      </div>
    `;

    const host = findPlacardHostForMarker({ id: "415", seconds: 675 }, document.body);
    expect(host?.textContent).toContain("11:15");
    expect(secondsToDisplayTimestamp(675)).toBe("11:15");
  });

  it("finds preview badge host inside wall-item-container only", () => {
    document.body.innerHTML = `
      <div class="wall-item">
        <div class="wall-item-container">
          <div class="wall-item-text"><div>1:02-1:49</div></div>
        </div>
      </div>
    `;

    const wallItem = document.querySelector(".wall-item")!;
    const host = findPreviewBadgeHost(wallItem);
    expect(host?.textContent).toContain("1:02-1:49");
    expect(host?.closest(".wall-item-container")).not.toBeNull();
  });

  it("finds primary-card badge row by timestamp", () => {
    document.body.innerHTML = `
      <div class="primary-card-body">
        <div>
          <div class="d-flex align-items-center">
            <div>1:02-1:49</div>
          </div>
        </div>
      </div>
    `;

    const row = findPrimaryCardBadgeRow({ id: "415", seconds: 62 }, document.body);
    expect(row?.classList.contains("d-flex")).toBe(true);
    expect(row?.querySelector(":scope > div:first-child")?.textContent).toContain("1:02");
  });

  it("finds placard host on wall-item-text timestamp without spaces", () => {
    document.body.innerHTML = `
      <div class="wall-item">
        <div class="wall-item-text">
          <div>Doggie Style</div>
          <div>11:14-13:38</div>
        </div>
      </div>
    `;

    const host = findPlacardHostForMarker({ id: "415", seconds: 674 }, document.body);
    expect(host?.textContent).toContain("11:14-13:38");
  });
});
