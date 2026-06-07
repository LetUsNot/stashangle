declare global {
  interface Window {
    PluginApi?: any;
  }
}

export function getPluginApi(): any {
  if (!window.PluginApi) {
    throw new Error("PluginApi is not available.");
  }
  return window.PluginApi;
}
