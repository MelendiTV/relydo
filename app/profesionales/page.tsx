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
  const key = normalizarTrade(trade);

  const oficiosEs: Record<string, string> = {
    plumbing: "Plomería",
    electrical: "Electricidad",
    painting: "Pintura",
    landscaping: "Jardinería",
    cleaning: "Limpieza",
    hvac: "A/C y HVAC",
    "ac-rental": "Renta de A/C",
    carpentry: "Carpintería",
    moving: "Mudanzas",
    "appliance-repair": "Reparación de electrodomésticos",
    handyman: "Handyman",
    locksmith: "Cerrajería",
    roofing: "Techado",
    flooring: "Pisos",
    tile: "Azulejos y losas",
    drywall: "Drywall",
    masonry: "Concreto y albañilería",
    "doors-windows": "Puertas y ventanas",
    "garage-doors": "Garajes",
    fencing: "Cercas",
    "pool-spa": "Piscinas y spas",
    "pest-control": "Control de plagas",
    "pressure-washing": "Lavado a presión",
    "carpet-cleaning": "Limpieza de alfombras",
    "junk-removal": "Retiro de basura",
    "furniture-assembly": "Montaje de muebles",
    "smart-home": "TV y hogar inteligente",
  };

  const oficiosEn: Record<string, string> = {
    plumbing: "Plumbing",
    electrical: "Electrical",
    painting: "Painting",
    landscaping: "Landscaping",
    cleaning: "Cleaning",
    hvac: "A/C & HVAC",
    "ac-rental": "A/C Rental",
    carpentry: "Carpentry",
    moving: "Moving",
    "appliance-repair": "Appliance repair",
    handyman: "Handyman",
    locksmith: "Locksmith",
    roofing: "Roofing",
    flooring: "Flooring",
    tile: "Tile",
    drywall: "Drywall",
    masonry: "Concrete & masonry",
    "doors-windows": "Doors & windows",
    "garage-doors": "Garage doors",
    fencing: "Fencing",
    "pool-spa": "Pools & spas",
    "pest-control": "Pest control",
    "pressure-washing": "Pressure washing",
    "carpet-cleaning": "Carpet cleaning",
    "junk-removal": "Junk removal",
    "furniture-assembly": "Furniture assembly",
    "smart-home": "TV & smart home",
  };

  if (!trade) {
    return language === "es" ? "Profesional" : "Professional";
  }

  const oficios = language === "es" ? oficiosEs : oficiosEn;
  return oficios[key] || trade;
}

const ESPECIALIDADES = [
  "plumbing",
  "electrical",
  "painting",
  "landscaping",
  "cleaning",
  "hvac",
  "ac_rental",
  "carpentry",
  "moving",
  "appliance_repair",
  "handyman",
  "locksmith",
  "roofing",
  "flooring",
  "tile",
  "drywall",
  "masonry",
  "doors_windows",
  "garage_doors",
  "fencing",
  "pool_spa",
  "pest_control",
  "pressure_washing",
  "carpet_cleaning",
  "junk_removal",
  "furniture_assembly",
  "smart_home",
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

      const candidatos =
        (data || []) as Profesional[];

      let enZona = candidatos;

      /*
        Conservamos la lógica real del punto #106:
        - Si existe ZIP del Cliente, calculamos la distancia entre ZIPs
          mediante /api/location/zip-distance.
        - Cada Pro solo aparece cuando la distancia está dentro de su
          service_radius_miles.
        - Si el cálculo falla, usamos un fallback conservador por
          ciudad + estado.
        - Para cuentas antiguas sin ZIP, usamos ciudad + estado.
      */
      if (customerZip) {
        try {
          const response = await fetch(
            "/api/location/zip-distance",
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body: JSON.stringify({
                customerZip,
                providerZips:
                  candidatos.map(
                    (profesional) => ({
                      id:
                        profesional.user_id,
                      zip:
                        profesional.zip_code,
                    })
                  ),
              }),
            }
          );

          if (!response.ok) {
            throw new Error(
              "No se pudo calcular el radio de servicio."
            );
          }

          const result =
            await response.json();

          const distancias = new Map<
            string,
            number | null
          >(
            Object.entries(
              result?.distances || {}
            ) as [
              string,
              number | null
            ][]
          );

          enZona =
            candidatos.filter(
              (profesional) => {
                const distancia =
                  distancias.get(
                    profesional.user_id
                  );

                const radio =
                  Number(
                    profesional.service_radius_miles ??
                      0
                  );

                if (
                  distancia === null ||
                  distancia === undefined ||
                  !Number.isFinite(
                    radio
                  ) ||
                  radio <= 0
                ) {
                  return false;
                }

                return (
                  distancia <= radio
                );
              }
            );
        } catch (distanceError) {
          console.error(
            "Error calculando radio de servicio:",
            distanceError
          );

          enZona =
            candidatos.filter(
              (profesional) =>
                ciudadCliente &&
                estadoCliente &&
                normalizar(
                  profesional.city
                ) === ciudadCliente &&
                normalizar(
                  profesional.state
                ) === estadoCliente
            );
        }
      } else if (
        ciudadCliente &&
        estadoCliente
      ) {
        enZona =
          candidatos.filter(
            (profesional) =>
              normalizar(
                profesional.city
              ) === ciudadCliente &&
              normalizar(
                profesional.state
              ) === estadoCliente
          );
      }

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
      const key = normalizarTrade(profesional.trade);
      if (!key) return;
      conteo.set(key, (conteo.get(key) || 0) + 1);
    });

    return ESPECIALIDADES.map((trade) => {
      const key = normalizarTrade(trade);

      return {
        trade,
        key,
        count: conteo.get(key) || 0,
        nombre: nombreOficio(trade, language),
      };
    });
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
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {categorias.map((categoria, index) => {
                  const tonos = [
                    "border-sky-200 bg-sky-50 text-sky-900 hover:bg-sky-100",
                    "border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100",
                    "border-violet-200 bg-violet-50 text-violet-900 hover:bg-violet-100",
                    "border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100",
                    "border-rose-200 bg-rose-50 text-rose-900 hover:bg-rose-100",
                    "border-cyan-200 bg-cyan-50 text-cyan-900 hover:bg-cyan-100",
                  ];
                  const activo =
                    normalizarTrade(tradeSeleccionado) === categoria.key;

                  return (
                    <button
                      key={categoria.trade}
                      type="button"
                      onClick={() => seleccionarTrade(categoria.trade)}
                      title={categoria.nombre}
                      className={`flex min-h-[64px] min-w-0 items-center gap-3 overflow-hidden rounded-xl border px-4 py-3 text-sm font-extrabold leading-tight shadow-sm transition ${
                        activo
                          ? "border-blue-700 bg-blue-700 text-white shadow-sm"
                          : tonos[index % tonos.length]
                      }`}
                    >
                      <span className="min-w-0 flex-1 break-words text-left [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">
                        {categoria.nombre}
                      </span>
                      <span className="flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full bg-black/10 px-2 text-xs font-black">
                        {categoria.count}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => seleccionarTrade("")}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-extrabold transition ${
                    !tradeSeleccionado
                      ? "border-blue-700 bg-blue-700 text-white"
                      : "border-blue-200 bg-blue-50 text-blue-800 hover:border-blue-400 hover:bg-blue-100"
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
