import { parseProviderEnvironment } from "@/lib/config";

export const dynamic = "force-dynamic";

export function GET() {
  const environment = parseProviderEnvironment(process.env);
  const providers = Object.fromEntries(
    Object.entries(environment.report.providers).map(([name, capability]) => [
      name,
      {
        requiredForCore: capability.requiredForCore,
        status: capability.status,
      },
    ]),
  );

  return Response.json(
    {
      ok: true,
      service: "talos",
      core: environment.report.core,
      providers,
      build:
        process.env.VERCEL_GIT_COMMIT_SHA ??
        process.env.RENDER_GIT_COMMIT ??
        process.env.TALOS_BUILD_SHA ??
        "development-unverified",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
