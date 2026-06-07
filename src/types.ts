export const PLUGIN_ID = "Stashangle";
export const TRANSFORMS_FILE = "marker-transforms.json";
export const PENDING_FILE = "pending-create.json";
export const CLAIM_TIMEOUT_MS = 10_000;
export const STALE_PENDING_MS = 5 * 60_000;

export type TransformValue = "rotate_left_scale" | "rotate_right_scale";

export type TransformMap = Record<string, TransformValue>;

export interface TransformStoreV1 {
  version: 1;
  scenes: Record<string, TransformMap>;
}

export interface PendingEntry {
  transform: TransformValue;
  created_at: string;
}

export type PendingStore = Record<string, PendingEntry>;

export interface SceneMarkerLike {
  id: string;
  title?: string;
  seconds: number;
  end_seconds?: number | null;
}

export interface MarkerRange {
  markerId: string;
  start: number;
  end: number;
}

export interface SceneFileLike {
  width?: number | null;
  height?: number | null;
}

export interface SceneLike {
  id: string;
  files?: SceneFileLike[];
  scene_markers?: SceneMarkerLike[];
}

export interface TaskResult<T = unknown> {
  output?: T;
  error?: string;
}
