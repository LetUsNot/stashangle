import { getPluginApi } from "./pluginApi";

import {

  applyMarkerTransform,

  findActiveMarkerAt,

  isMarkerTransformDomActive,

  resetMarkerTransforms

} from "./transforms";

import { getCachedTransforms, getLoadState, getSceneRanges, hasTransforms, loadSceneTransforms } from "./storageClient";

import { SceneLike, TransformValue } from "./types";



let activeSceneId: string | null = null;

let mounted = false;

let readinessTimer: number | undefined;

let detachListeners: (() => void) | undefined;

let detachDomObservers: (() => void) | undefined;

let evaluatePlayback: (() => void) | undefined;

let activeMarkerId: string | null = null;

let activeTransform: TransformValue | null = null;

let lastAppliedPlayerWidth: number | null = null;

let lastAppliedPlayerHeight: number | null = null;

let sceneRef: SceneLike | null = null;



const TRANSFORM_FLAG_ATTR = "data-stashangle-transform";



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

  lastAppliedPlayerWidth = null;

  lastAppliedPlayerHeight = null;

  resetMarkerTransforms();

}



function maybeAttach(): void {

  if (!mounted || !sceneRef) return;



  const player = getPlayer();

  if (!player) return;



  if (getLoadState(sceneRef.id) !== "loaded") {

    readinessTimer = window.setTimeout(maybeAttach, 100);

    return;

  }



  if (!hasTransforms(sceneRef.id)) return;



  const markers = sceneRef.scene_markers ?? [];



  const evaluate = () => {

    if (!sceneRef) return;

    const transforms = getCachedTransforms(sceneRef.id);

    const ranges = getSceneRanges(sceneRef.id, markers, getMarkerDuration(player));

    const currentTime = player.currentTime?.() ?? 0;

    const nextMarkerId = findActiveMarkerAt(currentTime, ranges);

    const nextTransform = nextMarkerId ? transforms[nextMarkerId] : undefined;

    const domActive = isMarkerTransformDomActive();

    const playerEl = document.getElementById("VideoJsPlayer");

    const playerWidth = playerEl?.clientWidth ?? 0;

    const playerHeight = playerEl?.clientHeight ?? 0;

    const playerDimsChanged =

      playerWidth !== lastAppliedPlayerWidth || playerHeight !== lastAppliedPlayerHeight;



    if (!nextMarkerId || !nextTransform) {

      if (activeMarkerId || activeTransform) {

        activeMarkerId = null;

        activeTransform = null;

        resetMarkerTransforms();

      }

      return;

    }



    if (activeMarkerId === nextMarkerId && activeTransform === nextTransform) {

      if (domActive && !playerDimsChanged) {

        return;

      }



      applyMarkerTransform(nextTransform, sceneRef);

      lastAppliedPlayerWidth = playerWidth;

      lastAppliedPlayerHeight = playerHeight;

      return;

    }



    activeMarkerId = nextMarkerId;

    activeTransform = nextTransform;

    applyMarkerTransform(nextTransform, sceneRef);

    lastAppliedPlayerWidth = playerWidth;

    lastAppliedPlayerHeight = playerHeight;

  };



  const onTimeUpdate = () => {

    if (player.paused?.()) return;

    evaluate();

  };



  const onSeeked = () => evaluate();

  const onCanPlay = () => evaluate();

  const onFullscreen = () => evaluate();



  evaluatePlayback = evaluate;

  evaluate();

  player.on?.("timeupdate", onTimeUpdate);

  player.on?.("seeked", onSeeked);

  player.on?.("canplay", onCanPlay);

  player.on?.("fullscreenchange", onFullscreen);



  detachListeners = () => {

    player.off?.("timeupdate", onTimeUpdate);

    player.off?.("seeked", onSeeked);

    player.off?.("canplay", onCanPlay);

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

  evaluatePlayback?.();

}



export function destroyMarkerTransformController(): void {

  stopPlaybackController();

  activeSceneId = null;

  sceneRef = null;

}



export function mountMarkerTransformController(scene: SceneLike): void {

  if (activeSceneId === scene.id && sceneRef === scene && mounted) {

    return;

  }



  stopPlaybackController();

  activeSceneId = scene.id;

  sceneRef = scene;

  mounted = true;



  const markerIds = (scene.scene_markers ?? []).map((m) => m.id);

  void loadSceneTransforms(scene.id, markerIds).then(() => {

    maybeAttach();

  });

}

