"use client";

import { useEffect } from "react";

export default function WikiTruthPrintExpansion() {
  useEffect(() => {
    const getAuditDetails = () =>
      Array.from(document.querySelectorAll(".auditView details")) as HTMLDetailsElement[];

    let restoreState: Array<{ element: HTMLDetailsElement; open: boolean }> = [];

    const expandAllDetails = () => {
      const details = getAuditDetails();
      restoreState = details.map((detail) => ({ element: detail, open: detail.open }));
      details.forEach((detail) => {
        detail.open = true;
      });
    };

    const restoreDetails = () => {
      restoreState.forEach(({ element, open }) => {
        element.open = open;
      });
      restoreState = [];
    };

    const beforePrint = () => {
      expandAllDetails();
    };

    const afterPrint = () => {
      restoreDetails();
    };

    window.addEventListener("beforeprint", beforePrint);
    window.addEventListener("afterprint", afterPrint);

    const media = window.matchMedia("print");
    const mediaChangeHandler = (event: MediaQueryListEvent) => {
      if (event.matches) {
        expandAllDetails();
      } else {
        restoreDetails();
      }
    };

    if (media.addEventListener) {
      media.addEventListener("change", mediaChangeHandler);
    } else {
      media.addListener(mediaChangeHandler);
    }

    return () => {
      window.removeEventListener("beforeprint", beforePrint);
      window.removeEventListener("afterprint", afterPrint);
      if (media.removeEventListener) {
        media.removeEventListener("change", mediaChangeHandler);
      } else {
        media.removeListener(mediaChangeHandler);
      }
      restoreDetails();
    };
  }, []);

  return null;
}
