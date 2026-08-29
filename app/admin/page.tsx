"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  createClient,
} from "@supabase/supabase-js";

import {
  useRouter,
} from "next/navigation";

import {
  useLanguage,
} from "@/app/components/LanguageProvider";

import {
  AdminRole,
  adminRoleLabel,
  hasAdminPermission,
  isAdminRole,
} from "@/app/lib/adminPermissions";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

type AdminMetrics = {
  totalUsuarios: number;
  totalProfesionales: number;
  profesionalesPendientes: number;
  profesionalesAprobados: number;
  profesionalesSuspendidos: number;
  totalOrdenes: number;
  ordenesAbiertas: number;
  ordenesActivas: number;
  ordenesCompletadas: number;
  reclamosAbiertos: number;
  reclamosRevision: number;
  totalReclamosActivos: number;
};

type CardProps = {
  titulo: string;
  descripcion: string;
  icono: string;
  valor?: string | number;
  etiqueta?: string;
  color:
    | "blue"
    | "red"
    | "emerald"
    | "violet"
    | "cyan"
    | "purple"
    | "amber"
    | "indigo";
  onClick: () => void;
};

const estilos = {
  blue: {
    border: "border-blue-200 hover:border-blue-400",
    icon: "bg-blue-100",
    action: "text-blue-700",
    pill: "bg-blue-50 text-blue-800",
  },
  red: {
    border: "border-red-200 hover:border-red-400",
    icon: "bg-red-100",
    action: "text-red-700",
    pill: "bg-red-50 text-red-800",
  },
  emerald: {
    border: "border-emerald-200 hover:border-emerald-400",
    icon: "bg-emerald-100",
    action: "text-emerald-700",
    pill: "bg-emerald-50 text-emerald-800",
  },
  violet: {
    border: "border-violet-200 hover:border-violet-400",
    icon: "bg-violet-100",
    action: "text-violet-700",
    pill: "bg-violet-50 text-violet-800",
  },
  cyan: {
    border: "border-cyan-200 hover:border-cyan-400",
    icon: "bg-cyan-100",
    action: "text-cyan-700",
    pill: "bg-cyan-50 text-cyan-800",
  },
  purple: {
    border: "border-purple-200 hover:border-purple-400",
    icon: "bg-purple-100",
    action: "text-purple-700",
    pill: "bg-purple-50 text-purple-800",
  },
  amber: {
    border: "border-amber-200 hover:border-amber-400",
    icon: "bg-amber-100",
    action: "text-amber-700",
    pill: "bg-amber-50 text-amber-800",
  },
  indigo: {
    border: "border-indigo-200 hover:border-indigo-400",
    icon: "bg-indigo-100",
    action: "text-indigo-700",
    pill: "bg-indigo-50 text-indigo-800",
  },
};

function AdminCard({
  titulo,
  descripcion,
  icono,
  valor,
  etiqueta,
  color,
  onClick,
}: CardProps) {
  const style = estilos[color];

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group rounded-3xl border bg-white p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg ${style.border}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-2xl text-2xl ${style.icon}`}
        >
          {icono}
        </div>

        <span
          className={`text-xl font-black transition group-hover:translate-x-1 ${style.action}`}
        >
          →
        </span>
      </div>

      <h3 className="mt-5 text-xl font-black text-slate-950">
        {titulo}
      </h3>

      <p className="mt-2 min-h-[72px] text-sm leading-6 text-slate-600">
        {descripcion}
      </p>

      {(valor !== undefined || etiqueta) && (
        <div
          className={`mt-5 inline-flex rounded-xl px-3 py-2 text-sm font-black ${style.pill}`}
        >
          {valor !== undefined ? valor : etiqueta}
        </div>
      )}
    </button>
  );
}

export default function AdminHomePage() {
  const router =
    useRouter();

  const { language } =
    useLanguage();

  const T = (
    es: string,
    en: string
  ) =>
    language === "es"
      ? es
      : en;

  const [
    verificandoAdmin,
    setVerificandoAdmin,
  ] = useState(true);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    adminEmail,
    setAdminEmail,
  ] = useState("");

  const [
    adminRole,
    setAdminRole,
  ] =
    useState<AdminRole>(
      "super_admin"
    );

  const [
    error,
    setError,
  ] = useState("");

  const [
    metrics,
    setMetrics,
  ] = useState<AdminMetrics>({
    totalUsuarios: 0,
    totalProfesionales: 0,
    profesionalesPendientes: 0,
    profesionalesAprobados: 0,
    profesionalesSuspendidos: 0,
    totalOrdenes: 0,
    ordenesAbiertas: 0,
    ordenesActivas: 0,
    ordenesCompletadas: 0,
    reclamosAbiertos: 0,
    reclamosRevision: 0,
    totalReclamosActivos: 0,
  });

  useEffect(() => {
    verificarAdmin();
  }, []);

  async function verificarAdmin() {
    setVerificandoAdmin(true);
    setError("");

    try {
      const {
        data: {
          user,
        },
        error:
          authError,
      } =
        await supabase.auth.getUser();

      if (
        authError ||
        !user
      ) {
        router.replace(
          "/login-admin"
        );

        return;
      }

      const {
        data:
          adminProfile,
        error:
          adminProfileError,
      } = await supabase
        .from("profiles")
        .select(`
          id,
          role,
          email,
          admin_role
        `)
        .eq(
          "id",
          user.id
        )
        .maybeSingle();

      if (
        adminProfileError ||
        !adminProfile ||
        adminProfile.role !==
          "admin" ||
        !isAdminRole(
          adminProfile.admin_role
        )
      ) {
        await supabase.auth.signOut();

        router.replace(
          "/login-admin"
        );

        return;
      }

      setAdminEmail(
        user.email ||
          adminProfile.email ||
          T("Administrador", "Administrator")
      );

      setAdminRole(
        adminProfile.admin_role
      );

      setVerificandoAdmin(false);

      await cargarResumen();
    } catch (err) {
      console.error(
        "Error verificando Admin:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : T("No pudimos verificar la sesión administrativa.", "We could not verify the administrative session.")
      );

      setVerificandoAdmin(false);
      setLoading(false);
    }
  }

  async function cargarResumen() {
    setLoading(true);
    setError("");

    try {
      const [
        usuariosResult,
        profesionalesResult,
        ordenesResult,
        reclamosResult,
      ] = await Promise.all([
        supabase
          .from("profiles")
          .select(
            "id, role",
            {
              count: "exact",
            }
          ),

        supabase
          .from(
            "provider_profiles"
          )
          .select(`
            user_id,
            verification_status,
            verified,
            active
          `),

        supabase
          .from(
            "service_requests"
          )
          .select(`
            id,
            status
          `)
          .limit(5000),

        supabase
          .from("job_claims")
          .select(`
            id,
            status
          `)
          .limit(2000),
      ]);

      if (
        usuariosResult.error
      ) {
        throw new Error(
          `${T("Usuarios", "Users")}: ${usuariosResult.error.message}`
        );
      }

      if (
        profesionalesResult.error
      ) {
        throw new Error(
          `${T("Profesionales", "Professionals")}: ${profesionalesResult.error.message}`
        );
      }

      if (
        ordenesResult.error
      ) {
        throw new Error(
          `${T("Órdenes", "Orders")}: ${ordenesResult.error.message}`
        );
      }

      if (
        reclamosResult.error
      ) {
        throw new Error(
          `${T("Reclamos", "Claims")}: ${reclamosResult.error.message}`
        );
      }

      const profesionales =
        profesionalesResult.data ||
        [];

      const ordenes =
        ordenesResult.data ||
        [];

      const reclamos =
        reclamosResult.data ||
        [];

      const profesionalesPendientes =
        profesionales.filter(
          (provider) =>
            provider.verification_status ===
            "pending"
        ).length;

      const profesionalesAprobados =
        profesionales.filter(
          (provider) =>
            provider.verified ===
              true &&
            provider.active ===
              true
        ).length;

      const profesionalesSuspendidos =
        profesionales.filter(
          (provider) =>
            provider.verified ===
              true &&
            provider.active !==
              true
        ).length;

      const ordenesAbiertas =
        ordenes.filter(
          (orden) =>
            orden.status ===
            "open"
        ).length;

      const ordenesActivas =
        ordenes.filter(
          (orden) =>
            orden.status ===
            "in_progress"
        ).length;

      const ordenesCompletadas =
        ordenes.filter(
          (orden) =>
            orden.status ===
            "completed"
        ).length;

      const reclamosAbiertos =
        reclamos.filter(
          (reclamo) =>
            reclamo.status ===
            "open"
        ).length;

      const reclamosRevision =
        reclamos.filter(
          (reclamo) =>
            reclamo.status ===
            "reviewing"
        ).length;

      setMetrics({
        totalUsuarios:
          usuariosResult.count ||
          usuariosResult.data
            ?.length ||
          0,

        totalProfesionales:
          profesionales.length,

        profesionalesPendientes,

        profesionalesAprobados,

        profesionalesSuspendidos,

        totalOrdenes:
          ordenes.length,

        ordenesAbiertas,

        ordenesActivas,

        ordenesCompletadas,

        reclamosAbiertos,

        reclamosRevision,

        totalReclamosActivos:
          reclamosAbiertos +
          reclamosRevision,
      });
    } catch (err) {
      console.error(
        "Error cargando resumen Admin:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : T("No pudimos cargar el resumen administrativo.", "We could not load the administrative summary.")
      );
    } finally {
      setLoading(false);
    }
  }

  async function cerrarSesion() {
    await supabase.auth.signOut();

    router.replace(
      "/login-admin"
    );

    router.refresh();
  }

  const alertasPendientes =
    useMemo(
      () =>
        metrics.totalReclamosActivos +
        metrics.profesionalesPendientes,
      [
        metrics.totalReclamosActivos,
        metrics.profesionalesPendientes,
      ]
    );

  const puede = (
    permission:
      | "admin_home"
      | "claims"
      | "orders"
      | "finance"
      | "financial_settings"
      | "users"
      | "providers"
      | "alerts"
      | "activity"
  ) =>
    hasAdminPermission(
      adminRole,
      permission
    );

  if (verificandoAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <div className="rounded-3xl border border-slate-200 bg-white px-8 py-10 text-center shadow-xl">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-2xl font-black text-white">
            R
          </div>

          <p className="font-bold text-slate-900">
            {T("Verificando sesión administrativa...", "Verifying administrative session...")}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100">
      <div className="mx-auto w-full max-w-[1500px] px-4 py-6 md:px-6 md:py-8">
        {/* HEADER */}

        <section className="overflow-hidden rounded-[32px] bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 text-white shadow-2xl">
          <div className="p-6 md:p-9">
            <div className="flex flex-col gap-7 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-blue-400/30 bg-blue-400/10 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-blue-200">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  RELYDO ADMIN
                </div>

                <h1 className="mt-5 text-3xl font-black tracking-tight md:text-5xl">
                  {T("Centro de administración", "Administration center")}
                </h1>

                <p className="mt-3 max-w-3xl text-base leading-7 text-slate-300 md:text-lg">
                  {T(
                    "Controla la operación de RELYDO desde un solo lugar: usuarios, profesionales, órdenes, reclamos, pagos, alertas y actividad.",
                    "Control RELYDO operations from one place: users, professionals, orders, claims, payments, alerts, and activity."
                  )}
                </p>
              </div>

              <div className="w-full rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm lg:w-[330px]">
                <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                  {T("Sesión administrativa", "Administrative session")}
                </p>

                <p className="mt-2 break-all font-bold text-white">
                  {adminEmail}
                </p>

                <div className="mt-3 inline-flex rounded-full border border-blue-300/20 bg-blue-400/10 px-3 py-1.5 text-xs font-black text-blue-100">
                  {adminRoleLabel(
                    adminRole,
                    language
                  )}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={cargarResumen}
                    disabled={loading}
                    className="rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-black text-white transition hover:bg-white/15 disabled:opacity-50"
                  >
                    {loading
                      ? T("Actualizando...", "Updating...")
                      : T("↻ Actualizar", "↻ Refresh")}
                  </button>

                  <button
                    type="button"
                    onClick={cerrarSesion}
                    className="rounded-xl bg-white px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-slate-100"
                  >
                    {T("Cerrar sesión", "Sign out")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {error && (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 font-semibold text-red-700">
            {error}
          </div>
        )}

        {/* RESUMEN */}

        <section className="mt-7">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-700">
              {T("Resumen", "Summary")}
            </p>

            <h2 className="mt-2 text-3xl font-black text-slate-950">
              {T("Estado de RELYDO", "RELYDO status")}
            </h2>

            <p className="mt-2 text-slate-600">
              {T(
                "Una vista rápida de lo que necesita atención y de la actividad general de la plataforma.",
                "A quick view of what needs attention and the platform's overall activity."
              )}
            </p>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
            {puede("users") && (
            <button type="button" onClick={() => router.push("/admin/usuarios")} className="rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-slate-400 hover:shadow-lg">
              <p className="text-sm font-bold text-slate-500">{T("Usuarios", "Users")}</p>
              <p className="mt-2 text-3xl font-black text-slate-950">{loading ? "—" : metrics.totalUsuarios}</p>
            </button>
            )}

            {puede("providers") && (
            <button type="button" onClick={() => router.push("/admin/operaciones")} className="rounded-2xl border border-purple-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-purple-400 hover:shadow-lg">
              <p className="text-sm font-bold text-slate-500">{T("Profesionales", "Professionals")}</p>
              <p className="mt-2 text-3xl font-black text-purple-700">{loading ? "—" : metrics.totalProfesionales}</p>
            </button>
            )}

            {puede("orders") && (
            <button type="button" onClick={() => router.push("/admin/ordenes")} className="rounded-2xl border border-blue-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-400 hover:shadow-lg">
              <p className="text-sm font-bold text-slate-500">{T("Órdenes", "Orders")}</p>
              <p className="mt-2 text-3xl font-black text-blue-700">{loading ? "—" : metrics.totalOrdenes}</p>
            </button>
            )}

            {puede("orders") && (
            <button type="button" onClick={() => router.push("/admin/ordenes?status=in_progress")} className="rounded-2xl border border-emerald-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-400 hover:shadow-lg">
              <p className="text-sm font-bold text-slate-500">{T("En curso", "In progress")}</p>
              <p className="mt-2 text-3xl font-black text-emerald-700">{loading ? "—" : metrics.ordenesActivas}</p>
            </button>
            )}

            {puede("claims") && (
            <button type="button" onClick={() => router.push("/admin/reclamos")} className="rounded-2xl border border-red-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-red-400 hover:shadow-lg">
              <p className="text-sm font-bold text-slate-500">{T("Reclamos activos", "Active claims")}</p>
              <p className="mt-2 text-3xl font-black text-red-700">{loading ? "—" : metrics.totalReclamosActivos}</p>
            </button>
            )}

            {puede("alerts") && (
            <button type="button" onClick={() => router.push("/admin/alertas")} className="rounded-2xl border border-amber-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-amber-400 hover:shadow-lg">
              <p className="text-sm font-bold text-slate-500">{T("Alertas", "Alerts")}</p>
              <p className="mt-2 text-3xl font-black text-amber-700">{loading ? "—" : alertasPendientes}</p>
            </button>
            )}
          </div>
        </section>

        {/* ACCESOS PRINCIPALES */}

        <section className="mt-8">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-700">
              {T("Administración", "Administration")}
            </p>

            <h2 className="mt-2 text-3xl font-black text-slate-950">
              {T("Herramientas de control", "Control tools")}
            </h2>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {puede("claims") && (
            <AdminCard
              titulo={T("Reclamos de trabajos", "Job claims")}
              descripcion={T("Revisa disputas abiertas, casos en revisión, evidencias y decisiones económicas.", "Review open disputes, cases under review, evidence, and financial decisions.")}
              icono="⚠️"
              valor={`${metrics.totalReclamosActivos} ${T(
                metrics.totalReclamosActivos === 1 ? "activo" : "activos",
                "active"
              )}`}
              color="red"
              onClick={() =>
                router.push(
                  "/admin/reclamos"
                )
              }
            />
            )}

            {puede("orders") && (
            <AdminCard
              titulo={T("Control de órdenes", "Order control")}
              descripcion={T("Consulta todas las solicitudes y trabajos de la plataforma y abre el expediente de cada orden.", "Review all platform requests and jobs and open each order record.")}
              icono="📋"
              valor={`${metrics.totalOrdenes} ${T("registradas", "registered")}`}
              color="blue"
              onClick={() =>
                router.push(
                  "/admin/ordenes"
                )
              }
            />
            )}

            {puede("finance") && (
            <AdminCard
              titulo={T("Finanzas y ganancias", "Finances and earnings")}
              descripcion={T("Controla ingresos de RELYDO, pagos a profesionales, retenciones, reembolsos y volumen procesado.", "Control RELYDO revenue, professional payouts, holds, refunds, and processed volume.")}
              icono="📊"
              etiqueta={T("Abrir panel financiero", "Open financial panel")}
              color="violet"
              onClick={() =>
                router.push(
                  "/admin/finanzas"
                )
              }
            />
            )}

            {puede("financial_settings") && (
            <AdminCard
              titulo={T("Configuración financiera", "Financial settings")}
              descripcion={T("Administra comisiones, tarifa al cliente, cancelaciones y porcentajes del profesional.", "Manage commissions, customer fees, cancellations, and professional percentages.")}
              icono="💰"
              etiqueta={T("Administrar configuración", "Manage settings")}
              color="emerald"
              onClick={() =>
                router.push(
                  "/admin/configuracion-financiera"
                )
              }
            />
            )}

            {puede("users") && (
            <AdminCard
              titulo={T("Gestión de usuarios", "User management")}
              descripcion={T("Consulta clientes y profesionales, información de contacto, roles y actividad dentro de RELYDO.", "Review customers and professionals, contact information, roles, and activity within RELYDO.")}
              icono="👥"
              valor={metrics.totalUsuarios}
              color="cyan"
              onClick={() =>
                router.push(
                  "/admin/usuarios"
                )
              }
            />
            )}

            {puede("providers") && (
            <AdminCard
              titulo={T("Gestión de profesionales", "Professional management")}
              descripcion={T("Administra la red profesional, verificaciones, documentos, suspensiones y expedientes.", "Manage the professional network, verifications, documents, suspensions, and records.")}
              icono="🧰"
              valor={`${metrics.totalProfesionales} ${T("total", "total")}`}
              color="purple"
              onClick={() =>
                router.push(
                  "/admin/operaciones"
                )
              }
            />
            )}

            {puede("alerts") && (
            <AdminCard
              titulo={T("Centro de alertas", "Alert center")}
              descripcion={T("Revisa reclamos activos, profesionales pendientes y situaciones que requieren atención.", "Review active claims, pending professionals, and situations requiring attention.")}
              icono="🔔"
              valor={`${alertasPendientes} ${T(
                alertasPendientes === 1 ? "pendiente" : "pendientes",
                "pending"
              )}`}
              color="amber"
              onClick={() =>
                router.push(
                  "/admin/alertas"
                )
              }
            />
            )}

            {puede("activity") && (
            <AdminCard
              titulo={T("Actividad de la plataforma", "Platform activity")}
              descripcion={T("Mide trabajos, profesionales, clientes y señales operativas relevantes de RELYDO.", "Track jobs, professionals, customers, and relevant RELYDO operational signals.")}
              icono="📈"
              etiqueta={T("Ver actividad", "View activity")}
              color="indigo"
              onClick={() =>
                router.push(
                  "/admin/actividad"
                )
              }
            />
            )}
          </div>
        </section>

        {/* ATENCIÓN */}

        <section className="mt-8 grid gap-5 lg:grid-cols-2">
          {puede("providers") && (
          <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-amber-700">
              {T("Requiere atención", "Requires attention")}
            </p>

            <h3 className="mt-2 text-2xl font-black text-slate-950">
              {T("Profesionales pendientes", "Pending professionals")}
            </h3>

            <p className="mt-2 text-slate-700">
              {T("Tienes", "You have")}{" "}
              <strong>{metrics.profesionalesPendientes}</strong>{" "}
              {T(
                metrics.profesionalesPendientes === 1 ? "profesional pendiente de revisión." : "profesionales pendientes de revisión.",
                metrics.profesionalesPendientes === 1 ? "professional pending review." : "professionals pending review."
              )}
            </p>

            <div className="mt-5 flex flex-wrap gap-3 text-sm font-bold">
              <span className="rounded-xl bg-white px-3 py-2 text-emerald-700">
                {T("Aprobados", "Approved")}: {metrics.profesionalesAprobados}
              </span>

              <span className="rounded-xl bg-white px-3 py-2 text-amber-700">
                {T("Pendientes", "Pending")}: {metrics.profesionalesPendientes}
              </span>

              <span className="rounded-xl bg-white px-3 py-2 text-red-700">
                {T("Suspendidos", "Suspended")}: {metrics.profesionalesSuspendidos}
              </span>
            </div>

            <button
              type="button"
              onClick={() =>
                router.push(
                  "/admin/operaciones"
                )
              }
              className="mt-6 rounded-xl bg-amber-600 px-5 py-3 font-black text-white transition hover:bg-amber-700"
            >
              {T("Revisar profesionales →", "Review professionals →")}
            </button>
          </div>
          )}

          {puede("claims") && (
          <div className="rounded-3xl border border-red-200 bg-red-50 p-6">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-red-700">
              {T("Protección", "Protection")}
            </p>

            <h3 className="mt-2 text-2xl font-black text-slate-950">
              {T("Reclamos que requieren decisión", "Claims requiring a decision")}
            </h3>

            <p className="mt-2 text-slate-700">
              {T("Hay", "There are")}{" "}
              <strong>{metrics.reclamosAbiertos}</strong>{" "}
              {T(
                metrics.reclamosAbiertos === 1 ? "abierto" : "abiertos",
                "open"
              )}{" "}
              {T("y", "and")}{" "}
              <strong>{metrics.reclamosRevision}</strong>{" "}
              {T("en revisión.", "under review.")}
            </p>

            <button
              type="button"
              onClick={() =>
                router.push(
                  "/admin/reclamos"
                )
              }
              className="mt-6 rounded-xl bg-red-600 px-5 py-3 font-black text-white transition hover:bg-red-700"
            >
              {T("Abrir reclamos →", "Open claims →")}
            </button>
          </div>
          )}
        </section>

        {/* OPERACIÓN */}

        {puede("orders") && (
        <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                {T("Operación", "Operations")}
              </p>

              <h3 className="mt-2 text-2xl font-black text-slate-950">
                {T("Estado de las órdenes", "Order status")}
              </h3>

              <p className="mt-2 text-slate-600">
                {T("Resumen", "Summary")} de solicitudes abiertas, trabajos activos y trabajos completados.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-2xl bg-blue-50 px-4 py-3 text-center">
                <p className="text-xs font-bold text-slate-500">
                  {T("Abiertas", "Open")}
                </p>
                <p className="mt-1 text-2xl font-black text-blue-700">
                  {metrics.ordenesAbiertas}
                </p>
              </div>

              <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-center">
                <p className="text-xs font-bold text-slate-500">
                  {T("Activas", "Active")}
                </p>
                <p className="mt-1 text-2xl font-black text-emerald-700">
                  {metrics.ordenesActivas}
                </p>
              </div>

              <div className="rounded-2xl bg-slate-100 px-4 py-3 text-center">
                <p className="text-xs font-bold text-slate-500">
                  {T("Completadas", "Completed")}
                </p>
                <p className="mt-1 text-2xl font-black text-slate-900">
                  {metrics.ordenesCompletadas}
                </p>
              </div>
            </div>
          </div>
        </section>
        )}

        <footer className="py-8 text-center text-xs font-semibold text-slate-400">
          {T("RELYDO Admin · Acceso restringido", "RELYDO Admin · Restricted access")}
        </footer>
      </div>
    </main>
  );
}