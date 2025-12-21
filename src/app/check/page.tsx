import { getLawProfile } from "@/lib/lawStore";
import { computeStatus } from "@/lib/status";

export const runtime = "nodejs";

type SP = { country?: string; region?: string };

export default async function CheckPage({
  searchParams
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;

  const rawCountry = (sp.country ?? "US").trim().toUpperCase();
  const rawRegion = (sp.region ?? "CA").trim().toUpperCase();

  const country = rawCountry || "US";
  const region = rawRegion || "CA";

  const profile = getLawProfile({
    country,
    region: country === "US" ? region : undefined
  });

  if (!profile) {
    return (
      <main style={{ padding: 24, fontFamily: "system-ui" }}>
        <h1>isLegalCannabis — Check</h1>
        <p>Not found. Try:</p>
        <ul>
          <li><code>/check?country=US&amp;region=CA</code></li>
          <li><code>/check?country=DE</code></li>
        </ul>
      </main>
    );
  }

  const status = computeStatus(profile);

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>isLegalCannabis — Check</h1>

      <p>
        Jurisdiction: <b>{profile.id}</b>
      </p>

      <p>
        Status: <b>{status.label}</b>
      </p>

      <pre style={{ padding: 16, border: "1px solid #ddd", borderRadius: 12, overflow: "auto" }}>
        {JSON.stringify(profile, null, 2)}
      </pre>

      <p style={{ marginTop: 16 }}>
        Try:{" "}
        <code>/check?country=US&amp;region=CA</code>{" "}
        <code>/check?country=DE</code>
      </p>
    </main>
  );
}
