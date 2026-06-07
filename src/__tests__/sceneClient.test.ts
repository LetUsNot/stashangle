import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchScene } from "../sceneClient";

describe("sceneClient", () => {
  afterEach(() => {
    delete (window as any).PluginApi;
  });

  it("loads scene via FindSceneDocument", async () => {
    const query = vi.fn().mockResolvedValue({
      data: {
        findScene: {
          id: "15202",
          files: [{ width: 1920, height: 1080 }],
          scene_markers: [{ id: "m1", seconds: 10, title: "test" }]
        }
      }
    });

    (window as any).PluginApi = {
      GQL: { FindSceneDocument: {} },
      utils: {
        StashService: {
          getClient: () => ({ query })
        }
      }
    };

    const scene = await fetchScene("15202");
    expect(scene?.id).toBe("15202");
    expect(scene?.scene_markers).toHaveLength(1);
    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({ variables: { id: "15202" } })
    );
  });

  it("falls back to queryFindScenesByID", async () => {
    const queryFindScenesByID = vi.fn().mockResolvedValue({
      data: {
        findScenes: {
          scenes: [{ id: "15202", scene_markers: [] }]
        }
      }
    });

    (window as any).PluginApi = {
      GQL: {},
      utils: {
        StashService: {
          getClient: () => null,
          queryFindScenesByID
        }
      }
    };

    const scene = await fetchScene("15202");
    expect(scene?.id).toBe("15202");
    expect(queryFindScenesByID).toHaveBeenCalledWith([15202]);
  });
});
