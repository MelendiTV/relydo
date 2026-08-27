"use client";

import { Suspense, useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useRouter, useSearchParams } from "next/navigation";
import { useLanguage } from "@/app/components/LanguageProvider";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

type Profesional = {
  user_id: string;
  business_name: string | null;
  bio: string | null;
  trade: string | null;
  years_experience: number | null;
  service_radius_miles: number | null;
  average_rating: number | null;
  completed_jobs: number | null;
  verification_status: string | null;
  verified: boolean | null;
  active: boolean | null;
  city: string | null;
  state: string | null;
};

function nombreOficio(
  trade: string | null,
  language: "es" | "en"
) {
  const oficiosEs: Record<string, string> = {
    plumbing: "Plomería",
    electrical: "Electricidad",
    hvac: "HVAC / Aire acondicionado",
    carpentry: "Carpintería",
    painting: "Pintura",
    landscaping: "Jardinería",
    cleaning: "Limpieza",
    moving: "Mudanzas",
    "appliance-repair": "Reparación de electrodomésticos",
    handyman: "Handyman",
    other: "Otros servicios",
  };

  const oficiosEn: Record<string, string> = {
    plumbing: "Plumbing",
    electrical: "Electrical",
    hvac: "HVAC / Air conditioning",
    carpentry: "Carpentry",
    painting: "Painting",
    landscaping: "Landscaping",
    cleaning: "Cleaning",
    moving: "Moving",
    "appliance-repair": "Appliance repair",
    handyman: "Handyman",
    other: "Other services",
  };

  if (!trade) {
    return language === "es"
      ? "Profesional"
      : "Professional";
  }

  const oficios =
    language === "es"
      ? oficiosEs
      : oficiosEn;

  return oficios[trade] || trade;
}

function ProfesionalesContenido() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { language } = useLanguage();

  const requestedTrade =
    searchParams.get("trade")?.trim() || "";

  const text =
    language === "es"
      ? {
          errorCarga:
            "No se pudieron cargar los profesionales",
          cargando:
            "Cargando profesionales...",
          volverInicio:
            "Volver a mi cuenta",
          titulo:
            "Profesionales",
          descripcion:
            "Encuentra profesionales verificados para realizar tu trabajo.",
          sinProfesionales:
            "Todavía no hay profesionales disponibles",
          sinProfesionalesDescripcion:
            "Los profesionales aparecerán aquí cuando estén verificados y activos.",
          verificado:
            "Verificado",
          profesionalRelydo:
            "Profesional RELYDO",
          calificacion:
            "Calificación",
          trabajos:
            "Trabajos",
          experiencia:
            "Experiencia",
          anos:
            "años",
          verPerfil:
            "Ver perfil",
          solicitarTrabajo:
            "Solicitar trabajo",
          sinCoincidencias:
            "No encontramos profesionales de esta especialidad en tu zona.",
          sinCoincidenciasDescripcion:
            "Prueba otra categoría o vuelve más tarde mientras ampliamos la red de profesionales.",
        }
      : {
          errorCarga:
            "We could not load the professionals",
          cargando:
            "Loading professionals...",
          volverInicio:
            "Back to my account",
          titulo:
            "Professionals",
          descripcion:
            "Find verified professionals for your job.",
          sinProfesionales:
            "There are no professionals available yet",
          sinProfesionalesDescripcion:
            "Professionals will appear here once they are verified and active.",
          verificado:
            "Verified",
          profesionalRelydo:
            "RELYDO Professional",
          calificacion:
            "Rating",
          trabajos:
            "Jobs",
          experiencia:
            "Experience",
          anos:
            "years",
          verPerfil:
            "View profile",
          solicitarTrabajo:
            "Request job",
          sinCoincidencias:
            "We couldn't find professionals in this specialty in your area.",
          sinCoincidenciasDescripcion:
            "Try another category or check back later as we expand the professional network.",
        };

  const [profesionales, setProfesionales] =
    useState<Profesional[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  useEffect(() => {
    cargarProfesionales();
  }, [requestedTrade]);

  async function cargarProfesionales() {
    setLoading(true);
    setError("");

    const normalizar = (
      valor: string | null | undefined
    ) =>
      (valor || "")
        .trim()
        .toLowerCase();

    const normalizarTrade = (
      valor: string | null | undefined
    ) =>
      normalizar(valor)
        .replace(/_/g, "-")
        .replace(/\s+/g, "-");

    let customerCity = "";
    let customerState = "";

    const {
      data: authData,
    } = await supabase.auth.getUser();

    if (authData.user) {
      const {
        data: customerProfile,
      } = await supabase
        .from("profiles")
        .select("city, state")
        .eq("id", authData.user.id)
        .maybeSingle();

      customerCity =
        customerProfile?.city?.trim() || "";
      customerState =
        customerProfile?.state?.trim() || "";
    }

    const {
      data,
      error: profesionalesError,
    } = await supabase
      .from("provider_profiles")
      .select(`
        user_id,
        business_name,
        bio,
        trade,
        years_experience,
        service_radius_miles,
        average_rating,
        completed_jobs,
        verification_status,
        verified,
        active,
        city,
        state
      `)
      .eq("verification_status", "verified")
      .eq("verified", true)
      .eq("active", true)
      .order("average_rating", {
        ascending: false,
      });

    if (profesionalesError) {
      console.error(
        "Error cargando profesionales:",
        profesionalesError
      );

      setError(
        `${text.errorCarga}: ${profesionalesError.message}`
      );

      setLoading(false);
      return;
    }

    const tradeBuscado =
      normalizarTrade(requestedTrade);

    const ciudadCliente =
      normalizar(customerCity);

    const estadoCliente =
      normalizar(customerState);

    const filtrados = (data || []).filter(
      (profesional) => {
        const tradeProfesional =
          normalizarTrade(
            profesional.trade
          );

        const coincideTrade =
          !tradeBuscado ||
          tradeProfesional ===
            tradeBuscado;

        if (!coincideTrade) {
          return false;
        }

        const ciudadProfesional =
          normalizar(
            profesional.city
          );

        const estadoProfesional =
          normalizar(
            profesional.state
          );

        if (
          ciudadCliente &&
          estadoCliente
        ) {
          return (
            ciudadProfesional ===
              ciudadCliente &&
            estadoProfesional ===
              estadoCliente
          );
        }

        return true;
      }
    );

    setProfesionales(filtrados);
    setLoading(false);
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-100 flex items-center justify-center px-4">
        <div className="rounded-2xl border border-slate-200 bg-white px-8 py-7 shadow-lg">
          <p className="font-bold text-slate-700">
            {text.cargando}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-10">
      <div className="mx-auto max-w-6xl">
        {/* HEADER */}

        <div>
          <button
            type="button"
            onClick={() =>
              router.push("/mis-solicitudes")
            }
            className="font-bold text-blue-700 hover:underline"
          >
            ← {text.volverInicio}
          </button>

          <h1 className="mt-5 text-4xl font-extrabold text-slate-900">
            {text.titulo}
          </h1>

          <p className="mt-2 text-lg text-slate-600">
            {text.descripcion}
          </p>
        </div>

        {/* ERROR */}

        {error && (
          <div className="mt-7 rounded-2xl border border-red-300 bg-red-50 p-5 text-red-700">
            {error}
          </div>
        )}

        {/* SIN PROFESIONALES */}

        {!error &&
          profesionales.length === 0 && (
            <div className="mt-8 rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-lg">
              <div className="text-5xl">
                👷
              </div>

              <h2 className="mt-4 text-2xl font-extrabold text-slate-900">
                {requestedTrade
                  ? text.sinCoincidencias
                  : text.sinProfesionales}
              </h2>

              <p className="mt-2 text-slate-600">
                {requestedTrade
                  ? text.sinCoincidenciasDescripcion
                  : text.sinProfesionalesDescripcion}
              </p>
            </div>
          )}

        {/* LISTA */}

        {profesionales.length > 0 && (
          <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
            {profesionales.map(
              (profesional) => (
                <article
                  key={profesional.user_id}
                  className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-lg transition hover:-translate-y-1 hover:shadow-xl"
                >
                  {/* CABECERA */}

                  <div className="bg-blue-700 p-6 text-white">
                    <div className="flex items-start gap-4">
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-3xl">
                        👷
                      </div>

                      <div className="flex-1">
                        <span className="inline-block rounded-full bg-green-100 px-3 py-1 text-xs font-extrabold text-green-800">
                          ✓ {text.verificado}
                        </span>

                        <h2 className="mt-3 text-2xl font-extrabold">
                          {profesional.business_name ||
                            text.profesionalRelydo}
                        </h2>

                        <p className="mt-1 font-semibold text-blue-100">
                          {nombreOficio(
                            profesional.trade,
                            language
                          )}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* CONTENIDO */}

                  <div className="p-6">
                    {profesional.bio && (
                      <p className="line-clamp-3 leading-7 text-slate-600">
                        {profesional.bio}
                      </p>
                    )}

                    <div className="mt-5 grid grid-cols-3 gap-3">
                      <div className="rounded-xl bg-slate-50 p-3 text-center">
                        <p className="text-xs text-slate-500">
                          {text.calificacion}
                        </p>

                        <p className="mt-1 font-extrabold text-slate-900">
                          ⭐{" "}
                          {Number(
                            profesional.average_rating ??
                              0
                          ).toFixed(1)}
                        </p>
                      </div>

                      <div className="rounded-xl bg-slate-50 p-3 text-center">
                        <p className="text-xs text-slate-500">
                          {text.trabajos}
                        </p>

                        <p className="mt-1 font-extrabold text-slate-900">
                          {profesional.completed_jobs ??
                            0}
                        </p>
                      </div>

                      <div className="rounded-xl bg-slate-50 p-3 text-center">
                        <p className="text-xs text-slate-500">
                          {text.experiencia}
                        </p>

                        <p className="mt-1 font-extrabold text-slate-900">
                          {profesional.years_experience ??
                            0}{" "}
                          {text.anos}
                        </p>
                      </div>
                    </div>

                    <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() =>
                          router.push(
                            `/profesionales/${profesional.user_id}`
                          )
                        }
                        className="rounded-xl border-2 border-blue-700 px-5 py-3 font-extrabold text-blue-700 hover:bg-blue-50"
                      >
                        {text.verPerfil}
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          router.push(
                            `/solicitar-trabajo?profesional=${profesional.user_id}`
                          )
                        }
                        className="rounded-xl bg-blue-700 px-5 py-3 font-extrabold text-white hover:bg-blue-800"
                      >
                        {text.solicitarTrabajo}
                      </button>
                    </div>
                  </div>
                </article>
              )
            )}
          </div>
        )}
      </div>
    </main>
  );
}

export default function ProfesionalesPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-100 flex items-center justify-center px-4">
          <div className="rounded-2xl border border-slate-200 bg-white px-8 py-7 shadow-lg">
            <p className="font-bold text-slate-700">
              Cargando...
            </p>
          </div>
        </main>
      }
    >
      <ProfesionalesContenido />
    </Suspense>
  );
}