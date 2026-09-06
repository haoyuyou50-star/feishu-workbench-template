const FEISHU_APPLINK_ORIGIN = "https://applink.feishu.cn";

export function createDocsAppLink(targetUrl) {
  const appLink = new URL("/client/docs/open", FEISHU_APPLINK_ORIGIN);
  appLink.searchParams.set("url", targetUrl);
  return appLink.toString();
}

export function toNativeFeishuSchema(appLink) {
  if (!appLink?.startsWith(`${FEISHU_APPLINK_ORIGIN}/`)) return appLink;
  return `feishu://${appLink.slice("https://".length)}`;
}

export function openFeishuDestination(destination, browserWindow = globalThis.window) {
  if (!destination || !browserWindow) return "unavailable";
  const target = typeof destination === "string"
    ? { appLink: destination, webHref: destination }
    : destination;
  const appLink = target.appLink || target.webHref;
  const webHref = target.webHref || appLink;
  if (!appLink) return "unavailable";

  const client = browserWindow.tt;
  if (typeof client?.openSchema === "function") {
    const fallback = () => browserWindow.location.assign(webHref);
    try {
      client.openSchema({
        schema: toNativeFeishuSchema(appLink),
        external: true,
        fail: fallback,
      });
      return "native";
    } catch {
      fallback();
      return "web";
    }
  }

  browserWindow.location.assign(appLink);
  return "applink";
}
