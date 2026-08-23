"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type maplibregl from "maplibre-gl";
import type { Comment, Discussion, DiscussionType, SocialGeoAttachment } from "@/social/domain";
import { toSocialGeoAttachment } from "@/social/privacy";
import type { SocialRuntimeConfig } from "@/social/runtimeConfig";
import { toSocialViewportQueryCells } from "@/social/viewport";
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
  return `member-${authorId.slice(0, 8)}`;
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
      if (selectedId && !payload.discussions.some((discussion) => discussion.id === selectedId)) setSelectedId(null);
    } catch (error) {
      if (controller.signal.aborted || generation !== requestGeneration.current) return;
      setStatus(error instanceof Error ? error.message : "SOCIAL_DISCUSSIONS_UNAVAILABLE");
    }
  }, [activeMapQueryCells.length, config.publicSocialEnabled, discussionType, discussionsUrl, geoId, lawId, selectedId]);

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
    if (!window.confirm("Delete this Social identity, revoke its session, and anonymize its public content?")) return;
    try {
      await responsePayload(await fetch("/api/social/account", { method: "DELETE", credentials: "same-origin" }));
      await clearLocalDmData();
      setIdentity(null);
      setSelectedId(null);
      setStatus("SOCIAL_ACCOUNT_DELETED");
      await refreshDiscussions();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "SOCIAL_ACCOUNT_DELETE_FAILED");
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
        aria-label="Social Chat"
      >
        <button
          type="button"
          className={styles.socialToggle}
          data-testid="truth-map-social-toggle"
          onClick={() => setPanelOpen(true)}
          aria-label="Open Social Chat"
          disabled={!hydrated}
        >
          <span>Social</span>
          <span className={styles.realtime}>{config.publicSocialEnabled ? realtime : "OFF"}</span>
        </button>
      </aside>
    );
  }

  if (!config.publicSocialEnabled) {
    return (
      <aside className={styles.panel} data-testid="truth-map-social-chat" data-social-chat-status="DISABLED" data-social-panel-state="expanded" data-social-hydrated={hydrated ? "true" : "false"} aria-label="Social Chat">
        <div className={styles.headerRow}>
          <div>
            <div className={styles.eyebrow}>Social Chat · GeoChat</div>
            <h2>Community discussion is unavailable</h2>
          </div>
          <button type="button" className={styles.closeButton} onClick={() => setPanelOpen(false)} aria-label="Collapse Social Chat" disabled={!hydrated}>×</button>
        </div>
        <p>Legal Truth remains available. Social fails closed and never falls back to raw coordinates or browser-local messages.</p>
        <p className={styles.status} data-testid="truth-map-social-status">{unavailableReason(config)}</p>
        {config.dmEnabled && !identity ? (
          <div className={styles.identityBox}>
            <label className={styles.label} htmlFor="truth-map-private-name">Choose a pseudonym for private messaging</label>
            <div className={styles.inlineRow}>
              <input id="truth-map-private-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={40} />
              <button type="button" onClick={() => void signIn()} disabled={busy || displayName.trim().length < 2}>Join</button>
            </div>
          </div>
        ) : null}
        {config.dmEnabled && identity ? (
          <>
            <div className={styles.identityRow}>
              <span>{identity.displayName}</span>
              <button type="button" onClick={() => void signOut()}>Sign out</button>
            </div>
            <PrivateDmPanel config={config} identity={identity} />
          </>
        ) : null}
      </aside>
    );
  }

  return (
    <aside className={styles.panel} data-testid="truth-map-social-chat" data-social-chat-status="ACTIVE" data-social-panel-state="expanded" data-social-hydrated={hydrated ? "true" : "false"} aria-label="Social Chat">
      <div className={styles.headerRow}>
        <div>
          <div className={styles.eyebrow}>Community Discussion</div>
          <h2>Social Chat</h2>
        </div>
        <div className={styles.headerActions}>
          <span className={styles.realtime} data-testid="truth-map-social-realtime">{realtime}</span>
          <button type="button" className={styles.closeButton} onClick={() => setPanelOpen(false)} aria-label="Collapse Social Chat" disabled={!hydrated}>×</button>
        </div>
      </div>
      <p className={styles.truthBoundary}><strong>Official / verified data stays above.</strong> Messages below never change Legal Truth or GEO colours.</p>

      {!identity ? (
        <div className={styles.identityBox}>
          <label className={styles.label} htmlFor="truth-map-social-name">Choose a pseudonym</label>
          <div className={styles.inlineRow}>
            <input id="truth-map-social-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={40} data-testid="truth-map-social-name" />
            <button type="button" onClick={() => void signIn()} disabled={busy || displayName.trim().length < 2} data-testid="truth-map-social-sign-in">Join</button>
          </div>
          <p>Creates a server-side identity and HttpOnly session. No email, GPS history, public user pin, or exact-distance profile.</p>
        </div>
      ) : (
        <div className={styles.identityRow}>
          <span data-testid="truth-map-social-identity">{identity.displayName}</span>
          <div className={styles.actions}>
            <button type="button" onClick={() => void signOut()}>Sign out</button>
            <button type="button" onClick={() => void deleteAccount()}>Delete account</button>
          </div>
        </div>
      )}

      {identity ? <PrivateDmPanel config={config} identity={identity} /> : null}

      <div className={styles.controls}>
        <label>Space
          <select value={discussionType} onChange={(event) => {
            setDiscussionType(event.target.value as typeof discussionType);
            setSelectedId(null);
            setSelectedMapArea(null);
          }} data-testid="truth-map-social-space">
            <option value="MAP">MAP · 24h active</option>
            <option value="GEO">GEO · persistent</option>
            <option value="LAW">LAW · persistent</option>
          </select>
        </label>
        <label>Sort
          <select value={sort} onChange={(event) => setSort(event.target.value as "NEW" | "TOP")}>
            <option value="NEW">NEW</option>
            <option value="TOP">TOP</option>
          </select>
        </label>
      </div>

      {discussionType === "GEO" ? <label className={styles.label}>GEO ID<input value={geoId} onChange={(event) => setGeoId(event.target.value)} /></label> : null}
      {discussionType === "LAW" ? <label className={styles.label}>Law ID<input value={lawId} onChange={(event) => setLawId(event.target.value)} /></label> : null}
      {discussionType === "MAP" && selectedMapArea ? (
        <div className={styles.mapAreaFocus} data-testid="truth-map-social-map-area-focus">
          <span>{selectedMapArea.activeDiscussionCount} active discussion{selectedMapArea.activeDiscussionCount === 1 ? "" : "s"} in this area</span>
          <button type="button" onClick={() => setSelectedMapArea(null)}>Show current view</button>
        </div>
      ) : null}

      {identity ? (
        <div className={styles.composerBox}>
          <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={240} placeholder="Title (optional)" />
          <textarea
            className={styles.composer}
            data-testid="truth-map-social-composer"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder={discussionType === "MAP" ? "Post to a privacy-safe area — raw GPS stays in this browser." : "Start a persistent community discussion."}
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
                {safeArea ? `Safe area ready · H3 r${safeArea.geoResolution}` : "Use privacy-safe map centre"}
              </button>
              <button type="button" className={styles.secondary} onClick={() => void requestSafeArea().then(() => setStatus("PRIVACY_SAFE_AREA_READY")).catch((error) => setStatus(error.message))}>
                Use privacy-safe current area
              </button>
            </div>
          ) : null}
          <button className={styles.send} type="button" onClick={() => void createDiscussion()} disabled={busy || !body.trim()} data-testid="truth-map-social-send">Post discussion</button>
        </div>
      ) : null}

      <div className={styles.list} data-testid="truth-map-social-discussions">
        {discussions.map((discussion) => (
          <article key={discussion.id} className={discussion.id === selectedId ? styles.selectedCard : styles.discussionCard}>
            <button type="button" className={styles.cardOpen} onClick={() => setSelectedId(discussion.id)}>
              <strong>{discussion.title || discussion.body.slice(0, 72)}</strong>
              <span>{discussion.authorDisplayName || shortAuthor(discussion.authorId)} · {discussion.replyCount} replies · {discussion.voteScore} votes</span>
            </button>
            <div className={styles.actions}>
              <button type="button" disabled={!identity} onClick={() => void vote("DISCUSSION", discussion.id, 1)}>▲</button>
              <button type="button" disabled={!identity} onClick={() => void vote("DISCUSSION", discussion.id, -1)}>▼</button>
              <button type="button" disabled={!identity} onClick={() => void report("DISCUSSION", discussion.id)}>Report</button>
              {identity?.userId === discussion.authorId
                ? <button type="button" onClick={() => void removeContent("DISCUSSION", discussion.id)}>Delete</button>
                : <button type="button" disabled={!identity} onClick={() => void blockAuthor(discussion.authorId)}>Block author</button>}
            </div>
          </article>
        ))}
        {discussions.length === 0 ? <p>No active discussion in this bounded view.</p> : null}
      </div>

      {selected ? (
        <section className={styles.thread} data-testid="truth-map-social-thread">
          <div className={styles.threadHeader}>
            <strong>{selected.title || "Discussion"}</strong>
            <button type="button" onClick={() => setSelectedId(null)}>Close</button>
          </div>
          <p>{selected.body}</p>
          {comments.map((comment) => (
            <article key={comment.id} className={comment.parentCommentId ? styles.nestedComment : styles.comment}>
              <p>{comment.body}</p>
              <div className={styles.actions}>
                <span>{comment.authorDisplayName || shortAuthor(comment.authorId)} · {comment.voteScore}</span>
                <button type="button" disabled={!identity} onClick={() => setReplyTo(comment.id)}>Reply</button>
                <button type="button" disabled={!identity} onClick={() => void vote("COMMENT", comment.id, 1)}>▲</button>
                <button type="button" disabled={!identity} onClick={() => void report("COMMENT", comment.id)}>Report</button>
                {identity?.userId === comment.authorId
                  ? <button type="button" onClick={() => void removeContent("COMMENT", comment.id)}>Delete</button>
                  : null}
              </div>
            </article>
          ))}
          {identity ? (
            <div className={styles.commentComposer}>
              {replyTo ? <span>Nested reply · <button type="button" onClick={() => setReplyTo(null)}>cancel</button></span> : null}
              <textarea value={commentBody} onChange={(event) => setCommentBody(event.target.value)} rows={2} maxLength={8_000} placeholder="Write a community reply" data-testid="truth-map-social-comment" />
              <button type="button" disabled={busy || !commentBody.trim()} onClick={() => void createComment()} data-testid="truth-map-social-comment-send">Reply</button>
            </div>
          ) : null}
        </section>
      ) : null}

      <p className={styles.status} data-testid="truth-map-social-status">{status}</p>
    </aside>
  );
}
