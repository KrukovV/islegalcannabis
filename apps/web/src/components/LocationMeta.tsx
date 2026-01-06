import {
  formatLocationMethodHint,
  formatLocationMethodLabel
} from "@/lib/geo/locationResolution";
import type { LocationContext } from "@/lib/location/locationContext";

type LocationMetaProps = {
  context: LocationContext;
  className?: string;
  labelClassName?: string;
  hintClassName?: string;
};

export default function LocationMeta({
  context,
  className,
  labelClassName,
  hintClassName
}: LocationMetaProps) {
  if (context.mode === "query") {
    return (
      <div className={className}>
        <span className={labelClassName}>Source: Query parameters</span>
      </div>
    );
  }

  if (!context.method || !context.confidence) {
    return null;
  }

  const modeLabel =
    context.mode === "manual" ? "Mode: Manual" : "Mode: Detected";
  const label = formatLocationMethodLabel({
    method: context.method,
    confidence: context.confidence
  });
  const hint = formatLocationMethodHint({
    method: context.method,
    confidence: context.confidence
  });

  return (
    <div className={className}>
      <span className={labelClassName}>{modeLabel}</span>
      <span className={labelClassName}>{label}</span>
      <span className={hintClassName}>Confidence: {context.confidence}</span>
      {hint ? <span className={hintClassName}>{hint}</span> : null}
    </div>
  );
}
