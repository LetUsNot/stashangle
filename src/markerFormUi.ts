import {
  getMarkerFormFieldLayout,
  getMarkerSelectClassName
} from "./domTargets";
import { getCachedTransforms } from "./storageClient";
import { BADGE_CLASS, STASHANGLE_ROOT_CLASS } from "./constants";
import { SceneLike, TransformValue } from "./types";

export type SelectValue = "" | TransformValue;

export function getCurrentSelection(scene: SceneLike, markerId: string | null): SelectValue {
  if (!markerId) return "";
  const cache = getCachedTransforms(scene.id);
  const value = cache[markerId];
  return value === "rotate_left_scale" || value === "rotate_right_scale" ? value : "";
}

export function clearFormUi(
  mountPoint: HTMLElement | null,
  state: {
    renderedMarkerId: string | null | undefined;
    renderedSelection: SelectValue | undefined;
  }
): void {
  if (mountPoint) {
    mountPoint.replaceChildren();
  }
  state.renderedMarkerId = undefined;
  state.renderedSelection = undefined;
}

function mountNeedsSelect(mountPoint: HTMLElement): boolean {
  const existing = mountPoint.querySelector("#stashangle-transform-select");
  return !(existing instanceof HTMLSelectElement) || !existing.isConnected;
}

export function renderSelect(
  mountPoint: HTMLElement,
  form: HTMLFormElement,
  value: SelectValue,
  onChange: (value: SelectValue) => void
): void {
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
  select.value = value;

  select.addEventListener("change", () => {
    onChange(select.value as SelectValue);
  });

  col.append(select);
  group.append(label, col);
  mountPoint.append(group);
}

export interface SelectRenderState {
  renderedMarkerId: string | null | undefined;
  renderedSelection: SelectValue | undefined;
}

export function ensureSelect(
  mountPoint: HTMLElement,
  form: HTMLFormElement,
  value: SelectValue,
  knownMarkerId: string | null,
  state: SelectRenderState,
  onChange: (value: SelectValue) => void
): void {
  if (mountNeedsSelect(mountPoint)) {
    renderSelect(mountPoint, form, value, onChange);
    state.renderedMarkerId = knownMarkerId;
    state.renderedSelection = value;
    return;
  }

  const existing = mountPoint.querySelector("#stashangle-transform-select");
  const matchesState =
    existing instanceof HTMLSelectElement &&
    mountPoint.querySelector(".stashangle-field") !== null &&
    state.renderedMarkerId === knownMarkerId &&
    state.renderedSelection === value;

  if (matchesState) {
    if (document.activeElement === existing) {
      return;
    }
    if (existing.value !== value) {
      existing.value = value;
      state.renderedSelection = value;
    }
    return;
  }

  if (existing instanceof HTMLSelectElement && document.activeElement === existing) {
    return;
  }

  renderSelect(mountPoint, form, value, onChange);
  state.renderedMarkerId = knownMarkerId;
  state.renderedSelection = value;
}

export function isStashangleNode(node: Node): boolean {
  if (node instanceof Element) {
    return (
      node.classList.contains(STASHANGLE_ROOT_CLASS) ||
      node.classList.contains(BADGE_CLASS) ||
      node.closest(`.${STASHANGLE_ROOT_CLASS}`) !== null ||
      node.closest(`.${BADGE_CLASS}`) !== null
    );
  }
  return (
    node.parentElement?.closest(`.${STASHANGLE_ROOT_CLASS}`) !== null ||
    node.parentElement?.closest(`.${BADGE_CLASS}`) !== null
  );
}

export function isStashangleOnlyMutation(mutations: MutationRecord[]): boolean {
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

export { STASHANGLE_ROOT_CLASS };
