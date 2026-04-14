"use client";

import { useMemo, useState } from "react";
import styles from "../MapRoot.module.css";
import type { GeoStatus, IpStatus } from "../hooks/useGeoStatus";

type ActiveGeo = {
  country: string;
  iso2: string;
} | null;

type Props = {
  activeGeo: ActiveGeo;
  geoStatus: GeoStatus;
  ipStatus: IpStatus;
  onGpsClick: () => void;
};

type AiQuerySuccess = {
  ok: true;
  answer: string;
  sources: string[];
  safety_note: string;
};

type AiQueryFailure = {
  ok: false;
  error?: {
    message?: string;
  };
};

type AiStreamEvent =
  | {
      type: "meta";
      requestId?: string;
      model?: string;
    }
  | {
      type: "delta";
      text?: string;
    }
  | {
      type: "done";
      ok?: boolean;
      answer?: string;
      sources?: string[];
      safety_note?: string;
      llm_connected?: boolean;
      model?: string;
    };

function trimQuery(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 500);
}

function parseAiStream(buffer: string) {
  const lines = buffer.split("\n");
  const rest = lines.pop() || "";
  const events: AiStreamEvent[] = [];
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    try {
      events.push(JSON.parse(line) as AiStreamEvent);
    } catch {
      continue;
    }
  }
  return { events, rest };
}

export default function AIBar({ activeGeo, geoStatus, ipStatus, onGpsClick }: Props) {
  const aiInputLocked = process.env.NODE_ENV === "production";
  const [isOpen, setIsOpen] = useState(true);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [sources, setSources] = useState<string[]>([]);
  const [safetyNote, setSafetyNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const normalizedQuery = useMemo(() => trimQuery(query), [query]);
  const placeholder = aiInputLocked
    ? "AI assistant temporarily unavailable"
    : activeGeo
      ? `Ask about cannabis law in ${activeGeo.country}`
      : "Ask about cannabis laws...";
  const gpsDotClassName =
    geoStatus.status === "resolved"
      ? styles.aiGpsDotResolved
      : geoStatus.status === "resolving"
        ? styles.aiGpsDotResolving
        : styles.aiGpsDotUnknown;
  const gpsClickable = geoStatus.status !== "resolving";

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (aiInputLocked || !normalizedQuery || loading) return;
    setLoading(true);
    setError(null);
    setAnswer(null);
    setSources([]);
    setSafetyNote(null);
    try {
      const response = await fetch("/api/ai-assistant/query", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-ai-stream": "1"
        },
        body: JSON.stringify({
          message: normalizedQuery,
          geo_hint: activeGeo?.iso2
        })
      });
      const contentType = String(response.headers.get("content-type") || "");
      const isStream = contentType.includes("application/x-ndjson") && response.body;
      if (isStream) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let streamedAnswer = "";
        let sawDone = false;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parsed = parseAiStream(buffer);
          buffer = parsed.rest;
          for (const streamEvent of parsed.events) {
            if (streamEvent.type === "delta") {
              const chunk = String(streamEvent.text || "");
              if (!chunk) continue;
              streamedAnswer += chunk;
              setAnswer(streamedAnswer);
            }
            if (streamEvent.type === "done") {
              sawDone = true;
              if (streamEvent.ok === false) {
                setError("Request failed.");
                setAnswer(null);
                setSources([]);
                setSafetyNote(null);
                break;
              }
              const finalAnswer = String(streamEvent.answer || streamedAnswer || "").trim();
              setAnswer(finalAnswer || null);
              setSources(Array.isArray(streamEvent.sources) ? streamEvent.sources : []);
              setSafetyNote(streamEvent.safety_note || null);
            }
          }
          if (sawDone) break;
        }
        if (!sawDone && streamedAnswer.trim()) {
          setAnswer(streamedAnswer.trim());
        }
        if (!sawDone && !streamedAnswer.trim()) {
          setError("Request failed.");
          setAnswer(null);
        }
        return;
      }

      const payload = (await response.json()) as AiQuerySuccess | AiQueryFailure;
      if (!response.ok || !payload.ok) {
        setError(payload.ok ? "Request failed." : payload.error?.message || "Request failed.");
        setAnswer(null);
        setSources([]);
        setSafetyNote(null);
        return;
      }
      setAnswer(payload.answer);
      setSources(Array.isArray(payload.sources) ? payload.sources : []);
      setSafetyNote(payload.safety_note || null);
    } catch {
      setError("Request failed.");
      setAnswer(null);
      setSources([]);
      setSafetyNote(null);
    } finally {
      setLoading(false);
    }
  }

  function handleClear() {
    setQuery("");
    setAnswer(null);
    setSources([]);
    setSafetyNote(null);
    setError(null);
  }

  if (!isOpen) {
    return (
      <div className={styles.aiDock} data-testid="new-map-ai-dock">
        <button
          type="button"
          className={styles.aiCollapsedButton}
          data-testid="new-map-ai-expand"
          onClick={() => setIsOpen(true)}
          aria-label="Open AI chat"
        >
          Ask
        </button>
      </div>
    );
  }

  return (
    <div className={styles.aiDock} data-testid="new-map-ai-dock">
      {answer || error ? (
        <div className={styles.aiAnswerCard} data-testid="new-map-ai-answer">
          <div className={styles.aiAnswerHeader}>
            <div className={styles.aiAnswerTitle}>Dialog</div>
            <button
              type="button"
              className={styles.aiAnswerClose}
              onClick={() => setIsOpen(false)}
              aria-label="Collapse AI chat"
            >
              ×
            </button>
          </div>
          <div className={styles.aiAnswerText}>{error || answer}</div>
          {!error ? (
            <div className={styles.aiAnswerMeta}>
              {safetyNote || "Not legal advice."}
              {activeGeo ? ` · GEO_HINT=${activeGeo.iso2}` : ""}
            </div>
          ) : null}
          {!error && sources.length > 0 ? (
            <div className={styles.aiSources}>
              {sources.slice(0, 6).map((source) => (
                <span key={source}>
                  {source}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      <form className={styles.aiBar} onSubmit={onSubmit}>
        <button type="button" className={styles.aiAction} aria-label="More actions">
          +
        </button>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className={styles.aiInput}
          placeholder={placeholder}
          maxLength={500}
          autoComplete="off"
          spellCheck={false}
          readOnly={aiInputLocked}
          disabled={aiInputLocked}
          aria-disabled={aiInputLocked}
        />
        <button
          type="button"
          className={`${styles.aiGps} ${gpsClickable ? styles.aiGpsButton : ""}`}
          aria-label={`GPS ${geoStatus.status}`}
          onClick={gpsClickable ? onGpsClick : undefined}
          disabled={!gpsClickable}
        >
          <span className={`${styles.aiGpsDot} ${gpsDotClassName}`} />
          <span>GPS</span>
        </button>
        <button
          type="submit"
          className={styles.aiSubmit}
          aria-label="Submit AI query"
          disabled={aiInputLocked || !normalizedQuery || loading}
        >
          {loading ? "…" : "→"}
        </button>
      </form>
      {ipStatus.message ? (
        <div className={styles.aiGeoHint} data-testid="new-map-ai-geo-hint">
          {ipStatus.message}
        </div>
      ) : null}
      {(answer || error || query) && isOpen ? (
        <button
          type="button"
          className={styles.aiClearGhost}
          onClick={handleClear}
          aria-label="Clear AI chat"
        >
          Clear chat
        </button>
      ) : null}
    </div>
  );
}
