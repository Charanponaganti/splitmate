import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { attachments } from "@/lib/db/schema";
import { MAX_RECEIPT_BYTES, RECEIPT_CONTENT_TYPES } from "@/lib/constants";
import { isAppError } from "@/lib/errors";
import { requireMember } from "@/lib/server/access";
import { getCurrentUser } from "@/lib/session";
import { uuidSchema } from "@/lib/validation";

export const runtime = "nodejs";

/** File signatures, so a renamed executable can't be uploaded as a "receipt". */
function sniffType(bytes: Uint8Array): string | null {
  const startsWith = (sig: number[], offset = 0) => sig.every((b, i) => bytes[offset + i] === b);
  if (startsWith([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith([0x89, 0x50, 0x4e, 0x47])) return "image/png";
  if (startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  if (startsWith([0x25, 0x50, 0x44, 0x46])) return "application/pdf";
  if (startsWith([0x66, 0x74, 0x79, 0x70], 4)) return "image/heic";
  return null;
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_RECEIPT_BYTES + 64 * 1024) {
    return NextResponse.json({ error: "Receipts must be 5 MB or smaller." }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload." }, { status: 400 });
  }
  const groupId = uuidSchema.safeParse(form.get("groupId"));
  const file = form.get("file");
  if (!groupId.success || !(file instanceof File)) {
    return NextResponse.json({ error: "Invalid upload." }, { status: 400 });
  }
  if (file.size === 0 || file.size > MAX_RECEIPT_BYTES) {
    return NextResponse.json({ error: "Receipts must be 5 MB or smaller." }, { status: 413 });
  }

  try {
    const db = await getDb();
    await requireMember(db, groupId.data, user.id);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const contentType = sniffType(bytes);
    if (!contentType || !RECEIPT_CONTENT_TYPES.includes(contentType)) {
      return NextResponse.json({ error: "Upload a JPG, PNG, WEBP, HEIC or PDF file." }, { status: 415 });
    }
    const fileName = file.name.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "receipt";
    const [row] = await db
      .insert(attachments)
      .values({
        groupId: groupId.data,
        uploadedBy: user.id,
        fileName,
        contentType,
        sizeBytes: bytes.byteLength,
        data: Buffer.from(bytes),
      })
      .returning({ id: attachments.id });
    return NextResponse.json({ id: row.id, fileName });
  } catch (error) {
    if (isAppError(error)) return NextResponse.json({ error: error.message }, { status: 404 });
    console.error("[attachments] upload failed");
    return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 500 });
  }
}
