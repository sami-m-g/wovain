import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import ffmpegPath from "ffmpeg-static";
import { z } from "zod";

import { openBrowser } from "./browser.ts";
import { readJourney, reportDir, shotOf } from "./journey.ts";

// Renders e2e-report/demo.mp4 from the last e2e run: one narrated scene per
// journey step, its caption drawn in HTML beside the step's widget, with
// crossfades and no waiting. Narration is fal's Kokoro voice with FAL_KEY,
// else espeak-ng when it's installed, else captions only.
// The command's stderr (ffmpeg logs there); throws when it fails.
const run = (file: string, args: string[]) => {
  const { error, status, stderr } = spawnSync(file, args, {
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (error !== undefined || status !== 0) {
    throw new Error(`${path.basename(file)} failed: ${stderr.slice(-2000)}`);
  }
  return stderr;
};
const ffmpeg = ffmpegPath ?? "ffmpeg";
const fade = 0.4;
const limit = 175;
const workDir = path.join(reportDir, "demo");

const escape = (text: string) =>
  text.replaceAll(
    /[&<>"]/gu,
    (char) =>
      ({ '"': "&quot;", "&": "&amp;", "<": "&lt;", ">": "&gt;" })[char] ?? char
  );

const falAudioSchema = z.object({ audio: z.object({ url: z.url() }) });

// The narration for one scene as a file, or undefined with no voice at hand.
const speak = async (
  text: string,
  base: string
): Promise<string | undefined> => {
  const key = process.env["FAL_KEY"];
  if (key !== undefined && key !== "") {
    const response = await fetch(
      "https://fal.run/fal-ai/kokoro/american-english",
      {
        body: JSON.stringify({ prompt: text, speed: 1.1, voice: "af_heart" }),
        headers: {
          authorization: `Key ${key}`,
          "content-type": "application/json",
        },
        method: "POST",
      }
    );
    if (!response.ok) {
      throw new Error(`fal's voice answered ${String(response.status)}`);
    }
    const { audio } = falAudioSchema.parse(await response.json());
    const file = `${base}${path.extname(new URL(audio.url).pathname) || ".wav"}`;
    const clip = await fetch(audio.url);
    await writeFile(file, Buffer.from(await clip.arrayBuffer()));
    return file;
  }
  try {
    run("espeak-ng", ["-s", "165", "-w", `${base}.wav`, text]);
    return `${base}.wav`;
  } catch {
    return undefined;
  }
};

const secondsOf = (file: string) => {
  const stderr = run(ffmpeg, ["-i", file, "-f", "null", "-"]);
  const [, h = "0", m = "0", s = "0"] =
    /Duration: (?<h>\d+):(?<m>\d+):(?<s>[\d.]+)/u.exec(stderr) ?? [];
  return Number(h) * 3600 + Number(m) * 60 + Number(s);
};

const slide = (
  counter: string,
  title: string,
  caption: string,
  image: string | undefined
) => `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;width:1280px;height:720px;display:grid;grid-template-columns:${image === undefined ? "1fr" : "440px 1fr"};gap:40px;padding:56px;box-sizing:border-box;background:#0f1115;color:#f3f1ec;font:22px/1.45 system-ui,sans-serif}
.text{display:flex;flex-direction:column;justify-content:center;${image === undefined ? "max-width:820px;margin:auto" : ""}}
small{color:#e9a23b;font-weight:600;letter-spacing:.08em;text-transform:uppercase;font-size:15px}
h1{margin:12px 0 16px;font-size:${image === undefined ? "52px" : "36px"};line-height:1.15}
p{margin:0;color:#c9c5bc}
.shot{display:flex;align-items:center;justify-content:center;min-height:0}
img{max-width:100%;max-height:608px;border-radius:16px;box-shadow:0 12px 40px #0008;background:#fff}
</style></head><body><div class="text"><small>${escape(counter)}</small><h1>${escape(title)}</h1><p>${escape(caption)}</p></div>${
  image === undefined
    ? ""
    : `<div class="shot"><img src="data:image/png;base64,${image}"></div>`
}</body></html>`;

const journey = await readJourney();
await mkdir(workDir, { recursive: true });

const scenes = [
  {
    say: "This is wovain: an MCP server that takes a print-on-demand seller from an idea to live products and a paused Meta campaign, through any agent.",
    shot: undefined,
    title: "wovain",
  },
  ...journey.steps.map((step, index) => ({
    say: step.say,
    shot:
      step.widget === undefined && step.page === undefined
        ? undefined
        : shotOf(index),
    title: step.title,
  })),
  {
    say: `That was ${String(journey.steps.length)} steps, every one checked by the end-to-end test that rendered this video.`,
    shot: undefined,
    title: "Every step, checked",
  },
];

const browser = await openBrowser();
const stills = await Promise.all(
  scenes.map(async (scene, index) => {
    const base = path.join(workDir, String(index).padStart(2, "0"));
    const image =
      scene.shot === undefined
        ? undefined
        : Buffer.from(
            await readFile(path.join(reportDir, scene.shot))
          ).toString("base64");
    const counter =
      index === 0 || index === scenes.length - 1
        ? "wovain"
        : `Step ${String(index)} of ${String(journey.steps.length)}`;
    await browser.still(
      slide(counter, scene.title, scene.say, image),
      `${base}.png`
    );
    return base;
  })
);
await browser.close();

// fal rate-limits a burst, so the lines are voiced one at a time.
const rendered: { audio?: string; image: string; seconds: number }[] = [];
for (const [index, base] of stills.entries()) {
  const say = scenes[index]?.say ?? "";
  // oxlint-disable-next-line no-await-in-loop -- one voice request at a time
  const audio = await speak(say, base);
  const spoken =
    audio === undefined ? say.split(/\s+/u).length / 2.6 : secondsOf(audio);
  rendered.push({
    ...(audio === undefined ? {} : { audio }),
    image: `${base}.png`,
    seconds: Math.max(spoken + 0.7, 2.5),
  });
}

// Each scene starts `fade` seconds before the last one ends.
const starts = rendered.map(
  (_, index) =>
    rendered.slice(0, index).reduce((sum, scene) => sum + scene.seconds, 0) -
    index * fade
);
const total = (starts.at(-1) ?? 0) + (rendered.at(-1)?.seconds ?? 0);
if (total > limit) {
  throw new Error(
    `The demo runs ${total.toFixed(0)} s; keep it under ${String(limit)} s.`
  );
}

const inputs = rendered.flatMap((scene) => [
  "-loop",
  "1",
  "-framerate",
  "30",
  "-t",
  scene.seconds.toFixed(2),
  "-i",
  scene.image,
]);
const voiced = rendered.filter((scene) => scene.audio !== undefined);
const audioInputs = voiced.flatMap((scene) => ["-i", scene.audio ?? ""]);
const silence = rendered.length + voiced.length;
const video = rendered
  .slice(1)
  .map((_, index) => {
    const from = index === 0 ? "[0:v]" : `[x${String(index)}]`;
    return `${from}[${String(index + 1)}:v]xfade=transition=fade:duration=${String(fade)}:offset=${(starts[index + 1] ?? 0).toFixed(2)}[x${String(index + 1)}]`;
  })
  .join(";");
const audio = voiced
  .map((scene, index) => {
    const delay = Math.round(
      ((starts[rendered.indexOf(scene)] ?? 0) + 0.3) * 1000
    );
    return `[${String(rendered.length + index)}:a]adelay=${String(delay)}:all=1[a${String(index)}]`;
  })
  .join(";");
const mix = `${voiced.map((_, index) => `[a${String(index)}]`).join("")}[${String(silence)}:a]amix=inputs=${String(voiced.length + 1)}:normalize=0:duration=longest[a]`;
const out = path.join(reportDir, "demo.mp4");

run(ffmpeg, [
  "-y",
  ...inputs,
  ...audioInputs,
  "-f",
  "lavfi",
  "-t",
  total.toFixed(2),
  "-i",
  "anullsrc=r=44100:cl=stereo",
  "-filter_complex",
  [video || "[0:v]null[x0]", audio, mix].filter(Boolean).join(";"),
  "-map",
  `[x${String(rendered.length - 1)}]`,
  "-map",
  "[a]",
  "-t",
  total.toFixed(2),
  "-c:v",
  "libx264",
  "-pix_fmt",
  "yuv420p",
  "-r",
  "30",
  "-c:a",
  "aac",
  "-movflags",
  "+faststart",
  out,
]);
console.log(
  `Demo: ${out} (${total.toFixed(1)} s, ${voiced.length === 0 ? "captions only" : "narrated"})`
);
