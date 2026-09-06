"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import {
  hasAdminPermission,
  isAdminRole,
} from "@/app/lib/adminPermissions";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);


type Provider = {
  user_id: string;
  business_name: string | null;
  trade: string | null;
  verification_status: string | null;
  verified: boolean | null;
  active: boolean | null;
  created_at: string | null;
};

type Claim = {
  id: string;
  request_id: string;
  reason: string;
  status: string;
  provider_response_deadline: string | null;
  provider_response: string | null;
  created_at: string;
};

type Payment = {
  id: string;
  request_id: string;
  status: string | null;
  release_status: string | null;
  refund_status: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type Alerta = {
  id: string;
  tipo: "reclamo" | "profesional" | "pago";
  prioridad: "alta" | "media";
  titulo: string;
  detalle: string;
  fecha: string | null;
  destino: string;
};

function fecha(fechaIso: string | null) {
  if (!fechaIso) return "Sin fecha";
  return new Intl.DateTimeFormat("es-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(fechaIso));
}

export default function AdminAlertasPage() {
  const router = useRouter();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    cargar();
  }, []);

  async function cargar() {
    setLoading(true);
    setError("");

    try {
      const { data: { user }, error: authError } =
        await supabase.auth.getUser();

      if (
        authError ||
        !user
      ) {
        router.replace("/login-profesional");
        return;
      }

      const {
        data: adminProfile,
        error: profileError,
      } = await supabase
        .from("profiles")
        .select("role, admin_role")
        .eq("id", user.id)
        .maybeSingle();

      if (
        profileError ||
        !adminProfile ||
        adminProfile.role !== "admin" ||
        !isAdminRole(adminProfile.admin_role) ||
        !hasAdminPermission(
          adminProfile.admin_role,
          "alerts"
        )
      ) {
        router.replace("/admin");
        return;
      }

      const [providerResp, claimResp, paymentResp] = await Promise.all([
        supabase
          .from("provider_profiles")
          .select("user_id,business_name,trade,verification_status,verified,active,created_at")
          .order("created_at", { ascending: false }),

        supabase
          .from("job_claims")
          .select("id,request_id,reason,status,provider_response_deadline,provider_response,created_at")
          .in("status", ["open", "reviewing"])
          .order("created_at", { ascending: false }),

        supabase
          .from("payments")
          .select("id,request_id,status,release_status,refund_status,created_at,updated_at")
          .order("updated_at", { ascending: false })
          .limit(1000),
      ]);

      if (providerResp.error) throw new Error(providerResp.error.message);
      if (claimResp.error) throw new Error(claimResp.error.message);

      setProviders((providerResp.data || []) as Provider[]);
      setClaims((claimResp.data || []) as Claim[]);

      // Payments is optional here: if current schema/RLS does not expose
      // one of these fields, claims and provider alerts still work.
      if (paymentResp.error) {
        console.warn("No se pudieron cargar alertas de pagos:", paymentResp.error);
        setPayments([]);
      } else {
        setPayments((paymentResp.data || []) as Payment[]);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No pudimos cargar las alertas."
      );
    } finally {
      setLoading(false);
    }
  }

  const alertas = useMemo(() => {
    const lista: Alerta[] = [];

    providers
      .filter((p) => p.verification_status === "pending")
      .forEach((p) => {
        lista.push({
          id: `provider-${p.user_id}`,
          tipo: "profesional",
          prioridad: "media",
          titulo: "Profesional pendiente de verificación",
          detalle: p.business_name || `ID ${p.user_id}`,
          fecha: p.created_at,
          destino: "/admin",
        });
      });

    claims.forEach((c) => {
      const vencido =
        !c.provider_response &&
        c.provider_response_deadline &&
        new Date(c.provider_response_deadline).getTime() <= Date.now();

      lista.push({
        id: `claim-${c.id}`,
        tipo: "reclamo",
        prioridad: vencido ? "alta" : "media",
        titulo: vencido
          ? "Reclamo con plazo de respuesta vencido"
          : c.status === "reviewing"
          ? "Reclamo en revisión"
          : "Nuevo reclamo activo",
        detalle: `${c.reason} · Orden ${c.request_id}`,
        fecha: c.created_at,
        destino: "/admin/reclamos",
      });
    });

    payments.forEach((p) => {
      const estado = (p.status || "").toLowerCase();
      const release = (p.release_status || "").toLowerCase();
      const refund = (p.refund_status || "").toLowerCase();

      const problema =
        ["failed", "error", "requires_action"].includes(estado) ||
        ["failed", "error"].includes(release) ||
        ["failed", "error"].includes(refund);

      if (problema) {
        lista.push({
          id: `payment-${p.id}`,
          tipo: "pago",
          prioridad: "alta",
          titulo: "Pago requiere revisión",
          detalle: `Orden ${p.request_id}`,
          fecha: p.updated_at || p.created_at,
          destino: "/admin/finanzas",
        });
      }
    });

    return lista.sort((a, b) => {
      if (a.prioridad !== b.prioridad) return a.prioridad === "alta" ? -1 : 1;
      return new Date(b.fecha || 0).getTime() - new Date(a.fecha || 0).getTime();
    });
  }, [providers, claims, payments]);

  const altas = alertas.filter((a) => a.prioridad === "alta").length;
  const reclamos = alertas.filter((a) => a.tipo === "reclamo").length;
  const verificaciones = alertas.filter((a) => a.tipo === "profesional").length;

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="rounded-2xl bg-white px-8 py-7 font-bold text-slate-700 shadow">
          Cargando centro de alertas...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={() => router.push("/admin")}
            className="font-black text-blue-700 hover:underline"
          >
            ← Volver al panel Admin
          </button>
          <button
            onClick={cargar}
            className="rounded-xl border-2 border-amber-600 bg-white px-5 py-3 font-black text-amber-700 hover:bg-amber-50"
          >
            ↻ Actualizar alertas
          </button>
        </div>

        <section className="rounded-3xl bg-slate-950 p-7 text-white shadow-xl">
          <p className="text-sm font-black uppercase tracking-widest text-amber-300">
            🔔 Supervisión
          </p>
          <h1 className="mt-2 text-3xl font-black">Centro de alertas</h1>
          <p className="mt-3 max-w-3xl text-slate-300">
            Aquí aparece lo que necesita atención del administrador. Cuando una
            situación se resuelve, deja de aparecer automáticamente.
          </p>
        </section>

        {error && (
          <div className="mt-6 rounded-2xl border border-red-300 bg-red-50 p-5 font-bold text-red-700">
            {error}
          </div>
        )}

        <section className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Resumen titulo="Alertas activas" valor={alertas.length} />
          <Resumen titulo="Prioridad alta" valor={altas} />
          <Resumen titulo="Reclamos" valor={reclamos} />
          <Resumen titulo="Verificaciones" valor={verificaciones} />
        </section>

        <section className="mt-6 space-y-4">
          {alertas.length === 0 ? (
            <div className="rounded-3xl border border-green-200 bg-white p-10 text-center shadow">
              <div className="text-4xl">✅</div>
              <h2 className="mt-3 text-xl font-black text-slate-950">
                Todo está bajo control
              </h2>
              <p className="mt-2 text-slate-600">
                No hay situaciones que requieran atención en este momento.
              </p>
            </div>
          ) : (
            alertas.map((alerta) => (
              <article
                key={alerta.id}
                className={`rounded-3xl border bg-white p-5 shadow ${
                  alerta.prioridad === "alta"
                    ? "border-red-300"
                    : "border-amber-200"
                }`}
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xl">
                        {alerta.tipo === "reclamo"
                          ? "⚠️"
                          : alerta.tipo === "pago"
                          ? "💳"
                          : "👤"}
                      </span>
                      <h2 className="font-black text-slate-950">
                        {alerta.titulo}
                      </h2>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-black ${
                          alerta.prioridad === "alta"
                            ? "bg-red-100 text-red-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {alerta.prioridad === "alta" ? "Alta" : "Atención"}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-semibold text-slate-600">
                      {alerta.detalle}
                    </p>
                    <p className="mt-1 text-xs font-bold text-slate-400">
                      {fecha(alerta.fecha)}
                    </p>
                  </div>

                  <button
                    onClick={() => router.push(alerta.destino)}
                    className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white hover:bg-slate-800"
                  >
                    Revisar →
                  </button>
                </div>
              </article>
            ))
          )}
        </section>
      </div>
    </main>
  );
}

function Resumen({ titulo, valor }: { titulo: string; valor: number }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow">
      <p className="text-sm font-black text-slate-500">{titulo}</p>
      <p className="mt-2 text-3xl font-black text-slate-950">{valor}</p>
    </div>
  );
}