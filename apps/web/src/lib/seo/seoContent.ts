import type { JurisdictionLawProfile, ResultStatusLevel } from "@islegal/shared";
import { computeStatus, STATUS_BANNERS } from "@islegal/shared";
import { buildBullets, buildRisks } from "@/lib/summary";
import {
  extrasStatusToLevel,
  formatExtrasValue,
  getExtrasStatus
} from "@/lib/extras";

type StatusInfo = {
  level: ResultStatusLevel;
  label: string;
};

type SeoContent = {
  status: StatusInfo;
  bullets: string[];
  risks: string[];
};

function toBulletLines(profile: JurisdictionLawProfile, limit = 6) {
  return buildBullets(profile)
    .map((item) => `${item.label}: ${item.value}`)
    .slice(0, limit);
}

export function buildWeedSeo(profile: JurisdictionLawProfile): SeoContent {
  const status = computeStatus(profile);
  return {
    status: { level: status.level, label: status.label },
    bullets: toBulletLines(profile, 6),
    risks: buildRisks(profile).slice(0, 4)
  };
}

export function buildExtrasSeo(
  profile: JurisdictionLawProfile,
  key: string,
  label: string
): SeoContent {
  if (profile.status === "provisional") {
    return {
      status: {
        level: "yellow",
        label: STATUS_BANNERS.provisional.title
      },
      bullets: [
        `${label}: Unverified`,
        ...toBulletLines(profile, 5)
      ].slice(0, 6),
      risks: buildRisks(profile).slice(0, 4)
    };
  }
  if (profile.status === "needs_review") {
    return {
      status: {
        level: "gray",
        label: STATUS_BANNERS.needs_review.title
      },
      bullets: toBulletLines(profile, 6),
      risks: buildRisks(profile).slice(0, 4)
    };
  }

  const raw = getExtrasStatus(profile, key);
  const statusLabel = formatExtrasValue(raw);
  const level = extrasStatusToLevel(raw);
  return {
    status: {
      level,
      label: `${label}: ${statusLabel}`
    },
    bullets: [
      `${label}: ${statusLabel}`,
      ...toBulletLines(profile, 5)
    ].slice(0, 6),
    risks: buildRisks(profile).slice(0, 4)
  };
}

export function buildFaqJsonLd(params: {
  title: string;
  status: string;
  bullets: string[];
  risks: string[];
}) {
  const possession = params.bullets.find((item) =>
    item.toLowerCase().startsWith("possession limit")
  );
  const publicUse = params.bullets.find((item) =>
    item.toLowerCase().startsWith("public use")
  );
  const risksText = params.risks.length ? params.risks.join(" ") : "Not specified.";

  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": params.title,
        "acceptedAnswer": {
          "@type": "Answer",
          "text": params.status
        }
      },
      {
        "@type": "Question",
        "name": "What is the possession limit?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": possession ?? "Not specified."
        }
      },
      {
        "@type": "Question",
        "name": "Is public use allowed?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": publicUse ?? "Not specified."
        }
      },
      {
        "@type": "Question",
        "name": "What are the key legal risks?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": risksText
        }
      }
    ]
  };
}

export function buildBreadcrumbs(params: {
  place: string;
  placeHref: string;
  current: string;
}) {
  return [
    { label: "Home", href: "/" },
    { label: params.place, href: params.placeHref },
    { label: params.current, href: "#" }
  ];
}
