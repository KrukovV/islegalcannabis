"use client";

import type { RuntimeIdentity } from "@/lib/runtimeIdentity";
import RuntimeParityBadge from "./RuntimeParityBadge";
import styles from "./MapRemovedScreen.module.css";

type Props = {
  runtimeIdentity: RuntimeIdentity;
  visibleStamp: string;
};

export default function MapRemovedScreen({ runtimeIdentity, visibleStamp }: Props) {
  return (
    <section className={styles.placeholderRoot} data-testid="map-placeholder" aria-label="Map removed">
      <div className={styles.placeholderCard}>
        <div className={styles.eyebrow}>Map Removed</div>
        <h2>Map temporarily removed for rebuild</h2>
        <p>
          Product map runtime is fully removed. Truth data, snapshot metadata, and runtime parity remain active while a
          new map subsystem is rebuilt from a clean base.
        </p>
        <div className={styles.actions}>
          <a className={styles.primaryLink} href="/wiki-truth" data-testid="map-placeholder-link">
            Open Wiki Truth
          </a>
          <div className={styles.secondaryMeta} data-testid="map-placeholder-runtime">
            RUNTIME={runtimeIdentity.mapRuntime.toUpperCase()}
          </div>
        </div>
        <div
          className={styles.runtimeBox}
          data-testid="runtime-stamp"
          data-build-id={runtimeIdentity.buildId}
          data-commit={runtimeIdentity.commit}
          data-built-at={runtimeIdentity.builtAt}
          data-dataset-hash={runtimeIdentity.datasetHash}
          data-final-snapshot-id={runtimeIdentity.finalSnapshotId}
          data-snapshot-built-at={runtimeIdentity.snapshotBuiltAt}
          data-runtime-mode={runtimeIdentity.runtimeMode}
          data-map-renderer={runtimeIdentity.mapRenderer}
          data-map-runtime={runtimeIdentity.mapRuntime}
          data-expected-origin={runtimeIdentity.expectedOrigin}
          data-dev-server-pid={runtimeIdentity.devServerPid}
          data-session-marker={runtimeIdentity.sessionMarker}
        >
          <RuntimeParityBadge runtimeIdentity={runtimeIdentity} />
          <div data-testid="build-stamp">{visibleStamp}</div>
          <div data-testid="snapshot-stamp">
            SNAPSHOT_BUILT={runtimeIdentity.snapshotBuiltAt} · MAP_ENABLED=0 · PREMIUM={runtimeIdentity.premiumMode} · NEARBY={runtimeIdentity.nearbyMode}
          </div>
        </div>
      </div>
    </section>
  );
}
