import type { ConfidenceLevel, LocationMethod } from "@islegal/shared";
import {
  formatLocationMethodHint,
  formatLocationMethodLabel
} from "@/lib/geo/locationResolution";

type LocationMetaProps = {
  method?: LocationMethod;
  confidence?: ConfidenceLevel;
  mode?: "detected" | "query";
  note?: string;
  className?: string;
  labelClassName?: string;
  hintClassName?: string;
};

export default function LocationMeta({
  method,
  confidence,
  mode = "detected",
  note,
  className,
  labelClassName,
  hintClassName
}: LocationMetaProps) {
  if (mode === "query") {
    return (
      <div className={className}>
        <span className={labelClassName}>Source: Query parameters</span>
      </div>
    );
  }

  if (!method || !confidence) {
    return null;
  }

  const label = formatLocationMethodLabel({ method, confidence });
  const hint = formatLocationMethodHint({ method, confidence });

  return (
    <div className={className}>
      <span className={labelClassName}>{label}</span>
      <span className={hintClassName}>Confidence: {confidence}</span>
      {hint ? <span className={hintClassName}>{hint}</span> : null}
      {note ? <span className={hintClassName}>{note}</span> : null}
    </div>
  );
}
