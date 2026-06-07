import { describe, expect, it, vi } from "vitest";
import { runPluginStorageOperation } from "../pluginGraphql";

describe("pluginGraphql", () => {
  it("prefers Apollo client gql when operation document is missing", async () => {
    const mutate = vi.fn().mockResolvedValue({
      data: { runPluginOperation: { output: { transforms: {} } } }
    });
    const gql = vi.fn((strings: TemplateStringsArray) => strings.join(""));

    const api = {
      utils: {
        StashService: {
          getClient: () => ({ mutate })
        }
      },
      libraries: {
        Apollo: { gql }
      }
    };

    const result = await runPluginStorageOperation(api, { mode: "getScene", scene_id: "1" });

    expect(mutate).toHaveBeenCalled();
    expect(gql).toHaveBeenCalled();
    expect(result).toEqual({ output: { transforms: {} } });
  });
});
