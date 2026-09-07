"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/app/lib/supabaseBrowser";
import { useRouter } from "next/navigation";
import { hasAdminPermission, isAdminRole } from "@/app/lib/adminPermissions";


type RequestRow = {
  id: string;
  customer_id: string | null;
  status: string;
  created_at: string;
  preferred_provider_id: string | null;
};

type OfferRow = {
  id: string;
  request_id: string;
  professional_id: string;
  status: string | null;
  created_at: string;
};

type ProfileRow = {
  id: string;
  role: string | null;
  created_at?: string | null;
};

type ProviderRow = {
  user_id: string;
  verified: boolean | null;
  active: boolean | null;
  created_at: string | null;
};

type Periodo =
  | "hoy"
  | "semana"
  | "mes"
  | "ano"
  | "todo";

function inicioDia(fecha: Date) {
  const d = new Date(fecha);
  d.setHours(0, 0, 0, 0);
  return d;
}

function inicioSemana(fecha: Date) {
  const d = inicioDia(fecha);
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  return d;
}

function porcentaje(parte: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((parte / total) * 1000) / 10;
}

export default function AdminActividadPage() {
  const router = useRouter();

  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [providers, setProviders] = useState<ProviderRow[]>([]);

  const [periodo, setPeriodo] = useState<Periodo>("mes");
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
        !hasAdminPermission(adminProfile.admin_role, "activity")
      ) {
        router.replace("/admin");
        return;
      }

      const [
        requestsResp,
        offersResp,
        profilesResp,
        providersResp,
      ] = await Promise.all([
        supabase
          .from("service_requests")
          .select(`
            id,
            customer_id,
            status,
            created_at,
            preferred_provider_id
          `)
          .order("created_at", { ascending: false })
          .limit(5000),

        supabase
          .from("offers")
          .select(`
            id,
            request_id,
            professional_id,
            status,
            created_at
          `)
          .order("created_at", { ascending: false })
          .limit(10000),

        supabase
          .from("profiles")
          .select(`
            id,
            role,
            created_at
          `)
          .limit(5000),

        supabase
          .from("provider_profiles")
          .select(`
            user_id,
            verified,
            active,
            created_at
          `)
          .limit(5000),
      ]);

      if (requestsResp.error) {
        throw new Error(
          `Trabajos: ${requestsResp.error.message}`
        );
      }

      if (offersResp.error) {
        throw new Error(
          `Ofertas: ${offersResp.error.message}`
        );
      }

      if (profilesResp.error) {
        throw new Error(
          `Usuarios: ${profilesResp.error.message}`
        );
      }

      if (providersResp.error) {
        throw new Error(
          `Profesionales: ${providersResp.error.message}`
        );
      }

      setRequests(
        (requestsResp.data || []) as RequestRow[]
      );

      setOffers(
        (offersResp.data || []) as OfferRow[]
      );

      setProfiles(
        (profilesResp.data || []) as ProfileRow[]
      );

      setProviders(
        (providersResp.data || []) as ProviderRow[]
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No pudimos cargar la actividad de RELYDO."
      );
    } finally {
      setLoading(false);
    }
  }

  const rango = useMemo(() => {
    const ahora = new Date();

    if (periodo === "todo") {
      return {
        inicio: null as Date | null,
        fin: null as Date | null,
      };
    }

    if (periodo === "hoy") {
      const inicio = inicioDia(ahora);
      const fin = new Date(inicio);
      fin.setDate(fin.getDate() + 1);
      return { inicio, fin };
    }

    if (periodo === "semana") {
      const inicio = inicioSemana(ahora);
      const fin = new Date(inicio);
      fin.setDate(fin.getDate() + 7);
      return { inicio, fin };
    }

    if (periodo === "mes") {
      const inicio = new Date(
        ahora.getFullYear(),
        ahora.getMonth(),
        1
      );
      const fin = new Date(
        ahora.getFullYear(),
        ahora.getMonth() + 1,
        1
      );
      return { inicio, fin };
    }

    const inicio = new Date(
      ahora.getFullYear(),
      0,
      1
    );
    const fin = new Date(
      ahora.getFullYear() + 1,
      0,
      1
    );
    return { inicio, fin };
  }, [periodo]);

  function dentro(fechaIso: string | null | undefined) {
    if (!fechaIso) return false;

    const fecha = new Date(fechaIso);

    if (rango.inicio && fecha < rango.inicio) {
      return false;
    }

    if (rango.fin && fecha >= rango.fin) {
      return false;
    }

    return true;
  }

  const requestsFiltrados = useMemo(() => {
    if (periodo === "todo") return requests;
    return requests.filter((r) => dentro(r.created_at));
  }, [requests, rango, periodo]);

  const offersFiltradas = useMemo(() => {
    if (periodo === "todo") return offers;
    return offers.filter((o) => dentro(o.created_at));
  }, [offers, rango, periodo]);

  const metrics = useMemo(() => {
    const abiertos = requestsFiltrados.filter(
      (r) => r.status === "open"
    ).length;

    const progreso = requestsFiltrados.filter(
      (r) => r.status === "in_progress"
    ).length;

    const completados = requestsFiltrados.filter(
      (r) => r.status === "completed"
    ).length;

    const cancelados = requestsFiltrados.filter(
      (r) => r.status === "cancelled"
    ).length;

    const contratados = requestsFiltrados.filter(
      (r) => Boolean(r.preferred_provider_id)
    ).length;

    const clientesUnicos = new Set(
      requestsFiltrados
        .map((r) => r.customer_id)
        .filter(Boolean)
    ).size;

    const prosConOferta = new Set(
      offersFiltradas.map(
        (o) => o.professional_id
      )
    ).size;

    const trabajosConOferta = new Set(
      offersFiltradas.map(
        (o) => o.request_id
      )
    ).size;

    const ofertasPromedio =
      trabajosConOferta > 0
        ? Math.round(
            (offersFiltradas.length /
              trabajosConOferta) *
              10
          ) / 10
        : 0;

    const tasaFinalizacion =
      porcentaje(
        completados,
        completados + cancelados
      );

    const tasaContratacion =
      porcentaje(
        contratados,
        requestsFiltrados.length
      );

    return {
      total: requestsFiltrados.length,
      abiertos,
      progreso,
      completados,
      cancelados,
      contratados,
      clientesUnicos,
      prosConOferta,
      trabajosConOferta,
      ofertas: offersFiltradas.length,
      ofertasPromedio,
      tasaFinalizacion,
      tasaContratacion,
    };
  }, [requestsFiltrados, offersFiltradas]);

  const clientesRegistrados =
    profiles.filter(
      (p) => p.role === "customer"
    ).length;

  const profesionalesRegistrados =
    profiles.filter(
      (p) => p.role === "provider"
    ).length;

  const profesionalesActivos =
    providers.filter(
      (p) =>
        p.verified === true &&
        p.active === true
    ).length;

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <div className="rounded-2xl bg-white px-8 py-7 font-bold text-slate-700 shadow">
          Cargando actividad de RELYDO...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-10">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() =>
              router.push("/admin")
            }
            className="font-black text-blue-700 hover:underline"
          >
            â† Volver al panel Admin
          </button>

          <button
            type="button"
            onClick={cargar}
            className="rounded-xl border-2 border-indigo-700 bg-white px-5 py-3 font-black text-indigo-700 hover:bg-indigo-50"
          >
            â†» Actualizar actividad
          </button>
        </div>

        <section className="rounded-3xl bg-slate-950 p-7 text-white shadow-xl">
          <p className="text-sm font-black uppercase tracking-widest text-indigo-300">
            ðŸ“ˆ Rendimiento operativo
          </p>

          <h1 className="mt-2 text-3xl font-black">
            Actividad de la plataforma
          </h1>

          <p className="mt-3 max-w-3xl text-slate-300">
            Observa cÃ³mo se mueve RELYDO: trabajos, contrataciÃ³n, finalizaciÃ³n, ofertas, clientes y profesionales.
          </p>
        </section>

        {error && (
          <div className="mt-6 rounded-2xl border border-red-300 bg-red-50 p-5 font-bold text-red-700">
            {error}
          </div>
        )}

        <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow">
          <p className="text-sm font-black uppercase tracking-wide text-slate-500">
            PerÃ­odo
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            {(
              [
                ["hoy", "Hoy"],
                ["semana", "Esta semana"],
                ["mes", "Este mes"],
                ["ano", "Este aÃ±o"],
                ["todo", "Todo"],
              ] as const
            ).map(([valor, texto]) => (
              <button
                key={valor}
                type="button"
                onClick={() =>
                  setPeriodo(valor)
                }
                className={`rounded-xl px-4 py-2 text-sm font-black ${
                  periodo === valor
                    ? "bg-indigo-700 text-white"
                    : "bg-slate-100 text-slate-700"
                }`}
              >
                {texto}
              </button>
            ))}
          </div>
        </section>

        <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Tarjeta
            titulo="Trabajos creados"
            valor={String(metrics.total)}
            descripcion="Solicitudes creadas en el perÃ­odo."
          />

          <Tarjeta
            titulo="Completados"
            valor={String(metrics.completados)}
            descripcion="Trabajos terminados correctamente."
          />

          <Tarjeta
            titulo="Cancelados"
            valor={String(metrics.cancelados)}
            descripcion="Trabajos cancelados."
          />

          <Tarjeta
            titulo="En progreso"
            valor={String(metrics.progreso)}
            descripcion="Trabajos actualmente en ejecuciÃ³n."
          />

          <Tarjeta
            titulo="Tasa de contrataciÃ³n"
            valor={`${metrics.tasaContratacion}%`}
            descripcion="Porcentaje de solicitudes con profesional asignado."
          />

          <Tarjeta
            titulo="Tasa de finalizaciÃ³n"
            valor={`${metrics.tasaFinalizacion}%`}
            descripcion="Completados frente a completados + cancelados."
          />

          <Tarjeta
            titulo="Ofertas enviadas"
            valor={String(metrics.ofertas)}
            descripcion="Ofertas creadas durante el perÃ­odo."
          />

          <Tarjeta
            titulo="Ofertas por trabajo"
            valor={String(metrics.ofertasPromedio)}
            descripcion="Promedio de ofertas por trabajo que recibiÃ³ al menos una."
          />
        </section>

        <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <Bloque
            titulo="Clientes"
            principal={String(clientesRegistrados)}
            detalle={`${metrics.clientesUnicos} cliente(s) con actividad en el perÃ­odo`}
          />

          <Bloque
            titulo="Profesionales"
            principal={String(profesionalesRegistrados)}
            detalle={`${profesionalesActivos} activo(s) y verificado(s)`}
          />

          <Bloque
            titulo="Profesionales ofertando"
            principal={String(metrics.prosConOferta)}
            detalle={`${metrics.trabajosConOferta} trabajo(s) recibieron ofertas`}
          />
        </section>

        <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow">
          <div>
            <p className="text-sm font-black uppercase tracking-wide text-indigo-700">
              Estado de trabajos
            </p>

            <h2 className="mt-1 text-2xl font-black text-slate-950">
              DistribuciÃ³n operativa
            </h2>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Estado
              titulo="Abiertos"
              valor={metrics.abiertos}
            />
            <Estado
              titulo="En progreso"
              valor={metrics.progreso}
            />
            <Estado
              titulo="Completados"
              valor={metrics.completados}
            />
            <Estado
              titulo="Cancelados"
              valor={metrics.cancelados}
            />
          </div>
        </section>
      </div>
    </main>
  );
}

function Tarjeta({
  titulo,
  valor,
  descripcion,
}: {
  titulo: string;
  valor: string;
  descripcion: string;
}) {
  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow">
      <p className="text-sm font-black text-slate-500">
        {titulo}
      </p>

      <p className="mt-3 text-3xl font-black text-slate-950">
        {valor}
      </p>

      <p className="mt-3 text-sm leading-6 text-slate-600">
        {descripcion}
      </p>
    </article>
  );
}

function Bloque({
  titulo,
  principal,
  detalle,
}: {
  titulo: string;
  principal: string;
  detalle: string;
}) {
  return (
    <article className="rounded-3xl border border-indigo-200 bg-indigo-50 p-6 shadow-sm">
      <p className="text-sm font-black text-indigo-700">
        {titulo}
      </p>

      <p className="mt-2 text-3xl font-black text-indigo-950">
        {principal}
      </p>

      <p className="mt-2 text-sm font-semibold text-indigo-800">
        {detalle}
      </p>
    </article>
  );
}

function Estado({
  titulo,
  valor,
}: {
  titulo: string;
  valor: number;
}) {
  return (
    <div className="rounded-2xl bg-slate-50 p-5">
      <p className="text-sm font-bold text-slate-500">
        {titulo}
      </p>
      <p className="mt-2 text-3xl font-black text-slate-950">
        {valor}
      </p>
    </div>
  );
}

