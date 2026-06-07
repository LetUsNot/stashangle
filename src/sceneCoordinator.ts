import { fetchScene, sceneFromId } from "./sceneClient";
import { destroyMarkerFormEnhancer, mountMarkerFormEnhancer } from "./markerFormEnhancerDom";
import {
  destroyMarkerTransformController,
  mountMarkerTransformController,
  refreshMarkerTransformPlayback
} from "./markerTransformControllerDom";
import { getPluginApi } from "./pluginApi";
import { SceneLike } from "./types";

export const STASHANGLE_BUILD_ID = "0.1.11";

let activeSceneId: string | null = null;
let cachedScene: SceneLike | null = null;
let syncTimer: number | undefined;
let bodyObserver: MutationObserver | null = null;

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
    if (document.getElementById("VideoJsPlayer")) {
      mountMarkerTransformController(scene);
    }
  });
}

function refreshUiOnly(): void {
  if (!cachedScene) return;
  refreshMarkerTransformPlayback();
  runAfterRender(() => {
    // Marker form enhancer owns its panel MutationObserver; body-driven refresh caused re-render loops.
    if (document.getElementById("VideoJsPlayer")) {
      mountMarkerTransformController(cachedScene!);
    }
  });
}

function unmountAll(): void {
  cachedScene = null;
  runAfterRender(() => {
    destroyMarkerFormEnhancer();
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
    return;
  }

  const sceneChanged = sceneId !== activeSceneId;
  if (sceneChanged) {
    destroyMarkerFormEnhancer();
    destroyMarkerTransformController();
    activeSceneId = sceneId;
    cachedScene = null;
    mode = "full";
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

export function startSceneCoordinator(): void {
  scheduleSync("full");

  const api = getPluginApi();
  api.Event?.addEventListener?.("stash:location", () => scheduleSync("full"));

  bodyObserver?.disconnect();
  bodyObserver = new MutationObserver(() => {
    if (parseSceneId(window.location.pathname)) {
      scheduleSync("ui-only");
    }
  });
  bodyObserver.observe(document.body, { childList: true, subtree: true });
}
