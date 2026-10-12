import { NextResponse } from "next/server";
import { attachmentSignedUrl } from "@/lib/announcements/attachment-files";
import { isUuid } from "@/lib/setup/structure";
import { createClient } from "@/lib/supabase/server";

/**
 * Opens an announcement's attachment (US-8.3, D49): a redirect to a
 * 60-second signed URL made with the viewer's own client, issued only when
 * RLS lets them read the attachment (and so the announcement). Anyone else
 * gets 404. With `?download=1` the file is saved under its stored name.
 */
export async function GET(
  request: Request,
  ctx: RouteContext<"/announcements/attachments/[attachmentId]">,
) {
  const { attachmentId } = await ctx.params;
  const notFound = new NextResponse("Not found", { status: 404 });
  if (!isUuid(attachmentId)) return notFound;
  const download = new URL(request.url).searchParams.get("download") === "1";
  const url = await attachmentSignedUrl(await createClient(), attachmentId, download);
  if (!url) return notFound;
  return NextResponse.redirect(url, {
    status: 303,
    headers: { "Cache-Control": "private, no-store" },
  });
}
