import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  destroyMarkerBadges,
  mountMarkerBadges,
  refreshMarkerBadges
} from "../markerBadgesDom";
import { BADGE_CLASS, BADGE_MARKER_ATTR } from "../constants";

const mutateRunPluginOperation = vi.fn();

describe("markerBadgesDom", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    mutateRunPluginOperation.mockResolvedValue({
      output: {
        transforms: {
          "101": "rotate_left_scale",
          "102": "rotate_right_scale"
        }
      }
    });

    (window as any).PluginApi = {
      utils: {
        InteractiveUtils: {
          getPlayer: () => ({
            duration: () => 100
          })
        },
        StashService: { mutateRunPluginOperation }
      }
    };
  });

  afterEach(() => {
    destroyMarkerBadges();
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("adds badges to wall placards and timeline markers", async () => {
    document.body.innerHTML = `
      <div id="scene-markers-panel" class="scene-markers-panel">
        <div class="primary-card-body">
          <div>
            <div class="d-flex align-items-center">
              <div>00:00:10 - 00:00:20</div>
            </div>
          </div>
          <div>
            <div class="d-flex align-items-center">
              <div>00:00:50</div>
            </div>
          </div>
        </div>
        <div class="wall-item">
          <div class="wall-item-container">
            <img src="/scene/1/scene_marker/101/screenshot" />
          </div>
        </div>
      </div>
      <div id="VideoJsPlayer">
        <div class="vjs-progress-holder">
          <div class="vjs-marker" style="left: calc(10% - 3px);"></div>
        </div>
        <div class="vjs-progress-control">
          <div class="vjs-marker-range" style="left: calc(50% - 3px);"></div>
        </div>
      </div>
    `;

    const scene = {
      id: "1",
      scene_markers: [
        { id: "101", seconds: 10, end_seconds: 20 },
        { id: "102", seconds: 50 }
      ]
    };

    mountMarkerBadges(scene);
    await vi.waitUntil(
      () => document.querySelectorAll(`.${BADGE_CLASS}`).length >= 4,
      { timeout: 2000 }
    );

    const placardBadge = document.querySelector(
      `.wall-item-container .${BADGE_CLASS}[${BADGE_MARKER_ATTR}="101"]`
    );
    expect(placardBadge?.textContent).toBe("↺");

    const listBadge = document.querySelector(
      `.primary-card-body .d-flex.align-items-center > .${BADGE_CLASS}[${BADGE_MARKER_ATTR}="101"]`
    );
    expect(listBadge?.textContent).toBe("↺");
    expect(listBadge?.parentElement?.classList.contains("d-flex")).toBe(true);

    expect(document.querySelector(`.vjs-marker .${BADGE_CLASS}`)).toBeNull();

    const dotBadge = document.querySelector(
      `.stashangle-timeline-badge-layer .${BADGE_CLASS}[${BADGE_MARKER_ATTR}="101"]`
    );
    expect(dotBadge?.textContent).toBe("↺");

    const rangeBadge = document.querySelector(
      `.stashangle-timeline-badge-layer .${BADGE_CLASS}[${BADGE_MARKER_ATTR}="102"]`
    );
    expect(rangeBadge?.textContent).toBe("↻");
  });

  it("removes badges when transforms are cleared", async () => {
    document.body.innerHTML = `
      <div id="scene-markers-panel" class="scene-markers-panel">
        <div class="wall-item">
          <div class="wall-item-container">
            <img src="/scene/1/scene_marker/101/screenshot" />
          </div>
        </div>
      </div>
    `;

    const scene = {
      id: "1",
      scene_markers: [{ id: "101", seconds: 10 }]
    };

    mountMarkerBadges(scene);
    await vi.waitUntil(() => document.querySelector(`.${BADGE_CLASS}`) !== null, {
      timeout: 2000
    });

    mutateRunPluginOperation.mockResolvedValue({
      output: { transforms: {} }
    });

    destroyMarkerBadges();
    mountMarkerBadges(scene);
    await vi.waitUntil(() => document.querySelector(`.${BADGE_CLASS}`) === null, {
      timeout: 2000
    });

    refreshMarkerBadges();
    expect(document.querySelector(`.${BADGE_CLASS}`)).toBeNull();
  });
});
