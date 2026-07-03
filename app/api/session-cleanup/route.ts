import { NextResponse } from "next/server";
import { clearSessionProjectFiles } from "@/lib/storage";
import { clearProjectIndex } from "@/lib/project-vector-store";
import { clearProjectStructuredIndex } from "@/lib/project-structured-index";
import { getProjectUploadExtensions } from "@/lib/document-parser";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const sessionId = typeof body?.sessionId === "string" ? body.sessionId.trim() : "";
    if (!sessionId) {
      return NextResponse.json({ error: "sessionId required" }, { status: 400 });
    }
    clearSessionProjectFiles(sessionId, getProjectUploadExtensions());
    clearProjectIndex(sessionId);
    clearProjectStructuredIndex(sessionId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
