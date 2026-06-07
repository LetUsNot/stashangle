import { describe, expect, it } from "vitest";
import {
  findMarkerForm,
  findMarkerFormMountPoint,
  findMarkerIdFromContent,
  findMarkerIdFromUrls,
  findMarkersPanel,
  findSubmitButton,
  getMarkerFormFieldLayout,
  getMarkerSelectClassName,
  isMarkerFormReady
} from "../domTargets";

function markerFormMarkup(options: { timeValue?: string; withDelete?: boolean } = {}): string {
  const { timeValue = "00:11:15", withDelete = false } = options;
  const deleteButton = withDelete
    ? `<button type="button" class="btn btn-danger">Delete</button>`
    : "";

  return `
    <form>
      <div class="form-container px-3">
        <div class="mb-3 row">
          <label class="col-form-label col-sm-3">Title</label>
          <div class="col-sm-9"><input class="text-input form-control" value="Anal" /></div>
        </div>
        <div class="mb-3 row">
          <label class="col-form-label col-sm-3">Time</label>
          <div class="col-sm-9">
            <div class="duration-input">
              <input class="duration-control text-input form-control" placeholder="hh:mm:ss.ms" value="${timeValue}" />
            </div>
          </div>
        </div>
      </div>
      <div class="buttons-container px-3">
        <div class="d-flex">
          <button type="button" class="btn btn-primary">Save</button>
          ${deleteButton}
        </div>
      </div>
    </form>
  `;
}

describe("domTargets marker form selectors", () => {
  it("finds the form inside the markers panel", () => {
    document.body.innerHTML = `
      <div id="scene-markers-panel">
        ${markerFormMarkup()}
      </div>
    `;

    const form = findMarkerForm();
    expect(findMarkersPanel()).not.toBeNull();
    expect(form).toBeInstanceOf(HTMLFormElement);
    expect(isMarkerFormReady(form!)).toBe(true);
    expect(findSubmitButton()).toBeInstanceOf(HTMLButtonElement);
    expect(findMarkerFormMountPoint()).toBeInstanceOf(HTMLElement);
    expect(document.querySelector(".stashangle-mount")).not.toBeNull();
    expect(document.querySelector(".form-container .stashangle-mount")).not.toBeNull();
  });

  it("finds marker form inside active markers tab pane without panel id", () => {
    document.body.innerHTML = `
      <div class="nav-tabs">
        <a class="active" data-rb-event-key="scene-markers-panel">Markers</a>
      </div>
      <div class="scene-tabs">
        <div class="tab-pane active" data-rb-event-key="scene-markers-panel">
          ${markerFormMarkup({ timeValue: "00:05:00" })}
        </div>
      </div>
    `;

    expect(findMarkerForm()).toBeInstanceOf(HTMLFormElement);
    expect(findMarkersPanel()).not.toBeNull();
  });

  it("does not match scene edit forms outside the markers tab", () => {
    document.body.innerHTML = `
      <div class="nav-tabs">
        <a class="active" data-rb-event-key="scene-edit-panel">Edit</a>
      </div>
      <div class="scene-tabs">
        <div class="tab-pane active" data-rb-event-key="scene-edit-panel">
          <form>
            <div class="form-container px-3">
              <div class="mb-3 row">
                <label class="col-form-label col-sm-3">Title</label>
                <div class="col-sm-9"><input class="text-input form-control" value="Scene title" /></div>
              </div>
            </div>
            <div class="buttons-container px-3">
              <button type="button" class="btn btn-primary">Save</button>
            </div>
          </form>
        </div>
      </div>
    `;

    expect(findMarkerForm()).toBeNull();
  });

  it("does not match marker form skeletons before duration fields render", () => {
    document.body.innerHTML = `
      <div id="scene-markers-panel">
        <form>
          <div class="buttons-container px-3">
            <button type="button" class="btn btn-primary">Save</button>
          </div>
        </form>
      </div>
    `;

    expect(findMarkerForm()).toBeNull();
    expect(findMarkerFormMountPoint()).toBeNull();
  });

  it("finds the modern buttons-container marker form layout", () => {
    document.body.innerHTML = `
      <div id="scene-markers-panel">
        ${markerFormMarkup({ timeValue: "00:01:00" })}
      </div>
    `;

    expect(findMarkerForm()).toBeInstanceOf(HTMLFormElement);
    expect(findSubmitButton()).toBeInstanceOf(HTMLButtonElement);
    expect(findMarkerFormMountPoint()).toBeInstanceOf(HTMLElement);
    const mount = document.querySelector(".stashangle-mount");
    const formContainer = document.querySelector(".form-container");
    expect(formContainer?.contains(mount)).toBe(true);
  });

  it("extracts marker id from scene_marker stream urls in the panel", () => {
    document.body.innerHTML = `
      <div id="scene-markers-panel">
        <video src="/scene/15202/scene_marker/415/stream"></video>
        ${markerFormMarkup({ withDelete: true })}
      </div>
    `;

    const panel = findMarkersPanel();
    expect(panel).not.toBeNull();
    expect(findMarkerIdFromUrls(panel!)).toBe("415");
  });

  it("extracts marker id from panel html when stream url is not on src or href", () => {
    document.body.innerHTML = `
      <div id="scene-markers-panel">
        <div data-preview="/scene/15202/scene_marker/415/stream"></div>
        ${markerFormMarkup({ withDelete: true })}
      </div>
    `;

    const panel = findMarkersPanel();
    expect(panel).not.toBeNull();
    expect(findMarkerIdFromContent(panel!)).toBe("415");
  });

  it("reads bootstrap row layout from an existing marker form field", () => {
    document.body.innerHTML = `
      <div id="scene-markers-panel">
        ${markerFormMarkup()}
      </div>
    `;

    const form = findMarkerForm();
    expect(form).toBeInstanceOf(HTMLFormElement);
    const layout = getMarkerFormFieldLayout(form!);
    expect(layout.rowClass).toContain("mb-3");
    expect(layout.labelClass).toContain("col-form-label");
    expect(layout.colClass).toContain("col-sm-9");
    expect(getMarkerSelectClassName(form!)).toContain("form-control");
  });
});
