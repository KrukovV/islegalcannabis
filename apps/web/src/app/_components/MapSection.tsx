 "use client";

import dynamic from "next/dynamic";

type MapSectionProps = {
  enabled: boolean;
};

const DynamicLeafletMap = dynamic(() => import("./LeafletMap"), {
  ssr: false
});

export default function MapSection({ enabled }: MapSectionProps) {
  if (!enabled) {
    return (
      <div>
        <h2>Map disabled in CI</h2>
        <p>Set MAP_ENABLED=1 to render the interactive map locally.</p>
      </div>
    );
  }

  return <DynamicLeafletMap />;
}
