/**
 * Client-side MP4 concatenation via ffmpeg.wasm.
 * The wasm core is loaded from the official UNPKG mirror at runtime so we
 * don't bloat the JS bundle. Cross-origin isolation isn't required for the
 * single-threaded `core` build (only the multi-threaded `core-mt` needs it).
 */

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

const CORE_VERSION = "0.12.10";
const CORE_BASE = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/umd`;

let ffmpegSingleton: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;

async function getFfmpeg(onLog?: (msg: string) => void): Promise<FFmpeg> {
  if (ffmpegSingleton) return ffmpegSingleton;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const ff = new FFmpeg();
    if (onLog) {
      ff.on("log", ({ message }) => onLog(message));
    }
    await ff.load({
      coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(
        `${CORE_BASE}/ffmpeg-core.wasm`,
        "application/wasm",
      ),
    });
    ffmpegSingleton = ff;
    return ff;
  })();
  return loadPromise;
}

/**
 * Concatenate the supplied MP4 URLs in order and return a Blob containing the
 * combined output. Uses the demuxer concat protocol with `-c copy` so we
 * don't re-encode — fast, but requires the inputs to share codec params.
 *
 * If `transcode` is true, the inputs are first re-encoded into a uniform
 * format which is more tolerant of mismatched codecs but much slower.
 */
export async function concatVideos(
  urls: string[],
  options?: {
    transcode?: boolean;
    onProgress?: (ratio: number) => void;
    onLog?: (msg: string) => void;
  },
): Promise<Blob> {
  if (urls.length === 0) throw new Error("No videos to concat");
  if (urls.length === 1) {
    // Trivial case: just download and return the only clip
    const data = await fetchFile(urls[0]);
    return new Blob([data as BlobPart], { type: "video/mp4" });
  }

  const ff = await getFfmpeg(options?.onLog);
  if (options?.onProgress) {
    ff.on("progress", ({ progress }) => options.onProgress!(progress));
  }

  const inputNames: string[] = [];

  // Download every clip into the wasm fs
  for (let i = 0; i < urls.length; i++) {
    const data = await fetchFile(urls[i]);
    const name = `in${i}.mp4`;
    await ff.writeFile(name, data);
    inputNames.push(name);
  }

  // Build the concat list file
  const concatList = inputNames.map((n) => `file '${n}'`).join("\n");
  await ff.writeFile("list.txt", new TextEncoder().encode(concatList));

  const outName = "out.mp4";
  if (options?.transcode) {
    // Re-encode pass — slower but tolerant of mismatched codecs
    await ff.exec([
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      "list.txt",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "23",
      "-c:a",
      "aac",
      "-movflags",
      "+faststart",
      outName,
    ]);
  } else {
    // Stream copy — fastest. Will fail if codecs disagree.
    await ff.exec([
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      "list.txt",
      "-c",
      "copy",
      "-movflags",
      "+faststart",
      outName,
    ]);
  }

  const data = (await ff.readFile(outName)) as Uint8Array;

  // Cleanup wasm fs
  for (const n of inputNames) await ff.deleteFile(n).catch(() => {});
  await ff.deleteFile("list.txt").catch(() => {});
  await ff.deleteFile(outName).catch(() => {});

  return new Blob([data as BlobPart], { type: "video/mp4" });
}
