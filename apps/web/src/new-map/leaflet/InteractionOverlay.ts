type PointerHandlers = {
  onMove: (_event: PointerEvent) => void;
  onLeave: (_event: PointerEvent) => void;
};

export function attachLeafletPointerOverlay(container: HTMLElement, handlers: PointerHandlers) {
  container.addEventListener("pointermove", handlers.onMove as EventListener, { passive: true });
  container.addEventListener("pointerleave", handlers.onLeave as EventListener, { passive: true });
  container.dataset.leafletOverlay = "native-pointer";

  return () => {
    container.removeEventListener("pointermove", handlers.onMove as EventListener);
    container.removeEventListener("pointerleave", handlers.onLeave as EventListener);
  };
}
