import { useState } from "react";

// Runs a widget's button actions. `busy` names the running kind (for the
// button's spinner) and `failed` stays true until the next run, so the view can
// tell the merchant. `run` resolves true when the action succeeded.
export const useAction = <K extends string>() => {
  const [busy, setBusy] = useState<K | null>(null);
  const [failed, setFailed] = useState(false);

  const run = async (
    kind: K | null,
    action: () => Promise<void>,
    onFail?: () => void
  ) => {
    setBusy(kind);
    setFailed(false);
    let ok = true;
    try {
      await action();
    } catch {
      ok = false;
      setFailed(true);
      onFail?.();
    }
    setBusy(null);
    return ok;
  };

  return { busy, failed, pending: busy !== null, run };
};
