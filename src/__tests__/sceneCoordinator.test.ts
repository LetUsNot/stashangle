import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mountMarkerFormEnhancer = vi.fn();
const destroyMarkerFormEnhancer = vi.fn();
const mountMarkerBadges = vi.fn();
const destroyMarkerBadges = vi.fn();
const refreshMarkerBadges = vi.fn();
const mountMarkerTransformController = vi.fn();
const destroyMarkerTransformController = vi.fn();
const refreshMarkerTransformPlayback = vi.fn();

vi.mock("../markerFormEnhancerDom", () => ({
  mountMarkerFormEnhancer,
  destroyMarkerFormEnhancer,
  refreshMarkerFormEnhancer: vi.fn()
}));

vi.mock("../markerBadgesDom", () => ({
  mountMarkerBadges,
  destroyMarkerBadges,
  refreshMarkerBadges
}));

vi.mock("../markerTransformControllerDom", () => ({
  mountMarkerTransformController,
  destroyMarkerTransformController,
  refreshMarkerTransformPlayback
}));

vi.mock("../sceneClient", () => ({
  fetchScene: vi.fn().mockResolvedValue({ id: "42", scene_markers: [] }),
  sceneFromId: (id: string) => ({ id, scene_markers: [] })
}));

vi.mock("../domTargets", () => ({
  findSceneTabsRoot: vi.fn(() => null)
}));

const { startSceneCoordinator, stopSceneCoordinator } = await import("../sceneCoordinator");

describe("sceneCoordinator lifecycle", () => {
  let locationHandler: (() => void) | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    mountMarkerFormEnhancer.mockClear();
    destroyMarkerFormEnhancer.mockClear();
    mountMarkerBadges.mockClear();
    destroyMarkerBadges.mockClear();
    refreshMarkerBadges.mockClear();
    mountMarkerTransformController.mockClear();
    destroyMarkerTransformController.mockClear();
    locationHandler = undefined;
    document.body.innerHTML = "";

    (window as any).PluginApi = {
      Event: {
        addEventListener: vi.fn((_event: string, handler: () => void) => {
          locationHandler = handler;
        }),
        removeEventListener: vi.fn()
      }
    };
  });

  async function flushCoordinator(): Promise<void> {
    await vi.runAllTimersAsync();
    await Promise.resolve();
    await Promise.resolve();
  }

  afterEach(async () => {
    stopSceneCoordinator();
    await flushCoordinator();
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("unmounts when leaving a scene route", async () => {
    window.history.pushState({}, "", "/scenes/42");
    startSceneCoordinator();
    await flushCoordinator();

    window.history.pushState({}, "", "/");
    locationHandler?.();
    await flushCoordinator();

    expect(destroyMarkerFormEnhancer).toHaveBeenCalled();
    expect(destroyMarkerBadges).toHaveBeenCalled();
    expect(destroyMarkerTransformController).toHaveBeenCalled();
  });

  it("stopSceneCoordinator disconnects listeners and unmounts", async () => {
    window.history.pushState({}, "", "/scenes/42");
    startSceneCoordinator();
    await flushCoordinator();

    stopSceneCoordinator();
    await flushCoordinator();

    const api = (window as any).PluginApi;
    expect(api.Event.removeEventListener).toHaveBeenCalled();
    expect(destroyMarkerFormEnhancer).toHaveBeenCalled();
    expect(destroyMarkerBadges).toHaveBeenCalled();
    expect(destroyMarkerTransformController).toHaveBeenCalled();
  });

  it("debounces sync requests", async () => {
    window.history.pushState({}, "", "/scenes/42");
    startSceneCoordinator();
    await flushCoordinator();

    const callsBefore = mountMarkerFormEnhancer.mock.calls.length;
    expect(callsBefore).toBeGreaterThan(0);

    locationHandler?.();
    locationHandler?.();
    await vi.advanceTimersByTimeAsync(50);
    expect(mountMarkerFormEnhancer.mock.calls.length).toBe(callsBefore);

    await vi.advanceTimersByTimeAsync(100);
    await flushCoordinator();
    expect(mountMarkerFormEnhancer.mock.calls.length).toBeGreaterThan(callsBefore);
  });
});
