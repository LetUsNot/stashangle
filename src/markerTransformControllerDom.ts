import { getPluginApi } from "./pluginApi";
import { debugBadgeLog } from "./debugBadgeLog";
import {
  applyMarkerTransform,
  findActiveMarkerAt,
  getMarkerTransformDomState,
  isApplyingMarkerTransform,
  isMarkerTransformDomActive,
  resetMarkerTransforms
} from "./transforms";
import {
  getCachedTransform,
  getCachedTransforms,
  getLoadState,
  getSceneRanges,
  hasTransforms,
  loadSceneTransforms
} from "./storageClient";
import { TRANSFORM_FLAG_ATTR } from "./constants";
import { SceneLike, TransformValue } from "./types";

let activeSceneId: string | null = null;
let mounted = false;
let readinessTimer: number | undefined;
let detachListeners: (() => void) | undefined;
let detachDomObservers: (() => void) | undefined;
let evaluatePlayback: (() => void) | undefined;
let activeMarkerId: string | null = null;
let activeTransform: TransformValue | null = null;
let transformApplied = false;
let lastAppliedPlayerWidth: number | null = null;
let lastAppliedPlayerHeight: number | null = null;
let sceneRef: SceneLike | null = null;
let mountedMarkerSignature = "";

function sceneMarkerSignature(scene: SceneLike): string {
  const file = scene.files?.[0];
  return JSON.stringify({
    markers: (scene.scene_markers ?? []).map((m) => [m.id, m.seconds, m.end_seconds]),
    dimensions: [file?.width ?? null, file?.height ?? null]
  });
}

function getPlayer(): any | null {
  try {
    return getPluginApi()?.utils?.InteractiveUtils?.getPlayer?.() ?? null;
  } catch {
    return null;
  }
}

function getMarkerDuration(player: any): number {
  const duration = player?.duration?.();
  return Number.isFinite(duration) ? duration : Number.MAX_SAFE_INTEGER;
}

function stopPlaybackController(): void {
  mounted = false;
  if (typeof readinessTimer === "number") {
    window.clearTimeout(readinessTimer);
    readinessTimer = undefined;
  }
  detachListeners?.();
  detachListeners = undefined;
  detachDomObservers?.();
  detachDomObservers = undefined;
  evaluatePlayback = undefined;
  activeMarkerId = null;
  activeTransform = null;
  transformApplied = false;
  lastAppliedPlayerWidth = null;
  lastAppliedPlayerHeight = null;
  resetMarkerTransforms();
}

function maybeAttach(): void {
  if (!mounted || !sceneRef) return;

  const player = getPlayer();
  if (!player) {
    // #region agent log
    debugBadgeLog({
      hypothesisId: "H19",
      location: "markerTransformControllerDom.ts:maybeAttach",
      message: "maybeAttach bail: no player",
      runId: "transform-attach-v1",
      data: { sceneId: sceneRef?.id ?? null, mounted }
    });
    // #endregion
    return;
  }

  const loadState = getLoadState(sceneRef.id);
  if (loadState !== "loaded") {
    readinessTimer = window.setTimeout(maybeAttach, 100);
    // #region agent log
    debugBadgeLog({
      hypothesisId: "H19",
      location: "markerTransformControllerDom.ts:maybeAttach",
      message: "maybeAttach waiting for transforms load",
      runId: "transform-attach-v1",
      data: { sceneId: sceneRef.id, loadState }
    });
    // #endregion
    return;
  }

  if (!hasTransforms(sceneRef.id)) {
    // #region agent log
    debugBadgeLog({
      hypothesisId: "H19",
      location: "markerTransformControllerDom.ts:maybeAttach",
      message: "maybeAttach bail: no transforms in cache",
      runId: "transform-attach-v1",
      data: {
        sceneId: sceneRef.id,
        transformKeys: Object.keys(getCachedTransforms(sceneRef.id))
      }
    });
    // #endregion
    return;
  }

  const markers = sceneRef.scene_markers ?? [];

  // #region agent log
  debugBadgeLog({
    hypothesisId: "H19",
    location: "markerTransformControllerDom.ts:maybeAttach",
    message: "maybeAttach attaching player listeners",
    runId: "transform-attach-v1",
    data: {
      sceneId: sceneRef.id,
      markerCount: markers.length,
      transformKeys: Object.keys(getCachedTransforms(sceneRef.id))
    }
  });
  // #endregion

  let lastEvaluateBailKey = "";

  const evaluate = (options?: { checkDom?: boolean }) => {
    if (!sceneRef) return;

    const checkDom = options?.checkDom !== false;
    const ranges = getSceneRanges(sceneRef.id, markers, getMarkerDuration(player));
    const currentTime = player.currentTime?.() ?? 0;
    const nextMarkerId = findActiveMarkerAt(currentTime, ranges);
    const nextTransform = nextMarkerId
      ? getCachedTransform(sceneRef.id, String(nextMarkerId))
      : undefined;

    const playerEl = document.getElementById("VideoJsPlayer");
    const playerWidth = playerEl?.clientWidth ?? 0;
    const playerHeight = playerEl?.clientHeight ?? 0;
    const playerDimsChanged =
      playerWidth !== lastAppliedPlayerWidth || playerHeight !== lastAppliedPlayerHeight;

    if (!nextMarkerId || !nextTransform) {
      const bailKey = `${currentTime.toFixed(2)}|${nextMarkerId ?? "none"}|${Boolean(nextTransform)}`;
      if (bailKey !== lastEvaluateBailKey) {
        lastEvaluateBailKey = bailKey;
        // #region agent log
        debugBadgeLog({
          hypothesisId: "H20",
          location: "markerTransformControllerDom.ts:evaluate",
          message: "evaluate bail: no active marker/transform",
          runId: "transform-attach-v1",
          data: {
            currentTime,
            nextMarkerId,
            hasTransform: Boolean(nextTransform),
            rangeCount: ranges.length,
            rangeSamples: ranges.slice(0, 3).map((r) => ({
              id: r.markerId,
              start: r.start,
              end: r.end
            })),
            paused: Boolean(player.paused?.())
          }
        });
        // #endregion
      }
      if (activeMarkerId || activeTransform) {
        activeMarkerId = null;
        activeTransform = null;
        transformApplied = false;
        resetMarkerTransforms();
      }
      return;
    }

    if (activeMarkerId === String(nextMarkerId) && activeTransform === nextTransform) {
      if (!checkDom && transformApplied && !playerDimsChanged) {
        return;
      }

      if (checkDom) {
        const domActive = isMarkerTransformDomActive();
        if (domActive && !playerDimsChanged) {
          return;
        }
      } else if (transformApplied && !playerDimsChanged) {
        return;
      }

      applyMarkerTransform(nextTransform, sceneRef);
      transformApplied = true;
      lastAppliedPlayerWidth = playerWidth;
      lastAppliedPlayerHeight = playerHeight;
      return;
    }

    activeMarkerId = String(nextMarkerId);
    activeTransform = nextTransform;
    applyMarkerTransform(nextTransform, sceneRef);
    transformApplied = true;
    lastAppliedPlayerWidth = playerWidth;
    lastAppliedPlayerHeight = playerHeight;
    // #region agent log
    debugBadgeLog({
      hypothesisId: "H21",
      location: "markerTransformControllerDom.ts:evaluate",
      message: "transform applied to media",
      runId: "transform-attach-v1",
      data: {
        markerId: nextMarkerId,
        transform: nextTransform,
        currentTime,
        domState: getMarkerTransformDomState()
      }
    });
    // #endregion
  };

  let timeUpdateRafId = 0;
  let lastTransformLogKey = "";

  const logTransformEvaluate = (reason: string) => {
    if (!sceneRef) return;
    const ranges = getSceneRanges(sceneRef.id, markers, getMarkerDuration(player));
    const currentTime = player.currentTime?.() ?? 0;
    const nextMarkerId = findActiveMarkerAt(currentTime, ranges);
    const nextTransform = nextMarkerId
      ? getCachedTransform(sceneRef.id, String(nextMarkerId))
      : undefined;
    const domState = getMarkerTransformDomState();
    const logKey = `${reason}|${currentTime.toFixed(2)}|${nextMarkerId ?? "none"}|${domState.mediaTag ?? "none"}`;
    if (logKey === lastTransformLogKey) return;
    lastTransformLogKey = logKey;

    // #region agent log
    debugBadgeLog({
      hypothesisId: "H14",
      location: "markerTransformControllerDom.ts:evaluate",
      message: "transform evaluate",
      runId: "post-fix-transform-v1",
      data: {
        reason,
        currentTime,
        nextMarkerId,
        hasTransform: Boolean(nextTransform),
        paused: Boolean(player.paused?.()),
        mediaTag: domState.mediaTag,
        domActive: isMarkerTransformDomActive(),
        transformApplied
      }
    });
    // #endregion
  };

  const onTimeUpdate = () => {
    if (timeUpdateRafId) return;
    timeUpdateRafId = requestAnimationFrame(() => {
      timeUpdateRafId = 0;
      evaluate({ checkDom: false });
    });
  };

  const onSeeked = () => {
    requestAnimationFrame(() => {
      evaluate();
      logTransformEvaluate("seeked");
    });
  };
  const onCanPlay = () => {
    evaluate();
    logTransformEvaluate("canplay");
  };
  const onPause = () => {
    evaluate({ checkDom: true });
    logTransformEvaluate("pause");
  };
  const onPlay = () => {
    evaluate({ checkDom: false });
    logTransformEvaluate("play");
  };
  const onFullscreen = () => evaluate();

  evaluatePlayback = () => evaluate();

  evaluate();

  player.on?.("timeupdate", onTimeUpdate);
  player.on?.("seeked", onSeeked);
  player.on?.("canplay", onCanPlay);
  player.on?.("pause", onPause);
  player.on?.("play", onPlay);
  player.on?.("fullscreenchange", onFullscreen);

  detachListeners = () => {
    if (timeUpdateRafId) {
      cancelAnimationFrame(timeUpdateRafId);
      timeUpdateRafId = 0;
    }
    player.off?.("timeupdate", onTimeUpdate);
    player.off?.("seeked", onSeeked);
    player.off?.("canplay", onCanPlay);
    player.off?.("pause", onPause);
    player.off?.("play", onPlay);
    player.off?.("fullscreenchange", onFullscreen);
  };

  const playerContainer = document.getElementById("VideoJsPlayer");
  if (playerContainer) {
    attachLayoutObservers(playerContainer, evaluate);
  }
}

function attachLayoutObservers(playerContainer: HTMLElement, evaluate: () => void): void {
  detachDomObservers?.();

  const reconcileAfterLayoutChange = () => {
    if (isApplyingMarkerTransform()) return;
    if (!mounted || !sceneRef) return;
    if (!activeMarkerId || !activeTransform) return;

    const playerWidth = playerContainer.clientWidth;
    const playerHeight = playerContainer.clientHeight;
    const playerDimsChanged =
      playerWidth !== lastAppliedPlayerWidth || playerHeight !== lastAppliedPlayerHeight;
    const domActive = isMarkerTransformDomActive();

    if (domActive && !playerDimsChanged) {
      return;
    }

    evaluate();
  };

  const disconnectors: Array<() => void> = [];

  if (typeof ResizeObserver !== "undefined") {
    const resizeObserver = new ResizeObserver(reconcileAfterLayoutChange);
    resizeObserver.observe(playerContainer);
    disconnectors.push(() => resizeObserver.disconnect());
  }

  const mutationObserver = new MutationObserver((mutations) => {
    if (isApplyingMarkerTransform()) return;

    for (const mutation of mutations) {
      if (mutation.type === "childList") {
        reconcileAfterLayoutChange();
        return;
      }

      if (
        mutation.type === "attributes" &&
        (mutation.attributeName === "style" || mutation.attributeName === TRANSFORM_FLAG_ATTR)
      ) {
        reconcileAfterLayoutChange();
        return;
      }
    }
  });

  mutationObserver.observe(playerContainer, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["style", TRANSFORM_FLAG_ATTR]
  });

  disconnectors.push(() => mutationObserver.disconnect());

  detachDomObservers = () => {
    for (const disconnect of disconnectors) {
      disconnect();
    }
    detachDomObservers = undefined;
  };
}

export function refreshMarkerTransformPlayback(): void {
  if (!evaluatePlayback) {
    // #region agent log
    debugBadgeLog({
      hypothesisId: "H22",
      location: "markerTransformControllerDom.ts:refreshMarkerTransformPlayback",
      message: "evaluatePlayback undefined — controller not attached",
      runId: "transform-attach-v1",
      data: { mounted, activeSceneId, hasSceneRef: Boolean(sceneRef) }
    });
    // #endregion
    return;
  }
  evaluatePlayback();
}

export function destroyMarkerTransformController(): void {
  stopPlaybackController();
  activeSceneId = null;
  sceneRef = null;
  mountedMarkerSignature = "";
}

export function mountMarkerTransformController(scene: SceneLike): void {
  const signature = sceneMarkerSignature(scene);
  const sameScene =
    activeSceneId === scene.id && mounted && mountedMarkerSignature === signature;

  if (sameScene) {
    return;
  }

  const previousSignature = mountedMarkerSignature;
  const sceneChanged = activeSceneId !== scene.id;
  stopPlaybackController();

  activeSceneId = scene.id;
  sceneRef = scene;
  mounted = true;
  mountedMarkerSignature = signature;

  const markerIds = (scene.scene_markers ?? []).map((m) => m.id);
  const forceReload =
    !sceneChanged && previousSignature !== "" && previousSignature !== signature;

  void loadSceneTransforms(scene.id, markerIds, forceReload ? { force: true } : undefined).then(() => {
    maybeAttach();
  });
}
