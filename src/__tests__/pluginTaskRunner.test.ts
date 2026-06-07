import { afterEach, describe, expect, it, vi } from "vitest";
import { runPluginTaskAndWait } from "../pluginTaskRunner";

describe("pluginTaskRunner", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("queues a plugin task and waits for FINISHED", async () => {
    vi.useFakeTimers();
    const mutate = vi.fn().mockResolvedValue({ data: { runPluginTask: "42" } });
    const query = vi
      .fn()
      .mockResolvedValueOnce({ data: { findJob: { status: "RUNNING" } } })
      .mockResolvedValueOnce({ data: { findJob: { status: "FINISHED" } } });

    const api = {
      GQL: {
        RunPluginTaskDocument: {},
        FindJobDocument: {}
      },
      utils: {
        StashService: {
          getClient: () => ({ mutate, query })
        }
      }
    };

    const promise = runPluginTaskAndWait(api, { mode: "getScene", scene_id: "1" });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(mutate).toHaveBeenCalledWith({
      mutation: {},
      variables: {
        plugin_id: "Stashangle",
        task_name: "Storage",
        args_map: { mode: "getScene", scene_id: "1" }
      }
    });
    expect(result.jobId).toBe("42");
    expect(result.job.status).toBe("FINISHED");
  });
});
