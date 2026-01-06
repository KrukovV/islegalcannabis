const fs = require("node:fs");
const path = require("node:path");

const SEED_ALPHA2 = [
  "AF","AX","AL","DZ","AS","AD","AO","AI","AQ","AG","AR","AM","AW","AU","AT","AZ",
  "BS","BH","BD","BB","BY","BE","BZ","BJ","BM","BT","BO","BQ","BA","BW","BV","BR",
  "IO","BN","BG","BF","BI","KH","CM","CA","CV","KY","CF","TD","CL","CN","CX","CC",
  "CO","KM","CG","CD","CK","CR","CI","HR","CU","CW","CY","CZ","DK","DJ","DM","DO",
  "EC","EG","SV","GQ","ER","EE","SZ","ET","FK","FO","FJ","FI","FR","GF","PF","TF",
  "GA","GM","GE","DE","GH","GI","GR","GL","GD","GP","GU","GT","GG","GN","GW","GY",
  "HT","HM","VA","HN","HK","HU","IS","IN","ID","IR","IQ","IE","IM","IL","IT","JM",
  "JP","JE","JO","KZ","KE","KI","KP","KR","KW","KG","LA","LV","LB","LS","LR","LY",
  "LI","LT","LU","MO","MG","MW","MY","MV","ML","MT","MH","MQ","MR","MU","YT","MX",
  "FM","MD","MC","MN","ME","MS","MA","MZ","MM","NA","NR","NP","NL","NC","NZ","NI",
  "NE","NG","NU","NF","MK","MP","NO","OM","PK","PW","PS","PA","PG","PY","PE","PH",
  "PN","PL","PT","PR","QA","RE","RO","RU","RW","BL","SH","KN","LC","MF","PM","VC",
  "WS","SM","ST","SA","SN","RS","SC","SL","SG","SX","SK","SI","SB","SO","ZA","GS",
  "SS","ES","LK","SD","SR","SJ","SE","CH","SY","TW","TJ","TZ","TH","TL","TG","TK",
  "TO","TT","TN","TR","TM","TC","TV","UG","UA","AE","GB","UM","US","UY","UZ","VU",
  "VE","VN","VG","VI","WF","EH","YE","ZM","ZW"
];

function validateSeed(list) {
  if (!Array.isArray(list)) {
    throw new Error("Seed list must be an array.");
  }
  if (list.length !== 249) {
    throw new Error(`Seed list must contain 249 codes, got ${list.length}.`);
  }
  const seen = new Set();
  for (const code of list) {
    if (!/^[A-Z]{2}$/.test(code)) {
      throw new Error(`Invalid alpha-2 code: ${code}`);
    }
    if (seen.has(code)) {
      throw new Error(`Duplicate alpha-2 code: ${code}`);
    }
    seen.add(code);
  }
}

function buildPayload() {
  const sorted = [...SEED_ALPHA2].sort();
  validateSeed(sorted);
  const now = new Date().toISOString().slice(0, 10);
  return {
    version: "iso3166-1",
    generated_at: now,
    source_note: "Curated list of ISO 3166-1 alpha-2 codes (249 entries).",
    alpha2: sorted
  };
}

function writeFileIfChanged(filePath, payload) {
  const nextContent = JSON.stringify(payload, null, 2) + "\n";
  if (fs.existsSync(filePath)) {
    const current = fs.readFileSync(filePath, "utf-8");
    if (current === nextContent) {
      console.log("iso3166-1.json unchanged.");
      return;
    }
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, nextContent, "utf-8");
  console.log("iso3166-1.json written.");
}

function main() {
  const outputPath = path.join(
    process.cwd(),
    "data",
    "iso3166",
    "iso3166-1.json"
  );
  const payload = buildPayload();
  writeFileIfChanged(outputPath, payload);
}

main();
