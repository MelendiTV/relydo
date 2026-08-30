"use client";

import {
  Suspense,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createClient } from "@supabase/supabase-js";
import {
  useRouter,
  useSearchParams,
} from "next/navigation";
import { useLanguage } from "@/app/components/LanguageProvider";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

type Profesional = {
  user_id: string;
  business_name: string | null;
  full_name?: string | null;
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
  zip_code: string | null;
};

type ProfileNameRow = {
  id: string;
  full_name: string | null;
};

function normalizar(
  valor: string | null | undefined
) {
  return (valor || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizarTrade(
  valor: string | null | undefined
) {
  return normalizar(valor)
    .replace(/_/g, "-")
    .replace(/\s+/g, "-");
}

function nombreOficio(
  trade: string | null,
  language: "es" | "en"
) {
  const oficiosEs: Record<string, string> = {
    plumbing: "Plomería",
    electrical: "Electricidad",
    hvac: "HVAC / Aire acondicionado",
    "ac-rental": "Renta de aires acondicionados",
    carpentry: "Carpintería",
    painting: "Pintura",
    landscaping: "Jardinería",
    cleaning: "Limpieza",
    moving: "Mudanzas",
    handyman: "Handyman",
    "appliance-repair":
      "Reparación de electrodomésticos",
    locksmith: "Cerrajería",
    roofing: "Techado",
    flooring: "Pisos",
    tile: "Azulejos y losas",
    drywall: "Drywall",
    masonry: "Concreto y albañilería",
    "doors-windows": "Puertas y ventanas",
    garage: "Garajes",
    fencing: "Cercas",
    "pools-spas": "Piscinas y spas",
    "pest-control": "Control de plagas",
    "pressure-washing": "Lavado a presión",
    "carpet-cleaning": "Limpieza de alfombras",
    "junk-removal": "Retiro de basura",
    "furniture-assembly": "Montaje de muebles",
    "tv-smart-home": "TV y hogar inteligente",
    other: "Otros servicios",
  };

  const oficiosEn: Record<string, string> = {
    plumbing: "Plumbing",
    electrical: "Electrical",
    hvac: "HVAC / Air conditioning",
    "ac-rental": "Air conditioner rental",
    carpentry: "Carpentry",
    painting: "Painting",
    landscaping: "Landscaping",
    cleaning: "Cleaning",
    moving: "Moving",
    handyman: "Handyman",
    "appliance-repair": "Appliance repair",
    locksmith: "Locksmith",
    roofing: "Roofing",
    flooring: "Flooring",
    tile: "Tile and stone",
    drywall: "Drywall",
    masonry: "Concrete and masonry",
    "doors-windows": "Doors and windows",
    garage: "Garage doors",
    fencing: "Fences",
    "pools-spas": "Pools and spas",
    "pest-control": "Pest control",
    "pressure-washing": "Pressure washing",
    "carpet-cleaning": "Carpet cleaning",
    "junk-removal": "Junk removal",
    "furniture-assembly": "Furniture assembly",
    "tv-smart-home": "TV and smart home",
    other: "Other services",
  };

  if (!trade) {
    return language === "es"
      ? "Profesional"
      : "Professional";
  }

  const key = normalizarTrade(trade);
  const oficios =
    language === "es"
      ? oficiosEs
      : oficiosEn;

  return oficios[key] || trade;
}


const ESPECIALIDADES = [
  "plumbing",
  "electrical",
  "hvac",
  "carpentry",
  "painting",
  "landscaping",
  "cleaning",
  "moving",
  "handyman",
  "appliance-repair",
  "locksmith",
  "roofing",
  "flooring",
  "tile",
  "drywall",
  "masonry",
  "doors-windows",
  "garage",
  "fencing",
  "pools-spas",
  "pest-control",
] as const;

function ProfesionalesContenido() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { language } = useLanguage();

  const requestedTrade =
    searchParams.get("trade")?.trim() || "";

  const [profesionales, setProfesionales] =
    useState<Profesional[]>([]);
  const [loading, setLoading] =
    useState(true);
  const [error, setError] =
    useState("");
  const [busqueda, setBusqueda] =
    useState("");
  const [tradeSeleccionado, setTradeSeleccionado] =
    useState(normalizarTrade(requestedTrade));
  const [customerArea, setCustomerArea] =
    useState<{
      city: string;
      state: string;
      zip: string;
    }>({
      city: "",
      state: "",
      zip: "",
    });

  const text =
    language === "es"
      ? {
          errorCarga:
            "No se pudieron cargar los profesionales",
          cargando:
            "Cargando profesionales...",
          titulo:
            "Profesionales",
          descripcion:
            "Encuentra profesionales verificados que atienden tu zona.",
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
          buscarPlaceholder:
            "Buscar por profesional, negocio o especialidad...",
          todos:
            "Todos",
          profesionalesZona:
            "Profesionales que atienden tu zona",
          especialidadesZona:
            "Especialidades disponibles en tu zona",
          resultados:
            "resultados",
          resultado:
            "resultado",
          sinCoincidencias:
            "No encontramos profesionales con esos filtros.",
          sinCoincidenciasDescripcion:
            "Prueba otra especialidad o cambia el texto de búsqueda.",
          sinProfesionales:
            "Todavía no hay profesionales disponibles en tu zona",
          sinProfesionalesDescripcion:
            "Los profesionales aparecerán aquí cuando estén verificados, activos y disponibles en tu área.",
          limpiar:
            "Limpiar filtros",
          zona:
            "Tu zona",
          ubicacionNoDisponible:
            "Ubicación del cliente no disponible",
        }
      : {
          errorCarga:
            "We could not load the professionals",
          cargando:
            "Loading professionals...",
          titulo:
            "Professionals",
          descripcion:
            "Find verified professionals who serve your area.",
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
          buscarPlaceholder:
            "Search by professional, business or specialty...",
          todos:
            "All",
          profesionalesZona:
            "Professionals serving your area",
          especialidadesZona:
            "Specialties available in your area",
          resultados:
            "results",
          resultado:
            "result",
          sinCoincidencias:
            "We couldn't find professionals with those filters.",
          sinCoincidenciasDescripcion:
            "Try another specialty or change your search.",
          sinProfesionales:
            "There are no professionals available in your area yet",
          sinProfesionalesDescripcion:
            "Professionals will appear here once they are verified, active, and available in your area.",
          limpiar:
            "Clear filters",
          zona:
            "Your area",
          ubicacionNoDisponible:
            "Customer location unavailable",
        };

  useEffect(() => {
    setTradeSeleccionado(
      normalizarTrade(requestedTrade)
    );
  }, [requestedTrade]);

  useEffect(() => {
    cargarProfesionales();
  }, []);

  async function cargarProfesionales() {
    setLoading(true);
    setError("");

    try {
      const {
        data: authData,
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) {
        console.error(
          "Error verificando sesión:",
          authError
        );
      }

      let customerCity = "";
      let customerState = "";
      let customerZip = "";

      if (authData.user) {
        const {
          data: customerProfile,
          error: customerProfileError,
        } = await supabase
          .from("profiles")
          .select("city, state, zip_code")
          .eq("id", authData.user.id)
          .maybeSingle();

        if (customerProfileError) {
          console.error(
            "Error cargando ubicación del cliente:",
            customerProfileError
          );
        } else {
          customerCity =
            customerProfile?.city?.trim() || "";
          customerState =
            customerProfile?.state?.trim() || "";
          customerZip =
            customerProfile?.zip_code?.trim() || "";
        }
      }

      setCustomerArea({
        city: customerCity,
        state: customerState,
        zip: customerZip,
      });

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
          state,
          zip_code
        `)
        .eq(
          "verification_status",
          "verified"
        )
        .eq("verified", true)
        .eq("active", true)
        .order("average_rating", {
          ascending: false,
        });

      if (profesionalesError) {
        throw profesionalesError;
      }

      const ciudadCliente =
        normalizar(customerCity);
      const estadoCliente =
        normalizar(customerState);
      const zipCliente =
        normalizar(customerZip);

      const enZona = (
        (data || []) as Profesional[]
      ).filter((profesional) => {
        const ciudadProfesional =
          normalizar(profesional.city);
        const estadoProfesional =
          normalizar(profesional.state);
        const zipProfesional =
          normalizar(
            profesional.zip_code
          );

        /*
          REGLA SEGURA ACTUAL:
          1) Si Cliente tiene ciudad + estado:
             solo muestra Pros de esa ciudad/estado.
          2) Si no hay ciudad/estado pero sí ZIP:
             usa coincidencia por ZIP.
          3) Si el Cliente todavía no tiene ubicación:
             no inventamos una zona y mostramos los Pros verificados.

          IMPORTANTE:
          El radio real por millas entre ciudades distintas requiere
          coordenadas/geocodificación. No se simula con datos falsos.
        */
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

        if (zipCliente) {
          return (
            zipProfesional === zipCliente
          );
        }

        return true;
      });

      const providerIds =
        enZona.map(
          (profesional) =>
            profesional.user_id
        );

      let nombres = new Map<
        string,
        string | null
      >();

      if (providerIds.length > 0) {
        const {
          data: profilesData,
          error: profilesError,
        } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", providerIds);

        if (profilesError) {
          console.warn(
            "No se pudieron cargar nombres públicos de profesionales:",
            profilesError
          );
        } else {
          nombres = new Map(
            (
              (profilesData ||
                []) as ProfileNameRow[]
            ).map((profile) => [
              profile.id,
              profile.full_name,
            ])
          );
        }
      }

      const completos =
        enZona.map(
          (profesional) => ({
            ...profesional,
            full_name:
              nombres.get(
                profesional.user_id
              ) || null,
          })
        );

      setProfesionales(completos);
    } catch (err) {
      console.error(
        "Error cargando profesionales:",
        err
      );

      setError(
        `${text.errorCarga}: ${
          err instanceof Error
            ? err.message
            : "Unknown error"
        }`
      );
      setProfesionales([]);
    } finally {
      setLoading(false);
    }
  }

  const categorias = useMemo(() => {
    const conteo = new Map<string, number>();

    profesionales.forEach((profesional) => {
      const trade = normalizarTrade(profesional.trade);
      if (!trade) return;
      conteo.set(trade, (conteo.get(trade) || 0) + 1);
    });

    return ESPECIALIDADES.map((trade) => ({
      trade,
      count: conteo.get(trade) || 0,
      nombre: nombreOficio(trade, language),
    }));
  }, [profesionales, language]);

  const profesionalesFiltrados =
    useMemo(() => {
      const texto =
        normalizar(busqueda);
      const tradeActivo =
        normalizarTrade(
          tradeSeleccionado
        );

      return profesionales.filter(
        (profesional) => {
          const tradeProfesional =
            normalizarTrade(
              profesional.trade
            );

          if (
            tradeActivo &&
            tradeProfesional !==
              tradeActivo
          ) {
            return false;
          }

          if (!texto) {
            return true;
          }

          const searchable = [
            profesional.full_name,
            profesional.business_name,
            profesional.trade,
            nombreOficio(
              profesional.trade,
              "es"
            ),
            nombreOficio(
              profesional.trade,
              "en"
            ),
            profesional.bio,
          ]
            .filter(Boolean)
            .map((item) =>
              normalizar(String(item))
            )
            .join(" ");

          return searchable.includes(
            texto
          );
        }
      );
    }, [
      profesionales,
      busqueda,
      tradeSeleccionado,
    ]);

  function seleccionarTrade(
    trade: string
  ) {
    const tradeNormalizado =
      normalizarTrade(trade);

    setTradeSeleccionado(
      tradeNormalizado
    );

    if (tradeNormalizado) {
      router.replace(
        `/profesionales?trade=${encodeURIComponent(
          tradeNormalizado
        )}`
      );
    } else {
      router.replace(
        "/profesionales"
      );
    }
  }

  function limpiarFiltros() {
    setBusqueda("");
    seleccionarTrade("");
  }

  const professionalsReturnPath =
    tradeSeleccionado
      ? `/profesionales?trade=${encodeURIComponent(
          tradeSeleccionado
        )}`
      : "/profesionales";

  const areaLabel = [
    customerArea.city,
    customerArea.state,
    customerArea.zip,
  ]
    .filter(Boolean)
    .join(", ");

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
        {/* BUSCADOR ARRIBA */}
        {!error && (
          <div className="relative mb-5">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg">
              🔍
            </span>
            <input
              type="search"
              value={busqueda}
              onChange={(event) => setBusqueda(event.target.value)}
              placeholder={text.buscarPlaceholder}
              className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-11 pr-4 text-sm font-semibold text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            />
          </div>
        )}

        {/* HEADER */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <button
              type="button"
              onClick={() => router.back()}
              aria-label={
                language === "es"
                  ? "Volver a la página anterior"
                  : "Go back to previous page"
              }
              title={language === "es" ? "Volver" : "Back"}
              className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
            >
              ←
            </button>

            <h1 className="text-4xl font-extrabold text-slate-900">
              {text.titulo}
            </h1>
            <p className="mt-1 text-base text-slate-600">
              {text.descripcion}
            </p>
          </div>

          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-bold text-blue-800">
            <span>📍</span>
            <span>{areaLabel || text.ubicacionNoDisponible}</span>
          </div>
        </div>

        {/* ERROR */}
        {error && (
          <div className="mt-5 rounded-2xl border border-red-300 bg-red-50 p-5 text-red-700">
            {error}
          </div>
        )}

        {!error && (
          <>
            {/* 21 ESPECIALIDADES COMPACTAS: 11 ARRIBA / 10 ABAJO EN DESKTOP */}
            <div className="mt-5">
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 md:grid-cols-7 lg:grid-cols-11">
                {categorias.map((categoria) => (
                  <button
                    key={categoria.trade}
                    type="button"
                    onClick={() => seleccionarTrade(categoria.trade)}
                    title={categoria.nombre}
                    className={`flex min-w-0 items-center justify-center gap-1 rounded-lg border px-2 py-2 text-[11px] font-extrabold leading-none transition ${
                      normalizarTrade(tradeSeleccionado) === categoria.trade
                        ? "border-blue-700 bg-blue-700 text-white shadow-sm"
                        : "border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-800"
                    }`}
                  >
                    <span className="truncate">{categoria.nombre}</span>
                    <span className="shrink-0 rounded-full bg-black/10 px-1.5 py-0.5 text-[10px]">
                      {categoria.count}
                    </span>
                  </button>
                ))}
              </div>

              <div className="mt-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => seleccionarTrade("")}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-extrabold transition ${
                    !tradeSeleccionado
                      ? "border-blue-700 bg-blue-700 text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-blue-50"
                  }`}
                >
                  {text.todos} · {profesionales.length}
                </button>

                {(tradeSeleccionado || busqueda) && (
                  <button
                    type="button"
                    onClick={limpiarFiltros}
                    className="text-xs font-bold text-blue-700 hover:text-blue-900"
                  >
                    {text.limpiar}
                  </button>
                )}
              </div>
            </div>

            {/* TITULO RESULTADOS */}
            <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-700">
                  {text.zona}
                </p>
                <h2 className="mt-1 text-2xl font-extrabold text-slate-900">
                  {
                    text.profesionalesZona
                  }
                </h2>
              </div>

              <p className="text-sm font-bold text-slate-500">
                {
                  profesionalesFiltrados.length
                }{" "}
                {profesionalesFiltrados.length ===
                1
                  ? text.resultado
                  : text.resultados}
              </p>
            </div>

            {/* SIN PROFESIONALES EN EL AREA */}
            {profesionales.length ===
              0 && (
              <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-lg">
                <div className="text-5xl">
                  👷
                </div>

                <h2 className="mt-4 text-2xl font-extrabold text-slate-900">
                  {
                    text.sinProfesionales
                  }
                </h2>

                <p className="mt-2 text-slate-600">
                  {
                    text.sinProfesionalesDescripcion
                  }
                </p>
              </div>
            )}

            {/* SIN COINCIDENCIAS DE BUSQUEDA/FILTRO */}
            {profesionales.length >
              0 &&
              profesionalesFiltrados.length ===
                0 && (
                <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-lg">
                  <div className="text-5xl">
                    🔎
                  </div>

                  <h2 className="mt-4 text-2xl font-extrabold text-slate-900">
                    {
                      text.sinCoincidencias
                    }
                  </h2>

                  <p className="mt-2 text-slate-600">
                    {
                      text.sinCoincidenciasDescripcion
                    }
                  </p>

                  <button
                    type="button"
                    onClick={
                      limpiarFiltros
                    }
                    className="mt-5 rounded-xl bg-blue-700 px-5 py-3 font-extrabold text-white hover:bg-blue-800"
                  >
                    {text.limpiar}
                  </button>
                </div>
              )}

            {/* LISTA */}
            {profesionalesFiltrados.length >
              0 && (
              <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
                {profesionalesFiltrados.map(
                  (
                    profesional
                  ) => (
                    <article
                      key={
                        profesional.user_id
                      }
                      className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-lg transition hover:-translate-y-1 hover:shadow-xl"
                    >
                      {/* CABECERA */}
                      <div className="bg-blue-700 p-6 text-white">
                        <div className="flex items-start gap-4">
                          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-3xl">
                            👷
                          </div>

                          <div className="min-w-0 flex-1">
                            <span className="inline-block rounded-full bg-green-100 px-3 py-1 text-xs font-extrabold text-green-800">
                              ✓{" "}
                              {
                                text.verificado
                              }
                            </span>

                            <h2 className="mt-3 break-words text-2xl font-extrabold">
                              {profesional.business_name ||
                                profesional.full_name ||
                                text.profesionalRelydo}
                            </h2>

                            {profesional.full_name &&
                              profesional.business_name && (
                                <p className="mt-1 text-sm font-medium text-blue-100">
                                  {
                                    profesional.full_name
                                  }
                                </p>
                              )}

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
                            {
                              profesional.bio
                            }
                          </p>
                        )}

                        <div className="mt-5 grid grid-cols-3 gap-3">
                          <div className="rounded-xl bg-slate-50 p-3 text-center">
                            <p className="text-xs text-slate-500">
                              {
                                text.calificacion
                              }
                            </p>

                            <p className="mt-1 font-extrabold text-slate-900">
                              ⭐{" "}
                              {Number(
                                profesional.average_rating ??
                                  0
                              ).toFixed(
                                1
                              )}
                            </p>
                          </div>

                          <div className="rounded-xl bg-slate-50 p-3 text-center">
                            <p className="text-xs text-slate-500">
                              {
                                text.trabajos
                              }
                            </p>

                            <p className="mt-1 font-extrabold text-slate-900">
                              {profesional.completed_jobs ??
                                0}
                            </p>
                          </div>

                          <div className="rounded-xl bg-slate-50 p-3 text-center">
                            <p className="text-xs text-slate-500">
                              {
                                text.experiencia
                              }
                            </p>

                            <p className="mt-1 font-extrabold text-slate-900">
                              {profesional.years_experience ??
                                0}{" "}
                              {
                                text.anos
                              }
                            </p>
                          </div>
                        </div>

                        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <button
                            type="button"
                            onClick={() =>
                              router.push(
                                `/profesionales/${profesional.user_id}?returnTo=${encodeURIComponent(
                                  professionalsReturnPath
                                )}`
                              )
                            }
                            className="rounded-xl border-2 border-blue-700 px-5 py-3 font-extrabold text-blue-700 hover:bg-blue-50"
                          >
                            {
                              text.verPerfil
                            }
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
                            {
                              text.solicitarTrabajo
                            }
                          </button>
                        </div>
                      </div>
                    </article>
                  )
                )}
              </div>
            )}
          </>
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
