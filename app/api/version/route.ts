export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    {
      sha:
        process.env.VERCEL_GIT_COMMIT_SHA ??
        process.env.RENDER_GIT_COMMIT ??
        process.env.TALOS_BUILD_SHA ??
        "development-unverified",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
