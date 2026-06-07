import { getPluginApi } from "./pluginApi";
import { SceneLike } from "./types";

function normalizeScene(raw: any): SceneLike | null {
  if (!raw?.id) return null;
  return {
    id: String(raw.id),
    files: raw.files,
    scene_markers: raw.scene_markers ?? []
  };
}

export function sceneFromId(sceneId: string): SceneLike {
  return { id: sceneId, scene_markers: [], files: [] };
}

export async function fetchScene(sceneId: string): Promise<SceneLike | null> {
  const api = getPluginApi();
  const stash = api?.utils?.StashService;
  if (!stash) {
    return null;
  }

  const client = stash.getClient?.();
  const findSceneDocument = api?.GQL?.FindSceneDocument;
  if (client && findSceneDocument) {
    try {
      const response = await client.query({
        query: findSceneDocument,
        variables: { id: sceneId },
        fetchPolicy: "network-only"
      });
      const scene = normalizeScene(response?.data?.findScene);
      if (scene) {
        return scene;
      }
    } catch {
      // Fall through to legacy query.
    }
  }

  const queryFindScenesByID = stash.queryFindScenesByID;
  if (typeof queryFindScenesByID === "function") {
    const numericId = Number(sceneId);
    if (Number.isFinite(numericId)) {
      try {
        const response = await queryFindScenesByID([numericId]);
        const scene = normalizeScene(response?.data?.findScenes?.scenes?.[0]);
        if (scene) {
          return scene;
        }
      } catch {
        // Fall through.
      }
    }
  }

  return null;
}
