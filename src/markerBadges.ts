import {
  BADGE_CLASS,
  BADGE_MARKER_ATTR,
  BADGE_TRANSFORM_ATTR
} from "./constants";
import { findMarkerIdFromContent, findPlacardHostForMarkerId } from "./domTargets";
import { timestampToSeconds } from "./timeUtils";
import { SceneMarkerLike, TransformValue } from "./types";

export const TRANSFORM_SYMBOLS: Record<TransformValue, string> = {
  rotate_left_scale: "↺",
  rotate_right_scale: "↻"
};

export const TRANSFORM_LABELS: Record<TransformValue, string> = {
  rotate_left_scale: "Rotate counter-clockwise",
  rotate_right_scale: "Rotate clockwise"
};

export type BadgePlacement = "placard" | "list" | "timeline";

export function createTransformBadge(
  markerId: string,
  transform: TransformValue,
  placement: BadgePlacement
): HTMLElement {
  const badge = document.createElement("span");
  badge.className = `${BADGE_CLASS} ${BADGE_CLASS}--${placement}`;
  badge.setAttribute(BADGE_MARKER_ATTR, markerId);
  badge.setAttribute(BADGE_TRANSFORM_ATTR, transform);
  badge.setAttribute("title", TRANSFORM_LABELS[transform]);
  badge.setAttribute("aria-label", TRANSFORM_LABELS[transform]);
  badge.textContent = TRANSFORM_SYMBOLS[transform];
  return badge;
}

export function parsePercentFromStyle(leftStyle: string): number | null {
  const calcMatch = leftStyle.match(/calc\(\s*([\d.]+)%/);
  if (calcMatch?.[1]) return Number.parseFloat(calcMatch[1]);

  const percentMatch = leftStyle.match(/^([\d.]+)%$/);
  if (percentMatch?.[1]) return Number.parseFloat(percentMatch[1]);

  return null;
}

export function findMarkerBySeconds(
  markers: SceneMarkerLike[],
  seconds: number,
  toleranceSeconds: number
): SceneMarkerLike | null {
  let best: SceneMarkerLike | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;

  for (const marker of markers) {
    if (!marker.id) continue;
    const delta = Math.abs(marker.seconds - seconds);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = marker;
    }
  }

  return best && bestDelta <= toleranceSeconds ? best : null;
}

export function markerFromTimelinePosition(
  markers: SceneMarkerLike[],
  leftStyle: string,
  duration: number
): SceneMarkerLike | null {
  if (!Number.isFinite(duration) || duration <= 0) return null;

  const percent = parsePercentFromStyle(leftStyle);
  if (percent == null) return null;

  const seconds = (percent / 100) * duration;
  const tolerance = Math.min(1, duration * 0.005);
  return findMarkerBySeconds(markers, seconds, tolerance);
}

export function parseTimestampRangeStart(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const startPart = trimmed.split(/\s*-\s*/)[0]?.trim() ?? "";
  return timestampToSeconds(startPart);
}

export function findMarkerIdFromPlacard(root: ParentNode): string | null {
  return findMarkerIdFromContent(root);
}

export function findPreviewBadgeHost(wallItem: ParentNode): HTMLElement | null {
  const container = wallItem.querySelector(".wall-item-container");
  if (!(container instanceof HTMLElement)) return null;

  const textRoot = container.querySelector(".wall-item-text");
  if (!(textRoot instanceof HTMLElement)) return container;

  for (const el of textRoot.querySelectorAll("div, span, p")) {
    if (!(el instanceof HTMLElement)) continue;
    if (parseTimestampRangeStart(el.textContent ?? "") != null) return el;
  }

  return textRoot;
}

export function findPrimaryCardBadgeRow(
  marker: SceneMarkerLike,
  searchRoot: ParentNode
): HTMLElement | null {
  if (!marker.id) return null;

  for (const row of searchRoot.querySelectorAll(
    ".primary-card-body .d-flex.align-items-center, .primary-card .d-flex.align-items-center"
  )) {
    if (!(row instanceof HTMLElement)) continue;

    const timeEl = row.querySelector(":scope > div:first-child");
    if (!(timeEl instanceof HTMLElement)) continue;

    const seconds = parseTimestampRangeStart(timeEl.textContent ?? "");
    if (seconds == null) continue;

    const delta = Math.abs(marker.seconds - seconds);
    if (delta <= 1) return row;
  }

  return null;
}

export function findWallItemTextTimestampHost(wallItem: ParentNode): HTMLElement | null {
  const textRoot = wallItem.querySelector(".wall-item-text");
  if (!(textRoot instanceof HTMLElement)) return null;

  for (const el of textRoot.querySelectorAll("div, span, p")) {
    if (!(el instanceof HTMLElement)) continue;
    if (parseTimestampRangeStart(el.textContent ?? "") != null) return el;
  }

  return textRoot;
}

export function findMarkerIdFromWallItem(
  wallItem: ParentNode,
  markers: SceneMarkerLike[]
): string | null {
  const fromContent = findMarkerIdFromPlacard(wallItem);
  if (fromContent) return fromContent;

  const text = wallItem.querySelector(".wall-item-text")?.textContent ?? "";
  const seconds = parseTimestampRangeStart(text);
  if (seconds == null) return null;

  return findMarkerBySeconds(markers, seconds, 1)?.id ?? null;
}

export function markerTimelineBadgePosition(
  markerEl: HTMLElement,
  holder: HTMLElement
): { left: string; top: string } {
  const holderRect = holder.getBoundingClientRect();
  const markerRect = markerEl.getBoundingClientRect();
  const hasLayout =
    holderRect.width > 0 &&
    markerRect.width > 0 &&
    markerRect.height > 0;

  if (!hasLayout) {
    const leftMatch = markerEl.style.left.match(/^([\d.]+)px$/);
    return {
      left: leftMatch?.[1] ? `${leftMatch[1]}px` : markerEl.style.left || "0px",
      top: `${Math.max(markerEl.offsetHeight, 1) + 1}px`
    };
  }

  const belowMarker = markerRect.bottom - holderRect.top + 5;
  const belowHolder = holderRect.height + 4;
  const topPx = Math.max(belowMarker, belowHolder);

  return {
    left: `${Math.max(0, markerRect.left - holderRect.left)}px`,
    top: `${Math.max(0, Math.round(topPx))}px`
  };
}

export function secondsToDisplayTimestamp(seconds: number): string {
  const wholeSeconds = Math.floor(seconds);
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const secs = wholeSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");

  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(secs)}`;
  return `${minutes}:${pad(secs)}`;
}

export function findPlacardHostForMarker(
  marker: SceneMarkerLike,
  searchRoot: ParentNode
): HTMLElement | null {
  if (!marker.id) return null;

  const byMedia = findPlacardHostForMarkerId(marker.id, searchRoot);
  if (byMedia) return byMedia;

  for (const wallItem of searchRoot.querySelectorAll(".wall-item")) {
    if (!(wallItem instanceof HTMLElement)) continue;

    const markerId = findMarkerIdFromWallItem(wallItem, [marker]);
    if (markerId === marker.id) {
      return (
        findWallItemTextTimestampHost(wallItem) ??
        (wallItem.querySelector(".wall-item-text") instanceof HTMLElement
          ? (wallItem.querySelector(".wall-item-text") as HTMLElement)
          : null) ??
        (wallItem.querySelector(".wall-item-container") instanceof HTMLElement
          ? (wallItem.querySelector(".wall-item-container") as HTMLElement)
          : wallItem instanceof HTMLElement
            ? wallItem
            : null)
      );
    }

    const text = wallItem.textContent ?? "";
    const label = secondsToDisplayTimestamp(marker.seconds);
    if (text.includes(label)) {
      return (
        findWallItemTextTimestampHost(wallItem) ??
        (wallItem.querySelector(".wall-item-text") instanceof HTMLElement
          ? (wallItem.querySelector(".wall-item-text") as HTMLElement)
          : null) ??
        (wallItem.querySelector(".wall-item-container") instanceof HTMLElement
          ? (wallItem.querySelector(".wall-item-container") as HTMLElement)
          : wallItem instanceof HTMLElement
            ? wallItem
            : null)
      );
    }
  }

  return null;
}
