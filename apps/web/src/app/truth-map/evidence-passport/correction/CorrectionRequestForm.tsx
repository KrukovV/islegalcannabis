"use client";

import { useState, type FormEvent } from "react";

type Receipt = {
  receiptId: string;
  candidate: { geo: string };
  provenance: { classification: string; candidateSha256: string };
  review: { state: string };
  outcome: { state: string };
};

export default function CorrectionRequestForm({ geos, initialGeo }: { geos: Array<{ geo: string; territory: string }>; initialGeo: string }) {
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    setReceipt(null);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/truth-map/b2b/correction-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(form.entries()))
    });
    const payload = await response.json() as Receipt & { error?: string };
    if (!response.ok) setError(payload.error || "Correction request was rejected.");
    else setReceipt(payload);
    setPending(false);
  }
  return <form onSubmit={submit} data-testid="correction-request-form">
    <label htmlFor="correction-geo">Jurisdiction</label>
    <select id="correction-geo" name="geo" defaultValue={initialGeo}>{geos.map((entry) => <option key={entry.geo} value={entry.geo}>{entry.territory} ({entry.geo})</option>)}</select>
    <label htmlFor="correction-organization">Submitting organization</label>
    <input id="correction-organization" name="organization" maxLength={180} required />
    <label htmlFor="correction-source">Official HTTPS source</label>
    <input id="correction-source" name="sourceUrl" type="url" pattern="https://.*" maxLength={2048} required />
    <label htmlFor="correction-licence">Licence or publication reference</label>
    <input id="correction-licence" name="licenceReference" maxLength={180} />
    <label htmlFor="correction-note">What should be independently checked?</label>
    <textarea id="correction-note" name="note" maxLength={2000} />
    <button type="submit" disabled={pending}>{pending ? "Recording candidate…" : "Submit unverified candidate"}</button>
    {error ? <p role="alert">{error}</p> : null}
    {receipt ? <section data-testid="correction-request-receipt"><strong>Candidate recorded — no automatic change</strong><p>Receipt: <code>{receipt.receiptId}</code></p><p>{receipt.candidate.geo} · {receipt.provenance.classification} · {receipt.review.state} · {receipt.outcome.state}</p><p>Candidate SHA-256: <code>{receipt.provenance.candidateSha256}</code></p></section> : null}
  </form>;
}
