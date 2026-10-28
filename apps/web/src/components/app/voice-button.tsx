"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@wovain/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@wovain/ui/components/dialog";
import { Spinner } from "@wovain/ui/components/spinner";
import { Mic } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { posthog } from "posthog-js";
import { useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { toast } from "sonner";

import { usePathname, useRouter } from "@/i18n/navigation";
import type { VoiceCommand } from "@/lib/flow-client";
import { orpc } from "@/utils/orpc";

/**
 * Hold to talk (openspec voice-commands): hold the mic, say a command,
 * release, check what wovain understood, confirm. The clip goes to wovain's
 * server and nowhere else from here; nothing runs before Confirm. Shown only
 * while the voice-input flag is on for this merchant.
 */

// Matches the server's cap (packages/core/src/voice.ts MAX_CLIP_SECONDS).
const MAX_CLIP_MS = 30_000;
// Plenty for speech, and under the server's MAX_AUDIO_BITS_PER_SECOND, so a
// 30 s clip fits the server's size cap.
const RECORDING_BITS_PER_SECOND = 48_000;
// A refused or missing microphone is the merchant's to fix, not a bug.
const EXPECTED_MIC_ERRORS = new Set(["NotAllowedError", "NotFoundError"]);
// The first type this browser records in: Opus in WebM (Chrome, Firefox),
// AAC in MP4 (Safari).
const RECORDING_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];
// Set once the merchant has read what voice sends where.
const DISCLOSED_KEY = "wovain.voice.disclosed";
const NEW_DROP_PATH = "/dashboard/new";

const recordingType = () =>
  RECORDING_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";

const toBase64 = async (blob: Blob) => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCodePoint(byte);
  }
  return btoa(binary);
};

// The screen the merchant is on, which decides what "this one" can mean.
const useScreen = () => {
  const pathname = usePathname();
  const runId = useSearchParams().get("run") ?? undefined;
  if (pathname === NEW_DROP_PATH && runId !== undefined) {
    return { runId, screen: "run" as const };
  }
  return {
    screen:
      pathname === NEW_DROP_PATH ? ("new_drop" as const) : ("home" as const),
  };
};

const ProposalText = ({ command }: { command: VoiceCommand }) => {
  const t = useTranslations("Voice");
  const { proposal } = command;
  switch (proposal.kind) {
    case "start_drop": {
      return t("startDrop", { brief: proposal.brief });
    }
    case "approve_ideas": {
      return t("approveIdeas", {
        count: proposal.ideaIds.length,
        ideas: proposal.labels.join(", "),
      });
    }
    case "approve_design": {
      return t("approveDesign", { design: proposal.label });
    }
    case "reject_design": {
      return proposal.reason === undefined
        ? t("rejectDesign", { design: proposal.label })
        : t("rejectDesignWhy", {
            design: proposal.label,
            reason: proposal.reason,
          });
    }
    case "decide_approval": {
      return proposal.approve
        ? t("approveAction", { action: proposal.label })
        : t("rejectAction", { action: proposal.label });
    }
    default: {
      return proposal.code === "not_heard" ? t("notHeard") : t("canDo");
    }
  }
};

// What wovain heard, and the model's own reply when it found nothing to do
// (an optional extra under the translated message).
const Heard = ({ command }: { command: VoiceCommand }) => {
  const t = useTranslations("Voice");
  const { proposal, transcript } = command;
  const reply =
    proposal.kind === "none" && proposal.reason !== undefined
      ? proposal.reason
      : undefined;
  return (
    <>
      {reply === undefined ? null : <p className="text-sm">{reply}</p>}
      {transcript === "" ? null : (
        <p className="text-muted-foreground text-sm">
          {t("heard", { transcript })}
        </p>
      )}
    </>
  );
};

export const VoiceButton = () => {
  const t = useTranslations("Voice");
  const status = useQuery(orpc.voice.status.queryOptions());
  const context = useScreen();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [recording, setRecording] = useState(false);
  const [disclosing, setDisclosing] = useState(false);
  const [command, setCommand] = useState<VoiceCommand | undefined>();
  const recorder = useRef<MediaRecorder | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // True from press to release, so a release during the microphone prompt
  // still stops the recording.
  const held = useRef(false);

  const propose = useMutation({
    mutationFn: async ({ clip, mimeType }: { clip: Blob; mimeType: string }) =>
      await orpc.voice.command.call({
        audio: await toBase64(clip),
        mimeType,
        ...context,
      }),
    onError: (error) => toast.error(error.message),
    onSuccess: setCommand,
  });

  const confirm = useMutation({
    mutationFn: async (token: string) =>
      await orpc.voice.confirm.call({ token }),
    onError: (error) => toast.error(error.message),
    onSuccess: async (done) => {
      setCommand(undefined);
      toast.success(t("done"));
      await queryClient.invalidateQueries();
      if (done.runId !== null) {
        router.push({ pathname: NEW_DROP_PATH, query: { run: done.runId } });
      }
    },
  });

  const stop = () => {
    held.current = false;
    clearTimeout(timer.current);
    if (recorder.current?.state === "recording") {
      recorder.current.stop();
    }
  };

  const record = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Released while the browser was still asking for the microphone.
    if (!held.current) {
      for (const track of stream.getTracks()) {
        track.stop();
      }
      return;
    }
    const type = recordingType();
    const media = new MediaRecorder(stream, {
      audioBitsPerSecond: RECORDING_BITS_PER_SECOND,
      ...(type === "" ? {} : { mimeType: type }),
    });
    const chunks: Blob[] = [];
    media.addEventListener("dataavailable", (event) => chunks.push(event.data));
    media.addEventListener("stop", () => {
      for (const track of stream.getTracks()) {
        track.stop();
      }
      setRecording(false);
      const clip = new Blob(chunks, { type: media.mimeType });
      if (clip.size > 0) {
        propose.mutate({ clip, mimeType: media.mimeType });
      }
    });
    recorder.current = media;
    media.start();
    setRecording(true);
    timer.current = setTimeout(stop, MAX_CLIP_MS);
  };

  // A refused or missing microphone is the merchant's to fix. Anything else
  // (no MediaRecorder, a busy device, an unsupported type) breaks voice, so
  // it goes to PostHog Error Tracking before the merchant sees a toast.
  const listen = useMutation({
    mutationFn: record,
    onError: (error) => {
      if (
        error instanceof DOMException &&
        EXPECTED_MIC_ERRORS.has(error.name)
      ) {
        toast.error(t("noMic"));
        return;
      }
      posthog.captureException(error, { feature: "voice-input" });
      toast.error(t("recordFailed"));
    },
  });

  if (status.data?.enabled !== true) {
    return null;
  }

  const start = () => {
    if (localStorage.getItem(DISCLOSED_KEY) === null) {
      setDisclosing(true);
      return;
    }
    if (recording || propose.isPending) {
      return;
    }
    held.current = true;
    listen.mutate();
  };

  // Space or Enter toggles, for keyboards and switch access.
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if ((event.key !== " " && event.key !== "Enter") || event.repeat) {
      return;
    }
    event.preventDefault();
    if (recording) {
      stop();
    } else {
      start();
    }
  };

  let label = t("hold");
  if (recording) {
    label = t("listening");
  } else if (propose.isPending) {
    label = t("thinking");
  }
  const busy = recording || propose.isPending;

  return (
    <>
      <Button
        aria-label={label}
        aria-pressed={recording}
        disabled={propose.isPending || confirm.isPending}
        onKeyDown={onKeyDown}
        onPointerCancel={stop}
        onPointerDown={start}
        onPointerLeave={stop}
        onPointerUp={stop}
        size="icon"
        title={label}
        variant={recording ? "default" : "ghost"}
      >
        {propose.isPending ? (
          <Spinner />
        ) : (
          <Mic
            aria-hidden="true"
            className={recording ? "animate-pulse" : undefined}
          />
        )}
      </Button>
      <span aria-live="polite" className="sr-only">
        {busy ? label : ""}
      </span>

      <Dialog onOpenChange={setDisclosing} open={disclosing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("disclosureTitle")}</DialogTitle>
            <DialogDescription>{t("disclosure")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => {
                localStorage.setItem(DISCLOSED_KEY, new Date().toISOString());
                setDisclosing(false);
              }}
            >
              {t("disclosureOk")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            setCommand(undefined);
          }
        }}
        open={command !== undefined}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {command?.token === undefined
                ? t("notUnderstood")
                : t("confirmTitle")}
            </DialogTitle>
            <DialogDescription>
              {command === undefined ? null : (
                <ProposalText command={command} />
              )}
            </DialogDescription>
          </DialogHeader>
          {command === undefined ? null : <Heard command={command} />}
          <DialogFooter showCloseButton>
            {command?.token === undefined ? null : (
              <Button
                disabled={confirm.isPending}
                onClick={() => confirm.mutate(command.token ?? "")}
              >
                {confirm.isPending ? <Spinner /> : null}
                {t("confirm")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
