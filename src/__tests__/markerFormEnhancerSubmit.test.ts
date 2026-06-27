import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { destroyMarkerFormEnhancer, mountMarkerFormEnhancer } from "../markerFormEnhancerDom";
import { teardownMarkerSubmitGuard } from "../markerFormSubmitGuard";
import * as storageClient from "../storageClient";
import { SceneLike } from "../types";

describe("markerFormEnhancerDom submit flows", () => {
  const setMarkerTransform = vi.spyOn(storageClient, "setMarkerTransform");
  const stageCreate = vi.spyOn(storageClient, "stageCreate");

  beforeEach(() => {
    setMarkerTransform.mockResolvedValue(undefined);
    stageCreate.mockResolvedValue(undefined);
    document.body.innerHTML = `
      <div id="scene-markers-panel">
        <form>
          <div class="form-container">
            <label>Title</label>
            <input type="text" value="Test marker" />
            <label>Time</label>
            <input placeholder="mm:ss" value="0:15" />
            <div class="buttons-container">
              <button type="button" class="btn btn-primary">Save</button>
              <button type="button" class="btn btn-danger">Delete</button>
            </div>
          </div>
          <div class="stashangle-mount"></div>
        </form>
      </div>
    `;
  });

  afterEach(() => {
    destroyMarkerFormEnhancer();
    teardownMarkerSubmitGuard();
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("persists transform on edit save when marker id is known", async () => {
    const scene = {
      id: "7",
      scene_markers: [{ id: "55", seconds: 15, title: "Test marker", end_seconds: 20 }]
    };

    mountMarkerFormEnhancer(scene);

    const select = document.querySelector("#stashangle-transform-select") as HTMLSelectElement;
    expect(select).toBeTruthy();
    select.value = "rotate_left_scale";
    select.dispatchEvent(new Event("change", { bubbles: true }));

    const save = document.querySelector("button.btn-primary") as HTMLButtonElement;
    const form = save.closest("form") as HTMLFormElement;
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await Promise.resolve();

    expect(setMarkerTransform).toHaveBeenCalledWith("7", "55", "rotate_left_scale");
  });

  it("submits the marker form only once per save intent", async () => {
    const scene: SceneLike = { id: "7", scene_markers: [] };
    const form = document.querySelector("form") as HTMLFormElement;
    const submitSpy = vi.fn((event: Event) => {
      event.preventDefault();
    });
    form.addEventListener("submit", submitSpy);

    mountMarkerFormEnhancer(scene);

    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await Promise.resolve();
    await Promise.resolve();

    expect(submitSpy).toHaveBeenCalledTimes(1);
  });
});
