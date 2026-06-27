import {
  BADGE_CLASS,
  BADGE_MARKER_ATTR,
  BADGE_TRANSFORM_ATTR,
  TIMELINE_BADGE_LAYER_CLASS,
  VIDEO_PLAYER_ID
} from "./constants";
import {
  findMarkersPanel,
  findMarkersPanelRoots,
  findPlacardHostForMarkerId,
  findSceneTabsRoot,
  isMarkersTabActive
} from "./domTargets";
import { getPluginApi } from "./pluginApi";
import {
  BadgePlacement,
  createTransformBadge,
  findMarkerBySeconds,
  findMarkerIdFromWallItem,
  findPlacardHostForMarker,
  findPreviewBadgeHost,
  findPrimaryCardBadgeRow,
  findWallItemTextTimestampHost,
  markerFromTimelinePosition,
  markerTimelineBadgePosition,
  parseTimestampRangeStart
} from "./markerBadges";
import { debugBadgeLog } from "./debugBadgeLog";
import { refreshMarkerTransformPlayback } from "./markerTransformControllerDom";
import { getCachedTransforms, getLoadState, hasTransforms, loadSceneTransforms } from "./storageClient";
import { SceneLike, TransformValue } from "./types";

let activeSceneId: string | null = null;
let sceneRef: SceneLike | null = null;
let panelObserver: MutationObserver | null = null;
let playerObserver: MutationObserver | null = null;
let markersTabLink: HTMLAnchorElement | null = null;
let wallClickHandler: ((event: Event) => void) | null = null;
let refreshTimer: number | undefined;

function onMarkersTabClick(): void {
  scheduleRefresh();
}

function isStashangleBadgeNode(node: Node): boolean {
  if (node instanceof Element) {
    return (
      node.classList.contains(BADGE_CLASS) ||
      node.classList.contains(TIMELINE_BADGE_LAYER_CLASS) ||
      node.closest(`.${BADGE_CLASS}`) !== null ||
      node.closest(`.${TIMELINE_BADGE_LAYER_CLASS}`) !== null
    );
  }
  return (
    node.parentElement?.closest(`.${BADGE_CLASS}`) !== null ||
    node.parentElement?.closest(`.${TIMELINE_BADGE_LAYER_CLASS}`) !== null
  );
}

function isBadgeOnlyMutation(mutations: MutationRecord[]): boolean {
  if (mutations.length === 0) return false;
  return mutations.every((mutation) => {
    if (isStashangleBadgeNode(mutation.target)) return true;
    for (const node of mutation.addedNodes) {
      if (!isStashangleBadgeNode(node)) return false;
    }
    for (const node of mutation.removedNodes) {
      if (!isStashangleBadgeNode(node)) return false;
    }
    return true;
  });
}

function getPlayerDuration(): number {
  try {
    const player = getPluginApi()?.utils?.InteractiveUtils?.getPlayer?.();
    const duration = player?.duration?.();
    return Number.isFinite(duration) && duration > 0 ? duration : 0;
  } catch {
    return 0;
  }
}

function placeBadge(
  host: HTMLElement,
  markerId: string,
  transform: TransformValue,
  placement: BadgePlacement
): void {
  const selector = `.${BADGE_CLASS}[${BADGE_MARKER_ATTR}="${markerId}"]`;
  const existing = host.querySelector(selector);
  if (existing instanceof HTMLElement) {
    if (existing.getAttribute(BADGE_TRANSFORM_ATTR) === transform) {
      return;
    }
    existing.remove();
  }

  if (placement === "list") {
    host.querySelector(`:scope > div ${selector}`)?.remove();
  }

  const badge = createTransformBadge(markerId, transform, placement);
  host.append(badge);

  if (placement === "list") {
    requestAnimationFrame(() => {
      if (!document.contains(badge)) return;
      const cs = window.getComputedStyle(badge);
      const badgeRect = badge.getBoundingClientRect();
      // #region agent log
      debugBadgeLog({
        hypothesisId: "H23",
        location: "markerBadgesDom.ts:placeBadge",
        message: "primary-card badge placed",
        runId: "placard-card-v1",
        data: {
          markerId,
          transform,
          hostClass: host.className.slice(0, 80),
          parentClass: host.parentElement?.className?.slice(0, 80) ?? null,
          display: cs.display,
          marginLeft: cs.marginLeft,
          width: badge.offsetWidth,
          height: badge.offsetHeight,
          rectW: badgeRect.width,
          rectH: badgeRect.height,
          inDocument: document.contains(badge)
        }
      });
      // #endregion
    });
  }

  if (placement === "placard") {
    requestAnimationFrame(() => {
      if (!document.contains(badge)) return;
      const cs = window.getComputedStyle(badge);
      const hostCs = window.getComputedStyle(host);
      const hostRect = host.getBoundingClientRect();
      const badgeRect = badge.getBoundingClientRect();
      // #region agent log
      debugBadgeLog({
        hypothesisId: "H15",
        location: "markerBadgesDom.ts:placeBadge",
        message: "placard badge computed style",
        runId: "placard-visibility-v1",
        data: {
          markerId,
          transform,
          textContent: badge.textContent,
          display: cs.display,
          visibility: cs.visibility,
          opacity: cs.opacity,
          color: cs.color,
          fontSize: cs.fontSize,
          width: badge.offsetWidth,
          height: badge.offsetHeight,
          rectW: badgeRect.width,
          rectH: badgeRect.height,
          hostClass: host.className.slice(0, 80),
          hostOverflow: hostCs.overflow,
          hostColor: hostCs.color,
          hostRectW: hostRect.width,
          hostRectH: hostRect.height,
          inDocument: document.contains(badge)
        }
      });
      // #endregion
    });
  }
}

function ensureTimelineBadgeLayer(container: HTMLElement): HTMLElement {
  const directChild = Array.from(container.children).find(
    (child) => child instanceof HTMLElement && child.classList.contains(TIMELINE_BADGE_LAYER_CLASS)
  );
  if (directChild instanceof HTMLElement) return directChild;

  const layer = document.createElement("div");
  layer.className = TIMELINE_BADGE_LAYER_CLASS;
  layer.setAttribute("aria-hidden", "true");
  container.append(layer);
  return layer;
}

function placeTimelineOverlayBadge(
  layer: HTMLElement,
  holder: HTMLElement,
  markerEl: HTMLElement,
  markerId: string,
  transform: TransformValue
): void {
  const position = markerTimelineBadgePosition(markerEl, holder);
  const selector = `.${BADGE_CLASS}[${BADGE_MARKER_ATTR}="${markerId}"]`;
  const existing = layer.querySelector(selector);
  if (existing instanceof HTMLElement) {
    if (existing.getAttribute(BADGE_TRANSFORM_ATTR) === transform) {
      existing.style.left = position.left;
      existing.style.top = position.top;
      return;
    }
    existing.remove();
  }

  const badge = createTransformBadge(markerId, transform, "timeline");
  badge.style.left = position.left;
  badge.style.top = position.top;
  layer.append(badge);
}

function collectPlacardSearchRoots(): ParentNode[] {
  const roots = new Set<ParentNode>();
  roots.add(document);
  const sceneTabs = findSceneTabsRoot();
  if (sceneTabs) roots.add(sceneTabs);
  for (const root of findMarkersPanelRoots()) roots.add(root);
  return [...roots];
}

function getPreviewBadgeHost(wallItem: HTMLElement): HTMLElement {
  return (
    findPreviewBadgeHost(wallItem) ??
    (wallItem.querySelector(".wall-item-container") instanceof HTMLElement
      ? (wallItem.querySelector(".wall-item-container") as HTMLElement)
      : wallItem)
  );
}

function removeStaleBadges(root: ParentNode, validMarkerIds: Set<string>): void {
  for (const badge of root.querySelectorAll(`.${BADGE_CLASS}`)) {
    const markerId = badge.getAttribute(BADGE_MARKER_ATTR);
    if (!markerId || !validMarkerIds.has(markerId)) {
      badge.remove();
    }
  }
}

function refreshPlacardBadges(sceneId: string, markers: SceneLike["scene_markers"]): void {
  const searchRoots = collectPlacardSearchRoots();
  const sceneTabs = findSceneTabsRoot();
  const transforms = getCachedTransforms(sceneId);
  const markerList = markers ?? [];
  let wallItems = 0;
  let wallIdsResolved = 0;
  let wallBadgesPlaced = 0;
  let listRows = 0;
  let listMatched = 0;
  let listBadgesPlaced = 0;
  let mediaScanPlaced = 0;
  let secondsMatchPlaced = 0;
  const seenWallItems = new Set<HTMLElement>();
  const seenPlacardHosts = new Set<HTMLElement>();
  const seenListRows = new Set<HTMLElement>();
  const unresolvedHrefSamples: string[] = [];
  const placardPlacedIds: string[] = [];
  const documentMediaNodes = document.querySelectorAll(
    '[src*="scene_marker"], [href*="scene_marker"], [data-preview*="scene_marker"]'
  ).length;

  for (const panel of searchRoots) {
    for (const wallItem of panel.querySelectorAll(".wall-item")) {
      if (!(wallItem instanceof HTMLElement) || seenWallItems.has(wallItem)) continue;
      seenWallItems.add(wallItem);
      wallItems += 1;

      const markerId = findMarkerIdFromWallItem(wallItem, markerList);
      if (!markerId) {
        if (unresolvedHrefSamples.length < 2) {
          const anchor = wallItem.querySelector("a[href], .wall-item-anchor");
          unresolvedHrefSamples.push(
            anchor instanceof HTMLAnchorElement ? anchor.href : wallItem.innerHTML.slice(0, 120)
          );
        }
        continue;
      }
      wallIdsResolved += 1;

      const transform = transforms[markerId];
      const host = getPreviewBadgeHost(wallItem);

      if (!transform) {
        host.querySelector(`.${BADGE_CLASS}[${BADGE_MARKER_ATTR}="${markerId}"]`)?.remove();
        continue;
      }

      if (!seenPlacardHosts.has(host)) {
        seenPlacardHosts.add(host);
        placeBadge(host, markerId, transform, "placard");
        wallBadgesPlaced += 1;
        placardPlacedIds.push(markerId);
      }
    }

    for (const row of panel.querySelectorAll(
      ".primary-card-body .d-flex.align-items-center, .primary-card .d-flex.align-items-center"
    )) {
      if (!(row instanceof HTMLElement) || seenListRows.has(row)) continue;
      seenListRows.add(row);
      listRows += 1;

      const timeEl = row.querySelector(":scope > div:first-child");
      if (!(timeEl instanceof HTMLElement)) continue;

      const seconds = parseTimestampRangeStart(timeEl.textContent ?? "");
      if (seconds == null) continue;

      const marker = findMarkerBySeconds(markerList, seconds, 1);
      if (!marker?.id) continue;
      listMatched += 1;

      const transform = transforms[marker.id];
      if (!transform) {
        row.querySelector(`.${BADGE_CLASS}[${BADGE_MARKER_ATTR}="${marker.id}"]`)?.remove();
        timeEl.querySelector(`.${BADGE_CLASS}[${BADGE_MARKER_ATTR}="${marker.id}"]`)?.remove();
        continue;
      }

      placeBadge(row, marker.id, transform, "list");
      listBadgesPlaced += 1;
    }
  }

  for (const marker of markerList) {
    if (!marker.id) continue;
    const transform = transforms[marker.id];
    if (!transform) continue;

    for (const root of searchRoots) {
      const row = findPrimaryCardBadgeRow(marker, root);
      if (!(row instanceof HTMLElement) || seenListRows.has(row)) continue;

      seenListRows.add(row);
      placeBadge(row, marker.id, transform, "list");
      listBadgesPlaced += 1;
      listMatched += 1;
      break;
    }
  }

  for (const marker of markerList) {
    if (!marker.id) continue;
    const transform = transforms[marker.id];
    if (!transform) continue;

    for (const root of searchRoots) {
      const host = findPlacardHostForMarker(marker, root);
      if (!(host instanceof HTMLElement) || seenPlacardHosts.has(host)) continue;

      seenPlacardHosts.add(host);
      placeBadge(host, marker.id, transform, "placard");
      wallBadgesPlaced += 1;
      wallIdsResolved += 1;
      placardPlacedIds.push(marker.id);

      const viaMedia = findPlacardHostForMarkerId(marker.id, root) === host;
      if (viaMedia) {
        mediaScanPlaced += 1;
      } else {
        secondsMatchPlaced += 1;
      }
      break;
    }
  }

  // #region agent log
  debugBadgeLog({
    hypothesisId: "H10",
    location: "markerBadgesDom.ts:refreshPlacardBadges",
    message: "placard refresh summary",
    runId: "post-fix-placard-v4-text",
    data: {
      sceneId,
      transformKeys: Object.keys(transforms),
      markerCount: markerList.length,
      searchRootCount: searchRoots.length,
      markersTabActive: isMarkersTabActive(),
      markersPaneWallItems:
        document.querySelector('[data-rb-event-key="scene-markers-panel"]')?.querySelectorAll(".wall-item")
          .length ?? 0,
      sceneTabsWallItems: sceneTabs?.querySelectorAll(".wall-item").length ?? 0,
      documentWallItems: document.querySelectorAll(".wall-item").length,
      wallItemTextNodes: document.querySelectorAll(".wall-item-text").length,
      documentMediaNodes,
      wallItems,
      wallIdsResolved,
      wallBadgesPlaced,
      placardPlacedIds,
      placardBadgesInDom: document.querySelectorAll(
        ".wall-item .stashangle-badge--placard, .wall-item-text .stashangle-badge"
      ).length,
      primaryCardBadgesInDom: document.querySelectorAll(
        ".primary-card-body .stashangle-badge--list, .primary-card .stashangle-badge--list"
      ).length,
      placardHostSamples: placardPlacedIds.slice(0, 2).map((markerId) => {
        const badge = document.querySelector(
          `.${BADGE_CLASS}[${BADGE_MARKER_ATTR}="${markerId}"]`
        );
        return badge?.parentElement?.className?.slice(0, 80) ?? null;
      }),
      mediaScanPlaced,
      secondsMatchPlaced,
      listRows,
      listMatched,
      listBadgesPlaced,
      unresolvedHrefSamples
    }
  });
  // #endregion
}

function refreshTimelineBadges(sceneId: string, markers: SceneLike["scene_markers"]): void {
  const playerRoot = document.getElementById(VIDEO_PLAYER_ID);
  const transforms = getCachedTransforms(sceneId);
  const markerList = markers ?? [];
  const duration = getPlayerDuration();
  let dotCount = 0;
  let dotMatched = 0;
  let dotBadgesPlaced = 0;
  let rangeCount = 0;
  let rangeMatched = 0;
  let rangeBadgesPlaced = 0;
  const leftSamples: string[] = [];

  if (!playerRoot) {
    // #region agent log
    debugBadgeLog({
      hypothesisId: "H4",
      location: "markerBadgesDom.ts:refreshTimelineBadges",
      message: "video player root not found",
      data: { sceneId, duration }
    });
    // #endregion
    return;
  }

  const validMarkerIds = new Set(
    Object.keys(transforms).filter((markerId) => Boolean(transforms[markerId]))
  );

  const progressHolder = playerRoot.querySelector(".vjs-progress-holder");
  const progressControl = playerRoot.querySelector(".vjs-progress-control");
  if (progressHolder instanceof HTMLElement) {
    const timelineLayer = ensureTimelineBadgeLayer(progressHolder);

    for (const dot of progressHolder.querySelectorAll(".vjs-marker")) {
      if (!(dot instanceof HTMLElement)) continue;
      dotCount += 1;
      if (leftSamples.length < 3) leftSamples.push(dot.style.left || "(empty)");

      const marker = markerFromTimelinePosition(markerList, dot.style.left, duration);
      if (!marker?.id) continue;
      dotMatched += 1;

      const transform = transforms[marker.id];
      if (!transform) {
        timelineLayer
          .querySelector(`.${BADGE_CLASS}[${BADGE_MARKER_ATTR}="${marker.id}"]`)
          ?.remove();
        continue;
      }

      placeTimelineOverlayBadge(timelineLayer, progressHolder, dot, marker.id, transform);
      dotBadgesPlaced += 1;
    }

    const rangeRoot = progressControl ?? progressHolder;
    for (const range of rangeRoot.querySelectorAll(".vjs-marker-range")) {
      if (!(range instanceof HTMLElement)) continue;
      rangeCount += 1;
      if (leftSamples.length < 5) leftSamples.push(range.style.left || "(empty)");

      const marker = markerFromTimelinePosition(markerList, range.style.left, duration);
      if (!marker?.id) continue;
      rangeMatched += 1;

      const transform = transforms[marker.id];
      if (!transform) {
        timelineLayer
          .querySelector(`.${BADGE_CLASS}[${BADGE_MARKER_ATTR}="${marker.id}"]`)
          ?.remove();
        continue;
      }

      placeTimelineOverlayBadge(timelineLayer, progressHolder, range, marker.id, transform);
      rangeBadgesPlaced += 1;
    }
  }

  playerRoot.querySelectorAll(`.${TIMELINE_BADGE_LAYER_CLASS}`).forEach((layer) => {
    for (const badge of layer.querySelectorAll(`.${BADGE_CLASS}`)) {
      const markerId = badge.getAttribute(BADGE_MARKER_ATTR);
      if (!markerId || !validMarkerIds.has(markerId)) badge.remove();
    }
    if (layer.childElementCount === 0) layer.remove();
  });

  removeStaleBadges(playerRoot, validMarkerIds);

  // #region agent log
  debugBadgeLog({
    hypothesisId: "H9",
    location: "markerBadgesDom.ts:refreshTimelineBadges",
    message: "timeline refresh summary",
    runId: "post-fix-timeline-gap",
    data: {
      sceneId,
      duration,
      markerCount: markerList.length,
      transformKeys: Object.keys(transforms),
      dotCount,
      dotMatched,
      dotBadgesPlaced,
      rangeCount,
      rangeMatched,
      rangeBadgesPlaced,
      leftSamples,
      badgesInDom: playerRoot.querySelectorAll(`.${BADGE_CLASS}`).length,
      timelineLayers: playerRoot.querySelectorAll(`.${TIMELINE_BADGE_LAYER_CLASS}`).length,
      markersInsideDots: playerRoot.querySelectorAll(".vjs-marker .stashangle-badge").length,
      badgeTopSample:
        progressHolder?.querySelector(`.${TIMELINE_BADGE_LAYER_CLASS} .${BADGE_CLASS}`) instanceof
        HTMLElement
          ? (
              progressHolder.querySelector(
                `.${TIMELINE_BADGE_LAYER_CLASS} .${BADGE_CLASS}`
              ) as HTMLElement
            ).style.top
          : null
    }
  });
  // #endregion
}

export function refreshMarkerBadges(): void {
  if (!sceneRef) return;

  const loadState = getLoadState(sceneRef.id);
  const transforms = getCachedTransforms(sceneRef.id);
  const hasAny = hasTransforms(sceneRef.id);

  // #region agent log
  debugBadgeLog({
    hypothesisId: "H1",
    location: "markerBadgesDom.ts:refreshMarkerBadges",
    message: "refresh entry",
    data: {
      sceneId: sceneRef.id,
      loadState,
      hasTransforms: hasAny,
      transformKeys: Object.keys(transforms),
      sceneMarkerCount: sceneRef.scene_markers?.length ?? 0
    }
  });
  // #endregion

  if (!hasAny) {
    const panel = findMarkersPanel();
    panel?.querySelectorAll(`.${BADGE_CLASS}`).forEach((badge) => badge.remove());
    document
      .getElementById(VIDEO_PLAYER_ID)
      ?.querySelectorAll(`.${BADGE_CLASS}`)
      .forEach((badge) => badge.remove());
    return;
  }

  refreshPlacardBadges(sceneRef.id, sceneRef.scene_markers);
  refreshTimelineBadges(sceneRef.id, sceneRef.scene_markers);
}

function scheduleRefresh(delayMs = 120): void {
  if (typeof refreshTimer === "number") {
    window.clearTimeout(refreshTimer);
  }
  refreshTimer = window.setTimeout(() => {
    refreshTimer = undefined;
    refreshMarkerBadges();
  }, delayMs);
}

function mutationTouchesTimeline(mutations: MutationRecord[]): boolean {
  for (const mutation of mutations) {
    const target = mutation.target;
    if (target instanceof Element) {
      if (target.closest(".vjs-progress-holder, .vjs-progress-control")) return true;
      if (target.classList.contains("vjs-marker") || target.classList.contains("vjs-marker-range")) {
        return true;
      }
    }

    for (const node of mutation.addedNodes) {
      if (!(node instanceof Element)) continue;
      if (node.classList.contains("vjs-marker") || node.classList.contains("vjs-marker-range")) {
        return true;
      }
      if (node.querySelector?.(".vjs-marker, .vjs-marker-range")) return true;
    }
  }
  return false;
}

function onDomMutation(mutations: MutationRecord[]): void {
  if (isBadgeOnlyMutation(mutations)) return;
  if (sceneRef && mutationTouchesTimeline(mutations)) {
    refreshTimelineBadges(sceneRef.id, sceneRef.scene_markers);
  }
  scheduleRefresh();
}

function onWallItemClick(event: Event): void {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (!target.closest(".wall-item, .wall-item-anchor, .wall-item-text")) return;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      refreshMarkerTransformPlayback();
      if (sceneRef) {
        refreshPlacardBadges(sceneRef.id, sceneRef.scene_markers);
      }
    });
  });
}

function disconnectObservers(): void {
  panelObserver?.disconnect();
  panelObserver = null;
  playerObserver?.disconnect();
  playerObserver = null;

  markersTabLink?.removeEventListener("click", onMarkersTabClick);
  markersTabLink = null;

  if (wallClickHandler) {
    document.removeEventListener("click", wallClickHandler, true);
    wallClickHandler = null;
  }

  if (typeof refreshTimer === "number") {
    window.clearTimeout(refreshTimer);
    refreshTimer = undefined;
  }
}

function connectObservers(): void {
  disconnectObservers();

  const observeTargets = new Set<HTMLElement>();
  for (const root of findMarkersPanelRoots()) {
    observeTargets.add(root);
  }
  const sceneTabs = findSceneTabsRoot();
  if (sceneTabs) observeTargets.add(sceneTabs);

  if (observeTargets.size > 0) {
    panelObserver = new MutationObserver(onDomMutation);
    for (const target of observeTargets) {
      panelObserver.observe(target, { childList: true, subtree: true });
    }
  }

  const playerRoot = document.getElementById(VIDEO_PLAYER_ID);
  if (playerRoot) {
    playerObserver = new MutationObserver(onDomMutation);
    playerObserver.observe(playerRoot, { childList: true, subtree: true });
  }

  const tabLink = document.querySelector(
    '.nav-tabs a[data-rb-event-key="scene-markers-panel"]'
  );
  if (tabLink instanceof HTMLAnchorElement) {
    markersTabLink = tabLink;
    markersTabLink.addEventListener("click", onMarkersTabClick);
  }

  wallClickHandler = onWallItemClick;
  document.addEventListener("click", wallClickHandler, true);
}

function ensureTransformsLoaded(scene: SceneLike): void {
  void loadSceneTransforms(scene.id, (scene.scene_markers ?? []).map((marker) => marker.id)).then(() => {
    if (sceneRef?.id !== scene.id) return;
    // #region agent log
    debugBadgeLog({
      hypothesisId: "H1",
      location: "markerBadgesDom.ts:ensureTransformsLoaded",
      message: "transforms loaded",
      data: {
        sceneId: scene.id,
        loadState: getLoadState(scene.id),
        transformKeys: Object.keys(getCachedTransforms(scene.id))
      }
    });
    // #endregion
    refreshMarkerBadges();
    requestAnimationFrame(() => {
      if (sceneRef?.id !== scene.id) return;
      refreshTimelineBadges(scene.id, scene.scene_markers);
    });
    connectObservers();
  });
}

export function destroyMarkerBadges(): void {
  disconnectObservers();
  document.querySelectorAll(`.${BADGE_CLASS}`).forEach((badge) => badge.remove());
  activeSceneId = null;
  sceneRef = null;
}

export function mountMarkerBadges(scene: SceneLike): void {
  sceneRef = scene;

  // #region agent log
  debugBadgeLog({
    hypothesisId: "H5",
    location: "markerBadgesDom.ts:mountMarkerBadges",
    message: "mount called",
    data: {
      sceneId: scene.id,
      activeSceneId,
      loadState: getLoadState(scene.id),
      hasTransforms: hasTransforms(scene.id),
      sceneMarkerCount: scene.scene_markers?.length ?? 0,
      buildId: (window as { __stashangleBuild?: string }).__stashangleBuild ?? null
    }
  });
  // #endregion

  if (activeSceneId === scene.id && getLoadState(scene.id) === "loaded") {
    refreshMarkerBadges();
    connectObservers();
    return;
  }

  activeSceneId = scene.id;

  if (getLoadState(scene.id) === "loaded" && !hasTransforms(scene.id)) {
    refreshMarkerBadges();
    connectObservers();
    return;
  }

  ensureTransformsLoaded(scene);
}
