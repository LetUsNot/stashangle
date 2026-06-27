import { findDurationInputsInForm, findMarkerIdFromContent, findMarkersPanel } from "./domTargets";
import { getCachedTransforms } from "./storageClient";
import { timestampToSeconds } from "./timeUtils";
import { SceneLike, SceneMarkerLike } from "./types";

const editMarkerMemory = new Map<string, string>();

export function rememberMarkerId(sceneId: string, markerId: string): void {
  editMarkerMemory.set(sceneId, markerId);
}

export function recallMarkerId(sceneId: string): string | null {
  return editMarkerMemory.get(sceneId) ?? null;
}

export function clearMarkerResolverMemory(): void {
  editMarkerMemory.clear();
}

function parseSecondsFromForm(form: HTMLFormElement): number | null {
  for (const input of findDurationInputsInForm(form)) {
    const parsed = timestampToSeconds(input.value);
    if (parsed != null) return parsed;
  }
  for (const input of form.querySelectorAll("input")) {
    if (!(input instanceof HTMLInputElement)) continue;
    const parsed = timestampToSeconds(input.value);
    if (parsed != null) return parsed;
  }
  return null;
}

export function isEditMode(form: HTMLFormElement): boolean {
  return form.querySelector("button.btn-danger") !== null;
}

function parseTitleFromForm(form: HTMLFormElement): string {
  const titleInput = form.querySelector("input[type='text'], input:not([type])");
  return (titleInput instanceof HTMLInputElement ? titleInput.value : "").trim();
}

function findLikelyMarker(scene: SceneLike, form: HTMLFormElement): SceneMarkerLike | null {
  const seconds = parseSecondsFromForm(form);
  const title = parseTitleFromForm(form);
  if (seconds == null) return null;

  const markers = scene.scene_markers ?? [];
  const exact = markers.find((marker) => marker.id && marker.seconds === seconds && marker.title === title);
  if (exact) return exact;

  const bySeconds = markers.filter(
    (marker) => marker.id && Math.abs(marker.seconds - seconds) < 0.001
  );
  if (bySeconds.length === 1) return bySeconds[0];
  if (isEditMode(form) && bySeconds.length > 0) return bySeconds[0];

  return null;
}

export function resolveMarkerId(
  scene: SceneLike,
  form: HTMLFormElement
): { markerId: string | null; via: "scene" | "dom" | "memory" | "none" } {
  const fromScene = findLikelyMarker(scene, form);
  if (fromScene?.id) {
    const markerId = String(fromScene.id);
    rememberMarkerId(scene.id, markerId);
    return { markerId, via: "scene" };
  }

  const roots = [findMarkersPanel(), form.closest(".tab-pane"), form].filter(
    (node): node is Element => node instanceof Element
  );
  for (const root of roots) {
    const fromDom = findMarkerIdFromContent(root);
    if (fromDom) {
      rememberMarkerId(scene.id, fromDom);
      return { markerId: fromDom, via: "dom" };
    }
  }

  if (isEditMode(form)) {
    const remembered = recallMarkerId(scene.id);
    if (remembered) {
      const cache = getCachedTransforms(scene.id);
      const inScene = (scene.scene_markers ?? []).some((marker) => String(marker.id) === remembered);
      if (cache[remembered] || inScene) {
        return { markerId: remembered, via: "memory" };
      }
    }
  }

  return { markerId: null, via: "none" };
}

export function parseMarkerSecondsFromForm(form: HTMLFormElement): number | null {
  return parseSecondsFromForm(form);
}
