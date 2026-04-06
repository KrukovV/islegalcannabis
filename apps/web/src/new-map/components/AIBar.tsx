"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "../MapRoot.module.css";
import type { GeoStatus, IpStatus } from "../hooks/useGeoStatus";
import { isAssistantChatEnabled } from "@/ai-assistant/config";

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

type ChatHistoryEntry = {
  id: string;
  role: "user" | "assistant" | "error";
  text: string;
  sources?: string[];
  safetyNote?: string | null;
};

const HISTORY_KEY = "new_map_ai_history";

function appendHistory(current: ChatHistoryEntry[], entry: ChatHistoryEntry) {
  return [...current, entry].slice(-12);
}

function trimQuery(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 500);
}

export default function AIBar({ activeGeo, geoStatus, ipStatus, onGpsClick }: Props) {
  const inputLocked = !isAssistantChatEnabled();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<ChatHistoryEntry[]>([]);
  const normalizedQuery = useMemo(() => trimQuery(query), [query]);
  const placeholder = activeGeo
    ? inputLocked
      ? "AI assistant is temporarily unavailable while we finish global rollout"
      : `Ask about cannabis law in ${activeGeo.country}`
    : inputLocked
      ? "AI assistant is temporarily unavailable while we finish global rollout"
      : "Ask about cannabis laws...";
  const gpsDotClassName =
    geoStatus.status === "resolved"
      ? styles.aiGpsDotResolved
      : geoStatus.status === "resolving"
        ? styles.aiGpsDotResolving
        : styles.aiGpsDotUnknown;
  const gpsClickable = geoStatus.status !== "resolving";

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(HISTORY_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as ChatHistoryEntry[];
      if (Array.isArray(parsed)) setHistory(parsed.slice(-12));
    } catch {
      setHistory([]);
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-12)));
    } catch {
      return;
    }
  }, [history]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inputLocked || !normalizedQuery || loading) return;
    const userEntry: ChatHistoryEntry = {
      id: `user-${Date.now()}`,
      role: "user",
      text: normalizedQuery
    };
    setHistory((current) => [...current, userEntry].slice(-12));
    setLoading(true);
    try {
      const response = await fetch("/api/ai-assistant/query", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          message: normalizedQuery,
          geo_hint: activeGeo?.iso2
        })
      });
      const payload = (await response.json()) as AiQuerySuccess | AiQueryFailure;
      if (!response.ok || !payload.ok) {
        setHistory((current) =>
          appendHistory(current, {
            id: `error-${Date.now()}`,
            role: "error",
            text: payload.ok ? "Request failed." : payload.error?.message || "Request failed."
          })
        );
        return;
      }
      setHistory((current) =>
        appendHistory(current, {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          text: payload.answer,
          sources: Array.isArray(payload.sources) ? payload.sources : [],
          safetyNote: payload.safety_note || null
        })
      );
      setQuery("");
    } catch {
      setHistory((current) =>
        appendHistory(current, {
          id: `error-${Date.now()}`,
          role: "error",
          text: "Request failed."
        })
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.aiDock} data-testid="new-map-ai-dock">
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
          disabled={inputLocked}
          readOnly={inputLocked}
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
          disabled={inputLocked || !normalizedQuery || loading}
        >
          {loading ? "…" : "→"}
        </button>
      </form>
      {inputLocked ? (
        <div className={styles.aiGeoHint} data-testid="new-map-ai-chat-locked">
          AI assistant is temporarily unavailable while we finish global rollout. GPS remains available.
        </div>
      ) : null}
      {ipStatus.message ? (
        <div className={styles.aiGeoHint} data-testid="new-map-ai-geo-hint">
          {ipStatus.message}
        </div>
      ) : null}
      {history.length > 0 ? (
        <div className={styles.aiAnswerCard} data-testid="new-map-ai-answer">
          {history.map((entry) => (
            <div key={entry.id} className={styles.aiAnswerBlock}>
              <div className={entry.role === "user" ? styles.aiAnswerPrompt : styles.aiAnswerText}>{entry.text}</div>
              {entry.role !== "user" ? (
                <div className={styles.aiAnswerMeta}>
                  {entry.safetyNote || (entry.role === "assistant" ? "Not legal advice." : "")}
                  {activeGeo ? ` · GEO_HINT=${activeGeo.iso2}` : ""}
                </div>
              ) : null}
              {entry.role === "assistant" && entry.sources && entry.sources.length > 0 ? (
                <div className={styles.aiSources}>
                  {entry.sources.slice(0, 6).map((source) => (
                    <span key={`${entry.id}-${source}`}>
                      {source}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
