import { afterEach, describe, expect, it, vi } from "vitest";

const startSceneCoordinator = vi.fn();
const stopSceneCoordinator = vi.fn();

vi.mock("../sceneCoordinator", () => ({
  STASHANGLE_BUILD_ID: "0.1.11",
  startSceneCoordinator,
  stopSceneCoordinator
}));

describe("plugin init guard", () => {
  afterEach(() => {
    delete (window as any).__stashangle_dom_v6;
    delete (window as any).__stashangleBuild;
    delete (window as any).PluginApi;
    startSceneCoordinator.mockClear();
    stopSceneCoordinator.mockClear();
    vi.resetModules();
  });

  it("re-initializes when build id changes", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    (window as any).PluginApi = {
      Event: { addEventListener: vi.fn() }
    };
    (window as any).__stashangle_dom_v6 = true;
    (window as any).__stashangleBuild = "0.1.10";

    await import("../index");

    expect(stopSceneCoordinator).toHaveBeenCalled();
    expect(startSceneCoordinator).toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("build changed 0.1.10 -> 0.1.11")
    );

    warnSpy.mockRestore();
    infoSpy.mockRestore();
  });
});
