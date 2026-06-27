import { fetchScene, sceneFromId } from "./sceneClient";
import { findSceneTabsRoot } from "./domTargets";
import { destroyMarkerFormEnhancer, mountMarkerFormEnhancer } from "./markerFormEnhancerDom";
import { destroyMarkerBadges, mountMarkerBadges, refreshMarkerBadges } from "./markerBadgesDom";
import {
  destroyMarkerTransformController,
  mountMarkerTransformController,
  refreshMarkerTransformPlayback
} from "./markerTransformControllerDom";
import { teardownMarkerSubmitGuard } from "./markerFormSubmitGuard";
import { getPluginApi } from "./pluginApi";
import { SceneLike } from "./types";

export const STASHANGLE_BUILD_ID = __STASHANGLE_BUILD_ID__;

let activeSceneId: string | null = null;
let cachedScene: SceneLike | null = null;
let syncTimer: number | undefined;
let sceneUiObserver: MutationObserver | null = null;
let locationHandler: (() => void) | undefined;

function parseSceneId(pathname: string): string | null {
  const match = pathname.match(/^\/scenes\/([^/?#]+)/);
  return match?.[1] ?? null;
}

function runAfterRender(task: () => void): void {
  queueMicrotask(() => {
    requestAnimationFrame(task);
  });
}

function mountForScene(scene: SceneLike): void {
  cachedScene = scene;
  runAfterRender(() => {
    mountMarkerFormEnhancer(scene);
    mountMarkerBadges(scene);
    if (document.getElementById("VideoJsPlayer")) {
      mountMarkerTransformController(scene);
    }
  });
}

function refreshUiOnly(): void {
  if (!cachedScene) return;
  refreshMarkerTransformPlayback();
  refreshMarkerBadges();
  runAfterRender(() => {
    if (document.getElementById("VideoJsPlayer")) {
      mountMarkerTransformController(cachedScene!);
    }
  });
}

function unmountAll(): void {
  cachedScene = null;
  runAfterRender(() => {
    destroyMarkerFormEnhancer();
    destroyMarkerBadges();
    destroyMarkerTransformController();
  });
}

async function syncScene(mode: "full" | "ui-only"): Promise<void> {
  const sceneId = parseSceneId(window.location.pathname);

  if (!sceneId) {
    if (activeSceneId) {
      activeSceneId = null;
      unmountAll();
    }
    disconnectSceneUiObserver();
    return;
  }

  const sceneChanged = sceneId !== activeSceneId;
  if (sceneChanged) {
    destroyMarkerFormEnhancer();
    destroyMarkerBadges();
    destroyMarkerTransformController();
    activeSceneId = sceneId;
    cachedScene = null;
    mode = "full";
    connectSceneUiObserver();
  }

  if (mode === "ui-only" && cachedScene?.id === sceneId) {
    refreshUiOnly();
    return;
  }

  const fetched = await fetchScene(sceneId);
  const scene = fetched ?? sceneFromId(sceneId);
  mountForScene(scene);
}

function scheduleSync(mode: "full" | "ui-only" = "full"): void {
  if (typeof syncTimer === "number") {
    window.clearTimeout(syncTimer);
  }
  syncTimer = window.setTimeout(() => {
    syncTimer = undefined;
    void syncScene(mode);
  }, 100);
}

function disconnectSceneUiObserver(): void {
  sceneUiObserver?.disconnect();
  sceneUiObserver = null;
}

function connectSceneUiObserver(): void {
  disconnectSceneUiObserver();

  const root = findSceneTabsRoot();
  if (!root) return;

  sceneUiObserver = new MutationObserver(() => {
    if (!parseSceneId(window.location.pathname)) return;
    if (document.getElementById("VideoJsPlayer")) {
      scheduleSync("ui-only");
    }
  });
  sceneUiObserver.observe(root, { childList: true, subtree: true });
}

export function stopSceneCoordinator(): void {
  if (typeof syncTimer === "number") {
    window.clearTimeout(syncTimer);
    syncTimer = undefined;
  }

  disconnectSceneUiObserver();

  if (locationHandler) {
    try {
      getPluginApi()?.Event?.removeEventListener?.("stash:location", locationHandler);
    } catch {
      // PluginApi may already be gone during teardown.
    }
    locationHandler = undefined;
  }

  destroyMarkerFormEnhancer();
  destroyMarkerBadges();
  destroyMarkerTransformController();
  teardownMarkerSubmitGuard();
  activeSceneId = null;
  cachedScene = null;
}

export function startSceneCoordinator(): void {
  scheduleSync("full");

  const api = getPluginApi();
  locationHandler = () => {
    scheduleSync("full");
    if (parseSceneId(window.location.pathname)) {
      connectSceneUiObserver();
    }
  };
  api.Event?.addEventListener?.("stash:location", locationHandler);

  if (parseSceneId(window.location.pathname)) {
    connectSceneUiObserver();
  }
}
