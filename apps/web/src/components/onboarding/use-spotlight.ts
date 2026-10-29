"use client";

import "driver.js/dist/driver.css";
import { driver } from "driver.js";
import { useEffect } from "react";

const SEEN_PREFIX = "wovain.launch.spotlight.";
// The step's action may render after its data loads.
const WAIT_FOR_ELEMENT_MS = 4000;

const seen = (key: string) => {
  try {
    return window.localStorage.getItem(SEEN_PREFIX + key) !== null;
  } catch {
    // Storage blocked (private mode): show the highlight, it is harmless.
    return false;
  }
};

const markSeen = (key: string) => {
  try {
    window.localStorage.setItem(SEEN_PREFIX + key, "1");
  } catch {
    // Storage blocked: the highlight may show again next visit.
  }
};

/**
 * Highlights one element with driver.js the first time a step opens on this
 * browser: one popover, dismissable, never repeated once seen.
 */
export const useSpotlight = (
  key: string | undefined,
  spot: { close: string; description: string; selector: string; title: string }
) => {
  const { close, description, selector, title } = spot;
  useEffect(() => {
    if (key === undefined || seen(key)) {
      return;
    }
    const tour = driver({
      allowClose: true,
      onDestroyed: () => markSeen(key),
      overlayClickBehavior: "close",
      stagePadding: 6,
    });
    tour.highlight({
      element: selector,
      // One labelled button that ends the highlight ("Got it").
      popover: {
        closeBtnLabel: close,
        description,
        doneBtnText: close,
        nextBtnText: close,
        onNextClick: () => tour.destroy(),
        showButtons: ["next", "close"],
        title,
      },
      skipMissingElement: true,
      waitForElement: WAIT_FOR_ELEMENT_MS,
    });
    return () => {
      tour.destroy();
    };
  }, [close, description, key, selector, title]);
};
