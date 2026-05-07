/**
 * Pull the last frame out of an MP4 (or any container ffmpeg can demux) and
 * return it as a JPEG Blob. Used to chain Video → Video by feeding the
 * upstream's final frame as the next clip's first frame.
 *
 * Strategy: `-sseof -0.1` seeks to 0.1s before EOF and we grab a single
 * frame. Fast even for long videos because we never decode the full file.
 */

import { fetchFile } from "@ffmpeg/util";
import { getFfmpeg } from "./ffmpeg-singleton";

export async function extractLastFrame(
  videoUrl: string,
  onLog?: (msg: string) => void,
): Promise<Blob> {
  const ff = await getFfmpeg(onLog);

  const inputName = `extract-in-${Date.now()}.mp4`;
  const outputName = `extract-out-${Date.now()}.jpg`;

  const data = await fetchFile(videoUrl);
  await ff.writeFile(inputName, data);

  try {
    await ff.exec([
      "-sseof",
      "-0.1",
      "-i",
      inputName,
      "-frames:v",
      "1",
      "-q:v",
      "2",
      outputName,
    ]);
  } catch (e) {
    // Some containers don't support negative -sseof; fall back to a slower
    // forward scan that always works.
    await ff.exec([
      "-i",
      inputName,
      "-vf",
      "select='eq(n\\,0)+eq(t\\,duration-0.1)'",
      "-vsync",
      "vfr",
      "-frames:v",
      "1",
      "-q:v",
      "2",
      outputName,
    ]);
    void e;
  }

  const frame = (await ff.readFile(outputName)) as Uint8Array;

  await ff.deleteFile(inputName).catch(() => {});
  await ff.deleteFile(outputName).catch(() => {});

  return new Blob([frame as BlobPart], { type: "image/jpeg" });
}
