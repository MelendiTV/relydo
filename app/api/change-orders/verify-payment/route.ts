import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/serverAuth";
import { ChangeOrderPaymentError, confirmChangeOrderPayment } from "../../../lib/changeOrderPayments";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (!auth.user) return NextResponse.json({ error: "Tu sesión no es válida. Inicia sesión nuevamente." }, { status: 401 });
    const body = await request.json();
    const result = await confirmChangeOrderPayment({
      sessionId: String(body?.sessionId || "").trim() || undefined,
      paymentIntentId: String(body?.paymentIntentId || "").trim() || undefined,
      expectedChangeOrderId: String(body?.changeOrderId || "").trim() || undefined,
      expectedCustomerId: auth.user.id,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ChangeOrderPaymentError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof SyntaxError) return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
    console.error("Change Order confirmation failed", error);
    return NextResponse.json({ error: "No pudimos confirmar el pago adicional. Reintenta la confirmación, no el cobro." }, { status: 500 });
  }
}
