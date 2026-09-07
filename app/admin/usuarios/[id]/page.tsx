"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "@/app/lib/supabaseBrowser";
import {
  useParams,
  useRouter,
} from "next/navigation";
import {
  hasAdminPermission,
  isAdminRole,
} from "@/app/lib/adminPermissions";

type AnyRow =
  Record<string, any>;

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

type ProviderProfile = {
  user_id: string;
  business_name?: string | null;
  bio?: string | null;
  trade?: string | null;
  years_experience?: number | null;
  service_radius_miles?: number | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  license_required?: boolean | null;
  license_number?: string | null;
  license_state?: string | null;
  license_expiration?: string | null;
  insured?: boolean | null;
  insurance_company?: string | null;
  insurance_expiration?: string | null;
  bonded?: boolean | null;
  verification_status?: string | null;
  verified?: boolean | null;
  active?: boolean | null;
  average_rating?: number | null;
  completed_jobs?: number | null;
  created_at?: string | null;
};

function fecha(
  value: any
) {
  if (!value) return "—";

  try {
    return new Intl.DateTimeFormat(
      "es-US",
      {
        dateStyle: "medium",
        timeStyle: "short",
      }
    ).format(new Date(value));
  } catch {
    return String(value);
  }
}

function dinero(
  value: any
) {
  const n = Number(value);

  if (!Number.isFinite(n)) {
    return "—";
  }

  return new Intl.NumberFormat(
    "en-US",
    {
      style: "currency",
      currency: "USD",
    }
  ).format(n);
}

function textoEstado(
  value: any
) {
  if (value === null || value === undefined) {
    return "—";
  }

  return String(value)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (x) =>
      x.toUpperCase()
    );
}

function nombreOficio(
  trade: string | null | undefined
) {
  const nombres:
    Record<string, string> = {
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

  return trade
    ? nombres[trade] || trade
    : "No indicado";
}

export default function
AdminUsuarioDetallePage() {
  const router = useRouter();
  const params = useParams();

  const userId =
    String(params?.id || "");

  const [
    profile,
    setProfile,
  ] =
    useState<Profile | null>(
      null
    );

  const [
    provider,
    setProvider,
  ] =
    useState<
      ProviderProfile | null
    >(null);

  const [
    requests,
    setRequests,
  ] =
    useState<AnyRow[]>([]);

  const [
    offers,
    setOffers,
  ] =
    useState<AnyRow[]>([]);

  const [
    payments,
    setPayments,
  ] =
    useState<AnyRow[]>([]);

  const [
    claims,
    setClaims,
  ] =
    useState<AnyRow[]>([]);

  const [
    reviews,
    setReviews,
  ] =
    useState<AnyRow[]>([]);

  const [
    documents,
    setDocuments,
  ] =
    useState<AnyRow[]>([]);

  const [
    notifications,
    setNotifications,
  ] =
    useState<AnyRow[]>([]);

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    error,
    setError,
  ] =
    useState("");

  useEffect(() => {
    cargar();
  }, [userId]);

  async function
  cargar() {
    if (!userId) {
      setError(
        "No encontramos el ID del usuario."
      );
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const {
        data: { user },
        error: authError,
      } =
        await supabase.auth.getUser();

      if (
        authError ||
        !user
      ) {
        router.replace(
          "/login-profesional"
        );
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
        !isAdminRole(
          adminProfile.admin_role
        ) ||
        !hasAdminPermission(
          adminProfile.admin_role,
          "users"
        )
      ) {
        router.replace("/admin");
        return;
      }

      const profileResp =
        await supabase
          .from("profiles")
          .select("*")
          .eq("id", userId)
          .maybeSingle();

      if (
        profileResp.error ||
        !profileResp.data
      ) {
        throw new Error(
          profileResp.error?.message ||
            "No encontramos este usuario."
        );
      }

      const base =
        profileResp.data as Profile;

      setProfile(base);

      const esProvider =
        base.role === "provider";

      const [
        providerResp,
        customerRequestsResp,
        providerRequestsResp,
        offersResp,
        paymentsResp,
        claimsOpenedResp,
        claimsAgainstResp,
        reviewsWrittenResp,
        reviewsReceivedResp,
        docsResp,
        notificationsResp,
      ] = await Promise.all([
        esProvider
          ? supabase
              .from(
                "provider_profiles"
              )
              .select("*")
              .eq(
                "user_id",
                userId
              )
              .maybeSingle()
          : Promise.resolve({
              data: null,
              error: null,
            }),

        supabase
          .from(
            "service_requests"
          )
          .select("*")
          .eq(
            "customer_id",
            userId
          )
          .order(
            "created_at",
            {
              ascending: false,
            }
          )
          .limit(1000),

        esProvider
          ? supabase
              .from(
                "service_requests"
              )
              .select("*")
              .eq(
                "preferred_provider_id",
                userId
              )
              .order(
                "created_at",
                {
                  ascending: false,
                }
              )
              .limit(1000)
          : Promise.resolve({
              data: [],
              error: null,
            }),

        esProvider
          ? supabase
              .from("offers")
              .select("*")
              .eq(
                "professional_id",
                userId
              )
              .order(
                "created_at",
                {
                  ascending: false,
                }
              )
              .limit(1000)
          : Promise.resolve({
              data: [],
              error: null,
            }),

        esProvider
          ? supabase
              .from("payments")
              .select("*")
              .eq(
                "provider_id",
                userId
              )
              .order(
                "created_at",
                {
                  ascending: false,
                }
              )
              .limit(1000)
          : Promise.resolve({
              data: [],
              error: null,
            }),

        supabase
          .from("job_claims")
          .select("*")
          .eq(
            "opened_by",
            userId
          )
          .order(
            "created_at",
            {
              ascending: false,
            }
          )
          .limit(1000),

        esProvider
          ? supabase
              .from(
                "job_claims"
              )
              .select("*")
              .eq(
                "provider_id",
                userId
              )
              .order(
                "created_at",
                {
                  ascending: false,
                }
              )
              .limit(1000)
          : Promise.resolve({
              data: [],
              error: null,
            }),

        supabase
          .from("reviews")
          .select("*")
          .eq(
            "reviewer_id",
            userId
          )
          .order(
            "created_at",
            {
              ascending: false,
            }
          )
          .limit(1000),

        supabase
          .from("reviews")
          .select("*")
          .eq(
            "reviewee_id",
            userId
          )
          .order(
            "created_at",
            {
              ascending: false,
            }
          )
          .limit(1000),

        esProvider
          ? supabase
              .from(
                "provider_documents"
              )
              .select("*")
              .eq(
                "user_id",
                userId
              )
              .order(
                "created_at",
                {
                  ascending: false,
                }
              )
              .limit(1000)
          : Promise.resolve({
              data: [],
              error: null,
            }),

        supabase
          .from(
            "notifications"
          )
          .select("*")
          .eq(
            "user_id",
            userId
          )
          .order(
            "created_at",
            {
              ascending: false,
            }
          )
          .limit(200),
      ]);

      if (
        providerResp.error
      ) {
        console.error(
          "provider_profiles:",
          providerResp.error
        );
      }

      setProvider(
        (providerResp.data ||
          null) as
          ProviderProfile | null
      );

      const solicitudes = [
        ...(customerRequestsResp.data ||
          []),
        ...(providerRequestsResp.data ||
          []),
      ];

      const uniqueRequests =
        Array.from(
          new Map(
            solicitudes.map(
              (x: AnyRow) => [
                x.id,
                x,
              ]
            )
          ).values()
        );

      setRequests(
        uniqueRequests
      );

      setOffers(
        (offersResp.data ||
          []) as AnyRow[]
      );

      setPayments(
        (paymentsResp.data ||
          []) as AnyRow[]
      );

      const todosClaims = [
        ...(claimsOpenedResp.data ||
          []),
        ...(claimsAgainstResp.data ||
          []),
      ];

      setClaims(
        Array.from(
          new Map(
            todosClaims.map(
              (x: AnyRow) => [
                x.id,
                x,
              ]
            )
          ).values()
        )
      );

      setReviews([
        ...(
          reviewsWrittenResp.data ||
          []
        ).map(
          (x: AnyRow) => ({
            ...x,
            relacion:
              "Escrita por el usuario",
          })
        ),
        ...(
          reviewsReceivedResp.data ||
          []
        ).map(
          (x: AnyRow) => ({
            ...x,
            relacion:
              "Recibida por el usuario",
          })
        ),
      ]);

      setDocuments(
        (docsResp.data ||
          []) as AnyRow[]
      );

      setNotifications(
        (notificationsResp.data ||
          []) as AnyRow[]
      );

      const erroresSecundarios = [
        customerRequestsResp.error,
        providerRequestsResp.error,
        offersResp.error,
        paymentsResp.error,
        claimsOpenedResp.error,
        claimsAgainstResp.error,
        reviewsWrittenResp.error,
        reviewsReceivedResp.error,
        docsResp.error,
        notificationsResp.error,
      ].filter(Boolean);

      if (
        erroresSecundarios.length >
        0
      ) {
        console.warn(
          "Algunas secciones no pudieron cargarse:",
          erroresSecundarios
        );
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No pudimos cargar el expediente del usuario."
      );
    } finally {
      setLoading(false);
    }
  }

  const reviewsRecibidas =
    useMemo(
      () =>
        reviews.filter(
          (r) =>
            r.reviewee_id ===
            userId
        ),
      [reviews, userId]
    );

  const promedioRating =
    useMemo(() => {
      if (
        reviewsRecibidas.length ===
        0
      ) {
        return null;
      }

      const ratings =
        reviewsRecibidas
          .map((r) =>
            Number(r.rating)
          )
          .filter(
            Number.isFinite
          );

      if (!ratings.length) {
        return null;
      }

      return (
        ratings.reduce(
          (a, b) => a + b,
          0
        ) / ratings.length
      );
    }, [reviewsRecibidas]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <div className="rounded-2xl bg-white px-8 py-7 font-black text-slate-700 shadow">
          Cargando expediente...
        </div>
      </main>
    );
  }

  if (
    error ||
    !profile
  ) {
    return (
      <main className="min-h-screen bg-slate-100 px-4 py-10">
        <div className="mx-auto max-w-4xl">
          <button
            type="button"
            onClick={() =>
              router.push(
                "/admin/usuarios"
              )
            }
            className="font-black text-blue-700 hover:underline"
          >
            ← Volver a usuarios
          </button>

          <div className="mt-6 rounded-3xl border border-red-200 bg-red-50 p-7 font-bold text-red-800">
            {error ||
              "Usuario no encontrado."}
          </div>
        </div>
      </main>
    );
  }

  const esProvider =
    profile.role ===
    "provider";

  const completados =
    requests.filter(
      (r) =>
        r.status ===
        "completed"
    ).length;

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 md:py-10">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() =>
              router.push(
                "/admin/usuarios"
              )
            }
            className="font-black text-blue-700 hover:underline"
          >
            ← Gestión de usuarios
          </button>

          <button
            type="button"
            onClick={cargar}
            className="rounded-xl border-2 border-cyan-700 bg-white px-4 py-2.5 font-black text-cyan-700 hover:bg-cyan-50"
          >
            ↻ Actualizar expediente
          </button>
        </div>

        <section className="overflow-hidden rounded-[32px] bg-slate-950 text-white shadow-xl">
          <div className="p-7 md:p-9">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.18em] text-cyan-300">
                  👤 Expediente RELYDO
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <h1 className="text-3xl font-black md:text-5xl">
                    {profile.full_name ||
                      provider?.business_name ||
                      "Usuario RELYDO"}
                  </h1>

                  <span className={`rounded-full px-3 py-1 text-xs font-black ${
                    esProvider
                      ? "bg-purple-200 text-purple-950"
                      : "bg-blue-200 text-blue-950"
                  }`}>
                    {esProvider
                      ? "Profesional"
                      : "Cliente"}
                  </span>
                </div>

                {provider?.business_name && (
                  <p className="mt-3 text-lg font-bold text-slate-300">
                    {provider.business_name}
                    {" · "}
                    {nombreOficio(
                      provider.trade
                    )}
                  </p>
                )}

                <p className="mt-4 break-all text-sm text-slate-400">
                  ID: {profile.id}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {profile.phone && (
                  <>
                    <a
                      href={`tel:${profile.phone}`}
                      className="rounded-xl bg-green-600 px-4 py-2.5 font-black text-white"
                    >
                      📞 Llamar
                    </a>

                    <a
                      href={`sms:${profile.phone}`}
                      className="rounded-xl bg-blue-600 px-4 py-2.5 font-black text-white"
                    >
                      💬 Mensaje
                    </a>
                  </>
                )}

                {profile.email && (
                  <a
                    href={`mailto:${profile.email}`}
                    className="rounded-xl bg-white px-4 py-2.5 font-black text-slate-950"
                  >
                    ✉️ Email
                  </a>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
          <Metrica
            titulo="Trabajos"
            valor={requests.length}
          />
          <Metrica
            titulo="Completados"
            valor={completados}
          />
          <Metrica
            titulo="Reclamos"
            valor={claims.length}
          />
          <Metrica
            titulo="Reseñas"
            valor={reviews.length}
          />
          <Metrica
            titulo="Pagos"
            valor={payments.length}
          />
          <Metrica
            titulo="Ofertas"
            valor={offers.length}
          />
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-2">
          <Bloque
            titulo="Información de la cuenta"
            subtitulo="Datos principales registrados en RELYDO."
          >
            <DatosGrid
              items={[
                [
                  "Nombre",
                  profile.full_name ||
                    "No registrado",
                ],
                [
                  "Email",
                  profile.email ||
                    "No registrado",
                ],
                [
                  "Teléfono",
                  profile.phone ||
                    "No registrado",
                ],
                [
                  "Rol",
                  esProvider
                    ? "Profesional"
                    : "Cliente",
                ],
                [
                  "Ciudad",
                  profile.city ||
                    "No registrada",
                ],
                [
                  "Estado",
                  profile.state ||
                    "No registrado",
                ],
                [
                  "ZIP",
                  profile.zip_code ||
                    "No registrado",
                ],
              ]}
            />
          </Bloque>

          {esProvider && (
            <Bloque
              titulo="Perfil profesional"
              subtitulo="Estado, oficio y datos operativos."
            >
              <DatosGrid
                items={[
                  [
                    "Negocio",
                    provider?.business_name ||
                      "No registrado",
                  ],
                  [
                    "Oficio",
                    nombreOficio(
                      provider?.trade
                    ),
                  ],
                  [
                    "Estado de verificación",
                    textoEstado(
                      provider?.verification_status
                    ),
                  ],
                  [
                    "Verificado",
                    provider?.verified
                      ? "Sí"
                      : "No",
                  ],
                  [
                    "Cuenta activa",
                    provider?.active
                      ? "Sí"
                      : "No",
                  ],
                  [
                    "Experiencia",
                    `${
                      provider?.years_experience ??
                      0
                    } años`,
                  ],
                  [
                    "Radio",
                    `${
                      provider?.service_radius_miles ??
                      0
                    } millas`,
                  ],
                  [
                    "Rating",
                    promedioRating !==
                    null
                      ? `⭐ ${promedioRating.toFixed(
                          1
                        )}`
                      : `⭐ ${
                          Number(
                            provider?.average_rating ||
                              0
                          ).toFixed(
                            1
                          )
                        }`,
                  ],
                ]}
              />

              {provider?.bio && (
                <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-700">
                  {provider.bio}
                </div>
              )}
            </Bloque>
          )}
        </section>

        {esProvider && (
          <section className="mt-6 grid gap-6 lg:grid-cols-2">
            <Bloque
              titulo="Licencia, seguro y bond"
              subtitulo="Información declarada por el profesional."
            >
              <DatosGrid
                items={[
                  [
                    "Licencia requerida",
                    provider?.license_required
                      ? "Sí"
                      : "No",
                  ],
                  [
                    "Número licencia",
                    provider?.license_number ||
                      "—",
                  ],
                  [
                    "Estado licencia",
                    provider?.license_state ||
                      "—",
                  ],
                  [
                    "Vence licencia",
                    provider?.license_expiration
                      ? fecha(
                          provider.license_expiration
                        )
                      : "—",
                  ],
                  [
                    "Seguro",
                    provider?.insured
                      ? "Sí"
                      : "No",
                  ],
                  [
                    "Aseguradora",
                    provider?.insurance_company ||
                      "—",
                  ],
                  [
                    "Vence seguro",
                    provider?.insurance_expiration
                      ? fecha(
                          provider.insurance_expiration
                        )
                      : "—",
                  ],
                  [
                    "Bond / Fianza",
                    provider?.bonded
                      ? "Sí"
                      : "No",
                  ],
                ]}
              />
            </Bloque>

            <Bloque
              titulo={`Documentos (${documents.length})`}
              subtitulo="Documentación de verificación cargada."
            >
              <ListaGenerica
                rows={documents}
                empty="No hay documentos registrados."
                renderer={(row) => (
                  <>
                    <p className="font-black text-slate-900">
                      {row.document_type ||
                        row.type ||
                        row.name ||
                        "Documento"}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      Estado:{" "}
                      {textoEstado(
                        row.status ||
                          row.verification_status
                      )}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {fecha(
                        row.created_at
                      )}
                    </p>
                  </>
                )}
              />
            </Bloque>
          </section>
        )}

        <section className="mt-6">
          <Bloque
            titulo={`Trabajos y órdenes (${requests.length})`}
            subtitulo="Historial de solicitudes relacionadas con este usuario."
          >
            <ListaGenerica
              rows={requests}
              empty="No hay trabajos registrados."
              renderer={(row) => (
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-black text-slate-950">
                      {row.title ||
                        row.customer_name ||
                        "Trabajo RELYDO"}
                    </p>

                    <p className="mt-1 text-sm text-slate-600">
                      Estado:{" "}
                      <b>
                        {textoEstado(
                          row.status
                        )}
                      </b>
                    </p>

                    <p className="mt-1 text-xs text-slate-400">
                      {fecha(
                        row.created_at
                      )}
                    </p>
                  </div>

                  {row.id && (
                    <button
                      type="button"
                      onClick={() =>
                        router.push(
                          `/admin/ordenes/${row.id}`
                        )
                      }
                      className="w-fit rounded-xl border-2 border-blue-700 bg-white px-4 py-2 font-black text-blue-700 hover:bg-blue-50"
                    >
                      Ver orden →
                    </button>
                  )}
                </div>
              )}
            />
          </Bloque>
        </section>

        {esProvider && (
          <section className="mt-6 grid gap-6 lg:grid-cols-2">
            <Bloque
              titulo={`Ofertas (${offers.length})`}
              subtitulo="Presupuestos enviados por el profesional."
            >
              <ListaGenerica
                rows={offers}
                empty="No hay ofertas registradas."
                renderer={(row) => (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-black text-slate-950">
                        {dinero(
                          row.price
                        )}
                      </p>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">
                        {textoEstado(
                          row.status
                        )}
                      </span>
                    </div>
                    {row.message && (
                      <p className="mt-2 text-sm text-slate-600">
                        {row.message}
                      </p>
                    )}
                    <p className="mt-2 text-xs text-slate-400">
                      {fecha(
                        row.created_at
                      )}
                    </p>
                  </>
                )}
              />
            </Bloque>

            <Bloque
              titulo={`Pagos (${payments.length})`}
              subtitulo="Historial financiero asociado al profesional."
            >
              <ListaGenerica
                rows={payments}
                empty="No hay pagos registrados."
                renderer={(row) => (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-black text-slate-950">
                        {dinero(
                          row.job_amount
                        )}
                      </p>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">
                        {textoEstado(
                          row.status
                        )}
                      </span>
                    </div>

                    <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-slate-600">
                      <p>
                        Neto Pro:{" "}
                        <b>
                          {dinero(
                            row.provider_net_amount
                          )}
                        </b>
                      </p>
                      <p>
                        Comisión:{" "}
                        <b>
                          {dinero(
                            row.provider_commission_amount
                          )}
                        </b>
                      </p>
                    </div>

                    <p className="mt-2 text-xs text-slate-400">
                      {fecha(
                        row.paid_at ||
                          row.created_at
                      )}
                    </p>
                  </>
                )}
              />
            </Bloque>
          </section>
        )}

        <section className="mt-6 grid gap-6 lg:grid-cols-2">
          <Bloque
            titulo={`Reclamos (${claims.length})`}
            subtitulo="Disputas abiertas o históricas relacionadas."
          >
            <ListaGenerica
              rows={claims}
              empty="No hay reclamos relacionados."
              renderer={(row) => (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-black text-slate-950">
                      {row.reason ||
                        row.title ||
                        "Reclamo"}
                    </p>
                    <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-black text-red-700">
                      {textoEstado(
                        row.status
                      )}
                    </span>
                  </div>

                  {(row.description ||
                    row.details) && (
                    <p className="mt-2 text-sm text-slate-600">
                      {row.description ||
                        row.details}
                    </p>
                  )}

                  <p className="mt-2 text-xs text-slate-400">
                    {fecha(
                      row.created_at
                    )}
                  </p>
                </>
              )}
            />
          </Bloque>

          <Bloque
            titulo={`Reseñas (${reviews.length})`}
            subtitulo="Reseñas escritas y recibidas."
          >
            <ListaGenerica
              rows={reviews}
              empty="No hay reseñas registradas."
              renderer={(row) => (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-black text-slate-950">
                      ⭐{" "}
                      {Number(
                        row.rating ||
                          0
                      ).toFixed(1)}
                    </p>

                    <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-800">
                      {row.relacion}
                    </span>
                  </div>

                  <p className="mt-2 text-sm text-slate-600">
                    {row.comment ||
                      "Sin comentario escrito."}
                  </p>

                  <p className="mt-2 text-xs text-slate-400">
                    Trabajo:{" "}
                    {row.job_id ||
                      "—"}
                    {" · "}
                    {fecha(
                      row.created_at
                    )}
                  </p>
                </>
              )}
            />
          </Bloque>
        </section>

        <section className="mt-6">
          <Bloque
            titulo={`Actividad y notificaciones (${notifications.length})`}
            subtitulo="Actividad reciente disponible para esta cuenta."
          >
            <ListaGenerica
              rows={notifications}
              empty="No hay notificaciones registradas."
              renderer={(row) => (
                <>
                  <p className="font-black text-slate-950">
                    {row.title ||
                      row.type ||
                      "Notificación"}
                  </p>

                  <p className="mt-1 text-sm text-slate-600">
                    {row.message ||
                      row.body ||
                      row.text ||
                      "Sin detalle."}
                  </p>

                  <p className="mt-2 text-xs text-slate-400">
                    {fecha(
                      row.created_at
                    )}
                  </p>
                </>
              )}
            />
          </Bloque>
        </section>
      </div>
    </main>
  );
}

function Metrica({
  titulo,
  valor,
}: {
  titulo: string;
  valor: number;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-black uppercase tracking-wide text-slate-500">
        {titulo}
      </p>
      <p className="mt-1 text-2xl font-black text-slate-950">
        {valor}
      </p>
    </div>
  );
}

function Bloque({
  titulo,
  subtitulo,
  children,
}: {
  titulo: string;
  subtitulo?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-black text-slate-950">
        {titulo}
      </h2>

      {subtitulo && (
        <p className="mt-1 text-sm text-slate-500">
          {subtitulo}
        </p>
      )}

      <div className="mt-5">
        {children}
      </div>
    </div>
  );
}

function DatosGrid({
  items,
}: {
  items: Array<
    [string, React.ReactNode]
  >;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map(
        ([label, value]) => (
          <div
            key={label}
            className="rounded-2xl bg-slate-50 p-4"
          >
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">
              {label}
            </p>
            <div className="mt-1 break-words font-bold text-slate-900">
              {value}
            </div>
          </div>
        )
      )}
    </div>
  );
}

function ListaGenerica({
  rows,
  empty,
  renderer,
}: {
  rows: AnyRow[];
  empty: string;
  renderer: (
    row: AnyRow
  ) => React.ReactNode;
}) {
  if (!rows.length) {
    return (
      <div className="rounded-2xl bg-slate-50 p-5 text-sm font-bold text-slate-500">
        {empty}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map(
        (row, index) => (
          <article
            key={
              row.id ||
              `${row.created_at}-${index}`
            }
            className="rounded-2xl border border-slate-200 bg-white p-4"
          >
            {renderer(row)}
          </article>
        )
      )}
    </div>
  );
}
