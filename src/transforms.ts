import { MarkerRange, SceneLike, SceneMarkerLike, TransformValue } from "./types";

const VIDEO_PLAYER_ID = "VideoJsPlayer";
const TRANSFORM_FLAG_ATTR = "data-stashangle-transform";

function getPlayerContainer(): HTMLElement | null {
  return document.getElementById(VIDEO_PLAYER_ID);
}

function getRenderableMedia(container: HTMLElement): HTMLElement | null {
  const canvas = container.querySelector("canvas");
  if (canvas instanceof HTMLElement) return canvas;
  const video = container.querySelector("video");
  if (video instanceof HTMLElement) return video;
  return null;
}

function clampPositive(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function computeRotateScale(direction: TransformValue, scene: SceneLike): string {
  const rotateDeg = direction === "rotate_left_scale" ? -90 : 90;
  const file = scene.files?.[0];
  const sceneWidth = clampPositive(file?.width ?? 1);
  const sceneHeight = clampPositive(file?.height ?? 1);
  const sceneAspect = sceneWidth / sceneHeight;
  const sceneRotatedAspect = sceneHeight / sceneWidth;

  const player = getPlayerContainer();
  const playerWidth = clampPositive(player?.clientWidth ?? 1);
  const playerHeight = clampPositive(player?.clientHeight ?? 1);
  const playerAspect = playerWidth / playerHeight;

  let scaledVideoHeight = 0;
  let scaledVideoWidth = 0;
  if (playerAspect > sceneAspect) {
    scaledVideoHeight = playerHeight;
    scaledVideoWidth = (playerHeight / sceneHeight) * sceneWidth;
  } else {
    scaledVideoWidth = playerWidth;
    scaledVideoHeight = (playerWidth / sceneWidth) * sceneHeight;
  }

  let scaleFactor = 1;
  if (playerAspect > sceneRotatedAspect) {
    scaleFactor = playerHeight / scaledVideoWidth;
  } else {
    scaleFactor = playerWidth / scaledVideoHeight;
  }

  return `rotate(${rotateDeg}deg) scale(${scaleFactor},${scaleFactor})`;
}

export function isMarkerTransformDomActive(): boolean {
  const state = getMarkerTransformDomState();
  if (!state.hasMedia) return false;

  const hasInlineTransform =
    Boolean(state.inlineTransform) && state.inlineTransform !== "none";
  const hasComputedTransform =
    Boolean(state.computedTransform) && state.computedTransform !== "none";

  // Treat stale marker attr without real transform as inactive.
  return state.activeAttr === "active" && (hasInlineTransform || hasComputedTransform);
}

export interface TransformDomState {
  hasPlayer: boolean;
  hasMedia: boolean;
  mediaTag: string | null;
  activeAttr: string | null;
  inlineTransform: string;
  computedTransform: string | null;
}

export function getMarkerTransformDomState(): TransformDomState {
  const player = getPlayerContainer();
  if (!player) {
    return {
      hasPlayer: false,
      hasMedia: false,
      mediaTag: null,
      activeAttr: null,
      inlineTransform: "",
      computedTransform: null
    };
  }

  const media = getRenderableMedia(player);
  if (!media) {
    return {
      hasPlayer: true,
      hasMedia: false,
      mediaTag: null,
      activeAttr: null,
      inlineTransform: "",
      computedTransform: null
    };
  }

  const computedTransform =
    typeof window.getComputedStyle === "function"
      ? window.getComputedStyle(media).transform
      : null;

  return {
    hasPlayer: true,
    hasMedia: true,
    mediaTag: media.tagName,
    activeAttr: media.getAttribute(TRANSFORM_FLAG_ATTR),
    inlineTransform: media.style.transform ?? "",
    computedTransform
  };
}

export function applyMarkerTransform(direction: TransformValue, scene: SceneLike): void {
  const player = getPlayerContainer();
  if (!player) return;
  const media = getRenderableMedia(player);
  if (!media) return;

  media.style.transform = computeRotateScale(direction, scene);
  media.setAttribute(TRANSFORM_FLAG_ATTR, "active");

  if (media.tagName === "CANVAS") {
    media.style.width = "100%";
    media.style.height = "100%";
    media.style.position = "absolute";
    media.style.top = "0";
  }
}

export function resetMarkerTransforms(): void {
  const player = getPlayerContainer();
  if (!player) return;
  const media = getRenderableMedia(player);
  if (!media) return;

  const hadActive = media.getAttribute(TRANSFORM_FLAG_ATTR) === "active";
  if (!hadActive) return;
  media.style.removeProperty("transform");
  media.removeAttribute(TRANSFORM_FLAG_ATTR);
}

function normalizeEnd(marker: SceneMarkerLike, fallbackEnd: number): number {
  if (typeof marker.end_seconds === "number" && Number.isFinite(marker.end_seconds)) {
    return Math.max(marker.seconds, marker.end_seconds);
  }
  return fallbackEnd;
}

export function resolveMarkerRanges(markers: SceneMarkerLike[], duration: number): MarkerRange[] {
  const sorted = [...markers].sort((a, b) => a.seconds - b.seconds);
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : Number.MAX_SAFE_INTEGER;

  return sorted.map((marker, index) => {
    const next = sorted[index + 1];
    const inferredEnd = next ? Math.max(marker.seconds, next.seconds) : safeDuration;
    const end = normalizeEnd(marker, inferredEnd);
    return {
      markerId: marker.id,
      start: marker.seconds,
      end
    };
  });
}

export function findActiveMarkerAt(time: number, ranges: MarkerRange[]): string | null {
  for (const range of ranges) {
    if (time >= range.start && time < range.end) {
      return range.markerId;
    }
  }
  return null;
}
