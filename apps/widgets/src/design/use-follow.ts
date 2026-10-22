import type { Design } from "@wovain/shared/design";
import { useEffect, useState } from "react";

interface Follow {
  design: Design;
  onConfirmed: (design: Design) => Promise<void>;
  poll: (design: Design) => Promise<Design>;
  pollMs: number;
  setDesign: (design: Design) => void;
}

// Follows the stored design while it changes outside the widget: while the
// merchant confirms the approval in a browser tab (`confirming`), and while
// the chat publishes. The confirmation shows as the design turning
// publishing; then onConfirmed tells the chat.
export const useFollow = ({
  design,
  onConfirmed,
  poll,
  pollMs,
  setDesign,
}: Follow) => {
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    const refresh = async () => {
      const saved = await poll(design);
      setDesign(saved);
      if (confirming && saved.status === "publishing") {
        setConfirming(false);
        await onConfirmed(saved);
      }
    };
    const timer = setInterval(() => {
      if (confirming || design.status === "publishing") {
        void refresh();
      }
    }, pollMs);
    return () => {
      clearInterval(timer);
    };
  }, [confirming, design, onConfirmed, poll, pollMs, setDesign]);

  return {
    confirming,
    startConfirming: () => {
      setConfirming(true);
    },
  };
};
