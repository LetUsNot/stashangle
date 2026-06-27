#!/usr/bin/env python3
import importlib.util
import json
import os
import tempfile


def load_storage_module():
    here = os.path.dirname(os.path.abspath(__file__))
    path = os.path.join(here, "stashangle_storage.py")
    spec = importlib.util.spec_from_file_location("stashangle_storage", path)
    mod = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(mod)
    return mod


def run() -> None:
    mod = load_storage_module()
    with tempfile.TemporaryDirectory() as tmp_dir:
        transforms_path = os.path.join(tmp_dir, mod.TRANSFORMS_FILENAME)

        mod.mode_set_marker(
            {"scene_id": "10", "marker_id": "1", "transform": "rotate_left_scale"},
            transforms_path,
        )
        mod.mode_set_marker(
            {"scene_id": "10", "marker_id": "2", "transform": "rotate_right_scale"},
            transforms_path,
        )

        pruned = mod.mode_prune_stale(
            {"scene_id": "10", "marker_ids": ["1"]},
            transforms_path,
        )
        assert pruned["pruned"] is True
        store = mod.load_json(transforms_path, {})
        assert store["scenes"]["10"] == {"1": "rotate_left_scale"}

        noop = mod.mode_prune_stale(
            {"scene_id": "10", "marker_ids": ["1"]},
            transforms_path,
        )
        assert noop["pruned"] is False

        mod.mode_remove_marker_by_id({"marker_id": "1"}, transforms_path)
        store = mod.load_json(transforms_path, {})
        assert "1" not in store["scenes"].get("10", {})

        with open(transforms_path, "w", encoding="utf-8") as handle:
            handle.write("{broken")

        recovered = mod.load_json(transforms_path, {"version": 1, "scenes": {}})
        assert recovered == {"version": 1, "scenes": {}}
        assert not os.path.exists(transforms_path)

    print("storage mode tests passed")


if __name__ == "__main__":
    run()
