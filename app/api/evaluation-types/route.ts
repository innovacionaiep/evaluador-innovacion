import { NextResponse } from "next/server";
import { initDb, getEvaluationTypes, createEvaluationType } from "@/lib/db";

export async function GET() {
  try {
    await initDb();
    const types = await getEvaluationTypes();
    return NextResponse.json(types);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status:500 });
  }
}

export async function POST(request: Request) {
  // #region agent log
  fetch("http://127.0.0.1:7243/ingest/2cfbb0df-8ae8-4230-9f25-74fe2cc0dcdd", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      location: "app/api/evaluation-types/route.ts:POST",
      message: "POST handler entered",
      data: { node: process.versions.node, platform: process.platform, arch: process.arch },
      timestamp: Date.now(),
      hypothesisId: "H4",
    }),
  }).catch(() => {});
  // #endregion
  try {
    const body = await request.json();
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    await initDb();
    const id = await createEvaluationType(name);
    return NextResponse.json({ id, name });
  } catch (e) {
    // #region agent log
    fetch("http://127.0.0.1:7243/ingest/2cfbb0df-8ae8-4230-9f25-74fe2cc0dcdd", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "app/api/evaluation-types/route.ts:POST catch",
        message: "POST evaluation-types error",
        data: { errorMessage: String(e), stack: e instanceof Error ? e.stack : undefined },
        timestamp: Date.now(),
        hypothesisId: "H1",
      }),
    }).catch(() => {});
    // #endregion
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
