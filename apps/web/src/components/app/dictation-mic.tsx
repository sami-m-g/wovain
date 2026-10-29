"use client";

import { ORPCError } from "@orpc/client";
import { useMutation, useQuery } from "@tanstack/react-query";
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
import { posthog } from "posthog-js";
import { useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { toast } from "sonner";

import { insertAtCursor } from "@/lib/dictation";
import { orpc } from "@/utils/orpc";

/**
 * Dictation (openspec voice-dictation): hold the mic beside a text field, say
 * the words, release. The transcript is inserted at the cursor and the
 * merchant edits it before they submit. No intent parsing, nothing runs. The
 * clip goes to wovain's server (fal turns it into text) and nowhere else.
 * Shown only while the voice-input flag is on for this merchant.
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

type Field = HTMLInputElement | HTMLTextAreaElement;

const fieldOf = (id: string): Field | undefined => {
  const element = document.querySelector(`#${id}`);
  return element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement
    ? element
    : undefined;
};

export const DictationMic = ({
  field,
  label,
  maxLength,
  onText,
}: {
  /** The id of the input or textarea the words go into. */
  field: string;
  /** The field's name, for the button's label ("Dictate: Brief"). */
  label: string;
  maxLength?: number;
  /** Receives the field's whole new value, to set in its state. */
  onText: (value: string) => void;
}) => {
  const t = useTranslations("Voice");
  const status = useQuery(orpc.voice.status.queryOptions());
  const [recording, setRecording] = useState(false);
  const [disclosing, setDisclosing] = useState(false);
  const recorder = useRef<MediaRecorder | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // True from press to release, so a release during the microphone prompt
  // still stops the recording.
  const held = useRef(false);
  // The cursor when the merchant pressed, before focus moved to the button.
  // and the field's text then, to tell whether it was edited since.
  const cursor = useRef({ end: 0, start: 0, value: "" });

  const insert = (text: string) => {
    const target = fieldOf(field);
    if (target === undefined) {
      return;
    }
    // Edited while the clip was transcribing: the saved selection points
    // into old text, so go in at the caret now and keep the edit.
    const edited = target.value !== cursor.current.value;
    const inserted = insertAtCursor({
      end: edited
        ? (target.selectionEnd ?? target.value.length)
        : cursor.current.end,
      maxLength,
      start: edited
        ? (target.selectionStart ?? target.value.length)
        : cursor.current.start,
      text,
      value: target.value,
    });
    onText(inserted.value);
    // After React has put the new value in, so the caret lands after the words.
    requestAnimationFrame(() => {
      target.focus();
      target.setSelectionRange(inserted.caret, inserted.caret);
    });
  };

  const dictate = useMutation({
    mutationFn: async ({ clip, mimeType }: { clip: Blob; mimeType: string }) =>
      await orpc.voice.dictate.call({ audio: await toBase64(clip), mimeType }),
    onError: (error) => {
      // A procedure that throws is already tracked on the server; a failure
      // before the request (the clip, the network) is only seen here.
      if (!(error instanceof ORPCError)) {
        posthog.captureException(error, { feature: "voice-input" });
      }
      toast.error(error.message);
    },
    onSuccess: ({ text }) => {
      if (text.trim() === "") {
        toast.error(t("notHeard"));
        return;
      }
      insert(text);
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
        dictate.mutate({ clip, mimeType: media.mimeType });
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
    const target = fieldOf(field);
    cursor.current = {
      end: target?.selectionEnd ?? target?.value.length ?? 0,
      start: target?.selectionStart ?? target?.value.length ?? 0,
      value: target?.value ?? "",
    };
    if (localStorage.getItem(DISCLOSED_KEY) === null) {
      setDisclosing(true);
      return;
    }
    if (recording || dictate.isPending) {
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

  let state = "";
  if (recording) {
    state = t("listeningField");
  } else if (dictate.isPending) {
    state = t("transcribing");
  }

  return (
    <>
      <Button
        aria-label={t("dictate", { field: label })}
        aria-pressed={recording}
        disabled={dictate.isPending}
        onKeyDown={onKeyDown}
        onPointerCancel={stop}
        onPointerDown={(event) => {
          // Keeps the field's focus and selection while the mic is held.
          event.preventDefault();
          start();
        }}
        onPointerLeave={stop}
        onPointerUp={stop}
        size="icon-sm"
        title={t("dictateHint")}
        type="button"
        variant={recording ? "default" : "ghost"}
      >
        {dictate.isPending ? (
          <Spinner />
        ) : (
          <Mic
            aria-hidden="true"
            className={recording ? "animate-pulse" : undefined}
          />
        )}
      </Button>
      <output aria-live="polite" className="sr-only">
        {state}
      </output>

      <Dialog onOpenChange={setDisclosing} open={disclosing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("disclosureTitle")}</DialogTitle>
            <DialogDescription>{t("disclosureDictation")}</DialogDescription>
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
    </>
  );
};
