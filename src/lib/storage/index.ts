import { createServiceClient } from "@/lib/supabase/server";

const BUCKET = "outputs";

export type StoredAsset = {
  url: string;
  path: string;
  contentType: string;
  size: number;
};

/**
 * Mirror an external (often expiring) URL into our own storage so it survives
 * APImart's 72-hour link expiry. Returns a stable public URL.
 */
export async function persistRemoteUrl(opts: {
  userId: string;
  workflowId: string;
  nodeId: string;
  url: string;
  ext?: string;
}): Promise<StoredAsset> {
  const remote = await fetch(opts.url);
  if (!remote.ok) {
    throw new Error(
      `Failed to download remote asset (${remote.status}) from ${opts.url}`,
    );
  }
  const contentType =
    remote.headers.get("content-type") ?? "application/octet-stream";
  const buf = Buffer.from(await remote.arrayBuffer());

  const ext =
    opts.ext ??
    (contentType.includes("png")
      ? "png"
      : contentType.includes("jpeg")
        ? "jpg"
        : contentType.includes("mp4")
          ? "mp4"
          : "bin");

  const path = `${opts.userId}/${opts.workflowId}/${opts.nodeId}-${Date.now()}.${ext}`;

  const supabase = createServiceClient();
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buf, { contentType, upsert: true });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path, contentType, size: buf.length };
}
