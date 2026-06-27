import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  destroyMarkerTransformController,
  mountMarkerTransformController,
  refreshMarkerTransformPlayback
} from "../markerTransformControllerDom";

describe("markerTransformControllerDom tab-switch regression", () => {
  const mutateRunPluginOperation = vi.fn();
  let seekedHandler: (() => void) | undefined;
  let fullscreenHandler: (() => void) | undefined;
  let currentTime = 15;
  let playerEl: HTMLDivElement;

  beforeEach(() => {
    currentTime = 15;
    seekedHandler = undefined;
    fullscreenHandler = undefined;
    document.body.innerHTML = "";

    playerEl = document.createElement("div");
    playerEl.id = "VideoJsPlayer";
    playerEl.style.width = "800px";
    playerEl.style.height = "600px";
    Object.defineProperty(playerEl, "clientWidth", { configurable: true, get: () => 800 });
    Object.defineProperty(playerEl, "clientHeight", { configurable: true, get: () => 600 });
    const video = document.createElement("video");
    playerEl.appendChild(video);
    document.body.appendChild(playerEl);

    const player = {
      currentTime: (value?: number) => {
        if (typeof value === "number") {
          currentTime = value;
        }
        return currentTime;
      },
      paused: () => true,
      duration: () => 100,
      on: (event: string, handler: () => void) => {
        if (event === "seeked") {
          seekedHandler = handler;
        }
        if (event === "fullscreenchange") {
          fullscreenHandler = handler;
        }
      },
      off: vi.fn()
    };

    (window as any).PluginApi = {
      utils: {
        InteractiveUtils: { getPlayer: () => player },
        StashService: { mutateRunPluginOperation }
      }
    };

    mutateRunPluginOperation.mockResolvedValue({
      output: { transforms: { m1: "rotate_left_scale" } }
    });
  });

  afterEach(() => {
    destroyMarkerTransformController();
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("documents whether transform re-applies after DOM styles are cleared", async () => {
    const scene = {
      id: "scene1",
      scene_markers: [{ id: "m1", seconds: 10, end_seconds: 20 }],
      files: [{ width: 1920, height: 1080 }]
    };

    mountMarkerTransformController(scene);
    await vi.waitUntil(() => seekedHandler != null, { timeout: 2000 });

    const flushRaf = () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });

    seekedHandler?.();
    await flushRaf();

    const media = document.querySelector("#VideoJsPlayer video") as HTMLVideoElement;
    expect(media.getAttribute("data-stashangle-transform")).toBe("active");
    expect(media.style.transform).toContain("rotate");

    media.style.removeProperty("transform");
    media.removeAttribute("data-stashangle-transform");

    seekedHandler?.();
    await flushRaf();

    expect(media.getAttribute("data-stashangle-transform")).toBe("active");
  });

  it("re-applies transform immediately after layout refresh without waiting for seeked", async () => {
    const scene = {
      id: "scene1",
      scene_markers: [{ id: "m1", seconds: 10, end_seconds: 20 }],
      files: [{ width: 1920, height: 1080 }]
    };

    mountMarkerTransformController(scene);
    await vi.waitUntil(() => seekedHandler != null, { timeout: 2000 });

    seekedHandler?.();

    const media = document.querySelector("#VideoJsPlayer video") as HTMLVideoElement;
    expect(media.style.transform).toContain("rotate");

    media.style.removeProperty("transform");
    media.removeAttribute("data-stashangle-transform");

    refreshMarkerTransformPlayback();

    expect(media.getAttribute("data-stashangle-transform")).toBe("active");
    expect(media.style.transform).toContain("rotate");
  });

  it("recomputes transform scale when player resizes for fullscreen", async () => {
    const scene = {
      id: "scene1",
      scene_markers: [{ id: "m1", seconds: 10, end_seconds: 20 }],
      files: [{ width: 1920, height: 1080 }]
    };

    mountMarkerTransformController(scene);
    await vi.waitUntil(() => seekedHandler != null && fullscreenHandler != null, { timeout: 2000 });

    seekedHandler?.();

    const media = document.querySelector("#VideoJsPlayer video") as HTMLVideoElement;
    const transformBefore = media.style.transform;

    playerEl.style.width = "1920px";
    playerEl.style.height = "1080px";
    Object.defineProperty(playerEl, "clientWidth", { configurable: true, get: () => 1920 });
    Object.defineProperty(playerEl, "clientHeight", { configurable: true, get: () => 1080 });

    fullscreenHandler?.();

    const transformAfter = media.style.transform;

    expect(transformAfter).not.toBe(transformBefore);
  });
});
