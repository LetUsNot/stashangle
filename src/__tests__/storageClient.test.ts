import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearClaimTimeout, completeCreate, loadSceneTransforms } from "../storageClient";

describe("storage client claim timeout behavior", () => {
  const mutateRunPluginOperation = vi.fn();
  const mutateRunPluginTask = vi.fn();
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    mutateRunPluginOperation.mockReset();
    mutateRunPluginTask.mockReset();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    (window as any).PluginApi = {
      utils: {
        StashService: {
          mutateRunPluginOperation,
          mutateRunPluginTask
        }
      }
    };
  });

  afterEach(() => {
    clearClaimTimeout("42");
    warnSpy.mockRestore();
    vi.useRealTimers();
  });

  it("uses runPluginOperation with positional plugin id and args", async () => {
    mutateRunPluginOperation.mockResolvedValueOnce({ output: { transforms: { "1": "rotate_left_scale" } } });

    await loadSceneTransforms("42");

    expect(mutateRunPluginOperation).toHaveBeenCalledWith("Stashangle", {
      mode: "getScene",
      scene_id: "42"
    });
    expect(mutateRunPluginTask).not.toHaveBeenCalled();
  });

  it("does not trigger timeout when claim succeeds", async () => {
    mutateRunPluginOperation.mockResolvedValueOnce({ output: { claimed: true } });
    mutateRunPluginOperation.mockResolvedValueOnce({ output: { transforms: {} } });

    const claimed = await completeCreate("42", "101");
    expect(claimed).toBe(true);

    vi.advanceTimersByTime(10_500);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("warns when claim does not succeed before timeout", async () => {
    mutateRunPluginOperation.mockResolvedValueOnce({ output: { claimed: false } });
    mutateRunPluginOperation.mockResolvedValueOnce({ output: { transforms: {} } });

    const claimed = await completeCreate("42", "101");
    expect(claimed).toBe(false);

    vi.advanceTimersByTime(10_500);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("treats hook-claimed pending as success when transform is already stored", async () => {
    mutateRunPluginOperation.mockResolvedValueOnce({ output: { claimed: false } });
    mutateRunPluginOperation.mockResolvedValueOnce({
      output: { transforms: { "101": "rotate_left_scale" } }
    });

    const claimed = await completeCreate("42", "101");
    expect(claimed).toBe(true);

    vi.advanceTimersByTime(10_500);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("does not call pruneStale when marker ids are empty", async () => {
    mutateRunPluginOperation.mockResolvedValueOnce({ output: { transforms: {} } });
    await loadSceneTransforms("42", []);

    const modes = mutateRunPluginOperation.mock.calls.map((call) => call[1].mode);
    expect(modes).toEqual(["getScene"]);
  });

  it("uses Apollo gql when StashService operation helpers are missing", async () => {
    const mutate = vi.fn().mockResolvedValue({
      data: { runPluginOperation: { output: { transforms: { "7": "rotate_left_scale" } } } }
    });
    const gql = vi.fn((strings: TemplateStringsArray) => strings.join(""));

    (window as any).PluginApi = {
      utils: {
        StashService: {
          getClient: () => ({ mutate }),
          mutateRunPluginTask
        }
      },
      libraries: {
        Apollo: { gql }
      }
    };

    await loadSceneTransforms("77");

    expect(mutate).toHaveBeenCalled();
    expect(mutateRunPluginTask).not.toHaveBeenCalled();
  });

  it("loads transforms from assets after plugin task completes", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ version: 1, scenes: { "55": { "9": "rotate_right_scale" } } })
    });
    vi.stubGlobal("fetch", fetchMock);

    const mutate = vi.fn().mockResolvedValue({ data: { runPluginTask: "42" } });
    const query = vi
      .fn()
      .mockResolvedValueOnce({ data: { findJob: { status: "RUNNING" } } })
      .mockResolvedValueOnce({ data: { findJob: { status: "FINISHED" } } });

    (window as any).PluginApi = {
      GQL: {
        RunPluginTaskDocument: {},
        FindJobDocument: {}
      },
      utils: {
        StashService: {
          getClient: () => ({ mutate, query }),
          mutateRunPluginTask
        }
      }
    };

    const promise = loadSceneTransforms("55");
    await vi.runAllTimersAsync();
    await promise;

    expect(mutate).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      "/plugin/Stashangle/assets/marker-transforms.json",
      expect.objectContaining({ credentials: "include" })
    );
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("returns empty transforms from missing asset file", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404
      })
    );

    (window as any).PluginApi = {
      utils: {
        StashService: {
          getClient: () => null,
          mutateRunPluginTask: vi.fn().mockRejectedValue(new Error("task unavailable"))
        }
      }
    };

    await loadSceneTransforms("88");
    vi.unstubAllGlobals();
  });
});
