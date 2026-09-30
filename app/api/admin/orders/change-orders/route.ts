import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { hasAdminPermission, isAdminRole } from "@/app/lib/adminPermissions";

export async function GET(request: NextRequest) {
  const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return json({ error: "No estás autenticado." }, 401);
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const { data: { user }, error: authError } = await db.auth.getUser(token);
    if (authError || !user) return json({ error: "Sesión no válida." }, 401);
    const { data: profile, error: profileError } = await db.from("profiles").select("role,admin_role").eq("id", user.id).maybeSingle();
    if (profileError || profile?.role !== "admin" || !isAdminRole(profile.admin_role) || !hasAdminPermission(profile.admin_role, "orders")) return json({ error: "No tienes permiso para consultar órdenes." }, 403);
    const requestId = request.nextUrl.searchParams.get("request_id");
    if (!requestId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) return json({ error: "Request ID interno no válido." }, 400);
    const { data: job, error: jobError } = await db.from("service_requests").select("id").eq("id", requestId).maybeSingle();
    if (jobError) throw jobError;
    if (!job) return json({ error: "No encontramos este trabajo." }, 404);
    // Sin filtro de estado: preservar todo el historial. Paginar sin truncarlo a 1000 filas.
    const orders: Record<string, unknown>[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await db.from("change_orders").select("id,request_id,provider_id,customer_id,reason,description,original_amount,additional_amount,new_total_amount,status,payment_status,additional_customer_fee_amount,additional_customer_total_amount,additional_provider_commission_amount,additional_provider_net_amount,additional_platform_revenue_amount,created_at,updated_at,accepted_at,rejected_at,paid_at,released_at").eq("request_id", job.id).order("created_at", { ascending: false }).order("id", { ascending: true }).range(offset, offset + 499);
      if (error) throw error;
      orders.push(...(data || []));
      if (!data || data.length < 500) break;
    }
    return json({ changeOrders: [...new Map(orders.map(order => [order.id, order])).values()] });
  } catch {
    return json({ error: "No se pudieron cargar los cambios de presupuesto. Intenta nuevamente." }, 500);
  }
}
