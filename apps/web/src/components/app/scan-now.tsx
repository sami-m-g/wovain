"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription } from "@wovain/ui/components/alert";
import { Button } from "@wovain/ui/components/button";
import { Skeleton } from "@wovain/ui/components/skeleton";
import { Spinner } from "@wovain/ui/components/spinner";
import { CircleAlert, CircleCheck, Clock, Radar } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { orpc } from "@/utils/orpc";

// How often the log is read while a scan runs in the background.
const SCAN_POLL_MS = 3000;
// After this long the scan is called slow, and the log is read less often.
const SLOW_MS = 180_000;
const SLOW_POLL_MS = 15_000;
const SECOND_MS = 1000;

type Scan =
  | { kind: "idle" }
  | { kind: "scanning"; requestedAt: string }
  | { kind: "throttled"; lastScanAt: string; nextAt: string }
  | { kind: "failed"; message: string };

/** The seconds since `from`, ticking once a second while `on`. */
const useElapsed = (from: string | undefined) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (from === undefined) {
      return;
    }
    const timer = setInterval(() => setNow(Date.now()), SECOND_MS);
    return () => clearInterval(timer);
  }, [from]);
  return from === undefined
    ? 0
    : Math.max(0, Math.round((now - Date.parse(from)) / SECOND_MS));
};

/**
 * "Scan now": the request, then the background scan's progress. The scan
 * runs on Inngest; it is done when the log's latest scan is newer than the
 * request. While it runs, the caller polls the log at `pollMs`.
 */
export const useScanNow = () => {
  const t = useTranslations("Autopilot");
  const [scan, setScan] = useState<Scan>({ kind: "idle" });
  const requestedAt = scan.kind === "scanning" ? scan.requestedAt : undefined;
  // The same query as the log on the page: polling it here refreshes both.
  const log = useQuery({
    ...orpc.autopilot.log.queryOptions(),
    enabled: requestedAt !== undefined,
    refetchInterval: (query) => {
      const latest = query.state.data?.lastScanAt;
      if (
        requestedAt === undefined ||
        (latest !== null && latest !== undefined && latest >= requestedAt)
      ) {
        return false;
      }
      return Date.now() - Date.parse(requestedAt) > SLOW_MS
        ? SLOW_POLL_MS
        : SCAN_POLL_MS;
    },
  });
  const lastScanAt = log.data?.lastScanAt;
  const suggestions = log.data?.suggestions ?? [];
  const request = useMutation(
    orpc.autopilot.scan.mutationOptions({
      onError: (error) => setScan({ kind: "failed", message: error.message }),
      onSuccess: (reply) =>
        setScan(
          reply.requested
            ? { kind: "scanning", requestedAt: reply.requestedAt }
            : {
                kind: "throttled",
                lastScanAt: reply.lastScanAt,
                nextAt: reply.nextAt,
              }
        ),
    })
  );
  const finished =
    requestedAt !== undefined &&
    lastScanAt !== null &&
    lastScanAt !== undefined &&
    lastScanAt >= requestedAt;
  const found =
    requestedAt === undefined
      ? 0
      : suggestions.filter((each) => each.createdAt >= requestedAt).length;
  const elapsed = useElapsed(finished ? undefined : requestedAt);

  // The toast only announces completion; everything else is inline.
  const announced = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (finished && announced.current !== requestedAt) {
      announced.current = requestedAt;
      toast.success(t("scanDone", { count: found }));
    }
  }, [finished, found, requestedAt, t]);

  const running = requestedAt !== undefined && !finished;
  const slow = running && elapsed * SECOND_MS > SLOW_MS;
  let pollMs: number | false = false;
  if (running) {
    pollMs = slow ? SLOW_POLL_MS : SCAN_POLL_MS;
  }
  return {
    elapsed,
    finished,
    found,
    handleStart: () => request.mutate({}),
    pending: request.isPending,
    pollMs,
    running,
    scan,
    slow,
  };
};

export type ScanNow = ReturnType<typeof useScanNow>;

export const ScanButton = ({ scan }: { scan: ScanNow }) => {
  const t = useTranslations("Autopilot");
  const busy = scan.pending || scan.running;
  return (
    <Button
      aria-busy={busy}
      disabled={busy}
      onClick={scan.handleStart}
      variant="outline"
    >
      {busy ? <Spinner /> : <Radar aria-hidden="true" />}
      {busy ? t("scanning") : t("scanNow")}
    </Button>
  );
};

/** Where the scan's result lands: progress, then the outcome or the error. */
export const ScanStatus = ({ scan }: { scan: ScanNow }) => {
  const t = useTranslations("Autopilot");
  const format = useFormatter();
  if (scan.running) {
    return (
      <div className="flex flex-col gap-3">
        <output
          aria-live="polite"
          className="text-muted-foreground flex items-center gap-2 text-sm"
        >
          <Spinner />
          {/* The ticking seconds stay out of the live region. */}
          <span aria-hidden="true" className="figures">
            {scan.slow
              ? t("scanSlow")
              : t("scanProgress", { seconds: scan.elapsed })}
          </span>
          <span className="sr-only">
            {scan.slow ? t("scanSlow") : t("scanning")}
          </span>
        </output>
        <Skeleton className="h-28 w-full rounded-xl" />
      </div>
    );
  }
  if (scan.finished) {
    return (
      <output aria-live="polite" className="flex items-center gap-2 text-sm">
        <CircleCheck aria-hidden="true" className="text-success size-4" />
        {t("scanDone", { count: scan.found })}
      </output>
    );
  }
  if (scan.scan.kind === "throttled") {
    return (
      <output
        aria-live="polite"
        className="text-muted-foreground flex items-center gap-2 text-sm"
      >
        <Clock aria-hidden="true" className="size-4" />
        {t("scanThrottled", {
          last: format.relativeTime(new Date(scan.scan.lastScanAt)),
          next: format.dateTime(new Date(scan.scan.nextAt), {
            timeStyle: "short",
          }),
        })}
      </output>
    );
  }
  if (scan.scan.kind === "failed") {
    return (
      <Alert variant="destructive">
        <CircleAlert aria-hidden="true" />
        <AlertDescription>
          {t("scanFailed")} {scan.scan.message}
        </AlertDescription>
      </Alert>
    );
  }
  return null;
};
