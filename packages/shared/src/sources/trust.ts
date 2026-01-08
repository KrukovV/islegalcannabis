export function scoreUrl(url: string): number {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return 0.4;
  }
  if (host.startsWith("www.")) {
    host = host.slice(4);
  }

  const highTrustPatterns = [
    ".gov",
    ".gouv.",
    ".gob.",
    ".bund.de",
    ".admin.ch",
    ".gov.uk",
    ".gov.au",
    ".govt.nz",
    ".gc.ca",
    ".gov.sg",
    ".gov.il",
    ".gov.za",
    ".gov.ph",
    ".go.jp",
    ".go.kr",
    ".go.id",
    ".go.th"
  ];

  const isHighTrust = highTrustPatterns.some((pattern) => {
    if (host === pattern) {
      return true;
    }
    if (pattern.startsWith(".")) {
      const bare = pattern.slice(1);
      if (host === bare) {
        return true;
      }
    }
    return host.includes(pattern) || host.endsWith(pattern);
  });

  if (isHighTrust) {
    return 1.0;
  }

  const officialPortals = new Set([
    "government.nl",
    "service-public.fr",
    "governo.it",
    "portugal.gov.pt",
    "gov.pl",
    "gov.ie",
    "regjeringen.no",
    "government.se",
    "borger.dk",
    "oesterreich.gv.at",
    "vlada.cz",
    "bund.de",
    "admin.ch",
    "u.ae",
    "vietnam.gov.vn",
    "indonesia.go.id",
    "malaysia.gov.my",
    "turkiye.gov.tr",
    "gov.il",
    "gov.sg",
    "gov.za",
    "canada.ca",
    "thaigov.go.th",
    "myflorida.com"
  ]);

  if (officialPortals.has(host)) {
    return 0.7;
  }

  return 0.4;
}
