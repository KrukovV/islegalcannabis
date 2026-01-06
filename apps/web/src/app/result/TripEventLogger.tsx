"use client";

import { useEffect, useRef } from "react";
import type { TripEvent } from "@islegal/shared";
import { addEvent, getActiveTrip } from "@/lib/tripStore";

type TripEventPayload = Omit<TripEvent, "id" | "tripId" | "ts">;

export default function TripEventLogger({ event }: { event: TripEventPayload }) {
  const loggedRef = useRef(false);

  useEffect(() => {
    if (loggedRef.current) return;
    loggedRef.current = true;
    const trip = getActiveTrip();
    if (!trip) return;
    addEvent(event);
  }, [event]);

  return null;
}
