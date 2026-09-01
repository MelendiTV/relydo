import { NextResponse } from "next/server";

// Deprecated: account-existence checks now use the database RPC
// relydo_email_exists from the registration form, avoiding public Auth enumeration.
export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(
    { error: "Deprecated endpoint." },
    {
      status: 410,
      headers: { "Cache-Control": "no-store" },
    }
  );
}
