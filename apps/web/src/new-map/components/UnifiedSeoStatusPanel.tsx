"use client";

import Link from "next/link";
import type { CountryPageData } from "@/lib/countryPageStorage";
import { buildCountryIntentSections } from "@/lib/seo/countryIntentContent";
import { deriveResultStatusFromCountryPageData } from "@/lib/resultStatus";
import styles from "../MapRoot.module.css";

function humanStatus(status: ReturnType<typeof deriveResultStatusFromCountryPageData>) {
  if (status === "LEGAL") return "Legal";
  if (status === "MIXED") return "Mixed or partly allowed";
  if (status === "DECRIM") return "Decriminalized";
  if (status === "ILLEGAL") return "Illegal";
  return "No reliable data";
}

function summaryText(data: CountryPageData) {
  const rec = data.legal_model.recreational.status;
  const med = data.legal_model.medical.status;
  const distribution = data.legal_model.distribution.status;
  return `${rec} recreational status, ${med} medical access, ${distribution} distribution status.`;
}

function statusReasons(data: CountryPageData) {
  const reasons: Array<{ id: string; text: string; href: string }> = [];
  if (data.legal_model.recreational.status === "ILLEGAL") {
    reasons.push({ id: "rec", text: "Recreational use remains illegal.", href: `/c/${data.code}#law-recreational` });
  }
  if (data.legal_model.medical.status === "LEGAL" || data.legal_model.medical.status === "LIMITED") {
    reasons.push({ id: "med", text: "Medical access is available.", href: `/c/${data.code}#law-medical` });
  }
  if (data.legal_model.distribution.status === "illegal" || data.legal_model.distribution.status === "restricted") {
    reasons.push({ id: "dist", text: "Sale and distribution remain restricted.", href: `/c/${data.code}#law-distribution` });
  }
  if (data.legal_model.signals?.penalties?.prison) {
    reasons.push({ id: "prison", text: "Prison exposure is present in the stored law signals.", href: `/c/${data.code}#law-risk` });
  }
  if (data.legal_model.signals?.enforcement_level === "rare" || data.legal_model.signals?.enforcement_level === "unenforced") {
    reasons.push({ id: "enforcement", text: "Enforcement is often limited in practice.", href: `/c/${data.code}#law-risk` });
  }
  return reasons.slice(0, 4);
}

export default function UnifiedSeoStatusPanel({
  data,
  onClose
}: {
  data: CountryPageData;
  onClose: () => void;
}) {
  const status = deriveResultStatusFromCountryPageData(data);
  const intents = buildCountryIntentSections(data);
  const reasons = statusReasons(data);

  return (
    <aside className={styles.seoOverlayPanel} data-testid="new-map-seo-overlay">
      <div className={styles.seoPanelHeader}>
        <div>
          <div className={styles.eyebrow}>{data.node_type === "state" ? "State View" : "Country View"}</div>
          <div className={styles.unifiedPanelStatusRow}>
            <span className={styles.unifiedPanelStatusDot} data-level={status} aria-hidden="true" />
            <h2 className={styles.unifiedPanelStatusTitle}>{humanStatus(status)}</h2>
          </div>
          <p className={styles.seoPanelIntro}>{summaryText(data)}</p>
        </div>
        <button type="button" className={styles.seoPanelClose} onClick={onClose} aria-label="Close country info">
          ×
        </button>
      </div>

      <section className={styles.seoPanelSection}>
        <h3 className={styles.seoPanelSubheading}>Status</h3>
        <ul className={styles.seoPanelList}>
          {reasons.map((reason) => (
            <li key={reason.id}>
              <Link href={reason.href}>{reason.text}</Link>
            </li>
          ))}
        </ul>
        <p className={styles.seoPanelIntro}>{data.notes_normalized}</p>
      </section>

      <section className={styles.seoPanelSection}>
        <h3 className={styles.seoPanelSubheading}>Intent</h3>
        {intents.map((intent) => (
          <div key={intent.id} className={styles.unifiedPanelIntentBlock}>
            <p className={styles.unifiedPanelIntentTitle}>{intent.heading}</p>
            <p>{intent.body}</p>
          </div>
        ))}
      </section>

      <section className={styles.seoPanelSection}>
        <h3 className={styles.seoPanelSubheading}>Related</h3>
        <ul className={styles.seoPanelList}>
          {data.related_names.map((item) => (
            <li key={item.code}>
              <Link href={`/c/${item.code}`}>{item.name}</Link>
            </li>
          ))}
        </ul>
      </section>

      {data.sources.citations.length > 0 ? (
        <section className={styles.seoPanelSection}>
          <h3 className={styles.seoPanelSubheading}>Sources</h3>
          <ul className={styles.seoPanelList}>
            {data.sources.citations.map((source) => (
              <li key={source.id}>
                <a href={source.url} rel="nofollow noopener noreferrer" target="_blank">
                  {source.title}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </aside>
  );
}
