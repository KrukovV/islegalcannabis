"use client";

import { useState, type FormEvent } from "react";
import type { CorrectionReviewQueueItem } from "@/truth-map/correctionRequest";

export default function CorrectionReviewQueue({
  initialQueue,
  initialReviewEventsSha256,
  initialSourceReviewRegistrySha256
}: {
  initialQueue: CorrectionReviewQueueItem[];
  initialReviewEventsSha256: string;
  initialSourceReviewRegistrySha256: string;
}) {
  const [queue, setQueue] = useState(initialQueue);
  const [reviewEventsSha256, setReviewEventsSha256] = useState(initialReviewEventsSha256);
  const [sourceReviewRegistrySha256, setSourceReviewRegistrySha256] = useState(initialSourceReviewRegistrySha256);
  const [error, setError] = useState("");

  async function refreshQueue() {
    const refreshed = await fetch("/api/truth-map/b2b/correction-review", { cache: "no-store" });
    const result = await refreshed.json() as {
      error?: string;
      queue?: CorrectionReviewQueueItem[];
      reviewEventsSha256?: string;
      sourceReviewRegistrySha256?: string;
    };
    if (!refreshed.ok) throw new Error(result.error || `Correction review refresh failed (${refreshed.status}).`);
    if (!Array.isArray(result.queue) || !result.reviewEventsSha256 || !result.sourceReviewRegistrySha256) {
      throw new Error("Correction review refresh returned an invalid snapshot.");
    }
    setQueue(result.queue);
    setReviewEventsSha256(result.reviewEventsSha256);
    setSourceReviewRegistrySha256(result.sourceReviewRegistrySha256);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const action = String(form.get("action") || "");
    const response = await fetch("/api/truth-map/b2b/correction-review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...Object.fromEntries(form.entries()),
        expectedReviewEventsSha256: reviewEventsSha256,
        ...(action === "HANDOFF" ? { expectedSourceReviewRegistrySha256: sourceReviewRegistrySha256 } : {})
      })
    });
    const payload = await response.json() as { error?: string };
    if (!response.ok) {
      const message = payload.error || "Review action was rejected.";
      if (response.status === 409) {
        try {
          await refreshQueue();
          setError(`${message} State was refreshed. Review the current queue and submit again.`);
        } catch (refreshError) {
          setError(`${message} Refresh failed: ${refreshError instanceof Error ? refreshError.message : "unknown error"}`);
        }
      } else {
        setError(message);
      }
      return;
    }
    try {
      await refreshQueue();
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Correction review refresh failed.");
    }
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
      </form> : item.state === "APPROVED_FOR_MANUAL_HANDOFF" ? <form onSubmit={submit}>
        <input type="hidden" name="action" value="HANDOFF" />
        <input type="hidden" name="receiptId" value={item.receipt.receiptId} />
        <input type="hidden" name="reviewerId" value={item.assignedReviewerId || ""} />
        <label>Existing same-GEO source-review operation ID<input name="targetOperationId" required /></label>
        <label>Handoff evidence note<textarea name="note" required /></label>
        <button type="submit">Record canonical review handoff</button>
      </form> : item.state === "HANDED_OFF"
        ? <p>Handoff is recorded to existing operation <code>{item.canonicalReviewOperationId}</code>. No Legal Truth, Store Truth, coordinate, leaf, position or ranking change was applied.</p>
        : <p>Outcome is recorded. No canonical review operation or Truth change is claimed.</p>}
      <details><summary>Append-only audit events ({item.events.length})</summary><pre>{JSON.stringify(item.events, null, 2)}</pre></details>
    </li>)}</ol> : <p>No correction candidates are currently recorded.</p>}
  </section>;
}
