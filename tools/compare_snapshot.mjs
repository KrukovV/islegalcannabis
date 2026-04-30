import fs from "node:fs";
import path from "node:path";

const snapshotPath = path.resolve(process.cwd(), "apps/web/src/data/legalSnapshot.json");
const targetUrl = process.env.NEW_MAP_COMPARE_URL || "https://www.islegal.info/api/new-map/countries";

const localSnapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
const response = await fetch(targetUrl, { cache: "no-store" });
if (!response.ok) {
  throw new Error(`COMPARE_SNAPSHOT_FAIL status=${response.status} url=${targetUrl}`);
}
const remoteSnapshot = await response.json();

const localByGeo = new Map(
  (Array.isArray(localSnapshot?.features) ? localSnapshot.features : []).map((feature) => [
    String(feature?.properties?.geo || ""),
    String(feature?.properties?.mapCategory || "")
  ])
);

const remoteByGeo = new Map(
  (Array.isArray(remoteSnapshot?.features) ? remoteSnapshot.features : []).map((feature) => [
    String(feature?.properties?.geo || ""),
    String(feature?.properties?.mapCategory || "")
  ])
);

const mismatches = [];
for (const [geo, localCategory] of localByGeo.entries()) {
  const remoteCategory = remoteByGeo.get(geo);
  if (remoteCategory !== localCategory) {
    mismatches.push({ geo, local: localCategory, remote: remoteCategory || "MISSING" });
  }
}

console.log(`COMPARE_SNAPSHOT total=${localByGeo.size} mismatches=${mismatches.length} url=${targetUrl}`);
if (mismatches.length) {
  console.log(JSON.stringify(mismatches.slice(0, 50), null, 2));
  process.exit(1);
}
