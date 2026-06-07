import {
  findDeleteButton,
  findMarkerForm,
  findMarkerFormMountPoint,
  findMarkerIdFromContent,
  findMarkersPanel,
  findSceneTabsRoot,
  findSubmitButton,
  findSubmitRow,
  getMarkerFormFieldLayout,
  getMarkerSelectClassName,
  isMarkerFormReady,
  isMarkersTabActive,
  probeMarkerFormDom
} from "./domTargets";
import { fetchScene } from "./sceneClient";
import {
  completeCreate,
  getCachedTransforms,
  loadSceneTransforms,
  removeMarkerTransform,
  setMarkerTransform,
  stageCreate
} from "./storageClient";
import { timestampToSeconds } from "./timeUtils";
import { SceneLike, TransformValue } from "./types";

type SelectValue = "" | TransformValue;

const STASHANGLE_ROOT_CLASS = "stashangle-mount";

let activeSceneId: string | null = null;
let panelObserver: MutationObserver | null = null;
let waitObserver: MutationObserver | null = null;
let submitButton: HTMLButtonElement | null = null;
let deleteButton: HTMLButtonElement | null = null;
let saveContainer: HTMLElement | null = null;
let boundForm: HTMLFormElement | null = null;
let onFormSubmit: ((event: Event) => void) | null = null;
let onSaveContainerClick: ((event: Event) => void) | null = null;
let selection: SelectValue = "";
let knownMarkerId: string | null = null;
let sceneRef: SceneLike | null = null;
let renderedMarkerId: string | null | undefined = undefined;
let renderedSelection: SelectValue | undefined = undefined;
let submitInFlight = false;
let saveUnlockObserver: MutationObserver | null = null;
let saveUnlockButton: HTMLButtonElement | null = null;
let delegatingToFormik = false;
const editMarkerMemory = new Map<string, string>();

function rememberMarkerId(sceneId: string, markerId: string): void {
  editMarkerMemory.set(sceneId, markerId);
}

function recallMarkerId(sceneId: string): string | null {
  return editMarkerMemory.get(sceneId) ?? null;
}

function parseSecondsFromForm(form: HTMLFormElement): number | null {
  for (const input of findDurationInputs(form)) {
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

function findDurationInputs(form: HTMLFormElement): HTMLInputElement[] {
  return Array.from(form.querySelectorAll("input")).filter((node) => {
    if (!(node instanceof HTMLInputElement)) return false;
    const placeholder = node.placeholder.toLowerCase();
    return placeholder.includes("mm:ss") || placeholder.includes("hh:mm");
  });
}

function isEditMode(form: HTMLFormElement): boolean {
  return form.querySelector("button.btn-danger") !== null;
}

function parseTitleFromForm(form: HTMLFormElement): string {
  const titleInput = form.querySelector("input[type='text'], input:not([type])");
  return (titleInput instanceof HTMLInputElement ? titleInput.value : "").trim();
}

function findLikelyMarker(scene: SceneLike, form: HTMLFormElement) {
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

function resolveMarkerId(
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
    (node): node is ParentNode => node instanceof HTMLElement
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

function releaseSaveUnlock(): void {
  saveUnlockObserver?.disconnect();
  saveUnlockObserver = null;
  saveUnlockButton = null;
}

function unlockSaveButton(form: HTMLFormElement): void {
  if (!isEditMode(form) && !selection) return;

  const submit = findSubmitButton();
  if (!(submit instanceof HTMLButtonElement)) return;

  if (saveUnlockButton !== submit) {
    releaseSaveUnlock();
    saveUnlockButton = submit;
  }

  const enable = (): void => {
    if (submit.disabled) {
      submit.disabled = false;
      submit.removeAttribute("disabled");
    }
  };

  enable();

  if (!saveUnlockObserver) {
    saveUnlockObserver = new MutationObserver(() => {
      enable();
    });
    saveUnlockObserver.observe(submit, { attributes: true, attributeFilter: ["disabled"] });
  }
}

async function persistSelection(sceneId: string, markerId: string | null): Promise<void> {
  const chosen = selection || null;
  if (markerId) {
    rememberMarkerId(sceneId, markerId);
    await setMarkerTransform(sceneId, markerId, chosen);
    return;
  }
  if (chosen) {
    await stageCreate(sceneId, chosen);
  }
}

function getCurrentSelection(scene: SceneLike, markerId: string | null): SelectValue {
  if (!markerId) return "";
  const cache = getCachedTransforms(scene.id);
  const value = cache[markerId];
  return value === "rotate_left_scale" || value === "rotate_right_scale" ? value : "";
}

function isStashangleNode(node: Node): boolean {
  if (node instanceof Element) {
    return node.classList.contains(STASHANGLE_ROOT_CLASS) || node.closest(`.${STASHANGLE_ROOT_CLASS}`) !== null;
  }
  return node.parentElement?.closest(`.${STASHANGLE_ROOT_CLASS}`) !== null;
}

function isStashangleOnlyMutation(mutations: MutationRecord[]): boolean {
  if (mutations.length === 0) return false;
  return mutations.every((mutation) => {
    if (isStashangleNode(mutation.target)) return true;
    for (const node of mutation.addedNodes) {
      if (!isStashangleNode(node)) return false;
    }
    for (const node of mutation.removedNodes) {
      if (!isStashangleNode(node)) return false;
    }
    return true;
  });
}

function clearFormUi(mountPoint: HTMLElement | null): void {
  if (mountPoint) {
    mountPoint.replaceChildren();
  }
  renderedMarkerId = undefined;
  renderedSelection = undefined;
}

function detachSaveContainerListener(): void {
  if (saveContainer && onSaveContainerClick) {
    saveContainer.removeEventListener("click", onSaveContainerClick, true);
    saveContainer = null;
    onSaveContainerClick = null;
  }
}

function detachFormActions(): void {
  if (submitButton) {
    submitButton.removeEventListener("click", onSubmitClick);
    submitButton = null;
  }
  if (deleteButton) {
    deleteButton.removeEventListener("click", onDeleteClick);
    deleteButton = null;
  }
  detachSaveContainerListener();
  detachFormSubmit();
  releaseSaveUnlock();
}

function detachFormSubmit(): void {
  if (boundForm && onFormSubmit) {
    boundForm.removeEventListener("submit", onFormSubmit, true);
    boundForm = null;
    onFormSubmit = null;
  }
}

function commitMarkerForm(form: HTMLFormElement): void {
  delegatingToFormik = true;
  try {
    if (typeof form.requestSubmit === "function") {
      form.requestSubmit();
    } else {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    }
  } finally {
    delegatingToFormik = false;
  }
}

function attachFormSubmit(form: HTMLFormElement): void {
  if (boundForm === form) return;
  detachFormSubmit();
  boundForm = form;
  onFormSubmit = () => {
    if (delegatingToFormik) return;
    void onSubmitClick();
  };
  form.addEventListener("submit", onFormSubmit, true);
}

function attachSaveContainerListener(form: HTMLFormElement): void {
  const container = findSubmitRow(form);
  if (!(container instanceof HTMLElement)) return;
  if (saveContainer === container) return;

  detachSaveContainerListener();
  saveContainer = container;
  onSaveContainerClick = (event) => {
    const target = event.target;
    const primary =
      target instanceof Element ? target.closest("button.btn-primary") : null;
    if (!(primary instanceof HTMLButtonElement)) return;
    void onSubmitClick();
  };
  container.addEventListener("click", onSaveContainerClick, true);
}

async function onSubmitClick(): Promise<void> {
  if (submitInFlight || !sceneRef) return;
  const form = findMarkerForm();
  if (!form) return;

  submitInFlight = true;
  try {
    const chosen = selection || null;
    const beforeIds = new Set((sceneRef.scene_markers ?? []).map((m) => m.id));
    const resolved = resolveMarkerId(sceneRef, form);
    const markerId = knownMarkerId ?? resolved.markerId;
    const seconds = parseSecondsFromForm(form);

    if (markerId) {
      rememberMarkerId(sceneRef.id, markerId);
      await setMarkerTransform(sceneRef.id, markerId, chosen);
      releaseSaveUnlock();
      commitMarkerForm(form);
      return;
    }

    if (chosen) {
      await stageCreate(sceneRef.id, chosen);
    }
    releaseSaveUnlock();
    commitMarkerForm(form);
    window.setTimeout(async () => {
      try {
        const refreshed = await fetchScene(sceneRef!.id);
        if (refreshed) {
          sceneRef = refreshed;
        }
        const nextMarkers = refreshed?.scene_markers ?? [];
        const created = nextMarkers.find((m: { id?: string }) => m.id && !beforeIds.has(m.id));
        if (created?.id) {
          await completeCreate(sceneRef!.id, created.id);
        }
      } catch {
        // Create.Post hook remains fallback path.
      }
    }, 1200);
  } finally {
    submitInFlight = false;
  }
}

async function onDeleteClick(): Promise<void> {
  if (!sceneRef || !knownMarkerId) return;
  await removeMarkerTransform(sceneRef.id, knownMarkerId);
}

function renderSelect(mountPoint: HTMLElement, form: HTMLFormElement, value: SelectValue): void {
  mountPoint.replaceChildren();

  const layout = getMarkerFormFieldLayout(form);
  const group = document.createElement("div");
  group.className = `${layout.rowClass} stashangle-field`;

  const label = document.createElement("label");
  label.className = layout.labelClass;
  label.htmlFor = "stashangle-transform-select";
  label.textContent = "Marker rotation transform";

  const col = document.createElement("div");
  col.className = layout.colClass;

  const select = document.createElement("select");
  select.id = "stashangle-transform-select";
  select.className = getMarkerSelectClassName(form);

  for (const [optionValue, optionLabel] of [
    ["", "None"],
    ["rotate_left_scale", "Rotate Left and Scale"],
    ["rotate_right_scale", "Rotate Right and Scale"]
  ] as const) {
    const option = document.createElement("option");
    option.value = optionValue;
    option.textContent = optionLabel;
    select.append(option);
  }
  // Set value only after options exist; setting it earlier can silently fall back to first option.
  select.value = value;

  select.addEventListener("change", () => {
    selection = select.value as SelectValue;
    renderedSelection = selection;
    unlockSaveButton(form);
    if (sceneRef) {
      void persistSelection(sceneRef.id, knownMarkerId);
    }
  });

  col.append(select);
  group.append(label, col);
  mountPoint.append(group);
  renderedMarkerId = knownMarkerId;
  renderedSelection = value;
}

function mountNeedsSelect(mountPoint: HTMLElement): boolean {
  const existing = mountPoint.querySelector("#stashangle-transform-select");
  return !(existing instanceof HTMLSelectElement) || !existing.isConnected;
}

function ensureSelect(mountPoint: HTMLElement, form: HTMLFormElement, value: SelectValue): void {
  if (mountNeedsSelect(mountPoint)) {
    renderSelect(mountPoint, form, value);
    return;
  }

  const existing = mountPoint.querySelector("#stashangle-transform-select");
  const matchesState =
    existing instanceof HTMLSelectElement &&
    mountPoint.querySelector(".stashangle-field") !== null &&
    renderedMarkerId === knownMarkerId &&
    renderedSelection === value;

  if (matchesState) {
    if (document.activeElement === existing) {
      return;
    }
    if (existing.value !== value) {
      existing.value = value;
      selection = value;
      renderedSelection = value;
    }
    return;
  }

  if (existing instanceof HTMLSelectElement && document.activeElement === existing) {
    return;
  }

  renderSelect(mountPoint, form, value);
}

function refreshFormUi(): void {
  if (!sceneRef) return;

  const form = findMarkerForm();
  const mountPoint = findMarkerFormMountPoint();
  const probe = probeMarkerFormDom();

  if (!form || !mountPoint || !isMarkerFormReady(form)) {
    detachFormActions();
    if (!form) {
      clearFormUi(mountPoint);
      knownMarkerId = null;
      selection = "";
      renderedMarkerId = undefined;
      renderedSelection = undefined;
    }
    if (sceneRef && (sceneRef.scene_markers?.length ?? 0) === 0 && (form || probe.formFound)) {
      void fetchScene(sceneRef.id).then((refreshed) => {
        if (refreshed && sceneRef?.id === refreshed.id) {
          sceneRef = refreshed;
          refreshFormUi();
        }
      });
    }
    return;
  }

  const resolved = resolveMarkerId(sceneRef, form);
  const nextMarkerId = resolved.markerId;
  const cache = getCachedTransforms(sceneRef.id);
  const nextSelection = getCurrentSelection(sceneRef, nextMarkerId);
  const markerChanged = nextMarkerId !== knownMarkerId;
  const parsedSeconds = parseSecondsFromForm(form);

  if (nextMarkerId) {
    rememberMarkerId(sceneRef.id, nextMarkerId);
  }
  knownMarkerId = nextMarkerId;
  selection = nextSelection;

  if (
    mountNeedsSelect(mountPoint) ||
    markerChanged ||
    renderedMarkerId !== knownMarkerId ||
    renderedSelection !== selection
  ) {
    ensureSelect(mountPoint, form, selection);
  }

  const submit = findSubmitButton();
  const del = findDeleteButton();
  if (!submit) return;

  attachFormSubmit(form);
  attachSaveContainerListener(form);

  if (submitButton !== submit) {
    if (submitButton) {
      submitButton.removeEventListener("click", onSubmitClick);
    }
    submitButton = submit;
    submitButton.addEventListener("click", onSubmitClick);
  }

  if (del && deleteButton !== del) {
    if (deleteButton) {
      deleteButton.removeEventListener("click", onDeleteClick);
    }
    deleteButton = del;
    deleteButton.addEventListener("click", onDeleteClick);
  }
}

function onPanelMutation(mutations: MutationRecord[]): void {
  if (isStashangleOnlyMutation(mutations)) {
    return;
  }
  refreshFormUi();
}

function getObserverRoot(): HTMLElement | null {
  return findSceneTabsRoot() ?? findMarkersPanel();
}

function attachPanelObserver(): boolean {
  const root = getObserverRoot();
  if (!(root instanceof HTMLElement) || !sceneRef) return false;

  refreshFormUi();
  panelObserver?.disconnect();
  panelObserver = new MutationObserver(onPanelMutation);
  panelObserver.observe(root, { childList: true, subtree: true });
  return true;
}

export function destroyMarkerFormEnhancer(): void {
  panelObserver?.disconnect();
  panelObserver = null;
  waitObserver?.disconnect();
  waitObserver = null;
  detachFormActions();
  const form = findMarkerForm();
  const mount = form?.querySelector(`.${STASHANGLE_ROOT_CLASS}`);
  clearFormUi(mount instanceof HTMLElement ? mount : null);
  activeSceneId = null;
  sceneRef = null;
  knownMarkerId = null;
  selection = "";
}

function ensureObservers(): void {
  if (panelObserver || waitObserver) return;

  if (!attachPanelObserver()) {
    waitObserver = new MutationObserver(() => {
      if (attachPanelObserver()) {
        waitObserver?.disconnect();
        waitObserver = null;
      }
    });
    waitObserver.observe(document.body, { childList: true, subtree: true });
  }
}

export function refreshMarkerFormEnhancer(scene?: SceneLike): void {
  if (scene) {
    sceneRef = scene;
  }
  if (!sceneRef) return;
  refreshFormUi();
}

function ensureSceneTransformsLoaded(sceneId: string): void {
  void loadSceneTransforms(sceneId).then(() => {
    if (sceneRef?.id === sceneId) {
      refreshFormUi();
    }
  });
}

export function mountMarkerFormEnhancer(scene: SceneLike): void {
  if (activeSceneId === scene.id) {
    sceneRef = scene;
    refreshFormUi();
    ensureSceneTransformsLoaded(scene.id);
    ensureObservers();
    return;
  }

  destroyMarkerFormEnhancer();
  activeSceneId = scene.id;
  sceneRef = scene;
  ensureSceneTransformsLoaded(scene.id);
  ensureObservers();
}
