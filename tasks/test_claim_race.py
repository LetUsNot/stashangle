#!/usr/bin/env python3
import importlib.util
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
        pending_path = os.path.join(tmp_dir, mod.PENDING_FILENAME)

        mod.mode_write_pending({"scene_id": "42", "transform": "rotate_left_scale"}, pending_path)

        first = mod.mode_claim_pending({"scene_id": "42", "marker_id": "101"}, transforms_path, pending_path)
        second = mod.mode_claim_pending({"scene_id": "42", "marker_id": "101"}, transforms_path, pending_path)
        assert first["claimed"] is True
        assert second["claimed"] is False

        store = mod.load_json(transforms_path, {})
        assert store["scenes"]["42"]["101"] == "rotate_left_scale"

        mod.mode_remove_marker({"scene_id": "42", "marker_id": "101"}, transforms_path)
        mod.mode_remove_marker({"scene_id": "42", "marker_id": "101"}, transforms_path)
        print("claim race and idempotent remove tests passed")


if __name__ == "__main__":
    run()
