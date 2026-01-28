"use client";

import { useEffect } from "react";
import { loadManualSelection } from "@/lib/geo/manual_store";
import { writeGeoLoc } from "@/lib/ssot/write_ssot";

export default function GeoInit() {
  useEffect(() => {
    const manual = loadManualSelection();
    if (!manual) return;
    writeGeoLoc({
      source: "manual",
      iso: manual.iso,
      state: manual.state,
      confidence: 1.0
    });
  }, []);

  return null;
}
