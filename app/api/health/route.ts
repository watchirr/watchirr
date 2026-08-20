import { NextResponse } from "next/server";
import { getStore } from "@/lib/auth";
import { checkHealth, healthHttpStatus } from "@/lib/health";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const body = await checkHealth(await getStore());
  return NextResponse.json(body, { status: healthHttpStatus(body) });
}
