"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "../MapRoot.module.css";
import type { GeoStatus, IpStatus } from "../hooks/useGeoStatus";

type ActiveGeo = {
  country: string;
  iso2: string;
  lat?: number;
  lng?: number;
} | null;

type Props = {
  activeGeo: ActiveGeo;
  geoStatus: GeoStatus;
  ipStatus: IpStatus;
  onGpsClick: () => void;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  sources?: string[];
  safetyNote?: string | null;
  error?: boolean;
  streaming?: boolean;
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

const MODEL_NO_RESPONSE_MESSAGE = "модель не ответила, попробуй ещё раз";
const CLARIFY_QUESTION_MESSAGE = "Уточни вопрос, я отвечу точнее";
const STREAM_SETTLE_MS = 4000;

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

const CHAT_STORAGE_KEY = "ai_chat_history";
const MODEL_OVERRIDE_STORAGE_KEY = "ai_model_override";

function shouldLockAiInputByDefault() {
  if (typeof window === "undefined") return true;
  const host = window.location.hostname;
  const isLocalHost =
    host === "127.0.0.1" ||
    host === "localhost" ||
    host === "::1" ||
    host.endsWith(".local");
  return !isLocalHost && process.env.NODE_ENV === "production";
}

function trimQuery(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 500);
}

function createMessageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isFallbackText(text: string) {
  return /Секунду, модель думает чуть дольше обычного|Give me a second, the model is taking longer than usual/i.test(
    String(text || "")
  );
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

function parseTrailingAiStreamEvent(buffer: string) {
  const line = String(buffer || "").trim();
  if (!line) return null;
  try {
    return JSON.parse(line) as AiStreamEvent;
  } catch {
    return null;
  }
}

function shouldPreferFinalAnswer(streamedText: string, finalText: string) {
  const streamed = String(streamedText || "").trim();
  const final = String(finalText || "").trim();
  if (!final) return false;
  if (!streamed) return true;
  if (final.length >= 80 && streamed !== final) return true;
  if (streamed.length < 40 && final.length >= 40) return true;
  return final.length > streamed.length + 20;
}

function allowsShortAssistantText(text: string) {
  return String(text || "").trim() === "Все норм 🙂";
}

export default function AIBar({ activeGeo, geoStatus, ipStatus, onGpsClick }: Props) {
  const requestControllerRef = useRef<AbortController | null>(null);
  const resetRequestRef = useRef<Promise<void> | null>(null);
  const messageRowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const lastScrolledTargetRef = useRef<string | null>(null);
  const streamBufferRef = useRef("");
  const streamMessageIdRef = useRef<string | null>(null);
  const streamFlushTimeoutRef = useRef<number | null>(null);
  const streamSettleTimeoutRef = useRef<number | null>(null);
  const warmStartedRef = useRef(false);
  const activeGeoRef = useRef<string | null>(activeGeo?.iso2 || null);
  const [aiInputLocked, setAiInputLocked] = useState(shouldLockAiInputByDefault);
  const [isOpen, setIsOpen] = useState(true);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
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

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CHAT_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as ChatMessage[];
      if (!Array.isArray(parsed)) return;
      setMessages(
        parsed
          .filter((item) => item && (item.role === "user" || item.role === "assistant"))
          .slice(-24)
          .map((item) => ({
            id: String(item.id || createMessageId()),
            role: item.role,
            text: String(item.text || ""),
            sources: Array.isArray(item.sources) ? item.sources.slice(0, 6) : [],
            safetyNote: item.safetyNote || null,
            error: Boolean(item.error),
            streaming: false
          }))
      );
    } catch {
      window.localStorage.removeItem(CHAT_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (warmStartedRef.current) return;
    warmStartedRef.current = true;
    const keepUnlockedOnLocalhost = !shouldLockAiInputByDefault();
    const model =
      typeof window !== "undefined"
        ? window.localStorage.getItem(MODEL_OVERRIDE_STORAGE_KEY) || ""
        : "";
    const params = new URLSearchParams({ warm: "1" });
    if (model) params.set("model", model);
    fetch(`/api/ai-assistant/query?${params.toString()}`)
      .then((response) => {
        setAiInputLocked(keepUnlockedOnLocalhost ? false : !response.ok);
      })
      .catch(() => {
        setAiInputLocked(keepUnlockedOnLocalhost ? false : true);
      });
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        CHAT_STORAGE_KEY,
        JSON.stringify(messages.slice(-24).map((message) => ({
          ...message,
          streaming: false
        })))
      );
    } catch {
      // ignore storage write issues
    }
  }, [messages]);

  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage) return;
    const targetMessage =
      lastMessage.role === "assistant" && !String(lastMessage.text || "").trim() && messages.length > 1
        ? messages[messages.length - 2]
        : lastMessage;
    if (!targetMessage?.id) return;
    const targetNode = messageRowRefs.current[targetMessage.id];
    if (!targetNode) return;
    const behavior = lastScrolledTargetRef.current === targetMessage.id ? "auto" : "smooth";
    lastScrolledTargetRef.current = targetMessage.id;
    window.requestAnimationFrame(() => {
      targetNode.scrollIntoView({
        behavior,
        block: "start",
        inline: "nearest"
      });
    });
  }, [messages]);

  useEffect(() => {
    return () => {
      requestControllerRef.current?.abort();
      requestControllerRef.current = null;
      if (streamFlushTimeoutRef.current !== null) {
        window.clearTimeout(streamFlushTimeoutRef.current);
        streamFlushTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const nextGeo = activeGeo?.iso2 || null;
    const prevGeo = activeGeoRef.current;
    activeGeoRef.current = nextGeo;
    if (!prevGeo || !nextGeo || prevGeo === nextGeo) return;
    requestControllerRef.current?.abort();
    requestControllerRef.current = null;
    resetStreamBuffer();
    setLoading(false);
    setError(null);
    setMessages([]);
    try {
      window.localStorage.removeItem(CHAT_STORAGE_KEY);
    } catch {
      // ignore storage write issues
    }
    void resetServerDialog();
  }, [activeGeo?.iso2]);

  function appendChunkToAssistantMessage(messageId: string, chunk: string) {
    setMessages((current) =>
      current.map((message) =>
        message.id === messageId
          ? {
              ...message,
              text: `${message.text || ""}${chunk}`,
              streaming: true
            }
          : message
      )
    );
  }

  function removeMessage(messageId: string) {
    setMessages((current) => current.filter((message) => message.id !== messageId));
  }

  function flushBufferedChunks() {
    const messageId = streamMessageIdRef.current;
    const chunk = streamBufferRef.current;
    if (!messageId || !chunk) return;
    streamBufferRef.current = "";
    appendChunkToAssistantMessage(messageId, chunk);
  }

  function scheduleChunkAppend(messageId: string, chunk: string) {
    streamMessageIdRef.current = messageId;
    streamBufferRef.current += chunk;
    if (streamFlushTimeoutRef.current !== null) return;
    streamFlushTimeoutRef.current = window.setTimeout(() => {
      streamFlushTimeoutRef.current = null;
      flushBufferedChunks();
    }, 50);
  }

  function resetStreamBuffer() {
    if (streamFlushTimeoutRef.current !== null) {
      window.clearTimeout(streamFlushTimeoutRef.current);
      streamFlushTimeoutRef.current = null;
    }
    if (streamSettleTimeoutRef.current !== null) {
      window.clearTimeout(streamSettleTimeoutRef.current);
      streamSettleTimeoutRef.current = null;
    }
    streamBufferRef.current = "";
    streamMessageIdRef.current = null;
  }

  function scheduleStreamSettle(controller: AbortController, hasStreamStarted: () => boolean) {
    if (streamSettleTimeoutRef.current !== null) {
      window.clearTimeout(streamSettleTimeoutRef.current);
    }
    streamSettleTimeoutRef.current = window.setTimeout(() => {
      streamSettleTimeoutRef.current = null;
      if (hasStreamStarted() && !controller.signal.aborted) {
        controller.abort();
      }
    }, STREAM_SETTLE_MS);
  }

  function resetServerDialog() {
    const resetRequest = fetch("/api/ai-assistant/query", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ai-reset": "1"
      },
      body: JSON.stringify({ message: "reset" })
    })
      .then(() => {})
      .catch(() => {})
      .finally(() => {
        if (resetRequestRef.current === resetRequest) {
          resetRequestRef.current = null;
        }
      });
    resetRequestRef.current = resetRequest;
    return resetRequest;
  }

async function requestNonStreamAnswer(input: {
    message: string;
    signal: AbortSignal;
  }) {
    const response = await fetch("/api/ai-assistant/query", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      signal: input.signal,
      body: JSON.stringify({
        message: input.message,
        geo_hint: activeGeo?.iso2,
        lat: activeGeo?.lat,
        lng: activeGeo?.lng,
        model: typeof window !== "undefined" ? window.localStorage.getItem(MODEL_OVERRIDE_STORAGE_KEY) || undefined : undefined
      })
    });
    const payload = (await response.json()) as AiQuerySuccess | AiQueryFailure;
    if (!response.ok || !payload.ok) {
      throw new Error(MODEL_NO_RESPONSE_MESSAGE);
    }
    return payload;
  }

  function finalizeAssistantMessage(
    messageId: string,
    payload: { text?: string; sources?: string[]; safetyNote?: string | null; error?: boolean; streaming?: boolean }
  ) {
    setMessages((current) =>
      current.map((message) => {
        if (message.id !== messageId) return message;
        const currentText = String(message.text || "").trim();
        const nextText = String(payload.text || "").trim();
        const keepCurrentText = currentText && isFallbackText(nextText);
        const displayText =
          !payload.error && nextText && nextText.length < 40 && !allowsShortAssistantText(nextText)
            ? (currentText.length >= 40 ? currentText : CLARIFY_QUESTION_MESSAGE)
            : nextText;
        return {
          ...message,
          text: keepCurrentText ? currentText : (displayText || currentText),
          sources: Array.isArray(payload.sources) ? payload.sources : message.sources || [],
          safetyNote: payload.safetyNote ?? message.safetyNote ?? null,
          error: Boolean(payload.error),
          streaming: Boolean(payload.streaming)
        };
      })
    );
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (aiInputLocked || !normalizedQuery || loading) return;
    if (resetRequestRef.current) {
      await resetRequestRef.current;
    }
    const userMessageId = createMessageId();
    const assistantMessageId = createMessageId();
    setLoading(true);
    setError(null);
    setMessages((current) => [
      ...current,
      { id: userMessageId, role: "user", text: normalizedQuery },
      { id: assistantMessageId, role: "assistant", text: "", sources: [], safetyNote: null, streaming: true }
    ]);
    setQuery("");
    requestControllerRef.current?.abort();
    resetStreamBuffer();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    let streamedAnswer = "";
    let hasStreamStarted = false;
    try {
      const response = await fetch("/api/ai-assistant/query", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-ai-stream": "1"
        },
        signal: controller.signal,
        body: JSON.stringify({
          message: normalizedQuery,
          geo_hint: activeGeo?.iso2,
          lat: activeGeo?.lat,
          lng: activeGeo?.lng,
          model: typeof window !== "undefined" ? window.localStorage.getItem(MODEL_OVERRIDE_STORAGE_KEY) || undefined : undefined
        })
      });
      const contentType = String(response.headers.get("content-type") || "");
      const isStream = contentType.includes("application/x-ndjson") && response.body;
      if (isStream) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let sawDone = false;
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            buffer += decoder.decode();
            const parsed = parseAiStream(buffer);
            buffer = parsed.rest;
            const trailingEvent = parseTrailingAiStreamEvent(buffer);
            const finalEvents = trailingEvent ? [...parsed.events, trailingEvent] : parsed.events;
            for (const streamEvent of finalEvents) {
              if (streamEvent.type === "delta") {
                const chunk = String(streamEvent.text || "");
                if (!chunk) continue;
                hasStreamStarted = true;
                streamedAnswer += chunk;
                scheduleChunkAppend(assistantMessageId, chunk);
                scheduleStreamSettle(controller, () => hasStreamStarted);
              }
              if (streamEvent.type === "done") {
                flushBufferedChunks();
                sawDone = true;
                if (streamEvent.ok === false) {
                  setError(MODEL_NO_RESPONSE_MESSAGE);
                  finalizeAssistantMessage(assistantMessageId, {
                    text: hasStreamStarted ? streamedAnswer : MODEL_NO_RESPONSE_MESSAGE,
                    error: !hasStreamStarted,
                    streaming: false
                  });
                } else {
                  const finalAnswer = String(streamEvent.answer || streamedAnswer || "").trim();
                  let preferredAnswer = shouldPreferFinalAnswer(streamedAnswer, finalAnswer)
                    ? finalAnswer
                    : (hasStreamStarted && streamedAnswer.trim() ? streamedAnswer.trim() : finalAnswer);
                  let sources = Array.isArray(streamEvent.sources) ? streamEvent.sources : [];
                  let safetyNote = streamEvent.safety_note || null;
                  if (preferredAnswer.length < 40) {
                    try {
                      const payload = await requestNonStreamAnswer({ message: normalizedQuery, signal: controller.signal });
                      preferredAnswer = String(payload.answer || preferredAnswer || "").trim();
                      sources = Array.isArray(payload.sources) ? payload.sources : sources;
                      safetyNote = payload.safety_note || safetyNote;
                    } catch {
                      // Keep the stream result; the final guard below will avoid an empty bubble.
                    }
                  }
                  finalizeAssistantMessage(assistantMessageId, {
                    text: preferredAnswer,
                    sources,
                    safetyNote,
                    streaming: false
                  });
                }
              }
            }
            break;
          }
          buffer += decoder.decode(value, { stream: true });
          const parsed = parseAiStream(buffer);
          buffer = parsed.rest;
          for (const streamEvent of parsed.events) {
            if (streamEvent.type === "delta") {
              const chunk = String(streamEvent.text || "");
              if (!chunk) continue;
              hasStreamStarted = true;
              streamedAnswer += chunk;
              scheduleChunkAppend(assistantMessageId, chunk);
              scheduleStreamSettle(controller, () => hasStreamStarted);
            }
            if (streamEvent.type === "done") {
              flushBufferedChunks();
              sawDone = true;
              if (streamEvent.ok === false) {
                setError(MODEL_NO_RESPONSE_MESSAGE);
                finalizeAssistantMessage(assistantMessageId, {
                  text: hasStreamStarted ? streamedAnswer : MODEL_NO_RESPONSE_MESSAGE,
                  error: !hasStreamStarted,
                  streaming: false
                });
                break;
              }
              const finalAnswer = String(streamEvent.answer || streamedAnswer || "").trim();
              let preferredAnswer = shouldPreferFinalAnswer(streamedAnswer, finalAnswer)
                ? finalAnswer
                : (hasStreamStarted && streamedAnswer.trim() ? streamedAnswer.trim() : finalAnswer);
              let sources = Array.isArray(streamEvent.sources) ? streamEvent.sources : [];
              let safetyNote = streamEvent.safety_note || null;
              if (preferredAnswer.length < 40) {
                try {
                  const payload = await requestNonStreamAnswer({ message: normalizedQuery, signal: controller.signal });
                  preferredAnswer = String(payload.answer || preferredAnswer || "").trim();
                  sources = Array.isArray(payload.sources) ? payload.sources : sources;
                  safetyNote = payload.safety_note || safetyNote;
                } catch {
                  // Keep the stream result; the final guard below will avoid an empty bubble.
                }
              }
              finalizeAssistantMessage(assistantMessageId, {
                text: preferredAnswer,
                sources,
                safetyNote,
                streaming: false
              });
            }
          }
          if (sawDone) break;
        }
        flushBufferedChunks();
        if (!sawDone && streamedAnswer.trim()) {
          finalizeAssistantMessage(assistantMessageId, {
            text: streamedAnswer.trim(),
            streaming: false
          });
        }
        if (!sawDone && !streamedAnswer.trim()) {
          try {
            const payload = await requestNonStreamAnswer({ message: normalizedQuery, signal: controller.signal });
            finalizeAssistantMessage(assistantMessageId, {
              text: payload.answer,
              sources: Array.isArray(payload.sources) ? payload.sources : [],
              safetyNote: payload.safety_note || null,
              streaming: false
            });
          } catch {
            setError(MODEL_NO_RESPONSE_MESSAGE);
            finalizeAssistantMessage(assistantMessageId, {
              text: MODEL_NO_RESPONSE_MESSAGE,
              error: true,
              streaming: false
            });
          }
        }
        return;
      }

      const payload = (await response.json()) as AiQuerySuccess | AiQueryFailure;
      if (!response.ok || !payload.ok) {
        setError(MODEL_NO_RESPONSE_MESSAGE);
        finalizeAssistantMessage(assistantMessageId, {
          text: MODEL_NO_RESPONSE_MESSAGE,
          error: true,
          streaming: false
        });
        return;
      }
      finalizeAssistantMessage(assistantMessageId, {
        text: payload.answer,
        sources: Array.isArray(payload.sources) ? payload.sources : [],
        safetyNote: payload.safety_note || null,
        streaming: false
      });
    } catch (error) {
      flushBufferedChunks();
      if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
        if (hasStreamStarted && streamedAnswer.trim()) {
          finalizeAssistantMessage(assistantMessageId, {
            text: streamedAnswer.trim(),
            streaming: false
          });
        } else {
          removeMessage(assistantMessageId);
        }
        return;
      }
      setError(MODEL_NO_RESPONSE_MESSAGE);
      finalizeAssistantMessage(assistantMessageId, {
        text: MODEL_NO_RESPONSE_MESSAGE,
        error: true,
        streaming: false
      });
    } finally {
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null;
      }
      resetStreamBuffer();
      setLoading(false);
    }
  }

  function handleClear() {
    requestControllerRef.current?.abort();
    requestControllerRef.current = null;
    resetStreamBuffer();
    setQuery("");
    setMessages([]);
    setError(null);
    window.localStorage.removeItem(CHAT_STORAGE_KEY);
    void resetServerDialog();
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
      {messages.length > 0 ? (
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
          <div className={styles.aiChatThread}>
            {messages.map((message) => (
              <div
                key={message.id}
                ref={(node) => {
                  messageRowRefs.current[message.id] = node;
                }}
                className={`${styles.aiMessageRow} ${message.role === "user" ? styles.aiMessageRowUser : styles.aiMessageRowAssistant}`}
                data-ai-message={message.role}
                data-streaming={message.streaming ? "true" : "false"}
              >
                <div
                  className={`${styles.aiBubble} ${message.role === "user" ? styles.aiBubbleUser : styles.aiBubbleAssistant} ${message.error ? styles.aiBubbleError : ""}`}
                >
                  <div className={styles.aiBubbleRole}>{message.role === "user" ? "You" : "AI"}</div>
                  <div className={styles.aiAnswerText} data-ai-message-text={message.role}>
                    {message.text}
                  </div>
                  {message.role === "assistant" ? (
                    <>
                      {message.safetyNote ? (
                        <div className={styles.aiAnswerMeta}>
                          {message.safetyNote}
                        </div>
                      ) : null}
                      {Array.isArray(message.sources) && message.sources.length > 0 ? (
                        <div className={styles.aiSources}>
                          {message.sources.slice(0, 6).map((source) => (
                            <span key={`${message.id}:${source}`}>
                              {source}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <form className={styles.aiBar} onSubmit={onSubmit}>
        <button type="button" className={styles.aiAction} aria-label="More actions">
          +
        </button>
        <input
          data-ai-input="1"
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
      {(messages.length > 0 || error || query) && isOpen ? (
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
