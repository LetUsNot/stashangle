#!/usr/bin/env python3
import importlib.util
import os
import tempfile
import threading


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

        errors = []

        def set_marker(marker_id: str, transform: str) -> None:
            try:
                mod.mode_set_marker(
                    {"scene_id": "99", "marker_id": marker_id, "transform": transform},
                    transforms_path,
                )
            except Exception as exc:
                errors.append(exc)

        threads = [
            threading.Thread(target=set_marker, args=("201", "rotate_left_scale")),
            threading.Thread(target=set_marker, args=("202", "rotate_right_scale")),
        ]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()

        assert not errors
        concurrent_store = mod.load_json(transforms_path, {})
        scene_map = concurrent_store["scenes"]["99"]
        assert scene_map["201"] == "rotate_left_scale"
        assert scene_map["202"] == "rotate_right_scale"

        with open(transforms_path, "w", encoding="utf-8") as handle:
            handle.write("{not valid json")
        recovered = mod.load_json(transforms_path, {"version": 1, "scenes": {}})
        assert recovered == {"version": 1, "scenes": {}}
        assert not os.path.exists(transforms_path)

        print("claim race, concurrent write, and corrupt json tests passed")


if __name__ == "__main__":
    run()
