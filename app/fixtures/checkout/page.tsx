import { FixtureCheckout } from "@/components/fixture-checkout";

export const dynamic = "force-dynamic";

export default async function CheckoutFixturePage({
  searchParams,
}: {
  searchParams: Promise<{ variant?: string | string[] }>;
}) {
  const query = await searchParams;
  const requestedVariant = Array.isArray(query.variant)
    ? query.variant[0]
    : query.variant;
  const variant = requestedVariant === "candidate" ? "candidate" : "baseline";
  const buildSha =
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.TALOS_BUILD_SHA ??
    "development-unverified";

  return <FixtureCheckout variant={variant} buildSha={buildSha} />;
}
