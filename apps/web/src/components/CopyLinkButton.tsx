"use client";

import { useState } from "react";

type CopyLinkButtonProps = {
  className?: string;
};

export default function CopyLinkButton({ className }: CopyLinkButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleClick = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(window.location.href);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      setCopied(false);
    }
  };

  return (
    <button
      className={className}
      type="button"
      onClick={handleClick}
      aria-live="polite"
    >
      {copied ? "Copied" : "Copy link"}
    </button>
  );
}
