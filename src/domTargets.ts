const MARKERS_PANEL_IDS = ["scene-markers-panel"] as const;
const MOUNT_POINT_CLASS = "stashangle-mount";
const STASHANGLE_LABEL = "Marker rotation transform";

export const DOM_TARGETS = {
  mountPointClass: MOUNT_POINT_CLASS,
  filterPanel: "#scene-video-filter-panel",
  rotateSlider: "#scene-video-filter-panel input[type='range']"
} as const;

export function findDurationInputsInForm(form: HTMLFormElement): HTMLInputElement[] {
  return Array.from(form.querySelectorAll("input")).filter((node) => {
    if (!(node instanceof HTMLInputElement)) return false;
    const placeholder = node.placeholder.toLowerCase();
    return placeholder.includes("mm:ss") || placeholder.includes("hh:mm");
  });
}

function hasMarkerFieldLabels(form: HTMLFormElement): boolean {
  return Array.from(form.querySelectorAll("label")).some((label) => {
    const text = label.textContent?.trim().toLowerCase() ?? "";
    if (!text || text === STASHANGLE_LABEL.toLowerCase()) return false;
    return (
      text.includes("title") ||
      text.includes("time") ||
      text.includes("tag") ||
      text.includes("primary")
    );
  });
}

export function isMarkerEditForm(node: Element | null): node is HTMLFormElement {
  if (!(node instanceof HTMLFormElement)) return false;
  if (!node.isConnected) return false;

  const hasButtons =
    node.querySelector(".buttons-container button.btn-primary") !== null ||
    node.querySelector(".text-end button.btn-primary") !== null;
  if (!hasButtons) return false;

  const hasFormContainer = node.querySelector(".form-container") !== null;
  const hasDuration =
    findDurationInputsInForm(node).length > 0 ||
    node.querySelector(".duration-input, .duration-control") !== null;
  const hasMarkerLabels = hasMarkerFieldLabels(node);

  return hasFormContainer && (hasDuration || hasMarkerLabels);
}

export function isMarkerFormReady(form: HTMLFormElement): boolean {
  if (!isMarkerEditForm(form)) return false;
  return (
    findDurationInputsInForm(form).length > 0 ||
    form.querySelector(".duration-input, .duration-control") !== null ||
    hasMarkerFieldLabels(form)
  );
}

function scoreMarkerForm(form: HTMLFormElement): number {
  let score = 0;
  if (form.querySelector(".form-container")) score += 2;
  if (findDurationInputsInForm(form).length > 0) score += 4;
  if (form.querySelector(".duration-input, .duration-control")) score += 2;
  if (hasMarkerFieldLabels(form)) score += 3;
  if (form.querySelector("button.btn-danger")) score += 1;
  score += Math.min(form.querySelectorAll("label").length, 6);
  return score;
}

function findMarkerFormInRoot(root: ParentNode): HTMLFormElement | null {
  let best: HTMLFormElement | null = null;
  let bestScore = 0;

  for (const form of root.querySelectorAll("form")) {
    if (!isMarkerEditForm(form)) continue;
    const score = scoreMarkerForm(form);
    if (score > bestScore) {
      best = form;
      bestScore = score;
    }
  }

  return best;
}

function findMarkersPanelById(): HTMLElement | null {
  for (const id of MARKERS_PANEL_IDS) {
    const byId = document.getElementById(id);
    if (byId instanceof HTMLElement) return byId;
  }

  const byEventKey = document.querySelector("[data-rb-event-key='scene-markers-panel']");
  if (byEventKey instanceof HTMLElement) {
    if (byEventKey.classList.contains("tab-pane")) return byEventKey;
    const pane = byEventKey.closest(".tab-pane");
    if (pane instanceof HTMLElement) return pane;
    return byEventKey;
  }

  if (isMarkersTabActive()) {
    const activePane = document.querySelector(".scene-tabs .tab-pane.active");
    if (activePane instanceof HTMLElement) return activePane;
  }

  const byClass = document.querySelector(".scene-markers-panel");
  if (byClass instanceof HTMLElement) return byClass;

  return null;
}

export function findMarkerForm(): HTMLFormElement | null {
  const panel = findMarkersPanelById();
  if (panel) {
    const inPanel = findMarkerFormInRoot(panel);
    if (inPanel) return inPanel;
  }

  if (isMarkersTabActive()) {
    const activePane = document.querySelector(".scene-tabs .tab-pane.active");
    if (activePane) {
      return findMarkerFormInRoot(activePane);
    }
  }

  return null;
}

export function findMarkersPanelRoots(): HTMLElement[] {
  const roots = new Set<HTMLElement>();

  for (const id of MARKERS_PANEL_IDS) {
    const byId = document.getElementById(id);
    if (byId instanceof HTMLElement) roots.add(byId);
  }

  for (const el of document.querySelectorAll("[data-rb-event-key='scene-markers-panel']")) {
    if (!(el instanceof HTMLElement)) continue;
    if (el.classList.contains("tab-pane")) {
      roots.add(el);
      continue;
    }
    const pane = el.closest(".tab-pane");
    roots.add(pane instanceof HTMLElement ? pane : el);
  }

  for (const el of document.querySelectorAll(".scene-markers-panel")) {
    if (el instanceof HTMLElement) roots.add(el);
  }

  if (isMarkersTabActive()) {
    const activePane = document.querySelector(".scene-tabs .tab-pane.active");
    if (activePane instanceof HTMLElement) roots.add(activePane);
  }

  const form = findMarkerForm();
  const formPane = form?.closest(".tab-pane");
  if (formPane instanceof HTMLElement) roots.add(formPane);

  return [...roots];
}

export function findMarkersPanel(): HTMLElement | null {
  const panel = findMarkersPanelById();
  if (panel) return panel;

  const form = findMarkerForm();
  const pane = form?.closest(".tab-pane");
  return pane instanceof HTMLElement ? pane : null;
}

export function findSubmitButton(): HTMLButtonElement | null {
  const form = findMarkerForm();
  if (!form) return null;
  const node =
    form.querySelector(".buttons-container button.btn-primary") ??
    form.querySelector(".text-end button.btn-primary") ??
    form.querySelector("button.btn-primary");
  return node instanceof HTMLButtonElement ? node : null;
}

export function findDeleteButton(): HTMLButtonElement | null {
  const form = findMarkerForm();
  if (!form) return null;
  const node = form.querySelector("button.btn-danger");
  return node instanceof HTMLButtonElement ? node : null;
}

export type MarkerFormFieldLayout = {
  rowClass: string;
  labelClass: string;
  colClass: string;
};

export function getMarkerFormFieldLayout(form: HTMLFormElement): MarkerFormFieldLayout {
  const sampleRow =
    form.querySelector(".form-container .mb-3.row, .form-container .row.mb-3, .mb-3.row, .row.mb-3");
  if (sampleRow instanceof HTMLElement) {
    const label = sampleRow.querySelector("label");
    const col =
      Array.from(sampleRow.querySelectorAll("[class*='col-']")).find(
        (node) => node.tagName !== "LABEL"
      ) ?? null;
    return {
      rowClass: sampleRow.className,
      labelClass: label?.className ?? "col-form-label col-sm-3",
      colClass: col?.className ?? "col-sm-9"
    };
  }

  return {
    rowClass: "mb-3 row",
    labelClass: "col-form-label col-sm-3",
    colClass: "col-sm-9"
  };
}

export function getMarkerSelectClassName(form: HTMLFormElement): string {
  const durationControl = form.querySelector(".duration-control, .text-input.form-control");
  if (durationControl instanceof HTMLElement && durationControl.className) {
    return durationControl.className;
  }
  return "text-input form-control";
}

export function findSubmitRow(form: HTMLFormElement): HTMLElement | null {
  const buttonsContainer = form.querySelector(".buttons-container");
  if (buttonsContainer instanceof HTMLElement) return buttonsContainer;

  const textEnd = form.querySelector(".text-end");
  if (textEnd instanceof HTMLElement) return textEnd;

  const primary = form.querySelector("button.btn-primary");
  return primary?.parentElement instanceof HTMLElement ? primary.parentElement : null;
}

export function findSceneTabsRoot(): HTMLElement | null {
  const sceneTabs = document.querySelector(".scene-tabs");
  return sceneTabs instanceof HTMLElement ? sceneTabs : null;
}

export function isMarkersTabActive(): boolean {
  return Boolean(
    document.querySelector(".nav-tabs a.active[data-rb-event-key='scene-markers-panel']")
  );
}

export function probeMarkerFormDom(): Record<string, unknown> {
  const panel = findMarkersPanel();
  const form = findMarkerForm();
  const submit = findSubmitButton();
  const mountPoint = form?.querySelector(`.${MOUNT_POINT_CLASS}`) ?? null;
  const submitRow = form ? findSubmitRow(form) : null;
  const formInputs =
    form instanceof HTMLFormElement
      ? Array.from(form.querySelectorAll("input")).map((input) => ({
          name: input.name || null,
          type: input.type,
          placeholder: input.placeholder || null
        }))
      : [];
  const formLabels =
    form instanceof HTMLFormElement
      ? Array.from(form.querySelectorAll("label")).map((label) => label.textContent?.trim() ?? "")
      : [];

  return {
    panelFound: panel instanceof HTMLElement,
    formFound: form instanceof HTMLFormElement,
    formReady: form instanceof HTMLFormElement ? isMarkerFormReady(form) : false,
    mountPointFound: mountPoint instanceof HTMLElement,
    submitRowFound: submitRow instanceof HTMLElement,
    submitFound: submit instanceof HTMLElement,
    formInputCount: formInputs.length,
    formInputs,
    formLabels
  };
}

const SCENE_MARKER_ID_PATTERNS = [
  /scene_marker\/(\d+)/i,
  /scene_markers\/(\d+)/i,
  /\/markers\/(\d+)(?:\/|$|[?#])/i
] as const;

function matchMarkerIdFromText(text: string): string | null {
  for (const pattern of SCENE_MARKER_ID_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

export function findMarkerIdFromUrls(root: ParentNode): string | null {
  for (const el of root.querySelectorAll("[src], [href], source, [data-preview]")) {
    const candidates = [
      el instanceof HTMLAnchorElement ? el.href : null,
      el instanceof HTMLMediaElement ? el.src : null,
      el.getAttribute("src"),
      el.getAttribute("href"),
      el.getAttribute("data-preview")
    ];
    for (const url of candidates) {
      if (!url) continue;
      const markerId = matchMarkerIdFromText(url);
      if (markerId) return markerId;
    }
  }
  return null;
}

export function findMarkerIdFromContent(root: ParentNode): string | null {
  const fromUrls = findMarkerIdFromUrls(root);
  if (fromUrls) return fromUrls;

  if (root instanceof Element) {
    return matchMarkerIdFromText(root.innerHTML);
  }
  return null;
}

export function findPlacardHostForMarkerId(
  markerId: string,
  searchRoot: ParentNode = document
): HTMLElement | null {
  const tokens = [
    `scene_marker/${markerId}`,
    `scene_markers/${markerId}`,
    `/markers/${markerId}`
  ];

  for (const el of searchRoot.querySelectorAll(
    "img[src], video[src], source[src], a[href], [data-preview]"
  )) {
    const candidates = [
      el.getAttribute("src"),
      el.getAttribute("href"),
      el.getAttribute("data-preview"),
      el instanceof HTMLAnchorElement ? el.href : null
    ];
    for (const url of candidates) {
      if (!url || !tokens.some((token) => url.includes(token))) continue;

      const container = el.closest(".wall-item-container");
      if (container instanceof HTMLElement) return container;

      const wallItem = el.closest(".wall-item");
      if (wallItem instanceof HTMLElement) {
        const inner = wallItem.querySelector(".wall-item-container");
        return inner instanceof HTMLElement ? inner : wallItem;
      }

      if (el.parentElement instanceof HTMLElement) return el.parentElement;
    }
  }

  return null;
}

export function findMarkerFormMountPoint(): HTMLElement | null {
  const form = findMarkerForm();
  if (!form || !isMarkerFormReady(form)) return null;

  const existing = form.querySelector(`.${MOUNT_POINT_CLASS}`);
  if (existing instanceof HTMLElement && existing.isConnected) return existing;

  const formContainer = form.querySelector(".form-container");
  const mount = document.createElement("div");
  mount.className = MOUNT_POINT_CLASS;

  if (formContainer instanceof HTMLElement) {
    formContainer.append(mount);
    return mount;
  }

  const submitRow = findSubmitRow(form);
  if (!(submitRow instanceof HTMLElement)) return null;

  submitRow.parentElement?.insertBefore(mount, submitRow);
  return mount;
}
