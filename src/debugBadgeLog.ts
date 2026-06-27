type DebugBadgePayload = {
  hypothesisId: string;
  location: string;
  message: string;
  data?: Record<string, unknown>;
  runId?: string;
};

type DebugBadgeEntry = DebugBadgePayload & {
  timestamp: number;
  sessionId: string;
};

declare global {
  interface Window {
    __stashangleDebugDb83ad?: DebugBadgeEntry[];
    __stashangleBadgeDiag?: () => {
      count: number;
      latest: DebugBadgeEntry | null;
      byHypothesis: Record<string, DebugBadgeEntry[]>;
      all: DebugBadgeEntry[];
    };
  }
}

const INGEST_URL =
  "http://127.0.0.1:7651/ingest/0e4549b0-a85f-4652-b8cb-3274bd010493";

let diagHelperInstalled = false;

function installDiagHelper(): void {
  if (diagHelperInstalled) return;
  diagHelperInstalled = true;

  window.__stashangleBadgeDiag = () => {
    const all = window.__stashangleDebugDb83ad ?? [];
    const byHypothesis: Record<string, DebugBadgeEntry[]> = {};
    for (const entry of all) {
      (byHypothesis[entry.hypothesisId] ??= []).push(entry);
    }
    return {
      count: all.length,
      latest: all.length > 0 ? all[all.length - 1]! : null,
      byHypothesis,
      all
    };
  };
}

export function debugBadgeLog(payload: DebugBadgePayload): void {
  installDiagHelper();

  const entry: DebugBadgeEntry = {
    ...payload,
    timestamp: Date.now(),
    sessionId: "db83ad"
  };
  const bucket = (window.__stashangleDebugDb83ad ??= []);
  bucket.push(entry);
  if (bucket.length > 200) {
    bucket.splice(0, bucket.length - 200);
  }

  // #region agent log
  console.warn("[Stashangle-debug-db83ad]", entry);
  fetch(INGEST_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "db83ad"
    },
    body: JSON.stringify(entry)
  }).catch(() => {});
  // #endregion
}
