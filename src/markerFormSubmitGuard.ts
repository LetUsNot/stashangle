import { isMarkerEditForm } from "./domTargets";

type MarkerSubmitHandler = (form: HTMLFormElement) => void | Promise<void>;

const SUBMIT_LOCK_KEY = "__stashangleMarkerSubmitLock";
const DELEGATED_KEY = "__stashangleDelegatedSubmit";
const INTERCEPTOR_KEY = "__stashangleMarkerSubmitInterceptor";
const HANDLER_KEY = "__stashangleMarkerDocumentSubmitHandler";

function getWindow(): Record<string, unknown> {
  return window as unknown as Record<string, unknown>;
}

function tryAcquireSubmitLock(): boolean {
  const win = getWindow();
  if (win[SUBMIT_LOCK_KEY]) return false;
  win[SUBMIT_LOCK_KEY] = true;
  return true;
}

function releaseSubmitLock(): void {
  getWindow()[SUBMIT_LOCK_KEY] = false;
}

function isDelegatedSubmit(): boolean {
  return Boolean(getWindow()[DELEGATED_KEY]);
}

function onDocumentSubmit(event: Event): void {
  if (isDelegatedSubmit()) return;

  const target = event.target;
  if (!(target instanceof HTMLFormElement) || !isMarkerEditForm(target)) return;

  const interceptor = getWindow()[INTERCEPTOR_KEY] as MarkerSubmitHandler | undefined;
  if (!interceptor) return;

  event.preventDefault();
  event.stopImmediatePropagation();

  if (!tryAcquireSubmitLock()) return;

  void Promise.resolve(interceptor(target)).finally(() => {
    queueMicrotask(releaseSubmitLock);
  });
}

export function ensureMarkerSubmitGuard(): void {
  const win = getWindow();
  if (win[HANDLER_KEY]) return;
  document.addEventListener("submit", onDocumentSubmit, true);
  win[HANDLER_KEY] = onDocumentSubmit;
}

export function teardownMarkerSubmitGuard(): void {
  const win = getWindow();
  const handler = win[HANDLER_KEY] as EventListener | undefined;
  if (handler) {
    document.removeEventListener("submit", handler, true);
  }
  delete win[HANDLER_KEY];
  delete win[INTERCEPTOR_KEY];
  releaseSubmitLock();
}

export function setMarkerSubmitInterceptor(handler: MarkerSubmitHandler | null): void {
  const win = getWindow();
  if (handler) {
    ensureMarkerSubmitGuard();
    win[INTERCEPTOR_KEY] = handler;
    return;
  }
  delete win[INTERCEPTOR_KEY];
}

export function commitDelegatedMarkerSubmit(form: HTMLFormElement): void {
  const win = getWindow();
  win[DELEGATED_KEY] = true;
  try {
    if (typeof form.requestSubmit === "function") {
      form.requestSubmit();
    } else {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    }
  } finally {
    win[DELEGATED_KEY] = false;
  }
}
