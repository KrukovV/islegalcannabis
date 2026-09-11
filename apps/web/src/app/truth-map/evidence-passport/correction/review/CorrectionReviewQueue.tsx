"use client";

import { useState, type FormEvent } from "react";
import type { CorrectionReviewQueueItem } from "@/truth-map/correctionRequest";

export default function CorrectionReviewQueue({ initialQueue }: { initialQueue: CorrectionReviewQueueItem[] }) {
  const [queue, setQueue] = useState(initialQueue);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/truth-map/b2b/correction-review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(form.entries()))
    });
    const payload = await response.json() as { error?: string };
    if (!response.ok) {
      setError(payload.error || "Review action was rejected.");
      return;
    }
    const refreshed = await fetch("/api/truth-map/b2b/correction-review", { cache: "no-store" });
    const result = await refreshed.json() as { queue: CorrectionReviewQueueItem[] };
    setQueue(result.queue);
  }

  return <section data-testid="correction-review-queue">
    {error ? <p role="alert">{error}</p> : null}
    {queue.length ? <ol>{queue.map((item) => <li key={item.receipt.receiptId}>
      <strong>{item.receipt.candidate.geo} · {item.state}</strong>
      <p>{item.receipt.candidate.organization} · <a href={item.receipt.candidate.sourceUrl}>{item.receipt.candidate.sourceUrl}</a></p>
      <p>Receipt: <code>{item.receipt.receiptId}</code></p>
      {item.state === "PENDING_ASSIGNMENT" ? <form onSubmit={submit}>
        <input type="hidden" name="action" value="ASSIGN" />
        <input type="hidden" name="receiptId" value={item.receipt.receiptId} />
        <label>Reviewer ID<input name="reviewerId" required /></label>
        <label>Assignment note<textarea name="note" /></label>
        <button type="submit">Assign independent review</button>
      </form> : item.state === "ASSIGNED" ? <form onSubmit={submit}>
        <input type="hidden" name="action" value="DECIDE" />
        <input type="hidden" name="receiptId" value={item.receipt.receiptId} />
        <input type="hidden" name="reviewerId" value={item.assignedReviewerId || ""} />
        <label>Evidence decision<select name="decision" defaultValue="NEEDS_MORE_EVIDENCE"><option>NEEDS_MORE_EVIDENCE</option><option>REJECTED</option><option>APPROVED_FOR_MANUAL_HANDOFF</option></select></label>
        <label>Decision evidence note<textarea name="note" required /></label>
        <button type="submit">Record decision and outcome</button>
      </form> : <p>Outcome is recorded. Approval means awaiting a separate manual canonical handoff; no canonical review operation or Truth change is claimed here.</p>}
      <details><summary>Append-only audit events ({item.events.length})</summary><pre>{JSON.stringify(item.events, null, 2)}</pre></details>
    </li>)}</ol> : <p>No correction candidates are currently recorded.</p>}
  </section>;
}
