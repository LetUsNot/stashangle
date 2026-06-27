import {
  findDeleteButton,
  findMarkerForm,
  findMarkerFormMountPoint,
  findMarkersPanel,
  findSceneTabsRoot,
  findSubmitButton,
  isMarkerFormReady,
  probeMarkerFormDom
} from "./domTargets";
import {
  clearFormUi,
  ensureSelect,
  getCurrentSelection,
  isStashangleOnlyMutation,
  SelectRenderState,
  SelectValue,
  STASHANGLE_ROOT_CLASS
} from "./markerFormUi";
import { refreshMarkerBadges } from "./markerBadgesDom";
import { isEditMode, rememberMarkerId, resolveMarkerId } from "./markerResolver";
import {
  commitDelegatedMarkerSubmit,
  setMarkerSubmitInterceptor,
  teardownMarkerSubmitGuard
} from "./markerFormSubmitGuard";
import { fetchScene } from "./sceneClient";
import {
  completeCreate,
  loadSceneTransforms,
  removeMarkerTransform,
  setMarkerTransform,
  stageCreate
} from "./storageClient";
import { SceneLike } from "./types";

let activeSceneId: string | null = null;
let panelObserver: MutationObserver | null = null;
let waitObserver: MutationObserver | null = null;
let submitButton: HTMLButtonElement | null = null;
let deleteButton: HTMLButtonElement | null = null;
let selection: SelectValue = "";
let knownMarkerId: string | null = null;
let sceneRef: SceneLike | null = null;
let saveUnlockObserver: MutationObserver | null = null;
let saveUnlockButton: HTMLButtonElement | null = null;

const selectRenderState: SelectRenderState = {
  renderedMarkerId: undefined,
  renderedSelection: undefined
};

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
    refreshMarkerBadges();
    return;
  }
  if (chosen) {
    await stageCreate(sceneId, chosen);
  }
}

function onSelectChange(value: SelectValue): void {
  selection = value;
  selectRenderState.renderedSelection = value;
  const form = findMarkerForm();
  if (form) {
    unlockSaveButton(form);
  }
  if (sceneRef) {
    void persistSelection(sceneRef.id, knownMarkerId);
  }
}

function detachFormActions(): void {
  if (deleteButton) {
    deleteButton.removeEventListener("click", onDeleteClick);
    deleteButton = null;
  }
  submitButton = null;
  releaseSaveUnlock();
}

async function handleMarkerSave(form: HTMLFormElement): Promise<void> {
  if (!sceneRef) return;

  const chosen = selection || null;
  const beforeIds = new Set((sceneRef.scene_markers ?? []).map((m) => m.id));
  const resolved = resolveMarkerId(sceneRef, form);
  const markerId = knownMarkerId ?? resolved.markerId;

  if (markerId) {
    rememberMarkerId(sceneRef.id, markerId);
    await setMarkerTransform(sceneRef.id, markerId, chosen);
    releaseSaveUnlock();
    commitDelegatedMarkerSubmit(form);
    return;
  }

  if (chosen) {
    await stageCreate(sceneRef.id, chosen);
  }
  releaseSaveUnlock();
  commitDelegatedMarkerSubmit(form);
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
}

async function onDeleteClick(): Promise<void> {
  if (!sceneRef || !knownMarkerId) return;
  await removeMarkerTransform(sceneRef.id, knownMarkerId);
  refreshMarkerBadges();
}

function refreshFormUi(): void {
  if (!sceneRef) return;

  const form = findMarkerForm();
  const mountPoint = findMarkerFormMountPoint();
  const probe = probeMarkerFormDom();

  if (!form || !mountPoint || !isMarkerFormReady(form)) {
    detachFormActions();
    if (!form) {
      clearFormUi(mountPoint, selectRenderState);
      knownMarkerId = null;
      selection = "";
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
  const nextSelection = getCurrentSelection(sceneRef, nextMarkerId);
  const markerChanged = nextMarkerId !== knownMarkerId;

  if (nextMarkerId) {
    rememberMarkerId(sceneRef.id, nextMarkerId);
  }
  knownMarkerId = nextMarkerId;
  selection = nextSelection;

  const needsSelect =
    mountPoint.querySelector("#stashangle-transform-select") === null ||
    markerChanged ||
    selectRenderState.renderedMarkerId !== knownMarkerId ||
    selectRenderState.renderedSelection !== selection;

  if (needsSelect) {
    ensureSelect(mountPoint, form, selection, knownMarkerId, selectRenderState, onSelectChange);
  }

  const submit = findSubmitButton();
  const del = findDeleteButton();
  if (!submit) return;

  submitButton = submit;

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
  setMarkerSubmitInterceptor(null);
  detachFormActions();
  const form = findMarkerForm();
  const mount = form?.querySelector(`.${STASHANGLE_ROOT_CLASS}`);
  clearFormUi(mount instanceof HTMLElement ? mount : null, selectRenderState);
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
  setMarkerSubmitInterceptor((form) => handleMarkerSave(form));

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
