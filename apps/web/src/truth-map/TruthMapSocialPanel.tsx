"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { cellToLatLng } from "h3-js";
import type maplibregl from "maplibre-gl";
import type { Comment, Discussion, DiscussionType, SocialGeoAttachment } from "@/social/domain";
import { toSocialGeoAttachment } from "@/social/privacy";
import type { SocialRuntimeConfig } from "@/social/runtimeConfig";
import { isSocialQueryCell, toSocialViewportQueryCells } from "@/social/viewport";
import {
  SOCIAL_MAP_ACTIVITY_INVALIDATED_EVENT,
  SOCIAL_MAP_ACTIVITY_SELECTED_EVENT,
  type SocialMapActivitySelection,
} from "@/new-map/social/SocialLayer";
import { clearLocalDmData } from "@/dm/vault";
import PrivateDmPanel from "./PrivateDmPanel";
import styles from "./TruthMapSocialPanel.module.css";

type Props = {
  config: SocialRuntimeConfig;
  map: maplibregl.Map | null;
  mapReady: boolean;
  initiallyOpen?: boolean;
};

type Identity = { userId: string; displayName: string; roles: string[] };
type ApiError = { error?: { code?: string; message?: string } };
type DiscussionPayload = { ok: true; discussions: Discussion[] };
type CommentPayload = { ok: true; comments: Comment[] };

const subscribeHydration = () => () => {};

function useHydrated() {
  return useSyncExternalStore(subscribeHydration, () => true, () => false);
}

async function responsePayload<T>(response: Response): Promise<T> {
  const payload = await response.json() as T & ApiError;
  if (!response.ok) throw new Error(payload.error?.code || `SOCIAL_HTTP_${response.status}`);
  return payload;
}

function unavailableReason(config: SocialRuntimeConfig) {
  if (!config.databaseConfigured) return "DURABLE_SOCIAL_STORAGE_REQUIRED";
  if (!config.identityConfigured) return "VERIFIED_USER_IDENTITY_REQUIRED";
  return "SOCIAL_RUNTIME_DISABLED";
}

function shortAuthor(authorId: string) {
  return `Участник-${authorId.slice(0, 8)}`;
}

function messageDate(createdAt: string) {
  const value = new Date(createdAt);
  if (Number.isNaN(value.getTime())) return "недавно";
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(value);
}

function realtimeLabel(status: "CONNECTING" | "LIVE" | "POLLING") {
  if (status === "LIVE") return "В СЕТИ";
  if (status === "POLLING") return "ОБНОВЛЯЕМ";
  return "ПОДКЛЮЧАЕМ";
}

function friendlySocialStatus(status: string) {
  if (status === "CONNECTING") return "Подключаем обсуждения…";
  if (status === "IDENTITY_READY") return "Псевдоним готов.";
  if (status === "SIGNED_OUT") return "Вы вышли из профиля.";
  if (status === "SOCIAL_ACCOUNT_DELETED") return "Профиль удалён.";
  if (status === "ZOOM_OR_MOVE_TO_BOUNDED_AREA") return "Приблизьте карту или переместитесь в нужную область.";
  if (status === "PRIVACY_SAFE_MAP_AREA_READY" || status === "PRIVACY_SAFE_AREA_READY") return "Приватная область карты выбрана.";
  if (status === "DISCUSSION_DURABLY_COMMITTED") return "Обсуждение опубликовано.";
  if (status === "COMMENT_DURABLY_COMMITTED") return "Ответ опубликован.";
  if (status === "REPORT_RECORDED_FOR_MODERATION") return "Жалоба отправлена на проверку.";
  if (status === "AUTHOR_BLOCKED") return "Автор заблокирован.";
  if (status === "MY_MESSAGE_MAP_CENTERED") return "Карта показала приватную область сообщения.";
  if (status === "MY_MESSAGE_MAP_AREA_UNAVAILABLE") return "Не удалось открыть приватную область этого сообщения на карте.";
  if (status.endsWith("_REMOVED")) return "Материал удалён.";
  if (status === "DURABLE_SOCIAL_STORAGE_REQUIRED" || status === "VERIFIED_USER_IDENTITY_REQUIRED" || status === "SOCIAL_RUNTIME_DISABLED") return "Обсуждения сейчас недоступны.";
  const discussionCount = /^(\d+) COMMUNITY_DISCUSSIONS$/.exec(status);
  if (discussionCount) return Number(discussionCount[1]) === 0 ? "В этой области пока нет обсуждений." : `В этой области: ${discussionCount[1]} обсуждений.`;
  if (/^\d+ DISCUSSIONS_IN_SELECTED_AREA$/.test(status)) return `В выбранной области: ${status.split(" ")[0]} обсуждений.`;
  return status.includes("FAILED") || status.includes("UNAVAILABLE") ? "Обсуждениям требуется внимание." : status;
}

export default function TruthMapSocialPanel({ config, map, mapReady, initiallyOpen = false }: Props) {
  const hydrated = useHydrated();
  const [panelOpen, setPanelOpen] = useState(initiallyOpen);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [discussionType, setDiscussionType] = useState<Extract<DiscussionType, "MAP" | "GEO" | "LAW">>("MAP");
  const [geoId, setGeoId] = useState("US-NY");
  const [lawId, setLawId] = useState("cannabis-law");
  const [sort, setSort] = useState<"NEW" | "TOP">("NEW");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [safeArea, setSafeArea] = useState<SocialGeoAttachment | null>(null);
  const [queryCells, setQueryCells] = useState<string[]>([]);
  const [selectedMapArea, setSelectedMapArea] = useState<SocialMapActivitySelection | null>(null);
  const [discussions, setDiscussions] = useState<Discussion[]>([]);
  const [myMessagesOpen, setMyMessagesOpen] = useState(false);
  const [myMessages, setMyMessages] = useState<Discussion[]>([]);
  const [myMessagesLoading, setMyMessagesLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentBody, setCommentBody] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(config.publicSocialEnabled ? "CONNECTING" : unavailableReason(config));
  const [realtime, setRealtime] = useState<"CONNECTING" | "LIVE" | "POLLING">("CONNECTING");
  const requestGeneration = useRef(0);
  const requestAbort = useRef<AbortController | null>(null);

  const selected = useMemo(
    () => discussions.find((discussion) => discussion.id === selectedId) || null,
    [discussions, selectedId],
  );

  const refreshIdentity = useCallback(async () => {
    if (!config.identityConfigured) return;
    try {
      const payload = await responsePayload<{ ok: true; identity: Identity | null }>(await fetch("/api/social/session", {
        cache: "no-store",
        credentials: "same-origin",
      }));
      setIdentity(payload.identity);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "SOCIAL_IDENTITY_UNAVAILABLE");
    }
  }, [config.identityConfigured]);

  useEffect(() => {
    const initialRefresh = window.setTimeout(() => {
      void refreshIdentity();
    }, 0);
    return () => window.clearTimeout(initialRefresh);
  }, [refreshIdentity]);

  useEffect(() => {
    if (!map || !mapReady) return;
    const syncCells = () => {
      const bounds = map.getBounds();
      const nextCells = toSocialViewportQueryCells({
        west: bounds.getWest(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        north: bounds.getNorth(),
      });
      setQueryCells(nextCells);
      setSelectedMapArea((current) => current && !nextCells.includes(current.geoCell) ? null : current);
    };
    syncCells();
    map.on("moveend", syncCells);
    map.on("zoomend", syncCells);
    return () => {
      map.off("moveend", syncCells);
      map.off("zoomend", syncCells);
    };
  }, [map, mapReady]);

  useEffect(() => {
    const selectMapArea = (event: Event) => {
      const selection = (event as CustomEvent<SocialMapActivitySelection>).detail;
      if (!selection || typeof selection.geoCell !== "string" || !Number.isSafeInteger(selection.activeDiscussionCount)) return;
      setDiscussionType("MAP");
      setPanelOpen(true);
      setSelectedId(null);
      setSelectedMapArea(selection);
      setStatus(`${selection.activeDiscussionCount} DISCUSSIONS_IN_SELECTED_AREA`);
    };
    window.addEventListener(SOCIAL_MAP_ACTIVITY_SELECTED_EVENT, selectMapArea);
    return () => window.removeEventListener(SOCIAL_MAP_ACTIVITY_SELECTED_EVENT, selectMapArea);
  }, []);

  const activeMapQueryCells = useMemo(
    () => selectedMapArea ? [selectedMapArea.geoCell] : queryCells,
    [queryCells, selectedMapArea],
  );

  const discussionsUrl = useCallback(() => {
    const url = new URL("/api/social/discussions", window.location.origin);
    url.searchParams.set("type", discussionType);
    url.searchParams.set("sort", sort);
    url.searchParams.set("limit", "30");
    if (discussionType === "MAP") url.searchParams.set("cells", activeMapQueryCells.join(","));
    if (discussionType === "GEO") url.searchParams.set("geoId", geoId.trim());
    if (discussionType === "LAW") url.searchParams.set("lawId", lawId.trim());
    return url;
  }, [activeMapQueryCells, discussionType, geoId, lawId, sort]);

  const refreshDiscussions = useCallback(async () => {
    if (!config.publicSocialEnabled) return;
    if (discussionType === "MAP" && activeMapQueryCells.length === 0) {
      setDiscussions([]);
      setStatus("ZOOM_OR_MOVE_TO_BOUNDED_AREA");
      return;
    }
    if (discussionType === "GEO" && !geoId.trim()) return;
    if (discussionType === "LAW" && !lawId.trim()) return;
    const generation = requestGeneration.current + 1;
    requestGeneration.current = generation;
    requestAbort.current?.abort();
    const controller = new AbortController();
    requestAbort.current = controller;
    try {
      const payload = await responsePayload<DiscussionPayload>(await fetch(discussionsUrl(), {
        cache: "no-store",
        credentials: "same-origin",
        signal: controller.signal,
      }));
      if (generation !== requestGeneration.current) return;
      setDiscussions(payload.discussions);
      setStatus(`${payload.discussions.length} COMMUNITY_DISCUSSIONS`);
      setSelectedId((current) => current && !payload.discussions.some((discussion) => discussion.id === current) ? null : current);
    } catch (error) {
      if (controller.signal.aborted || generation !== requestGeneration.current) return;
      setStatus(error instanceof Error ? error.message : "SOCIAL_DISCUSSIONS_UNAVAILABLE");
    }
  }, [activeMapQueryCells.length, config.publicSocialEnabled, discussionType, discussionsUrl, geoId, lawId]);

  const refreshMyMessages = useCallback(async () => {
    if (!identity || !config.publicSocialEnabled) {
      setMyMessages([]);
      return;
    }
    setMyMessagesLoading(true);
    try {
      const url = new URL("/api/social/discussions", window.location.origin);
      url.searchParams.set("mine", "1");
      url.searchParams.set("type", "MAP");
      url.searchParams.set("limit", "20");
      const payload = await responsePayload<DiscussionPayload>(await fetch(url, {
        cache: "no-store",
        credentials: "same-origin",
      }));
      setMyMessages(payload.discussions);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "SOCIAL_MY_MESSAGES_UNAVAILABLE");
    } finally {
      setMyMessagesLoading(false);
    }
  }, [config.publicSocialEnabled, identity]);

  useEffect(() => {
    const initialRefresh = window.setTimeout(() => {
      void refreshDiscussions();
    }, 0);
    const polling = window.setInterval(() => void refreshDiscussions(), 15_000);
    return () => {
      window.clearTimeout(initialRefresh);
      window.clearInterval(polling);
      requestGeneration.current += 1;
      requestAbort.current?.abort();
    };
  }, [refreshDiscussions]);

  useEffect(() => {
    if (!myMessagesOpen) return;
    const initialRefresh = window.setTimeout(() => {
      void refreshMyMessages();
    }, 0);
    return () => window.clearTimeout(initialRefresh);
  }, [myMessagesOpen, refreshMyMessages]);

  const refreshComments = useCallback(async () => {
    if (!selectedId) {
      setComments([]);
      return;
    }
    try {
      const payload = await responsePayload<CommentPayload>(await fetch(`/api/social/discussions/${selectedId}/comments?limit=100`, {
        cache: "no-store",
        credentials: "same-origin",
      }));
      setComments(payload.comments);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "SOCIAL_COMMENTS_UNAVAILABLE");
    }
  }, [selectedId]);

  useEffect(() => {
    const initialRefresh = window.setTimeout(() => {
      void refreshComments();
    }, 0);
    return () => window.clearTimeout(initialRefresh);
  }, [refreshComments]);

  useEffect(() => {
    if (!config.publicSocialEnabled) return;
    if (queryCells.length === 0 && !selectedId) return;
    const url = new URL("/api/social/events", window.location.origin);
    if (queryCells.length > 0) url.searchParams.set("cells", queryCells.join(","));
    if (selectedId) url.searchParams.set("discussionId", selectedId);
    const source = new EventSource(url, { withCredentials: true });
    source.addEventListener("open", () => setRealtime("CONNECTING"));
    source.addEventListener("ready", () => setRealtime("LIVE"));
    source.addEventListener("social", () => {
      window.dispatchEvent(new Event(SOCIAL_MAP_ACTIVITY_INVALIDATED_EVENT));
      void refreshDiscussions();
      void refreshComments();
    });
    source.addEventListener("degraded", () => setRealtime("POLLING"));
    source.onerror = () => setRealtime("POLLING");
    return () => source.close();
  }, [config.publicSocialEnabled, queryCells, refreshComments, refreshDiscussions, selectedId]);

  const signIn = async () => {
    setBusy(true);
    try {
      const payload = await responsePayload<{ ok: true; identity: Identity }>(await fetch("/api/social/session", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName }),
      }));
      setIdentity(payload.identity);
      setDisplayName("");
      setStatus("IDENTITY_READY");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "SOCIAL_IDENTITY_CREATE_FAILED");
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    await fetch("/api/social/session", { method: "DELETE", credentials: "same-origin" });
    await clearLocalDmData();
    setIdentity(null);
    setMyMessages([]);
    setMyMessagesOpen(false);
    setStatus("SIGNED_OUT");
  };

  const requestSafeArea = useCallback(() => new Promise<SocialGeoAttachment>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("SOCIAL_BROWSER_GEO_UNAVAILABLE"));
      return;
    }
    navigator.geolocation.getCurrentPosition((position) => {
      try {
        const attachment = toSocialGeoAttachment({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }, { requestedMapZoom: map?.getZoom() || 0 });
        setSafeArea(attachment);
        map?.easeTo({
          center: [position.coords.longitude, position.coords.latitude],
          zoom: Math.max(map.getZoom(), 10),
          duration: 500,
        });
        resolve(attachment);
      } catch (error) {
        reject(error);
      }
    }, () => reject(new Error("SOCIAL_BROWSER_GEO_DENIED")), {
      enableHighAccuracy: false,
      maximumAge: 0,
      timeout: 10_000,
    });
  }), [map]);

  const selectMapCenterSafeArea = useCallback(() => {
    if (!map || !mapReady) throw new Error("SOCIAL_MAP_AREA_UNAVAILABLE");
    const center = map.getCenter();
    const attachment = toSocialGeoAttachment({
      latitude: center.lat,
      longitude: center.lng,
    }, { requestedMapZoom: map.getZoom() });
    setSafeArea(attachment);
    setStatus("PRIVACY_SAFE_MAP_AREA_READY");
  }, [map, mapReady]);

  const createDiscussion = async () => {
    if (!identity || !body.trim()) return;
    setBusy(true);
    try {
      const geo = discussionType === "MAP" ? safeArea || await requestSafeArea() : null;
      const payload = {
        type: discussionType,
        title: title.trim() || null,
        body: body.trim(),
        ...(discussionType === "MAP" ? { geo: { geoCell: geo?.geoCell, geoResolution: geo?.geoResolution } } : {}),
        ...(discussionType === "GEO" ? { geoId: geoId.trim() } : {}),
        ...(discussionType === "LAW" ? { lawId: lawId.trim() } : {}),
      };
      const saved = await responsePayload<{ ok: true; discussion: Discussion }>(await fetch("/api/social/discussions", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }));
      setBody("");
      setTitle("");
      setSelectedId(saved.discussion.id);
      if (saved.discussion.type === "MAP") {
        setMyMessages((current) => [saved.discussion, ...current.filter((discussion) => discussion.id !== saved.discussion.id)]);
      }
      window.dispatchEvent(new Event(SOCIAL_MAP_ACTIVITY_INVALIDATED_EVENT));
      setStatus("DISCUSSION_DURABLY_COMMITTED");
      await refreshDiscussions();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "SOCIAL_DISCUSSION_CREATE_FAILED");
    } finally {
      setBusy(false);
    }
  };

  const createComment = async () => {
    if (!selectedId || !commentBody.trim() || !identity) return;
    setBusy(true);
    try {
      await responsePayload(await fetch(`/api/social/discussions/${selectedId}/comments`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: commentBody.trim(), parentCommentId: replyTo }),
      }));
      setCommentBody("");
      setReplyTo(null);
      setStatus("COMMENT_DURABLY_COMMITTED");
      await Promise.all([refreshComments(), refreshDiscussions()]);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "SOCIAL_COMMENT_CREATE_FAILED");
    } finally {
      setBusy(false);
    }
  };

  const vote = async (targetType: "DISCUSSION" | "COMMENT", targetId: string, value: -1 | 1) => {
    if (!identity) return;
    try {
      await responsePayload(await fetch("/api/social/votes", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetType, targetId, value }),
      }));
      await Promise.all([refreshDiscussions(), refreshComments()]);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "SOCIAL_VOTE_FAILED");
    }
  };

  const report = async (targetType: "DISCUSSION" | "COMMENT", targetId: string) => {
    if (!identity) return;
    try {
      await responsePayload(await fetch("/api/social/reports", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetType, targetId, reason: "Community review requested" }),
      }));
      setStatus("REPORT_RECORDED_FOR_MODERATION");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "SOCIAL_REPORT_FAILED");
    }
  };

  const removeContent = async (targetType: "DISCUSSION" | "COMMENT", targetId: string) => {
    try {
      const route = targetType === "DISCUSSION" ? "discussions" : "comments";
      await responsePayload(await fetch(`/api/social/${route}/${targetId}`, {
        method: "DELETE",
        credentials: "same-origin",
      }));
      if (targetType === "DISCUSSION") setSelectedId(null);
      if (targetType === "DISCUSSION") setMyMessages((current) => current.filter((discussion) => discussion.id !== targetId));
      setStatus(`${targetType}_REMOVED`);
      await Promise.all([refreshDiscussions(), refreshComments()]);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "SOCIAL_REMOVE_FAILED");
    }
  };

  const blockAuthor = async (targetUserId: string) => {
    try {
      await responsePayload(await fetch("/api/social/relationships", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ relation: "BLOCK", targetUserId, active: true }),
      }));
      setSelectedId(null);
      setStatus("AUTHOR_BLOCKED");
      await refreshDiscussions();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "SOCIAL_BLOCK_FAILED");
    }
  };

  const deleteAccount = async () => {
    if (!window.confirm("Удалить этот Social-профиль, отозвать сессию и анонимизировать публичные материалы?")) return;
    try {
      await responsePayload(await fetch("/api/social/account", { method: "DELETE", credentials: "same-origin" }));
      await clearLocalDmData();
      setIdentity(null);
      setMyMessages([]);
      setMyMessagesOpen(false);
      setSelectedId(null);
      setStatus("SOCIAL_ACCOUNT_DELETED");
      await refreshDiscussions();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "SOCIAL_ACCOUNT_DELETE_FAILED");
    }
  };

  const focusMyMapMessage = (discussion: Discussion) => {
    const geoCell = discussion.type === "MAP" ? discussion.geo?.geoQueryCell : null;
    if (!map || !mapReady || !geoCell || !isSocialQueryCell(geoCell)) {
      setStatus("MY_MESSAGE_MAP_AREA_UNAVAILABLE");
      return;
    }
    try {
      const [latitude, longitude] = cellToLatLng(geoCell);
      setDiscussionType("MAP");
      setSelectedMapArea(null);
      setSelectedId(discussion.id);
      map.easeTo({ center: [longitude, latitude], zoom: Math.max(map.getZoom(), 10), duration: 500 });
      setStatus("MY_MESSAGE_MAP_CENTERED");
    } catch {
      setStatus("MY_MESSAGE_MAP_AREA_UNAVAILABLE");
    }
  };

  if (!panelOpen) {
    return (
      <aside
        className={styles.collapsedPanel}
        data-testid="truth-map-social-chat"
        data-social-chat-status={config.publicSocialEnabled ? "ACTIVE" : "DISABLED"}
        data-social-panel-state="collapsed"
        data-social-hydrated={hydrated ? "true" : "false"}
        aria-label="Чат сообщества"
      >
        <button
          type="button"
          className={styles.socialToggle}
          data-testid="truth-map-social-toggle"
          onClick={() => setPanelOpen(true)}
          aria-label="Открыть чат сообщества"
          disabled={!hydrated}
        >
          <span>Общение</span>
          <span className={styles.realtime}>{config.publicSocialEnabled ? realtimeLabel(realtime) : "ВЫКЛ."}</span>
        </button>
      </aside>
    );
  }

  if (!config.publicSocialEnabled) {
    return (
      <aside className={styles.panel} data-testid="truth-map-social-chat" data-social-chat-status="DISABLED" data-social-panel-state="expanded" data-social-hydrated={hydrated ? "true" : "false"} aria-label="Чат сообщества">
        <div className={styles.headerRow}>
          <div>
            <div className={styles.eyebrow}>Чат сообщества · GeoChat</div>
            <h2>Обсуждения сообщества недоступны</h2>
          </div>
          <button type="button" className={styles.closeButton} onClick={() => setPanelOpen(false)} aria-label="Свернуть чат сообщества" disabled={!hydrated}>×</button>
        </div>
        <p>Проверенная правовая информация остаётся доступной. Обсуждения закрываются безопасно и не используют точные координаты или локальные сообщения как замену.</p>
        <p className={styles.status}>{friendlySocialStatus(unavailableReason(config))}<span className={styles.srOnly} data-testid="truth-map-social-status">{unavailableReason(config)}</span></p>
        {config.dmEnabled && !identity ? (
          <div className={styles.identityBox}>
            <label className={styles.label} htmlFor="truth-map-private-name">Выберите псевдоним для личных сообщений</label>
            <div className={styles.inlineRow}>
              <input id="truth-map-private-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={40} />
              <button type="button" onClick={() => void signIn()} disabled={busy || displayName.trim().length < 2}>Продолжить</button>
            </div>
          </div>
        ) : null}
        {config.dmEnabled && identity ? (
          <>
            <div className={styles.identityRow}>
              <span>{identity.displayName}</span>
              <button type="button" onClick={() => void signOut()}>Выйти</button>
            </div>
            <PrivateDmPanel config={config} identity={identity} />
          </>
        ) : null}
      </aside>
    );
  }

  return (
    <aside className={styles.panel} data-testid="truth-map-social-chat" data-social-chat-status="ACTIVE" data-social-panel-state="expanded" data-social-hydrated={hydrated ? "true" : "false"} aria-label="Чат сообщества">
      <div className={styles.headerRow}>
        <div>
          <div className={styles.eyebrow}>Обсуждения сообщества</div>
          <h2>Чат сообщества</h2>
        </div>
        <div className={styles.headerActions}>
          <span className={styles.realtime}>{realtimeLabel(realtime)}<span className={styles.srOnly} data-testid="truth-map-social-realtime">{realtime}</span></span>
          <button type="button" className={styles.closeButton} onClick={() => setPanelOpen(false)} aria-label="Свернуть чат сообщества" disabled={!hydrated}>×</button>
        </div>
      </div>
      <p className={styles.truthBoundary}><strong>Проверенная информация всегда выше.</strong> Сообщения ниже не меняют Legal Truth или цвета GEO.</p>

      {!identity ? (
        <div className={styles.identityBox}>
          <label className={styles.label} htmlFor="truth-map-social-name">Выберите псевдоним</label>
          <div className={styles.inlineRow}>
            <input id="truth-map-social-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={40} data-testid="truth-map-social-name" />
            <button type="button" onClick={() => void signIn()} disabled={busy || displayName.trim().length < 2} data-testid="truth-map-social-sign-in">Продолжить</button>
          </div>
          <p>Создаёт серверный псевдоним и HttpOnly-сессию. Без email, истории GPS, публичной метки пользователя и точного расстояния.</p>
        </div>
      ) : (
        <div className={styles.identityRow}>
          <span data-testid="truth-map-social-identity">{identity.displayName}</span>
          <div className={styles.actions}>
            <button
              type="button"
              data-testid="truth-map-social-my-messages-toggle"
              aria-expanded={myMessagesOpen}
              onClick={() => setMyMessagesOpen((open) => !open)}
            >
              Мои сообщения
            </button>
            <button type="button" onClick={() => void signOut()}>Выйти</button>
            <button type="button" onClick={() => void deleteAccount()}>Удалить аккаунт</button>
          </div>
        </div>
      )}

      <div className={styles.controls}>
        <label>Раздел
          <select value={discussionType} onChange={(event) => {
            setDiscussionType(event.target.value as typeof discussionType);
            setSelectedId(null);
            setSelectedMapArea(null);
          }} data-testid="truth-map-social-space">
            <option value="MAP">Карта · активно 24 часа</option>
            <option value="GEO">GEO · постоянно</option>
            <option value="LAW">Закон · постоянно</option>
          </select>
        </label>
        <label>Сортировка
          <select value={sort} onChange={(event) => setSort(event.target.value as "NEW" | "TOP")}>
            <option value="NEW">Сначала новые</option>
            <option value="TOP">Популярные</option>
          </select>
        </label>
      </div>

      {discussionType === "GEO" ? <label className={styles.label}>Код GEO<input value={geoId} onChange={(event) => setGeoId(event.target.value)} /></label> : null}
      {discussionType === "LAW" ? <label className={styles.label}>Код закона<input value={lawId} onChange={(event) => setLawId(event.target.value)} /></label> : null}
      {discussionType === "MAP" && selectedMapArea ? (
        <div className={styles.mapAreaFocus} data-testid="truth-map-social-map-area-focus">
          <span>В этой области активных обсуждений: {selectedMapArea.activeDiscussionCount}</span>
          <button type="button" onClick={() => setSelectedMapArea(null)}>Показать текущую область</button>
        </div>
      ) : null}

      {identity ? (
        <div className={styles.composerBox}>
          <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={240} placeholder="Заголовок (необязательно)" />
          <textarea
            className={styles.composer}
            data-testid="truth-map-social-composer"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder={discussionType === "MAP" ? "Напишите в приватную область карты — исходные GPS-данные остаются в этом браузере." : "Начните постоянное обсуждение сообщества."}
            rows={3}
            maxLength={8_000}
          />
          {discussionType === "MAP" ? (
            <div className={styles.actions}>
              <button type="button" className={styles.secondary} disabled={!mapReady} onClick={() => {
                try {
                  selectMapCenterSafeArea();
                } catch (error) {
                  setStatus(error instanceof Error ? error.message : "SOCIAL_MAP_AREA_UNAVAILABLE");
                }
              }}>
                {safeArea ? `Приватная область выбрана · H3 r${safeArea.geoResolution}` : "Использовать приватный центр карты"}
              </button>
              <button type="button" className={styles.secondary} onClick={() => void requestSafeArea().then(() => setStatus("PRIVACY_SAFE_AREA_READY")).catch((error) => setStatus(error.message))}>
                Использовать приватную текущую область
              </button>
            </div>
          ) : null}
          <button className={styles.send} type="button" onClick={() => void createDiscussion()} disabled={busy || !body.trim()} data-testid="truth-map-social-send">Опубликовать обсуждение</button>
        </div>
      ) : null}

      {identity && myMessagesOpen ? (
        <section className={styles.myMessages} data-testid="truth-map-social-my-messages" aria-label="Мои сообщения на карте">
          <div className={styles.myMessagesHeader}>
            <div>
              <strong>Мои сообщения</strong>
              <p>Только активные публикации на карте. Нажмите, чтобы показать их приватную область.</p>
            </div>
            <button type="button" onClick={() => setMyMessagesOpen(false)} aria-label="Скрыть мои сообщения">Скрыть</button>
          </div>
          {myMessagesLoading ? <p>Загружаем сообщения…</p> : null}
          {!myMessagesLoading && myMessages.length === 0 ? <p>У вас пока нет активных сообщений на карте.</p> : null}
          <div className={styles.myMessagesList}>
            {myMessages.map((discussion) => (
              <button
                key={discussion.id}
                type="button"
                className={styles.myMessageCard}
                data-testid={`truth-map-social-my-message-${discussion.id}`}
                onClick={() => focusMyMapMessage(discussion)}
              >
                <strong>{discussion.title || discussion.body.slice(0, 90)}</strong>
                <span>{messageDate(discussion.createdAt)} · Показать на карте</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {identity ? <PrivateDmPanel config={config} identity={identity} /> : null}

      <div className={styles.list} data-testid="truth-map-social-discussions">
        {discussions.map((discussion) => (
          <article key={discussion.id} className={discussion.id === selectedId ? styles.selectedCard : styles.discussionCard}>
            <button type="button" className={styles.cardOpen} onClick={() => setSelectedId(discussion.id)}>
              <strong>{discussion.title || discussion.body.slice(0, 72)}</strong>
              <span>{discussion.authorDisplayName || shortAuthor(discussion.authorId)} · ответов: {discussion.replyCount} · голосов: {discussion.voteScore}</span>
            </button>
            <div className={styles.actions}>
              <button type="button" disabled={!identity} onClick={() => void vote("DISCUSSION", discussion.id, 1)}>▲</button>
              <button type="button" disabled={!identity} onClick={() => void vote("DISCUSSION", discussion.id, -1)}>▼</button>
              <button type="button" disabled={!identity} onClick={() => void report("DISCUSSION", discussion.id)}>Пожаловаться</button>
              {identity?.userId === discussion.authorId
                ? <button type="button" onClick={() => void removeContent("DISCUSSION", discussion.id)}>Удалить</button>
                : <button type="button" disabled={!identity} onClick={() => void blockAuthor(discussion.authorId)}>Заблокировать автора</button>}
            </div>
          </article>
        ))}
        {discussions.length === 0 ? <p>В этой области пока нет активных обсуждений.</p> : null}
      </div>

      {selected ? (
        <section className={styles.thread} data-testid="truth-map-social-thread">
          <div className={styles.threadHeader}>
            <strong>{selected.title || "Обсуждение"}</strong>
            <button type="button" onClick={() => setSelectedId(null)}>Закрыть</button>
          </div>
          <p>{selected.body}</p>
          {comments.map((comment) => (
            <article key={comment.id} className={comment.parentCommentId ? styles.nestedComment : styles.comment}>
              <p>{comment.body}</p>
              <div className={styles.actions}>
                <span>{comment.authorDisplayName || shortAuthor(comment.authorId)} · {comment.voteScore}</span>
                <button type="button" disabled={!identity} onClick={() => setReplyTo(comment.id)}>Ответить</button>
                <button type="button" disabled={!identity} onClick={() => void vote("COMMENT", comment.id, 1)}>▲</button>
                <button type="button" disabled={!identity} onClick={() => void report("COMMENT", comment.id)}>Пожаловаться</button>
                {identity?.userId === comment.authorId
                  ? <button type="button" onClick={() => void removeContent("COMMENT", comment.id)}>Удалить</button>
                  : null}
              </div>
            </article>
          ))}
          {identity ? (
            <div className={styles.commentComposer}>
              {replyTo ? <span>Ответ на комментарий · <button type="button" onClick={() => setReplyTo(null)}>отменить</button></span> : null}
              <textarea value={commentBody} onChange={(event) => setCommentBody(event.target.value)} rows={2} maxLength={8_000} placeholder="Напишите ответ сообществу" data-testid="truth-map-social-comment" />
              <button type="button" disabled={busy || !commentBody.trim()} onClick={() => void createComment()} data-testid="truth-map-social-comment-send">Ответить</button>
            </div>
          ) : null}
        </section>
      ) : null}

      <p className={styles.status}>{friendlySocialStatus(status)}<span className={styles.srOnly} data-testid="truth-map-social-status">{status}</span></p>
    </aside>
  );
}
