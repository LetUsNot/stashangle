import { getPluginApi } from "./pluginApi";
import { runPluginStorageOperation } from "./pluginGraphql";
import { runPluginTaskAndWait } from "./pluginTaskRunner";
import {
  CLAIM_TIMEOUT_MS,
  MarkerRange,
  PLUGIN_ID,
  SceneMarkerLike,
  TaskResult,
  TransformMap,
  TransformValue
} from "./types";
import { resolveMarkerRanges } from "./transforms";

type LoadState = "idle" | "loading" | "loaded" | "error";

interface SceneCacheEntry {
  state: LoadState;
  transforms: TransformMap;
  rangesSignature: string;
  cachedRanges: MarkerRange[];
}

const MAX_SCENE_CACHE = 20;

const sceneCache = new Map<string, SceneCacheEntry>();
const sceneCacheOrder: string[] = [];
const inflightLoads = new Map<string, Promise<void>>();
const claimTimeouts = new Map<string, number>();

function touchSceneCache(sceneId: string): void {
  const existingIndex = sceneCacheOrder.indexOf(sceneId);
  if (existingIndex >= 0) {
    sceneCacheOrder.splice(existingIndex, 1);
  }
  sceneCacheOrder.push(sceneId);
  while (sceneCacheOrder.length > MAX_SCENE_CACHE) {
    const evictId = sceneCacheOrder.shift();
    if (evictId) {
      sceneCache.delete(evictId);
    }
  }
}

function logWarn(message: string): void {
  console.warn(`[Stashangle] ${message}`);
}

function parseTaskResult<T>(result: unknown): TaskResult<T> {
  if (result == null) {
    return {};
  }

  if (typeof result === "string") {
    try {
      return JSON.parse(result) as TaskResult<T>;
    } catch {
      return { output: result as T };
    }
  }

  if (typeof result === "object") {
    const record = result as Record<string, unknown>;
    if ("output" in record || "error" in record) {
      return record as TaskResult<T>;
    }
    return { output: result as T };
  }

  return { output: result as T };
}

async function loadTransformsFromAsset(sceneId: string): Promise<TransformMap> {
  try {
    const response = await fetch(`/plugin/${PLUGIN_ID}/assets/marker-transforms.json`, {
      credentials: "include",
      cache: "no-store"
    });
    if (response.status === 404) return {};
    if (!response.ok) return {};
    const store = (await response.json()) as { scenes?: Record<string, TransformMap> };
    return store.scenes?.[sceneId] ?? {};
  } catch {
    return {};
  }
}

async function verifyWriteResult(args: Record<string, unknown>): Promise<void> {
  const sceneId = typeof args.scene_id === "string" ? args.scene_id : null;
  const markerId = typeof args.marker_id === "string" ? args.marker_id : null;
  const mode = args.mode;

  if (mode === "setMarker" && sceneId && markerId) {
    let persisted: TransformValue | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const transforms = await loadTransformsFromAsset(sceneId);
      persisted = transforms[markerId] ?? null;
      if (persisted || !args.transform) break;
      await new Promise((resolve) => window.setTimeout(resolve, 150));
    }
    if (args.transform && !persisted) {
      throw new Error("Marker transform was not written to plugin storage.");
    }
    return;
  }

  if (mode === "claimPending" && sceneId && markerId) {
    const transforms = await loadTransformsFromAsset(sceneId);
    if (!transforms[markerId]) {
      throw new Error("Claimed marker transform was not written to plugin storage.");
    }
    return;
  }
}

async function runTaskViaPoll<T = unknown>(
  api: ReturnType<typeof getPluginApi>,
  stash: NonNullable<ReturnType<typeof getPluginApi>["utils"]>["StashService"],
  args: Record<string, unknown>
): Promise<TaskResult<T>> {
  const canRunTask =
    Boolean(api?.GQL?.RunPluginTaskDocument && api?.GQL?.FindJobDocument) ||
    typeof stash.mutateRunPluginTask === "function";
  if (!canRunTask) {
    throw new Error("Plugin task API is unavailable.");
  }

  await runPluginTaskAndWait(api, args);
  if (args.mode !== "getScene") {
    await verifyWriteResult(args);
  }
  if (args.mode === "getScene" && typeof args.scene_id === "string") {
    const transforms = await loadTransformsFromAsset(String(args.scene_id));
    return { output: { transforms } as T };
  }
  return { output: { ok: true } as T };
}

async function runTask<T = unknown>(args: Record<string, unknown>): Promise<TaskResult<T>> {
  const api = getPluginApi();
  const stash = api?.utils?.StashService;
  if (!stash) {
    throw new Error("StashService is unavailable.");
  }

  try {
    const result = await runPluginStorageOperation(api, args);
    const parsed = parseTaskResult<T>(result);
    if (parsed.error) {
      throw new Error(parsed.error);
    }
    if (parsed.output != null) {
      return parsed;
    }
  } catch {
    // Fall through to task polling for this call only.
  }

  try {
    return await runTaskViaPoll<T>(api, stash, args);
  } catch (taskError) {
    if (args.mode === "getScene" && typeof args.scene_id === "string") {
      const transforms = await loadTransformsFromAsset(String(args.scene_id));
      return { output: { transforms } as T };
    }
    throw taskError;
  }
}

function getOrCreateEntry(sceneId: string): SceneCacheEntry {
  let entry = sceneCache.get(sceneId);
  if (!entry) {
    entry = { state: "idle", transforms: {}, rangesSignature: "", cachedRanges: [] };
    sceneCache.set(sceneId, entry);
  }
  touchSceneCache(sceneId);
  return entry;
}

function setClaimTimeout(sceneId: string): void {
  clearClaimTimeout(sceneId);
  const timer = window.setTimeout(() => {
    logWarn("Marker save succeeded but transform persistence timed out.");
    claimTimeouts.delete(sceneId);
  }, CLAIM_TIMEOUT_MS);
  claimTimeouts.set(sceneId, timer);
}

export function clearClaimTimeout(sceneId: string): void {
  const timer = claimTimeouts.get(sceneId);
  if (typeof timer === "number") {
    window.clearTimeout(timer);
    claimTimeouts.delete(sceneId);
  }
}

export function getLoadState(sceneId: string): LoadState {
  return sceneCache.get(sceneId)?.state ?? "idle";
}

export function hasTransforms(sceneId: string): boolean {
  const entry = sceneCache.get(sceneId);
  if (!entry || entry.state !== "loaded") return false;
  return Object.keys(entry.transforms).length > 0;
}

export function getCachedTransforms(sceneId: string): TransformMap {
  return { ...(sceneCache.get(sceneId)?.transforms ?? {}) };
}

export function getCachedTransform(
  sceneId: string,
  markerId: string | number
): TransformValue | undefined {
  return sceneCache.get(sceneId)?.transforms[String(markerId)];
}

async function refreshTransformsCache(sceneId: string): Promise<void> {
  const entry = getOrCreateEntry(sceneId);
  entry.transforms = await loadTransformsFromAsset(sceneId);
  entry.state = "loaded";
}

export async function loadSceneTransforms(
  sceneId: string,
  markerIds?: string[],
  options?: { force?: boolean }
): Promise<void> {
  const existing = inflightLoads.get(sceneId);
  if (existing) return existing;

  const entry = getOrCreateEntry(sceneId);
  if (!options?.force && entry.state === "loaded" && markerIds === undefined) {
    return;
  }

  entry.state = "loading";

  const promise = (async () => {
    try {
      const result = await runTask<{
        transforms?: TransformMap;
      }>({
        mode: "getScene",
        scene_id: sceneId
      });

      const fromTask = result.output?.transforms;
      const taskKeys = fromTask ? Object.keys(fromTask) : [];
      if (fromTask && Object.keys(fromTask).length > 0) {
        entry.transforms = fromTask;
      } else {
        const fromAsset = await loadTransformsFromAsset(sceneId);
        const assetKeys = Object.keys(fromAsset);
        entry.transforms = fromAsset;
      }
      entry.state = "loaded";

      if (markerIds && markerIds.length > 0) {
        const markerIdSet = new Set(markerIds);
        const hasOrphans = Object.keys(entry.transforms).some((key) => !markerIdSet.has(key));
        if (hasOrphans) {
          await runTask({
            mode: "pruneStale",
            scene_id: sceneId,
            marker_ids: markerIds
          });
        }
      }
    } catch (error) {
      entry.state = "error";
      entry.transforms = {};
      logWarn(`Failed to load transforms for scene ${sceneId}: ${String(error)}`);
    } finally {
      inflightLoads.delete(sceneId);
    }
  })();

  inflightLoads.set(sceneId, promise);
  return promise;
}

export async function stageCreate(sceneId: string, transform: TransformValue | null): Promise<void> {
  if (!transform) return;
  try {
    await runTask({
      mode: "writePending",
      scene_id: sceneId,
      transform
    });
  } catch (error) {
    logWarn(`Failed to stage pending transform: ${String(error)}`);
  }
}

export async function completeCreate(sceneId: string, markerId: string): Promise<boolean> {
  try {
    const result = await runTask<{ claimed?: boolean }>({
      mode: "claimPending",
      scene_id: sceneId,
      marker_id: markerId
    });
    const claimed = Boolean(result.output?.claimed);
    await loadSceneTransforms(sceneId, undefined, { force: true });
    const alreadyPersisted = Boolean(getCachedTransforms(sceneId)[markerId]);
    const success = claimed || alreadyPersisted;
    if (success) {
      clearClaimTimeout(sceneId);
      return true;
    }
    setClaimTimeout(sceneId);
    return false;
  } catch (error) {
    setClaimTimeout(sceneId);
    logWarn(`Failed to claim pending transform: ${String(error)}`);
    return false;
  }
}

export async function setMarkerTransform(
  sceneId: string,
  markerId: string,
  transform: TransformValue | null
): Promise<void> {
  try {
    if (!transform) {
      await runTask({
        mode: "removeMarker",
        scene_id: sceneId,
        marker_id: markerId
      });
    } else {
      await runTask({
        mode: "setMarker",
        scene_id: sceneId,
        marker_id: markerId,
        transform
      });
    }
    await refreshTransformsCache(sceneId);
  } catch (error) {
    logWarn("Marker saved but transform persistence failed.");
    logWarn(`Persisting marker transform failed: ${String(error)}`);
  }
}

export async function removeMarkerTransform(sceneId: string, markerId: string): Promise<void> {
  await setMarkerTransform(sceneId, markerId, null);
}

export function getSceneRanges(sceneId: string, markers: SceneMarkerLike[], duration: number) {
  const entry = getOrCreateEntry(sceneId);
  const signature = JSON.stringify({
    markers: markers.map((m) => [m.id, m.seconds, m.end_seconds]),
    duration
  });
  if (entry.rangesSignature === signature) {
    return entry.cachedRanges;
  }
  entry.rangesSignature = signature;
  entry.cachedRanges = resolveMarkerRanges(markers, duration);
  return entry.cachedRanges;
}
