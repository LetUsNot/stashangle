#!/usr/bin/env python3
import contextlib
import datetime
import json
import os
import re
import tempfile
import time
from typing import Any, Dict, Iterator, Tuple

NUMERIC_ID = re.compile(r"^[0-9]+$")
TRANSFORMS_FILENAME = "marker-transforms.json"
PENDING_FILENAME = "pending-create.json"
STALE_PENDING_SECONDS = 300


def now_utc() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc)


def parse_datetime(value: str) -> datetime.datetime:
    return datetime.datetime.fromisoformat(value.replace("Z", "+00:00"))


def load_json(path: str, fallback: Any) -> Any:
    if not os.path.exists(path):
        return fallback
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except json.JSONDecodeError:
        timestamp = now_utc().strftime("%Y%m%d%H%M%S")
        corrupt_path = f"{path}.corrupt.{timestamp}"
        try:
            os.replace(path, corrupt_path)
        except OSError:
            pass
        return fallback


@contextlib.contextmanager
def file_lock(path: str, timeout: float = 30.0) -> Iterator[None]:
    lock_path = f"{path}.lock"
    start = time.monotonic()
    lock_fd = None
    while True:
        try:
            lock_fd = os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_RDWR)
            break
        except FileExistsError:
            if time.monotonic() - start > timeout:
                raise TimeoutError(f"Could not acquire lock for {path}")
            time.sleep(0.05)
    try:
        yield
    finally:
        if lock_fd is not None:
            os.close(lock_fd)
        try:
            os.remove(lock_path)
        except OSError:
            pass


def atomic_write_json(path: str, data: Any) -> None:
    directory = os.path.dirname(path) or "."
    fd, tmp_path = tempfile.mkstemp(prefix=".stashangle-", suffix=".tmp", dir=directory)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(data, handle, sort_keys=True, separators=(",", ":"))
        os.replace(tmp_path, path)
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


def ensure_numeric_id(value: Any, field: str) -> str:
    text = str(value or "")
    if not NUMERIC_ID.match(text):
        raise ValueError(f"{field} must be numeric.")
    return text


def ensure_transform_store(store: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(store, dict):
        store = {}
    version = store.get("version")
    if version != 1:
        store["version"] = 1
    scenes = store.get("scenes")
    if not isinstance(scenes, dict):
        store["scenes"] = {}
    return store


def ensure_pending_store(store: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(store, dict):
        store = {}
    return store


def cleanup_stale_pending(pending: Dict[str, Any]) -> Dict[str, Any]:
    cutoff = now_utc() - datetime.timedelta(seconds=STALE_PENDING_SECONDS)
    stale_keys = []
    for scene_id, entry in pending.items():
        created_at = entry.get("created_at")
        if not isinstance(created_at, str):
            stale_keys.append(scene_id)
            continue
        try:
            if parse_datetime(created_at) < cutoff:
                stale_keys.append(scene_id)
        except Exception:
            stale_keys.append(scene_id)
    for key in stale_keys:
        pending.pop(key, None)
    return pending


def get_plugin_dir(input_obj: Dict[str, Any]) -> str:
    server = input_obj.get("server_connection", {})
    plugin_dir = server.get("PluginDir") or server.get("pluginDir")
    if not plugin_dir:
        raise ValueError("PluginDir missing from server_connection.")
    return plugin_dir


def get_paths(plugin_dir: str) -> Tuple[str, str]:
    return (
        os.path.join(plugin_dir, TRANSFORMS_FILENAME),
        os.path.join(plugin_dir, PENDING_FILENAME),
    )


def write_output(output: Any = None, error: str = "") -> None:
    payload: Dict[str, Any] = {}
    if output is not None:
        payload["output"] = output
    if error:
        payload["error"] = error
    print(json.dumps(payload))


def mode_get_scene(args: Dict[str, Any], transforms_path: str) -> Dict[str, Any]:
    scene_id = ensure_numeric_id(args.get("scene_id"), "scene_id")
    with file_lock(transforms_path):
        store = ensure_transform_store(load_json(transforms_path, {"version": 1, "scenes": {}}))
        scene_map = store["scenes"].get(scene_id, {})
    return {"transforms": scene_map}


def mode_set_marker(args: Dict[str, Any], transforms_path: str) -> Dict[str, Any]:
    scene_id = ensure_numeric_id(args.get("scene_id"), "scene_id")
    marker_id = ensure_numeric_id(args.get("marker_id"), "marker_id")
    transform = args.get("transform")
    if transform not in ("rotate_left_scale", "rotate_right_scale"):
        raise ValueError("transform must be rotate_left_scale or rotate_right_scale.")

    with file_lock(transforms_path):
        store = ensure_transform_store(load_json(transforms_path, {"version": 1, "scenes": {}}))
        scene_map = dict(store["scenes"].get(scene_id, {}))
        if len(scene_map) >= 500 and marker_id not in scene_map:
            raise ValueError("max 500 transforms per scene.")
        scene_map[marker_id] = transform
        store["scenes"][scene_id] = scene_map
        atomic_write_json(transforms_path, store)
    return {"saved": True}


def mode_remove_marker(args: Dict[str, Any], transforms_path: str) -> Dict[str, Any]:
    scene_id = ensure_numeric_id(args.get("scene_id"), "scene_id")
    marker_id = ensure_numeric_id(args.get("marker_id"), "marker_id")
    with file_lock(transforms_path):
        store = ensure_transform_store(load_json(transforms_path, {"version": 1, "scenes": {}}))
        scene_map = dict(store["scenes"].get(scene_id, {}))
        scene_map.pop(marker_id, None)
        if scene_map:
            store["scenes"][scene_id] = scene_map
        else:
            store["scenes"].pop(scene_id, None)
        atomic_write_json(transforms_path, store)
    return {"removed": True}


def mode_remove_marker_by_id(args: Dict[str, Any], transforms_path: str) -> Dict[str, Any]:
    marker_id = ensure_numeric_id(args.get("marker_id"), "marker_id")
    with file_lock(transforms_path):
        store = ensure_transform_store(load_json(transforms_path, {"version": 1, "scenes": {}}))
        for scene_id, scene_map in list(store["scenes"].items()):
            if marker_id in scene_map:
                scene_copy = dict(scene_map)
                scene_copy.pop(marker_id, None)
                if scene_copy:
                    store["scenes"][scene_id] = scene_copy
                else:
                    store["scenes"].pop(scene_id, None)
        atomic_write_json(transforms_path, store)
    return {"removed": True}


def mode_prune_stale(args: Dict[str, Any], transforms_path: str) -> Dict[str, Any]:
    scene_id = ensure_numeric_id(args.get("scene_id"), "scene_id")
    marker_ids = args.get("marker_ids", [])
    if not isinstance(marker_ids, list) or len(marker_ids) == 0:
        return {"pruned": False, "reason": "empty_marker_ids"}

    normalized = {ensure_numeric_id(marker_id, "marker_id") for marker_id in marker_ids}
    with file_lock(transforms_path):
        store = ensure_transform_store(load_json(transforms_path, {"version": 1, "scenes": {}}))
        scene_map = dict(store["scenes"].get(scene_id, {}))
        next_map = {k: v for k, v in scene_map.items() if k in normalized}
        if next_map == scene_map:
            return {"pruned": False, "reason": "no_changes"}
        if next_map:
            store["scenes"][scene_id] = next_map
        else:
            store["scenes"].pop(scene_id, None)
        atomic_write_json(transforms_path, store)
    return {"pruned": True}


def mode_write_pending(args: Dict[str, Any], pending_path: str) -> Dict[str, Any]:
    scene_id = ensure_numeric_id(args.get("scene_id"), "scene_id")
    transform = args.get("transform")
    if transform not in ("rotate_left_scale", "rotate_right_scale"):
        raise ValueError("transform must be rotate_left_scale or rotate_right_scale.")

    with file_lock(pending_path):
        pending = ensure_pending_store(load_json(pending_path, {}))
        cleanup_stale_pending(pending)
        pending[scene_id] = {
            "transform": transform,
            "created_at": now_utc().isoformat().replace("+00:00", "Z"),
        }
        atomic_write_json(pending_path, pending)
    return {"staged": True}


def mode_claim_pending(args: Dict[str, Any], transforms_path: str, pending_path: str) -> Dict[str, Any]:
    scene_id = ensure_numeric_id(args.get("scene_id"), "scene_id")
    marker_id = ensure_numeric_id(args.get("marker_id"), "marker_id")

    with file_lock(transforms_path):
        with file_lock(pending_path):
            pending = ensure_pending_store(load_json(pending_path, {}))
            cleanup_stale_pending(pending)
            entry = pending.get(scene_id)
            if not entry:
                atomic_write_json(pending_path, pending)
                return {"claimed": False}

            transform = entry.get("transform")
            if transform not in ("rotate_left_scale", "rotate_right_scale"):
                pending.pop(scene_id, None)
                atomic_write_json(pending_path, pending)
                return {"claimed": False}

            store = ensure_transform_store(load_json(transforms_path, {"version": 1, "scenes": {}}))
            scene_map = dict(store["scenes"].get(scene_id, {}))
            if len(scene_map) >= 500 and marker_id not in scene_map:
                raise ValueError("max 500 transforms per scene.")
            scene_map[marker_id] = transform
            store["scenes"][scene_id] = scene_map
            pending.pop(scene_id, None)
            atomic_write_json(transforms_path, store)
            atomic_write_json(pending_path, pending)
    return {"claimed": True}


def run() -> None:
    raw = input()
    payload = json.loads(raw) if raw else {}
    args = payload.get("args", {})
    mode = args.get("mode")
    hook_ctx = args.get("hookContext", {}) if isinstance(args, dict) else {}
    if mode == "removeMarkerById":
        args = {**args, "marker_id": hook_ctx.get("id", args.get("marker_id"))}
    if mode == "claimPending":
        hook_input = hook_ctx.get("input", {}) if isinstance(hook_ctx, dict) else {}
        args = {
            **args,
            "scene_id": hook_input.get("scene_id", args.get("scene_id")),
            "marker_id": hook_ctx.get("id", args.get("marker_id")),
        }
    plugin_dir = get_plugin_dir(payload)
    transforms_path, pending_path = get_paths(plugin_dir)

    if mode == "getScene":
        write_output(mode_get_scene(args, transforms_path))
    elif mode == "setMarker":
        write_output(mode_set_marker(args, transforms_path))
    elif mode == "removeMarker":
        write_output(mode_remove_marker(args, transforms_path))
    elif mode == "removeMarkerById":
        write_output(mode_remove_marker_by_id(args, transforms_path))
    elif mode == "pruneStale":
        write_output(mode_prune_stale(args, transforms_path))
    elif mode == "writePending":
        write_output(mode_write_pending(args, pending_path))
    elif mode == "claimPending":
        write_output(mode_claim_pending(args, transforms_path, pending_path))
    else:
        raise ValueError(f"Unsupported mode: {mode}")


if __name__ == "__main__":
    try:
        run()
    except Exception as exc:
        write_output(error=str(exc))
