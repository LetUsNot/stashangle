import { beforeEach, describe, expect, it } from "vitest";
import {
  applyMarkerTransform,
  getMarkerTransformDomState,
  isMarkerTransformDomActive,
  resetMarkerTransforms
} from "../transforms";

describe("transform application", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    const player = document.createElement("div");
    player.id = "VideoJsPlayer";
    player.style.width = "800px";
    player.style.height = "600px";
    Object.defineProperty(player, "clientWidth", { configurable: true, get: () => 800 });
    Object.defineProperty(player, "clientHeight", { configurable: true, get: () => 600 });
    const video = document.createElement("video");
    player.appendChild(video);
    document.body.appendChild(player);
  });

  it("applies rotate transform to video media", () => {
    const scene = {
      id: "1",
      files: [{ width: 1920, height: 1080 }]
    };

    applyMarkerTransform("rotate_left_scale", scene);

    const media = document.querySelector("#VideoJsPlayer video") as HTMLVideoElement;
    expect(media.getAttribute("data-stashangle-transform")).toBe("active");
    expect(media.style.transform).toContain("rotate(-90deg)");
    expect(isMarkerTransformDomActive()).toBe(true);
  });

  it("treats stale active attr without transform as inactive", () => {
    const media = document.querySelector("#VideoJsPlayer video") as HTMLVideoElement;
    media.setAttribute("data-stashangle-transform", "active");

    expect(getMarkerTransformDomState().activeAttr).toBe("active");
    expect(isMarkerTransformDomActive()).toBe(false);
  });

  it("prefers visible video over canvas when both are present", () => {
    const player = document.getElementById("VideoJsPlayer")!;
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    player.appendChild(canvas);

    const scene = {
      id: "1",
      files: [{ width: 1920, height: 1080 }]
    };

    applyMarkerTransform("rotate_left_scale", scene);

    const video = document.querySelector("#VideoJsPlayer video") as HTMLVideoElement;
    expect(video.getAttribute("data-stashangle-transform")).toBe("active");
    expect(canvas.getAttribute("data-stashangle-transform")).toBeNull();
  });

  it("resetMarkerTransforms clears active transform state", () => {
    const scene = {
      id: "1",
      files: [{ width: 1920, height: 1080 }]
    };

    applyMarkerTransform("rotate_right_scale", scene);
    resetMarkerTransforms();

    const media = document.querySelector("#VideoJsPlayer video") as HTMLVideoElement;
    expect(media.getAttribute("data-stashangle-transform")).toBeNull();
    expect(media.style.transform).toBe("");
    expect(isMarkerTransformDomActive()).toBe(false);
  });
});
