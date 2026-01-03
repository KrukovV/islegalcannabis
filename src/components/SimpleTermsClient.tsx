"use client";

import { useState } from "react";
import styles from "./SimpleTerms.module.css";

type SimpleTermsClientProps = {
  country: string;
  region?: string;
  locale?: string;
  fallbackText: string;
};

export default function SimpleTermsClient({
  country,
  region,
  locale = "en",
  fallbackText
}: SimpleTermsClientProps) {
  const [text, setText] = useState(fallbackText);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/paraphrase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ country, region, locale })
      });

      const data = (await response.json()) as {
        ok: boolean;
        text?: string;
        error?: string;
      };

      if (!response.ok || !data.ok || !data.text) {
        setError(data.error ?? "Unable to generate explanation.");
        return;
      }

      setText(data.text);
    } catch {
      setError("Unable to generate explanation.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.wrapper}>
      <h2>In simple terms</h2>
      <p className={styles.text}>{text}</p>
      {error ? <p className={styles.error}>{error}</p> : null}
      <button
        className={styles.button}
        type="button"
        onClick={handleClick}
        disabled={loading}
        aria-busy={loading}
      >
        {loading ? "Generating..." : "Generate simple explanation"}
      </button>
      <p className={styles.note}>Educational only. Not legal advice.</p>
    </div>
  );
}
