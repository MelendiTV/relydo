"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useLanguage } from "@/app/components/LanguageProvider";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

type Trabajo = {
  id: string;
  title: string;
  description: string;
  city: string;
  state: string;
  zip_code: string;
  preferred_date: string | null;
  preferred_time: string | null;
  status: string;
  created_at: string;
  customer_name: string | null;
  service_id: string;
  preferred_provider_id: string | null;
};

type ProviderProfile = {
  user_id: string;
  state: string | null;
  trade: string | null;
  verification_status: string | null;
  verified: boolean | null;
  active: boolean | null;
};

type GeneralProfile = {
  state: string | null;
};

type ProviderService = {
  service_id: string;
};

type ReleasedJob = {
  request_id: string;
};

type ProviderOfferStatus = {
  request_id: string;
  status: string;
};

export default function TrabajosPage() {
  const { language } = useLanguage();

  const T = (es: string, en: string) =>
    language === "es" ? es : en;

  const [trabajos, setTrabajos] =
    useState<Trabajo[]>([]);

  const [cargando, setCargando] =
    useState(true);

  const [error, setError] =
    useState("");

  const [offerStatuses, setOfferStatuses] =
    useState<Record<string, string>>({});

  /*
    CARGA INICIAL + REALTIME

    Si una solicitud vuelve a quedar abierta
    porque un profesional la liberó, los demás
    profesionales podrán verla sin tener que
    recargar manualmente la página.
  */

  useEffect(() => {
    let mounted = true;

    comprobarUsuarioYCargarTrabajos();

    const channel = supabase
      .channel(
        "trabajos-disponibles-service-requests"
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "service_requests",
        },
        async () => {
          if (mounted) {
            await comprobarUsuarioYCargarTrabajos(
              false
            );
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "offers",
        },
        async () => {
          if (mounted) {
            await comprobarUsuarioYCargarTrabajos(
              false
            );
          }
        }
      )
      .subscribe();

    return () => {
      mounted = false;

      supabase.removeChannel(
        channel
      );
    };
  }, []);

  async function comprobarUsuarioYCargarTrabajos(
    mostrarCarga = true
  ) {
    if (mostrarCarga) {
      setCargando(true);
    }

    setError("");

    try {
      /*
        1. USUARIO AUTENTICADO
      */

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        window.location.href =
          "/login-profesional";
        return;
      }

      /*
        2. PERFIL PROFESIONAL
      */

      const {
        data: providerProfile,
        error: providerError,
      } = await supabase
        .from("provider_profiles")
        .select(`
          user_id,
          state,
          trade,
          verification_status,
          verified,
          active
        `)
        .eq("user_id", user.id)
        .maybeSingle();

      if (providerError) {
        throw new Error(
          `${T(
            "No se pudo cargar tu perfil profesional",
            "We could not load your professional profile"
          )}: ${providerError.message}`
        );
      }

      if (!providerProfile) {
        throw new Error(
          T(
            "No encontramos tu perfil profesional.",
            "We could not find your professional profile."
          )
        );
      }

      const perfil =
        providerProfile as ProviderProfile;

      /*
        3. SOLO PROFESIONALES
        VERIFICADOS Y ACTIVOS
      */

      if (
        perfil.verification_status !== "verified" ||
        perfil.verified !== true ||
        perfil.active !== true
      ) {
        throw new Error(
          T(
            "Tu cuenta profesional debe estar verificada y activa para ver trabajos disponibles.",
            "Your professional account must be verified and active to view available jobs."
          )
        );
      }

      /*
        4. OBTENER SERVICIOS
        ASIGNADOS AL PROFESIONAL
      */

      const {
        data: providerServices,
        error: servicesError,
      } = await supabase
        .from("provider_services")
        .select("service_id")
        .eq(
          "provider_id",
          user.id
        );

      if (servicesError) {
        throw new Error(
          `${T(
            "No se pudieron cargar tus especialidades",
            "We could not load your specialties"
          )}: ${servicesError.message}`
        );
      }

      const servicios =
        (providerServices || []) as ProviderService[];

      const serviceIds =
        servicios.map(
          (item) => item.service_id
        );

      if (serviceIds.length === 0) {
        setTrabajos([]);
        return;
      }

      /*
        5. OBTENER ESTADO

        Primero usamos:
        provider_profiles.state

        Si está vacío,
        intentamos profiles.state
      */

      let providerState =
        perfil.state
          ?.trim()
          .toUpperCase() ||
        "";

      if (!providerState) {
        const {
          data: generalProfile,
          error: generalProfileError,
        } = await supabase
          .from("profiles")
          .select("state")
          .eq("id", user.id)
          .maybeSingle();

        if (generalProfileError) {
          console.error(
            "No se pudo comprobar el estado en profiles:",
            generalProfileError
          );
        }

        const perfilGeneral =
          generalProfile as GeneralProfile | null;

        providerState =
          perfilGeneral?.state
            ?.trim()
            .toUpperCase() ||
          "";
      }

      if (!providerState) {
        throw new Error(
          T(
            "Tu perfil profesional no tiene un estado configurado. Completa tu perfil e indica el estado donde trabajas.",
            "Your professional profile does not have a state configured. Complete your profile and enter the state where you work."
          )
        );
      }

      /*
        6. TRABAJOS QUE ESTE PROFESIONAL
        YA LIBERÓ

        Esta tabla guarda las solicitudes que
        el profesional devolvió al sistema.

        Ese profesional NO debe volver a verlas,
        pero los demás profesionales sí.
      */

      const {
        data: releasedJobsData,
        error: releasedJobsError,
      } = await supabase
        .from(
          "provider_released_jobs"
        )
        .select(
          "request_id"
        )
        .eq(
          "professional_id",
          user.id
        );

      if (releasedJobsError) {
        throw new Error(
          `${T(
            "No se pudo comprobar el historial de trabajos liberados",
            "We could not check your released job history"
          )}: ${releasedJobsError.message}`
        );
      }

      const releasedJobs =
        (releasedJobsData ||
          []) as ReleasedJob[];

      const releasedRequestIds =
        new Set(
          releasedJobs.map(
            (item) =>
              item.request_id
          )
        );

      /*
        7. BUSCAR TRABAJOS

        FILTROS:
        - abiertos
        - misma especialidad
        - mismo estado
      */

      const {
        data,
        error: trabajosError,
      } = await supabase.rpc(
        "get_provider_open_requests_safe"
      );

      if (trabajosError) {
        throw new Error(
          `${T(
            "No se pudieron cargar los trabajos",
            "We could not load the jobs"
          )}: ${trabajosError.message}`
        );
      }

      /*
        8. FILTRAR TRABAJOS VISIBLES

        REGLAS:

        1. Si preferred_provider_id es NULL:
           cualquier profesional compatible
           puede verlo.

        2. Si tiene preferred_provider_id:
           solamente ese profesional puede verlo.

        3. Si este profesional ya liberó
           la solicitud:
           NO vuelve a verla.
      */

      const safeJobs = (data || []) as Trabajo[];

      const visibles =
        safeJobs.filter(
          (trabajo: Trabajo) => {
            const puedeVerPorPreferencia =
              trabajo.preferred_provider_id === null ||
              trabajo.preferred_provider_id === user.id;

            const yaLoLibero =
              releasedRequestIds.has(
                trabajo.id
              );

            return (
              puedeVerPorPreferencia &&
              !yaLoLibero
            );
          }
        );

      const visibleRequestIds =
        visibles.map(
          (trabajo: Trabajo) => trabajo.id
        );

      let statuses: Record<string, string> = {};

      if (visibleRequestIds.length > 0) {
        const {
          data: providerOffersData,
          error: providerOffersError,
        } = await supabase
          .from("offers")
          .select(`
            request_id,
            status
          `)
          .eq(
            "professional_id",
            user.id
          )
          .in(
            "request_id",
            visibleRequestIds
          );

        if (providerOffersError) {
          console.error(
            "No se pudieron cargar los estados de los presupuestos del profesional:",
            providerOffersError
          );
        } else {
          statuses = Object.fromEntries(
            ((providerOffersData || []) as ProviderOfferStatus[]).map(
              (item) => [
                item.request_id,
                item.status,
              ]
            )
          );
        }
      }

      setOfferStatuses(statuses);

      setTrabajos(
        visibles as Trabajo[]
      );
    } catch (err) {
      console.error(
        "Error cargando trabajos:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : T(
              "No se pudieron cargar los trabajos.",
              "We could not load the jobs."
            )
      );
    } finally {
      if (mostrarCarga) {
        setCargando(false);
      }
    }
  }

  if (cargando) {
    return (
      <main className="min-h-screen bg-slate-100 px-6 py-12">
        <div className="mx-auto max-w-5xl">
          <div className="rounded-2xl bg-white p-8 text-center shadow">
            <p className="font-semibold text-slate-700">
              {T(
                "Cargando trabajos...",
                "Loading jobs..."
              )}
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 px-6 py-12">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8">
          <a
            href="/panel-profesional"
            className="mb-5 inline-flex items-center gap-2 font-bold text-blue-700 hover:underline"
          >
            ←{" "}
            {T(
              "Volver al panel profesional",
              "Back to professional dashboard"
            )}
          </a>

          <h1 className="text-4xl font-bold text-gray-900">
            {T(
              "Trabajos disponibles",
              "Available jobs"
            )}
          </h1>

          <p className="mt-2 text-gray-600">
            {T(
              "Revisa solicitudes abiertas de tus especialidades en tu área y envía tu presupuesto.",
              "Review open requests that match your specialties and area, then send your quote."
            )}
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
            {error}
          </div>
        )}

        {!error &&
          trabajos.length === 0 && (
            <div className="rounded-2xl bg-white p-8 text-center shadow">
              <div className="text-5xl">
                🔎
              </div>

              <h2 className="mt-4 text-xl font-extrabold text-slate-900">
                {T(
                  "No hay trabajos disponibles",
                  "No jobs available"
                )}
              </h2>

              <p className="mt-2 text-gray-600">
                {T(
                  "En este momento no hay solicitudes abiertas que coincidan con tus especialidades y ubicación.",
                  "There are currently no open requests that match your specialties and location."
                )}
              </p>
            </div>
          )}

        {!error &&
          trabajos.length > 0 && (
            <div className="space-y-6">
              {trabajos.map(
                (trabajo) => {
                  const offerStatus =
                    offerStatuses[
                      trabajo.id
                    ];

                  const rechazadoPorCliente =
                    offerStatus ===
                    "rejected";

                  return (
                  <div
                    key={trabajo.id}
                    className="rounded-2xl bg-white p-6 shadow-md"
                  >
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div>
                        <h2 className="text-2xl font-bold text-gray-900">
                          {trabajo.title}
                        </h2>

                        <p className="mt-2 text-gray-600">
                          {trabajo.description}
                        </p>
                      </div>

                      <span
                        className={`inline-block rounded-full px-3 py-1 text-sm font-semibold ${
                          rechazadoPorCliente
                            ? "bg-red-100 text-red-700"
                            : "bg-green-100 text-green-700"
                        }`}
                      >
                        {rechazadoPorCliente
                          ? T(
                              "Rechazado por cliente",
                              "Rejected by customer"
                            )
                          : T(
                              "Abierto",
                              "Open"
                            )}
                      </span>
                    </div>

                    <div className="mt-6 grid grid-cols-1 gap-4 text-gray-700 md:grid-cols-2">
                      <div>
                        <strong>
                          {T(
                            "Ubicación:",
                            "Location:"
                          )}
                        </strong>{" "}
                        {trabajo.city},{" "}
                        {trabajo.state}{" "}
                        {trabajo.zip_code}
                      </div>

                      <div>
                        <strong>
                          {T(
                            "Cliente:",
                            "Customer:"
                          )}
                        </strong>{" "}
                        {trabajo.customer_name ||
                          T(
                            "Cliente",
                            "Customer"
                          )}
                      </div>

                      <div>
                        <strong>
                          {T(
                            "Fecha preferida:",
                            "Preferred date:"
                          )}
                        </strong>{" "}
                        {trabajo.preferred_date ||
                          T(
                            "Flexible",
                            "Flexible"
                          )}
                      </div>

                      <div>
                        <strong>
                          {T(
                            "Hora preferida:",
                            "Preferred time:"
                          )}
                        </strong>{" "}
                        {trabajo.preferred_time ||
                          T(
                            "Flexible",
                            "Flexible"
                          )}
                      </div>
                    </div>

                    {trabajo.preferred_provider_id && (
                      <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-4">
                        <p className="font-semibold text-blue-800">
                          {T(
                            "⭐ Este cliente te seleccionó como profesional preferido.",
                            "⭐ This customer selected you as their preferred professional."
                          )}
                        </p>
                      </div>
                    )}

                    <div className="mt-6">
                      <a
                        href={`/trabajos/${trabajo.id}`}
                        className={`inline-block rounded-xl px-6 py-3 font-semibold text-white ${
                          rechazadoPorCliente
                            ? "bg-slate-700 hover:bg-slate-800"
                            : "bg-blue-600 hover:bg-blue-700"
                        }`}
                      >
                        {rechazadoPorCliente
                          ? T(
                              "Ver trabajo",
                              "View job"
                            )
                          : T(
                              "Ver trabajo y enviar presupuesto",
                              "View job and send quote"
                            )}
                      </a>
                    </div>
                  </div>
                  );
                }
              )}
            </div>
          )}
      </div>
    </main>
  );
}