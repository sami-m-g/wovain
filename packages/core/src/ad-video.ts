import { z } from "zod";

import type { Buyers } from "./brand-discovery";
import { findOne } from "./upstream";

// Director-made video ads (openspec director-video-ads): a Director agent
// writes a 15 to 20 second 9:16 ad from the drop's evidence, fal casts a
// person matching the idea's Qloo buyers in the actual shirt, films it with
// native audio, crops a 4:5 feed cut and burns in the captions, and a
// Reviewer agent checks it. This file holds the data: the models, the
// agents' schemas and prompts, and each fal call's input. The workflow is
// packages/mastra/src/mastra/workflows/ad-video.ts.
//
// The models were picked with the fal MCP on 2026-10-30 (design.md of the
// change): Nano Banana Pro edit casts ($0.15 an image), Wan 3.0 Prime films
// with native audio ($0.05 a second), scale-video crops, VEED burns the
// captions ($0.10 a minute) and extract-frame reads frames for the
// Reviewer. About $1.28 an ad, $2.56 with the one redo.

export const AD_VIDEO_MODELS_VAR = "FAL_AD_VIDEO_MODELS";

const endpoint = z.string().min(1);

export const adVideoModelsSchema = z.strictObject({
  // Burns an SRT into a video (veed/subtitles).
  captions: endpoint,
  // Puts a person in the shirt, from the mockup and the art (an image edit).
  cast: endpoint,
  // Films the ad from the cast still, with native audio (image-to-video).
  film: endpoint,
  // Reads one frame of a video (first, middle or last).
  frame: endpoint,
  // Crops the 9:16 film to the 4:5 feed cut.
  resize: endpoint,
});
export type AdVideoModels = z.infer<typeof adVideoModelsSchema>;

// The models from their JSON; undefined where the environment sets none
// (director-made ads are off there). An invalid value throws, naming the
// variable.
export const parseAdVideoModels = (raw?: string): AdVideoModels | undefined => {
  if (raw === undefined || raw.trim() === "") {
    return undefined;
  }
  const parsed = adVideoModelsSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    throw new Error(
      `${AD_VIDEO_MODELS_VAR} is invalid: ${z.prettifyError(parsed.error)}`
    );
  }
  return parsed.data;
};

// The two cuts: Reels and Stories, then the feed.
export const AD_CUTS = ["9:16", "4:5"] as const;
export type AdCut = (typeof AD_CUTS)[number];

// The 4:5 cut of Wan's 720x1280 film.
const FEED_CUT = { height: 900, width: 720 } as const;

// The last caption cue: the call to action, then the disclosure.
export const AI_LABEL = "AI-generated model";

// ---------------------------------------------------------------------------
// The Director

const HOOK_SECONDS = 3;
export const MIN_SECONDS = 15;
export const MAX_SECONDS = 20;
const MIN_SHOT_SECONDS = 3;
const CTA_SECONDS = 3;
// The AI disclosure's own last seconds.
const LABEL_SECONDS = 1.5;

export const GENDERS = ["woman", "man"] as const;
export type CastGender = (typeof GENDERS)[number];

export const adConceptSchema = z.object({
  // The one idea the ad sells, in a few words.
  angle: z.string().min(1).max(80),
  cast: z.object({
    // The age range, e.g. "25 to 29"; code sets it from Qloo when it can.
    age: z.string().min(1).max(20),
    gender: z.enum(GENDERS),
    // Hair, styling, expression and what else they wear (never the shirt).
    look: z.string().min(1).max(240),
    // Where the ad is shot.
    setting: z.string().min(1).max(240),
  }),
  // The call to action, on screen for the last seconds.
  cta: z.string().min(1).max(28),
  // The on-screen hook, the first three seconds.
  hook: z.string().min(1).max(48),
  shots: z
    .array(
      z.object({
        // What the person and the camera do in this shot.
        action: z.string().min(1).max(320),
        seconds: z.number().int().min(1).max(10),
        // On-screen text during this shot ("" for none); the first shot's
        // text is the hook.
        text: z.string().max(48),
      })
    )
    .min(3)
    .max(4),
  sound: z.object({
    ambient: z.string().max(160),
    // At most one short spoken line by the model ("" for none).
    line: z.string().max(90),
    music: z.string().min(1).max(200),
  }),
});
export type AdConcept = z.infer<typeof adConceptSchema>;

// What the Director writes from: all of it from wovain's own records.
export interface AdEvidence {
  audience: {
    // Qloo's age band of the buyers, e.g. "25_to_29".
    age?: string | undefined;
    // The Qloo audiences the buyers belong to, by name.
    audiences: string[];
    gender?: Buyers["gender"];
  };
  // The idea: what to make, who buys it and when they wear it.
  idea: {
    buyer?: string | undefined;
    concept?: string | undefined;
    occasion?: string | undefined;
    theme: string;
  };
  product: { description: string; title: string };
  // The drop's tone (drop-style), when it has one.
  tone?: string | undefined;
  // Why the idea sells now (the research's line).
  whyNow?: string | undefined;
}

// Qloo's age bands as a cast's age range: always an adult.
const AGE_RANGES: Record<string, string> = {
  "24_and_younger": "21 to 24",
  "25_to_29": "25 to 29",
  "30_to_34": "30 to 34",
  "35_to_44": "35 to 44",
  "45_to_54": "45 to 54",
  "55_and_older": "55 to 64",
};

// Who the ad casts, where Qloo says: the buyers' gender lean and age band.
// A mixed or unknown lean leaves the Director's pick.
export const castOf = (
  audience: AdEvidence["audience"]
): { age?: string; gender?: CastGender } => {
  const age = audience.age === undefined ? undefined : AGE_RANGES[audience.age];
  let gender: CastGender | undefined;
  if (audience.gender === "female") {
    gender = "woman";
  } else if (audience.gender === "male") {
    gender = "man";
  }
  return {
    ...(age !== undefined && { age }),
    ...(gender !== undefined && { gender }),
  };
};

export const DIRECTOR_RULES = `You are the creative director of a short video ad for Meta Reels and Stories that sells one print-on-demand t-shirt. Answer only with JSON.

The ad:
- 9:16, ${MIN_SECONDS} to ${MAX_SECONDS} seconds, 3 or 4 shots of 3 to 6 seconds each, the first shot exactly ${HOOK_SECONDS} seconds.
- One person (an adult) wears the shirt in every shot, its print facing the camera most of the time. Nobody else is on screen.
- The hook is the first ${HOOK_SECONDS} seconds: the person and the print are on screen from the first frame, already moving, and the hook text (6 words at most) gives a reason to keep watching, drawn from the audience, the occasion or why now. No logo intro, no slow build.
- Made for sound off and better with sound on: every message is on-screen text (6 words at most per shot), the sound adds a music bed, ambient sound and at most one short spoken line, which is also that shot's text.
- Shots: each action says what the person does and what the camera does (push-in, orbit, handheld walk, close-up on the print). Keep the print readable: no turning away for long, no hiding it under a jacket or bag.
- End on the call to action (3 words at most, e.g. "Shop the drop").
- Write for the audience field: their age, their world and the occasion, without naming any brand, person or audience.

Meta's rules: never assert or imply the viewer's personal attributes (age, gender, body, health, money, identity), no prices, discounts, scarcity or claims the input doesn't give, no celebrities, brands or logos, nothing sexual, no before and after.

The cast field: the person's gender and age range (keep the ones the input fixes), their look (hair, styling, expression, what else they wear with the shirt) and the setting.`;

const REVISE_RULES =
  "\n\nThe reviewer rejected your last concept (the previous field) for the reasons in the fixes field. Write it again with every fix applied; keep what worked.";

// The Director's prompt: the evidence, the cast code fixes, and on a redo
// the last concept with the Reviewer's fixes.
export const directorPrompt = (
  evidence: AdEvidence,
  revision?: { fixes: string[]; previous: AdConcept }
) =>
  JSON.stringify({
    ...evidence,
    cast: castOf(evidence.audience),
    ...(revision !== undefined && revision),
  });

export const directorSystem = (revising: boolean) =>
  revising ? DIRECTOR_RULES + REVISE_RULES : DIRECTOR_RULES;

// The concept with the cast Qloo fixes: the Director's choice only where
// Qloo has none.
export const castConcept = (
  concept: AdConcept,
  audience: AdEvidence["audience"]
): AdConcept => ({
  ...concept,
  cast: { ...concept.cast, ...castOf(audience) },
});

export interface TimedShot {
  action: string;
  end: number;
  start: number;
  text: string;
}

// The shots on a clean timeline: the hook exactly 3 seconds, every other
// shot at least 3, the whole ad 15 to 20 seconds. The Director's lengths
// set the proportions; the model's arithmetic is never trusted.
export const timeline = (concept: AdConcept) => {
  const [first, ...rest] = concept.shots;
  const asked = rest.reduce((sum, shot) => sum + shot.seconds, 0);
  const restMin = rest.length * MIN_SHOT_SECONDS;
  const restTotal = Math.min(
    MAX_SECONDS - HOOK_SECONDS,
    Math.max(MIN_SECONDS - HOOK_SECONDS, restMin, asked)
  );
  // Whole seconds: the extra over each shot's floor goes by the Director's
  // proportions, the remainder to the last shot.
  const spare = restTotal - restMin;
  const weights = rest.map((shot) =>
    Math.max(shot.seconds - MIN_SHOT_SECONDS, 0)
  );
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  const lengths = rest.map((_, index) =>
    weightSum === 0
      ? MIN_SHOT_SECONDS + Math.floor(spare / rest.length)
      : MIN_SHOT_SECONDS +
        Math.floor((spare * (weights[index] ?? 0)) / weightSum)
  );
  const given = lengths.reduce((sum, length) => sum + length, 0);
  const lastIndex = lengths.length - 1;
  lengths[lastIndex] = (lengths[lastIndex] ?? 0) + restTotal - given;
  const shots: TimedShot[] = [];
  let at = 0;
  for (const [index, shot] of [first, ...rest].entries()) {
    if (shot === undefined) {
      continue;
    }
    const seconds = index === 0 ? HOOK_SECONDS : (lengths[index - 1] ?? 0);
    shots.push({
      action: shot.action,
      end: at + seconds,
      start: at,
      text: index === 0 ? concept.hook : shot.text,
    });
    at += seconds;
  }
  return { seconds: at, shots };
};

// ---------------------------------------------------------------------------
// fal inputs

// Nano Banana Pro edit: the mockup shows the shirt, the art is the print to
// keep exact.
export const castInput = (
  { artworkUrl, mockupUrl }: { artworkUrl: string; mockupUrl: string },
  concept: AdConcept
) => ({
  aspect_ratio: "9:16",
  image_urls: [mockupUrl, artworkUrl],
  num_images: 1,
  output_format: "png",
  prompt: [
    `A photorealistic vertical photo for a fashion ad: a ${concept.cast.gender} aged ${concept.cast.age}, wearing exactly the t-shirt in the first image.`,
    "The shirt keeps its color and cut, and its print is the artwork in the second image: the same artwork, colors and words, in the same place and size, flat and fully visible, never warped, cropped, mirrored or redrawn. Add no other text, logo or graphic anywhere.",
    `Look: ${concept.cast.look}.`,
    `Setting: ${concept.cast.setting}.`,
    "Framed from mid-thigh up, facing the camera, natural light, sharp focus on the print. Any sign in the background carries no readable words. The first frame of the ad's first shot.",
  ].join(" "),
  resolution: "1K",
});

const TRAILING_STOP = /[.!?]+$/u;

// Wan 3.0 Prime: one take, the shots in a timed prompt, with native audio
// (music across the cuts, ambient sound and at most one line).
export const filmInput = (castUrl: string, concept: AdConcept) => {
  const { seconds, shots } = timeline(concept);
  // The line as said, without the punctuation the prompt adds.
  const speaking = concept.sound.line.trim().replace(TRAILING_STOP, "");
  return {
    aspect_ratio: "9:16",
    audio: true,
    duration: seconds,
    // The prompt is the Director's shot list: a rewrite would lose its
    // timings.
    enable_prompt_expansion: false,
    prompt: [
      `Vertical fashion ad, ${seconds} seconds, photoreal, with hard cuts between the shots below. The person in the first frame is the model in every shot: same face, body and outfit.`,
      "The t-shirt and its print stay exactly as in the first frame: the same artwork, colors and words in the same place, never warped, mirrored, redrawn or hidden for long.",
      ...shots.map(
        (shot, index) =>
          `Shot ${index + 1} (${shot.start}-${shot.end}s): ${shot.action}`
      ),
      `Audio: ${concept.sound.music}, playing from the first second to the last${concept.sound.ambient.trim() === "" ? "" : `; ${concept.sound.ambient}`}.${speaking === "" ? " No speech." : ` The model says once: "${speaking}". No other speech.`}`,
      "No on-screen text, captions, logos or watermarks.",
    ].join("\n"),
    resolution: "720p",
    start_image_url: castUrl,
  };
};

// scale-video: the 4:5 feed cut, center-cropped.
export const feedCutInput = (videoUrl: string) => ({
  ...FEED_CUT,
  mode: "crop",
  video_url: videoUrl,
});

// VEED subtitles from wovain's own SRT (no transcription).
export const captionsInput = (videoUrl: string, srt: string) => ({
  customization: { position: "bottom", shadow: "mid" },
  preset: "simple",
  srt_content: srt,
  video_url: videoUrl,
});

export const frameInput = (
  videoUrl: string,
  frame: "first" | "last" | "middle"
) => ({ frame_type: frame, video_url: videoUrl });

const MS_PER_SECOND = 1000;
const pad = (value: number, width: number) =>
  String(value).padStart(width, "0");
const srtTime = (seconds: number) => {
  const ms = Math.round(seconds * MS_PER_SECOND);
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor(ms / 60_000) % 60;
  const secs = Math.floor(ms / MS_PER_SECOND) % 60;
  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(secs, 2)},${pad(ms % MS_PER_SECOND, 3)}`;
};

// The captions: each shot's text in its shot (the hook first), then the
// call to action and the AI disclosure in the last 3 seconds.
export const srtOf = (concept: AdConcept) => {
  const { seconds, shots } = timeline(concept);
  const ctaStart = seconds - CTA_SECONDS;
  const cues = shots
    .map((shot) => ({
      end: Math.min(shot.end, ctaStart),
      start: shot.start,
      text: shot.text.trim(),
    }))
    .filter((cue) => cue.text !== "" && cue.end > cue.start);
  // Two cues: VEED paces a cue's words through it, so the call to action
  // and the disclosure each get their own time on screen.
  cues.push(
    { end: seconds - LABEL_SECONDS, start: ctaStart, text: concept.cta.trim() },
    { end: seconds, start: seconds - LABEL_SECONDS, text: AI_LABEL }
  );
  return cues
    .map(
      (cue, index) =>
        `${index + 1}\n${srtTime(cue.start)} --> ${srtTime(cue.end)}\n${cue.text}\n`
    )
    .join("\n");
};

// ---------------------------------------------------------------------------
// fal outputs

const https = z.url({ protocol: /^https$/u });

export const imageUrlOf = (reply: unknown) => {
  const { images } = findOne(
    z.object({ images: z.array(z.object({ url: https })).min(1) }),
    reply,
    "image"
  );
  const [image] = images;
  if (image === undefined) {
    throw new Error("fal returned no image");
  }
  return image.url;
};

export const adVideoUrlOf = (reply: unknown) =>
  findOne(z.object({ video: z.object({ url: https }) }), reply, "video").video
    .url;

// ---------------------------------------------------------------------------
// The Reviewer

const check = z.object({ note: z.string().max(300), pass: z.boolean() });

export const reviewSchema = z.object({
  checks: z.object({
    // The design on the shirt matches the art: not warped, cut or redrawn.
    design: check,
    // The first frame and the hook text stop the scroll.
    hook: check,
    // Nothing breaks Meta's advertising policies.
    policy: check,
    // The shirt and its print are clearly visible.
    product: check,
    // The on-screen text is spelled right, readable and off the print.
    text: check,
  }),
  // What the Director should change, one instruction each.
  fixes: z.array(z.string().min(1).max(240)).max(5),
});
export type AdReview = z.infer<typeof reviewSchema>;

export const REVIEWER_RULES = `You review a short fashion video ad for Meta Reels before it runs. Answer only with JSON.

The images, in order: 1. the approved print artwork; 2. the cast still (the ad's first frame, the person wearing the shirt); 3. to 5. the first, middle and last frames of the finished ad, with its captions burned in. The input is the ad's concept: its hook, shots, on-screen text, sound and call to action.

Check each, pass or fail, with a short note:
- hook: the first frame shows the person and the print, and the hook text gives a reason to keep watching.
- product: the shirt and its print are clearly visible and in focus in most frames.
- design: the print matches the artwork (same image, colors and words, same placement); fail any warping, missing or invented parts, misspelled printed words or a mirrored print.
- text: the captions are spelled as the concept says, readable, and don't cover the print; the last frame shows the label "${AI_LABEL}".
- policy: nothing breaks Meta's advertising policies (personal attributes, adult content, misleading claims, a minor on screen, brands or celebrities).

On any fail, list fixes for the creative director: concrete changes to the concept (cast, look, setting, actions, text), one per line.`;

export const reviewPrompt = (concept: AdConcept) =>
  JSON.stringify({
    cta: concept.cta,
    hook: concept.hook,
    shots: timeline(concept).shots,
    sound: concept.sound,
  });

export const reviewPassed = (review: AdReview) =>
  Object.values(review.checks).every((one) => one.pass);

// The video ad's text on Meta, with the disclosure.
export const AI_DISCLOSURE = "Model is AI-generated.";
