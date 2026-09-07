"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/app/lib/supabaseBrowser";
import { useRouter } from "next/navigation";
import {
  hasAdminPermission,
  isAdminRole,
} from "@/app/lib/adminPermissions";


type Profile = {
  id: string;
  role: string | null;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
};

type Provider = {
  user_id: string;
  business_name: string | null;
  trade: string | null;
  verification_status: string | null;
  verified: boolean | null;
  active: boolean | null;
  average_rating: number | null;
  completed_jobs: number | null;
};

type RequestRow = {
  id: string;
  customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  preferred_provider_id: string | null;
  status: string;
};

type Filtro = "todos" | "customer" | "provider";

function nombreOficio(trade: string | null) {
  const nombres: Record<string, string> = {
    plumbing: "Plomería",
    electrical: "Electricidad",
    hvac: "HVAC / Aire acondicionado",
    carpentry: "Carpintería",
    painting: "Pintura",
    landscaping: "Jardinería",
    cleaning: "Limpieza",
    moving: "Mudanzas",
    other: "Otros servicios",
  };
  return trade ? nombres[trade] || trade : "No indicado";
}

export default function AdminUsuariosPage() {
  const router = useRouter();

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [buscando, setBuscando] = useState("");
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
        !hasAdminPermission(adminProfile.admin_role, "users")
      ) {
        router.replace("/admin");
        return;
      }

      const [profilesResp, providersResp, requestsResp] =
        await Promise.all([
          supabase
            .from("profiles")
            .select("id, role, full_name, phone, email, city, state, zip_code")
            .order("full_name", { ascending: true }),

          supabase
            .from("provider_profiles")
            .select(`
              user_id,
              business_name,
              trade,
              verification_status,
              verified,
              active,
              average_rating,
              completed_jobs
            `),

          supabase
            .from("service_requests")
            .select(`
              id,
              customer_id,
              customer_name,
              customer_phone,
              customer_email,
              preferred_provider_id,
              status
            `)
            .limit(5000),
        ]);

      if (profilesResp.error) {
        throw new Error(
          `No pudimos cargar los usuarios: ${profilesResp.error.message}`
        );
      }

      if (providersResp.error) {
        throw new Error(
          `No pudimos cargar los profesionales: ${providersResp.error.message}`
        );
      }

      if (requestsResp.error) {
        throw new Error(
          `No pudimos cargar la actividad: ${requestsResp.error.message}`
        );
      }

      setProfiles((profilesResp.data || []) as Profile[]);
      setProviders((providersResp.data || []) as Provider[]);
      setRequests((requestsResp.data || []) as RequestRow[]);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No pudimos cargar Gestión de usuarios."
      );
    } finally {
      setLoading(false);
    }
  }

  const usuarios = useMemo(() => {
    const texto = buscando.trim().toLowerCase();

    return profiles
      .filter((p) => p.role === "customer" || p.role === "provider")
      .filter((p) => filtro === "todos" || p.role === filtro)
      .filter((p) => {
        if (!texto) return true;

        const provider = providers.find((x) => x.user_id === p.id);

        return [
          p.full_name,
          p.email,
          p.phone,
          p.city,
          p.state,
          p.zip_code,
          p.id,
          provider?.business_name,
          provider?.trade,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(texto);
      });
  }, [profiles, providers, filtro, buscando]);

  const clientes = profiles.filter((p) => p.role === "customer").length;
  const profesionales = profiles.filter((p) => p.role === "provider").length;

  function contactoUsuario(profile: Profile) {
    const trabajosCliente = requests.filter(
      (r) => r.customer_id === profile.id
    );

    const telefonoSolicitud =
      trabajosCliente.find((r) => r.customer_phone)?.customer_phone || null;

    const emailSolicitud =
      trabajosCliente.find((r) => r.customer_email)?.customer_email || null;

    return {
      telefono: profile.phone || telefonoSolicitud,
      email: profile.email || emailSolicitud,
    };
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <div className="rounded-2xl bg-white px-8 py-7 font-bold text-slate-700 shadow">
          Cargando usuarios...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-10">
      <div className="mx-auto max-w-7xl">
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
            className="rounded-xl border-2 border-cyan-700 bg-white px-5 py-3 font-extrabold text-cyan-700 hover:bg-cyan-50"
          >
            ↻ Actualizar usuarios
          </button>
        </div>

        <section className="rounded-3xl bg-slate-950 p-7 text-white shadow-xl">
          <p className="text-sm font-black uppercase tracking-widest text-cyan-300">
            👥 Administración
          </p>
          <h1 className="mt-2 text-3xl font-black">
            Gestión de usuarios
          </h1>
          <p className="mt-3 max-w-3xl text-slate-300">
            Consulta clientes y profesionales, sus datos de contacto y su actividad dentro de FixFlow.
          </p>
        </section>

        {error && (
          <div className="mt-6 rounded-2xl border border-red-300 bg-red-50 p-5 font-bold text-red-700">
            {error}
          </div>
        )}

        <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Resumen titulo="Usuarios" valor={clientes + profesionales} />
          <Resumen titulo="Clientes" valor={clientes} />
          <Resumen titulo="Profesionales" valor={profesionales} />
        </section>

        <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <input
              value={buscando}
              onChange={(e) => setBuscando(e.target.value)}
              placeholder="Buscar nombre, teléfono, email, ciudad, negocio o ID..."
              className="w-full rounded-xl border border-slate-300 px-4 py-3 font-semibold outline-none focus:border-cyan-600 lg:max-w-xl"
            />

            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["todos", "Todos"],
                  ["customer", "Clientes"],
                  ["provider", "Profesionales"],
                ] as const
              ).map(([valor, texto]) => (
                <button
                  key={valor}
                  type="button"
                  onClick={() => setFiltro(valor)}
                  className={`rounded-xl px-4 py-2.5 text-sm font-black ${
                    filtro === valor
                      ? "bg-cyan-700 text-white"
                      : "bg-slate-100 text-slate-700"
                  }`}
                >
                  {texto}
                </button>
              ))}
            </div>
          </div>

          <p className="mt-4 text-sm font-bold text-slate-500">
            {usuarios.length} usuario{usuarios.length === 1 ? "" : "s"}
          </p>
        </section>

        <section className="mt-6 space-y-4">
          {usuarios.length === 0 ? (
            <div className="rounded-3xl bg-white p-8 text-center font-bold text-slate-500 shadow">
              No encontramos usuarios con esos filtros.
            </div>
          ) : (
            usuarios.map((profile) => {
              const provider = providers.find(
                (p) => p.user_id === profile.id
              );

              const contacto = contactoUsuario(profile);

              const trabajosCliente = requests.filter(
                (r) => r.customer_id === profile.id
              );

              const trabajosPro = requests.filter(
                (r) => r.preferred_provider_id === profile.id
              );

              const trabajos =
                profile.role === "provider"
                  ? trabajosPro
                  : trabajosCliente;

              const completados = trabajos.filter(
                (r) => r.status === "completed"
              ).length;

              return (
                <article
                  key={profile.id}
                  className="rounded-3xl border border-slate-200 bg-white p-6 shadow"
                >
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-xl font-black text-slate-950">
                          {profile.full_name ||
                            provider?.business_name ||
                            "Usuario FixFlow"}
                        </h2>

                        <span
                          className={`rounded-full px-3 py-1 text-xs font-black ${
                            profile.role === "provider"
                              ? "bg-purple-100 text-purple-800"
                              : "bg-blue-100 text-blue-800"
                          }`}
                        >
                          {profile.role === "provider"
                            ? "Profesional"
                            : "Cliente"}
                        </span>

                        {provider && (
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-black ${
                              provider.verified && provider.active
                                ? "bg-green-100 text-green-800"
                                : provider.verified && !provider.active
                                ? "bg-amber-100 text-amber-800"
                                : provider.verification_status === "rejected"
                                ? "bg-red-100 text-red-800"
                                : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {provider.verified && provider.active
                              ? "Activo"
                              : provider.verified && !provider.active
                              ? "Suspendido"
                              : provider.verification_status === "rejected"
                              ? "Rechazado"
                              : "Pendiente"}
                          </span>
                        )}
                      </div>

                      {provider?.business_name && (
                        <p className="mt-2 font-bold text-slate-700">
                          {provider.business_name} · {nombreOficio(provider.trade)}
                        </p>
                      )}

                      <div className="mt-4 grid grid-cols-1 gap-2 text-sm text-slate-600 sm:grid-cols-2">
                        <p>
                          <span className="font-black text-slate-800">📞 Teléfono:</span>{" "}
                          {contacto.telefono || "No registrado"}
                        </p>

                        <p>
                          <span className="font-black text-slate-800">✉️ Email:</span>{" "}
                          {contacto.email || "No registrado"}
                        </p>

                        <p>
                          <span className="font-black text-slate-800">📍 Ubicación:</span>{" "}
                          {[profile.city, profile.state, profile.zip_code]
                            .filter(Boolean)
                            .join(", ") || "No registrada"}
                        </p>

                        <p>
                          <span className="font-black text-slate-800">🧰 Trabajos:</span>{" "}
                          {trabajos.length} · {completados} completados
                        </p>
                      </div>

                      <p className="mt-3 break-all text-xs font-semibold text-slate-400">
                        ID: {profile.id}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2 lg:max-w-xs lg:justify-end">
                      {contacto.telefono && (
                        <>
                          <a
                            href={`tel:${contacto.telefono}`}
                            className="rounded-xl bg-green-700 px-4 py-2.5 text-sm font-black text-white hover:bg-green-800"
                          >
                            📞 Llamar
                          </a>

                          <a
                            href={`sms:${contacto.telefono}`}
                            className="rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-black text-white hover:bg-blue-800"
                          >
                            💬 Mensaje
                          </a>
                        </>
                      )}

                      {contacto.email && (
                        <a
                          href={`mailto:${contacto.email}`}
                          className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-black text-slate-700 hover:bg-slate-50"
                        >
                          ✉️ Email
                        </a>
                      )}
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </section>
      </div>
    </main>
  );
}

function Resumen({
  titulo,
  valor,
}: {
  titulo: string;
  valor: number;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow">
      <p className="text-sm font-black text-slate-500">{titulo}</p>
      <p className="mt-2 text-3xl font-black text-slate-950">{valor}</p>
    </div>
  );
}
