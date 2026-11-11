import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * Notes API — ShiftKar Neo reimagines the original's IndexedDB notes as a
 * real backend with SQLite persistence.
 *
 * GET  /api/notes              → all notes (newest updated first)
 * GET  /api/notes?jy=&jm=      → notes of one Jalali month
 * POST /api/notes              → upsert { dateKey, text } (empty text deletes)
 * DELETE /api/notes?dateKey=   → delete one note
 */

export async function GET(req: NextRequest) {
  try {
    const jy = req.nextUrl.searchParams.get("jy");
    const jm = req.nextUrl.searchParams.get("jm");

    if (jy && jm) {
      const mm = String(Number(jm)).padStart(2, "0");
      const notes = await db.note.findMany({
        where: { dateKey: { gte: `${jy}-${mm}-01`, lte: `${jy}-${mm}-31` } },
        orderBy: { dateKey: "desc" },
      });
      return NextResponse.json({ notes });
    }

    const notes = await db.note.findMany({ orderBy: { updatedAt: "desc" } });
    return NextResponse.json({ notes });
  } catch (err) {
    console.error("GET /api/notes failed:", err);
    return NextResponse.json({ error: "خطا در خواندن یادداشت‌ها" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { dateKey?: string; text?: string };
    const dateKey = body.dateKey?.trim();
    const text = body.text?.trim() ?? "";

    if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      return NextResponse.json({ error: "dateKey نامعتبر است" }, { status: 400 });
    }

    // Empty text removes the note (same contract as the original app).
    if (!text) {
      await db.note.deleteMany({ where: { dateKey } });
      return NextResponse.json({ ok: true, deleted: true });
    }
    const note = await db.note.upsert({
      where: { dateKey },
      update: { text, updatedAt: new Date() },
      create: { dateKey, text },
    });
    return NextResponse.json({ ok: true, note });
  } catch (err) {
    console.error("POST /api/notes failed:", err);
    return NextResponse.json({ error: "خطا در ذخیره یادداشت" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const dateKey = req.nextUrl.searchParams.get("dateKey");
    if (!dateKey) {
      return NextResponse.json({ error: "dateKey الزامی است" }, { status: 400 });
    }
    await db.note.deleteMany({ where: { dateKey } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/notes failed:", err);
    return NextResponse.json({ error: "خطا در حذف یادداشت" }, { status: 500 });
  }
}
