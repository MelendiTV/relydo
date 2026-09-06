"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { hasAdminPermission, isAdminRole } from "@/app/lib/adminPermissions";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);


type Provider = {
  user_id: string;
  business_name: string | null;
  trade: string | null;
};

type SolicitudAdmin = {
  id: string;
  customer_id: string | null;
  title: string;
  description: string;
  address_line1: string | null;
  address_line2: string | null;
  city: string;
  state: string;
  zip_code: string;
  preferred_date: string | null;
  preferred_time: string | null;
  status: string;
  created_at: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  preferred_provider_id: string | null;
  job_stage: string | null;
  cancellation_reason: string | null;
  cancelled_at: string | null;
};

type FiltroOrden =
  | "todas"
  | "open"
  | "in_progress"
  | "completed"
  | "cancelled";

function nombreEstadoOrden(
  status: string,
  jobStage: string | null
) {
  if (status === "open") return "Abierta";
  if (status === "completed") return "Completada";
  if (status === "cancelled") return "Cancelada";

  if (status === "in_progress") {
    if (jobStage === "on_the_way") return "Profesional en camino";
    if (jobStage === "arrived") return "Profesional llegó";
    if (jobStage === "working") return "Trabajo iniciado";
    return "Profesional contratado";
  }

  return status;
}

function estiloEstadoOrden(
  status: string,
  jobStage: string | null
) {
  if (status === "open") return "bg-blue-100 text-blue-800";
  if (status === "completed") return "bg-green-100 text-green-800";
  if (status === "cancelled") return "bg-red-100 text-red-800";

  if (status === "in_progress") {
    if (jobStage === "working") return "bg-amber-100 text-amber-800";
    if (jobStage === "arrived") return "bg-purple-100 text-purple-800";
    if (jobStage === "on_the_way") return "bg-sky-100 text-sky-800";
    return "bg-emerald-100 text-emerald-800";
  }

  return "bg-slate-100 text-slate-700";
}

export default function AdminOrdenesPage() {
  const router = useRouter();

  const [solicitudes, setSolicitudes] = useState<SolicitudAdmin[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [buscando, setBuscando] = useState("");
  const [filtro, setFiltro] = useState<FiltroOrden>("todas");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    cargar();
  }, []);

  async function cargar() {
    setLoading(true);
    setError("");

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        router.replace("/login-profesional");
        return;
      }

      const { data: adminProfile, error: profileError } = await supabase
        .from("profiles")
        .select("role, admin_role")
        .eq("id", user.id)
        .maybeSingle();

      if (
        profileError ||
        !adminProfile ||
        adminProfile.role !== "admin" ||
        !isAdminRole(adminProfile.admin_role) ||
        !hasAdminPermission(adminProfile.admin_role, "orders")
      ) {
        router.replace("/admin");
        return;
      }

      const [
        solicitudesResp,
        providersResp,
      ] = await Promise.all([
        supabase
          .from("service_requests")
          .select(`
            id,
            customer_id,
            title,
            description,
            address_line1,
            address_line2,
            city,
            state,
            zip_code,
            preferred_date,
            preferred_time,
            status,
            created_at,
            customer_name,
            customer_phone,
            customer_email,
            preferred_provider_id,
            job_stage,
            cancellation_reason,
            cancelled_at
          `)
          .order("created_at", { ascending: false })
          .limit(1000),

        supabase
          .from("provider_profiles")
          .select(`
            user_id,
            business_name,
            trade
          `)
          .limit(2000),
      ]);

      if (solicitudesResp.error) {
        throw new Error(solicitudesResp.error.message);
      }

      if (providersResp.error) {
        throw new Error(providersResp.error.message);
      }

      setSolicitudes(
        (solicitudesResp.data || []) as SolicitudAdmin[]
      );

      setProviders(
        (providersResp.data || []) as Provider[]
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No pudimos cargar las órdenes."
      );
    } finally {
      setLoading(false);
    }
  }

  const abiertas = solicitudes.filter(
    (s) => s.status === "open"
  ).length;

  const progreso = solicitudes.filter(
    (s) => s.status === "in_progress"
  ).length;

  const completadas = solicitudes.filter(
    (s) => s.status === "completed"
  ).length;

  const canceladas = solicitudes.filter(
    (s) => s.status === "cancelled"
  ).length;

  const filtradas = useMemo(() => {
    const texto = buscando.trim().toLowerCase();

    return solicitudes.filter((solicitud) => {
      if (
        filtro !== "todas" &&
        solicitud.status !== filtro
      ) {
        return false;
      }

      if (!texto) return true;

      const profesional =
        solicitud.preferred_provider_id
          ? providers.find(
              (p) =>
                p.user_id ===
                solicitud.preferred_provider_id
            )
          : null;

      const campos = [
        solicitud.title,
        solicitud.description,
        solicitud.customer_name || "",
        solicitud.customer_email || "",
        solicitud.customer_phone || "",
        solicitud.city,
        solicitud.state,
        solicitud.zip_code,
        solicitud.id,
        solicitud.customer_id || "",
        solicitud.preferred_provider_id || "",
        profesional?.business_name || "",
        profesional?.trade || "",
      ]
        .join(" ")
        .toLowerCase();

      return campos.includes(texto);
    });
  }, [solicitudes, providers, buscando, filtro]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <div className="rounded-2xl bg-white px-8 py-7 font-bold text-slate-700 shadow">
          Cargando órdenes...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={() => router.push("/admin")}
            className="w-fit font-black text-blue-700 hover:underline"
          >
            ← Volver al panel Admin
          </button>

          <button
            type="button"
            onClick={cargar}
            className="w-fit rounded-xl border-2 border-blue-700 bg-white px-5 py-3 font-extrabold text-blue-700 hover:bg-blue-50"
          >
            ↻ Actualizar órdenes
          </button>
        </div>

        <section className="mb-8 rounded-3xl bg-slate-950 p-7 text-white shadow-xl">
          <p className="text-sm font-black uppercase tracking-widest text-blue-300">
            Operaciones
          </p>
          <h1 className="mt-2 text-3xl font-black">
            Control de órdenes
          </h1>
          <p className="mt-3 text-slate-300">
            Consulta todas las órdenes y abre el expediente administrativo completo de cada trabajo.
          </p>
        </section>

        {error && (
          <div className="mb-6 rounded-2xl border border-red-300 bg-red-50 p-5 font-bold text-red-700">
            {error}
          </div>
        )}

        <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Resumen
            titulo="Abiertas"
            valor={abiertas}
            activo={filtro === "open"}
            onClick={() => setFiltro("open")}
          />
          <Resumen
            titulo="En progreso"
            valor={progreso}
            activo={filtro === "in_progress"}
            onClick={() => setFiltro("in_progress")}
          />
          <Resumen
            titulo="Completadas"
            valor={completadas}
            activo={filtro === "completed"}
            onClick={() => setFiltro("completed")}
          />
          <Resumen
            titulo="Canceladas"
            valor={canceladas}
            activo={filtro === "cancelled"}
            onClick={() => setFiltro("cancelled")}
          />
        </div>

        <div className="mb-5 rounded-3xl border border-slate-200 bg-white p-5 shadow">
          <input
            type="text"
            value={buscando}
            onChange={(e) => setBuscando(e.target.value)}
            placeholder="Buscar por trabajo, cliente, email, teléfono, ciudad, profesional o ID..."
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none focus:border-blue-500"
          />

          <div className="mt-4 flex flex-wrap gap-2">
            {(
              [
                ["todas", "Todas"],
                ["open", "Abiertas"],
                ["in_progress", "En progreso"],
                ["completed", "Completadas"],
                ["cancelled", "Canceladas"],
              ] as const
            ).map(([valor, texto]) => (
              <button
                key={valor}
                type="button"
                onClick={() => setFiltro(valor)}
                className={`rounded-xl px-4 py-2 text-sm font-extrabold transition ${
                  filtro === valor
                    ? "bg-blue-700 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {texto}
              </button>
            ))}
          </div>
        </div>

        {filtradas.length === 0 ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center shadow">
            <p className="font-bold text-slate-600">
              No hay órdenes con estos filtros.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filtradas.map((solicitud) => (
              <article
                key={solicitud.id}
                className="rounded-3xl border border-slate-200 bg-white p-6 shadow"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <span
                      className={`rounded-full px-3 py-1 text-sm font-extrabold ${estiloEstadoOrden(
                        solicitud.status,
                        solicitud.job_stage
                      )}`}
                    >
                      {nombreEstadoOrden(
                        solicitud.status,
                        solicitud.job_stage
                      )}
                    </span>

                    <h2 className="mt-3 text-xl font-extrabold text-slate-900">
                      {solicitud.title}
                    </h2>

                    <p className="mt-2 break-all text-sm font-semibold text-slate-500">
                      Orden: {solicitud.id}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      router.push(
                        `/admin/trabajos/${solicitud.id}`
                      )
                    }
                    className="w-full shrink-0 rounded-xl bg-blue-700 px-5 py-3 font-extrabold text-white hover:bg-blue-800 sm:w-auto"
                  >
                    🔎 Ver detalle del trabajo
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function Resumen({
  titulo,
  valor,
  activo,
  onClick,
}: {
  titulo: string;
  valor: number;
  activo: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border bg-white p-5 text-left shadow transition ${
        activo
          ? "border-blue-500 ring-2 ring-blue-100"
          : "border-slate-200 hover:border-blue-300"
      }`}
    >
      <p className="text-sm font-bold text-slate-500">
        {titulo}
      </p>
      <p className="mt-2 text-3xl font-black text-slate-950">
        {valor}
      </p>
    </button>
  );
}
