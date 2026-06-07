import { PLUGIN_ID } from "./types";

const RUN_PLUGIN_OPERATION = `
mutation StashangleRunPluginOperation($plugin_id: ID!, $args: Map) {
  runPluginOperation(plugin_id: $plugin_id, args: $args)
}
`;

function getApolloGql(api: any): ((strings: TemplateStringsArray, ...expr: unknown[]) => unknown) | null {
  const apollo = api?.libraries?.Apollo;
  if (!apollo) return null;
  if (typeof apollo.gql === "function") return apollo.gql;
  if (typeof apollo.default?.gql === "function") return apollo.default.gql;
  return null;
}

export async function runPluginOperationViaApollo(
  api: any,
  args: Record<string, unknown>
): Promise<unknown> {
  const stash = api?.utils?.StashService;
  const client = stash?.getClient?.();
  if (!client || typeof client.mutate !== "function") {
    throw new Error("Apollo client unavailable");
  }

  const variables = { plugin_id: PLUGIN_ID, args };
  const operationDoc = api?.GQL?.RunPluginOperationDocument;
  if (operationDoc) {
    const response = await client.mutate({ mutation: operationDoc, variables });
    return response?.data?.runPluginOperation;
  }

  const gql = getApolloGql(api);
  if (!gql) {
    throw new Error("Apollo gql unavailable");
  }

  const response = await client.mutate({
    mutation: gql`
      mutation StashangleRunPluginOperation($plugin_id: ID!, $args: Map) {
        runPluginOperation(plugin_id: $plugin_id, args: $args)
      }
    `,
    variables
  });
  return response?.data?.runPluginOperation;
}

export async function runPluginOperationRequest(
  args: Record<string, unknown>
): Promise<unknown> {
  const response = await fetch("/graphql", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      operationName: "StashangleRunPluginOperation",
      query: RUN_PLUGIN_OPERATION,
      variables: { plugin_id: PLUGIN_ID, args }
    })
  });

  const bodyText = await response.text();
  let json: {
    data?: { runPluginOperation?: unknown };
    errors?: Array<{ message?: string }>;
  } = {};

  try {
    json = bodyText ? JSON.parse(bodyText) : {};
  } catch {
    throw new Error(`GraphQL HTTP ${response.status}: ${bodyText.slice(0, 240)}`);
  }

  if (!response.ok) {
    const message = json.errors?.[0]?.message ?? bodyText.slice(0, 240);
    throw new Error(`GraphQL HTTP ${response.status}: ${message}`);
  }

  if (Array.isArray(json.errors) && json.errors.length > 0) {
    throw new Error(json.errors[0]?.message ?? "GraphQL error");
  }

  return json.data?.runPluginOperation;
}

export async function runPluginStorageOperation(
  api: any,
  args: Record<string, unknown>
): Promise<unknown> {
  const stash = api?.utils?.StashService;
  const mutateRunPluginOperation = stash?.mutateRunPluginOperation;
  if (typeof mutateRunPluginOperation === "function") {
    return mutateRunPluginOperation(PLUGIN_ID, args);
  }

  try {
    return await runPluginOperationViaApollo(api, args);
  } catch {
    // Fall through to raw GraphQL fetch.
  }

  return runPluginOperationRequest(args);
}
