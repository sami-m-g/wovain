import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

// Burns the brand (first seconds) and a caption (whole clip) into a video with
// positions inside Meta's 9:16 safe zone (top, bottom and sides kept clear;
// bottom 40% free: facebook.com/business/help/980593475366490). Uses
// ffmpeg's drawtext. Meta autoplays ads muted, so the words carry the message.
// Text goes through files, so quotes and colons in captions need no escaping.

export interface OverlayOptions {
  brand: string;
  // A logo image shown in place of the brand text when given.
  logo?: Uint8Array | undefined;
  brandSeconds: number;
  caption: string | undefined;
  ffmpeg: string;
  font: string;
}

const LINE_CHARS = 26;

// drawtext doesn't wrap, so break the caption into short lines.
const wrapCaption = (caption: string, width = LINE_CHARS) => {
  const lines: string[] = [];
  let line = "";
  for (const word of caption.trim().split(/\s+/u)) {
    if (line !== "" && line.length + word.length + 1 > width) {
      lines.push(line);
      line = word;
    } else {
      line = line === "" ? word : `${line} ${word}`;
    }
  }
  if (line !== "") {
    lines.push(line);
  }
  return lines.slice(0, 3).join("\n");
};

const drawtext = (textFile: string, font: string, extra: string) =>
  `drawtext=fontfile='${font}':textfile='${textFile}':fontcolor=white:box=1:boxcolor=black@0.5:boxborderw=18:line_spacing=10:x=(w-text_w)/2:${extra}`;

export const burnOverlays = async (
  video: Uint8Array,
  options: OverlayOptions
): Promise<Uint8Array> => {
  const dir = await mkdtemp(path.join(tmpdir(), "wovain-video-"));
  try {
    const input = path.join(dir, "in.mp4");
    const output = path.join(dir, "out.mp4");
    const brandFile = path.join(dir, "brand.txt");
    const captionFile = path.join(dir, "caption.txt");
    await Promise.all([
      writeFile(input, video),
      writeFile(brandFile, options.brand),
      writeFile(captionFile, wrapCaption(options.caption ?? "")),
    ]);
    const until = `enable='lt(t,${options.brandSeconds})'`;
    const caption =
      options.caption === undefined || options.caption.trim() === ""
        ? []
        : [drawtext(captionFile, options.font, "fontsize=h/30:y=h*0.6")];
    const logoFile = path.join(dir, "logo");
    if (options.logo !== undefined && options.brandSeconds > 0) {
      await writeFile(logoFile, options.logo);
    }
    // Brand overlay is optional (off by default; Meta already shows the Page).
    // With a logo it's scaled to 22% of the width below the top safe edge;
    // without one the brand name is drawn as text.
    const showBrand = options.brandSeconds > 0;
    const useLogo = showBrand && options.logo !== undefined;
    const textFilters = [
      ...(showBrand && !useLogo
        ? [drawtext(brandFile, options.font, `fontsize=h/24:y=h*0.15:${until}`)]
        : []),
      ...caption,
    ];
    const graph = useLogo
      ? [
          "[1:v][0:v]scale2ref=w=main_w*0.22:h=ow/mdar[logo][base];",
          `[base][logo]overlay=x=(W-w)/2:y=H*0.15:${until}`,
          ...textFilters.map((filter) => `,${filter}`),
          "[out]",
        ].join("")
      : `[0:v]${textFilters.length === 0 ? "null" : textFilters.join(",")}[out]`;
    const proc = Bun.spawn(
      [
        options.ffmpeg,
        "-y",
        "-loglevel",
        "error",
        "-i",
        input,
        ...(useLogo ? ["-i", logoFile] : []),
        "-filter_complex",
        graph,
        "-map",
        "[out]",
        "-map",
        "0:a?",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-movflags",
        "+faststart",
        output,
      ],
      { stderr: "pipe", stdout: "ignore" }
    );
    if ((await proc.exited) !== 0) {
      const detail = await new Response(proc.stderr).text();
      throw new Error(`ffmpeg failed: ${detail.slice(0, 200)}`);
    }
    return new Uint8Array(await readFile(output));
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
};
