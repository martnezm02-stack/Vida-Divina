import { NextResponse } from "next/server";
import { listProjects } from "@/lib/intelligence";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const data = listProjects();
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 200 }
    );
  }
}
