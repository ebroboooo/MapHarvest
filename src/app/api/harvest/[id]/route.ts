import { NextResponse } from "next/server";
import { cancelJob, getJob, leadsToCsv } from "@/lib/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const job = getJob(id);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const url = new URL(request.url);
  if (url.searchParams.get("format") === "csv") {
    const csv = leadsToCsv(job.leads);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="mapharvest-${id.slice(0, 8)}.csv"`,
      },
    });
  }

  return NextResponse.json({ job });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  cancelJob(id);
  return NextResponse.json({ ok: true });
}
