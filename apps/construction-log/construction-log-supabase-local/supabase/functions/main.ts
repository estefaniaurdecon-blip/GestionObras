import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const routes: Record<
  string,
  () => Promise<{ default: (req: Request) => Response | Promise<Response> }>
> = {
  "analyze-inventory": () =>
    import(new URL("./analyze-inventory/index.ts", import.meta.url).href),
  "analyze-invoice": () =>
    import(new URL("./analyze-invoice/index.ts", import.meta.url).href),
  "analyze-logo-colors": () =>
    import(new URL("./analyze-logo-colors/index.ts", import.meta.url).href),
  "analyze-work-image": () =>
    import(new URL("./analyze-work-image/index.ts", import.meta.url).href),
  "auto-duplicate-rental-machinery": () =>
    import(
      new URL("./auto-duplicate-rental-machinery/index.ts", import.meta.url)
        .href
    ),
  "check-calendar-tasks": () =>
    import(new URL("./check-calendar-tasks/index.ts", import.meta.url).href),
  "check-document-expiry": () =>
    import(new URL("./check-document-expiry/index.ts", import.meta.url).href),
  "check-pending-work-reports": () =>
    import(
      new URL("./check-pending-work-reports/index.ts", import.meta.url).href
    ),
  "check-updates": () =>
    import(new URL("./check-updates/index.ts", import.meta.url).href),
  "clean-inventory": () =>
    import(new URL("./clean-inventory/index.ts", import.meta.url).href),
  "construction-chat": () =>
    import(new URL("./construction-chat/index.ts", import.meta.url).href),
  "create-admin-user": () =>
    import(new URL("./create-admin-user/index.ts", import.meta.url).href),
  "detect-work-anomalies": () =>
    import(new URL("./detect-work-anomalies/index.ts", import.meta.url).href),
  "fix-user-metadata": () =>
    import(new URL("./fix-user-metadata/index.ts", import.meta.url).href),
  "generate-access-control": () =>
    import(new URL("./generate-access-control/index.ts", import.meta.url).href),
  "generate-summary-report": () =>
    import(new URL("./generate-summary-report/index.ts", import.meta.url).href),
  "populate-inventory-from-reports": () =>
    import(
      new URL("./populate-inventory-from-reports/index.ts", import.meta.url)
        .href
    ),
  "publish-update": () =>
    import(new URL("./publish-update/index.ts", import.meta.url).href),
  "send-daily-reminders": () =>
    import(new URL("./send-daily-reminders/index.ts", import.meta.url).href),
  "standardize-companies": () =>
    import(new URL("./standardize-companies/index.ts", import.meta.url).href),
  "voice-fill-sections": () =>
    import(new URL("./voice-fill-sections/index.ts", import.meta.url).href),
};

const port = Number(Deno.env.get("PORT") ?? "9000");

serve(
  async (req: Request) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/+/, "");
  const fnName = path.split("/")[0];

  if (!fnName) {
    return new Response("Not Found", { status: 404 });
  }

  const loader = routes[fnName];
  if (!loader) {
    return new Response("Not Found", { status: 404 });
  }

    try {
      const mod = await loader();
      if (typeof mod.default !== "function") {
        return new Response("Function missing default export", { status: 500 });
      }
      return await mod.default(req);
    } catch (err) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as Error).message)
          : String(err);
      return new Response(`Function error: ${message}`, { status: 500 });
    }
  },
  { hostname: "0.0.0.0", port }
);
