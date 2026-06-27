import { STASHANGLE_BUILD_ID, startSceneCoordinator, stopSceneCoordinator } from "./sceneCoordinator";
import { teardownMarkerSubmitGuard } from "./markerFormSubmitGuard";
import { getPluginApi } from "./pluginApi";

(function initStashangle() {
  try {
    getPluginApi();
  } catch (error) {
    console.warn("[Stashangle] Failed to initialize plugin:", error);
    return;
  }

  const initKey = "__stashangle_dom_v6";
  const previousBuild = (window as any).__stashangleBuild as string | undefined;

  if ((window as any)[initKey]) {
    if (previousBuild && previousBuild !== STASHANGLE_BUILD_ID) {
      stopSceneCoordinator();
      teardownMarkerSubmitGuard();
    } else {
      return;
    }
  }

  (window as any)[initKey] = true;
  (window as any).__stashangleBuild = STASHANGLE_BUILD_ID;

  if (previousBuild && previousBuild !== STASHANGLE_BUILD_ID) {
    console.warn(`[Stashangle] build changed ${previousBuild} -> ${STASHANGLE_BUILD_ID}`);
  }
  console.info(`[Stashangle] loaded build ${STASHANGLE_BUILD_ID}`);

  startSceneCoordinator();
})();
