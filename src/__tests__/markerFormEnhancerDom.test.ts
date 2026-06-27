import { afterEach, describe, expect, it, vi } from "vitest";
import {
  destroyMarkerFormEnhancer,
  mountMarkerFormEnhancer,
  refreshMarkerFormEnhancer
} from "../markerFormEnhancerDom";
import { teardownMarkerSubmitGuard } from "../markerFormSubmitGuard";

describe("markerFormEnhancerDom mount lifecycle", () => {
  afterEach(() => {
    destroyMarkerFormEnhancer();
    teardownMarkerSubmitGuard();
    document.body.innerHTML = "";
  });

  it("does not tear down observers when the same scene id is passed as a new object", () => {
    document.body.innerHTML = `
      <div id="scene-markers-panel">
        <form>
          <div class="form-container px-3">
            <div class="mb-3 row">
              <label class="col-form-label col-sm-3">Time</label>
              <div class="col-sm-9">
                <input class="duration-control text-input form-control" placeholder="hh:mm:ss.ms" value="00:01:00" />
              </div>
            </div>
          </div>
          <div class="buttons-container px-3">
            <button type="button" class="btn btn-primary">Save</button>
          </div>
        </form>
      </div>
    `;

    const sceneA = { id: "1", scene_markers: [] };
    const sceneB = { id: "1", scene_markers: [] };

    mountMarkerFormEnhancer(sceneA);
    expect(document.querySelector(".stashangle-mount")).not.toBeNull();

    const mount = document.querySelector(".stashangle-mount");
    const select = document.querySelector("#stashangle-transform-select");
    mountMarkerFormEnhancer(sceneB);
    refreshMarkerFormEnhancer(sceneB);
    refreshMarkerFormEnhancer(sceneB);
    refreshMarkerFormEnhancer(sceneB);

    expect(document.querySelector(".stashangle-mount")).toBe(mount);
    expect(document.querySelector("#stashangle-transform-select")).toBe(select);
    expect(document.querySelector(".stashangle-field.mb-3.row, .stashangle-field.row.mb-3")).not.toBeNull();
  });
});
