import { PLUGIN_ID } from "./types";

const JOB_POLL_MS = 200;
const JOB_TIMEOUT_MS = 15_000;

type JobStatus = "READY" | "RUNNING" | "FINISHED" | "STOPPING" | "CANCELLED" | "FAILED";

export type PluginJobResult = {
  status: JobStatus;
  error?: string | null;
  description?: string | null;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export async function waitForPluginJob(api: any, jobId: string): Promise<PluginJobResult> {
  const client = api?.utils?.StashService?.getClient?.();
  const findJobDocument = api?.GQL?.FindJobDocument;
  if (!client || !findJobDocument) {
    throw new Error("FindJobDocument unavailable");
  }

  const started = Date.now();
  while (Date.now() - started < JOB_TIMEOUT_MS) {
    const response = await client.query({
      query: findJobDocument,
      variables: { input: { id: jobId } },
      fetchPolicy: "network-only"
    });
    const job = response?.data?.findJob as PluginJobResult | undefined;
    const status = job?.status;
    if (status === "FINISHED") {
      return {
        status,
        error: job?.error ?? null,
        description: job?.description ?? null
      };
    }
    if (status === "FAILED" || status === "CANCELLED") {
      throw new Error(job?.error ?? `Plugin job ${status}`);
    }
    await sleep(JOB_POLL_MS);
  }

  throw new Error("Plugin job timed out");
}

export async function queuePluginTask(
  api: any,
  args: Record<string, unknown>
): Promise<string | null> {
  const client = api?.utils?.StashService?.getClient?.();
  const taskDocument = api?.GQL?.RunPluginTaskDocument;
  if (!client || !taskDocument) {
    const mutateRunPluginTask = api?.utils?.StashService?.mutateRunPluginTask;
    if (typeof mutateRunPluginTask !== "function") {
      throw new Error("RunPluginTaskDocument unavailable");
    }
    const result = await mutateRunPluginTask(PLUGIN_ID, "Storage", args);
    if (typeof result === "object" && result !== null && "data" in result) {
      return (result as { data?: { runPluginTask?: string } }).data?.runPluginTask ?? null;
    }
    return typeof result === "string" ? result : null;
  }

  const response = await client.mutate({
    mutation: taskDocument,
    variables: {
      plugin_id: PLUGIN_ID,
      task_name: "Storage",
      args_map: args
    }
  });
  return response?.data?.runPluginTask ?? null;
}

export async function runPluginTaskAndWait(
  api: any,
  args: Record<string, unknown>
): Promise<{ jobId: string | null; job: PluginJobResult }> {
  const jobId = await queuePluginTask(api, args);
  if (!jobId) {
    throw new Error("Plugin task did not return a job id");
  }
  const job = await waitForPluginJob(api, jobId);
  if (job.error) {
    throw new Error(job.error);
  }
  return { jobId, job };
}
