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


type Payment = {
  id: string;
  request_id: string;
  offer_id: string | null;
  customer_id: string;
  provider_id: string;
  job_amount: number;
  customer_fee_percent: number;
  customer_fee_amount: number;
  customer_total_amount: number;
  provider_commission_percent: number;
  provider_commission_amount: number;
  provider_net_amount: number;
  platform_revenue_amount: number;
  refunded_amount: number | null;
  refunded_at: string | null;
  released_at: string | null;
  currency: string;
  status: string;
  created_at: string | null;
  updated_at: string | null;
};

type ChangeOrder = {
  id: string;
  request_id: string;
  original_amount: number;
  additional_amount: number;
  new_total_amount: number;
  status: string;
  payment_status: string;
  additional_customer_fee_amount: number | null;
  additional_customer_total_amount: number | null;
  additional_provider_commission_amount: number | null;
  additional_provider_net_amount: number | null;
  additional_platform_revenue_amount: number | null;
  paid_at: string | null;
  created_at: string;
};

type ServiceRequest = {
  id: string;
  title: string;
  customer_name: string | null;
};

type Provider = {
  user_id: string;
  business_name: string | null;
};

type Periodo =
  | "hoy"
  | "semana"
  | "mes"
  | "ano"
  | "todo"
  | "personalizado";

function dinero(valor: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(Number(valor || 0));
}

function fechaCorta(valor: string | null | undefined) {
  if (!valor) return "Sin fecha";

  return new Intl.DateTimeFormat("es-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(valor));
}

function inicioDelDia(fecha: Date) {
  const d = new Date(fecha);
  d.setHours(0, 0, 0, 0);
  return d;
}

function inicioSemana(fecha: Date) {
  const d = inicioDelDia(fecha);
  const dia = d.getDay();
  const diferencia = dia === 0 ? 6 : dia - 1;
  d.setDate(d.getDate() - diferencia);
  return d;
}

export default function AdminFinanzasPage() {
  const router = useRouter();

  const [payments, setPayments] = useState<Payment[]>([]);
  const [changeOrders, setChangeOrders] = useState<ChangeOrder[]>([]);
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);

  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

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
        data: adminProfile,
        error: adminProfileError,
      } = await supabase
        .from("profiles")
        .select(`
          id,
          role,
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
        adminProfile.role !== "admin"
      ) {
        await supabase.auth.signOut();

        router.replace(
          "/login-admin"
        );
        return;
      }

      if (
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

      if (
        !hasAdminPermission(
          adminProfile.admin_role,
          "finance"
        )
      ) {
        /*
          Es un empleado Admin válido, pero no tiene
          permiso para Finanzas. NO cerramos su sesión.
        */
        router.replace(
          "/admin"
        );
        return;
      }

      const [
        paymentsResp,
        changeOrdersResp,
        requestsResp,
        providersResp,
      ] = await Promise.all([
        supabase
          .from("payments")
          .select(`
            id,
            request_id,
            offer_id,
            customer_id,
            provider_id,
            job_amount,
            customer_fee_percent,
            customer_fee_amount,
            customer_total_amount,
            provider_commission_percent,
            provider_commission_amount,
            provider_net_amount,
            platform_revenue_amount,
            refunded_amount,
            refunded_at,
            released_at,
            currency,
            status,
            created_at,
            updated_at
          `)
          .order("created_at", {
            ascending: false,
          })
          .limit(5000),

        supabase
          .from("change_orders")
          .select(`
            id,
            request_id,
            original_amount,
            additional_amount,
            new_total_amount,
            status,
            payment_status,
            additional_customer_fee_amount,
            additional_customer_total_amount,
            additional_provider_commission_amount,
            additional_provider_net_amount,
            additional_platform_revenue_amount,
            paid_at,
            created_at
          `)
          .order("created_at", {
            ascending: false,
          })
          .limit(5000),

        supabase
          .from("service_requests")
          .select(`
            id,
            title,
            customer_name
          `)
          .limit(5000),

        supabase
          .from("provider_profiles")
          .select(`
            user_id,
            business_name
          `)
          .limit(5000),
      ]);

      if (paymentsResp.error) {
        throw new Error(
          `Pagos: ${paymentsResp.error.message}`
        );
      }

      if (changeOrdersResp.error) {
        console.error(
          "No se pudieron cargar Change Orders:",
          changeOrdersResp.error
        );
      }

      if (requestsResp.error) {
        console.error(
          "No se pudieron cargar órdenes:",
          requestsResp.error
        );
      }

      if (providersResp.error) {
        console.error(
          "No se pudieron cargar profesionales:",
          providersResp.error
        );
      }

      setPayments(
        (paymentsResp.data || []) as Payment[]
      );

      setChangeOrders(
        (changeOrdersResp.data || []) as ChangeOrder[]
      );

      setRequests(
        (requestsResp.data || []) as ServiceRequest[]
      );

      setProviders(
        (providersResp.data || []) as Provider[]
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No pudimos cargar la información financiera."
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
      const inicio = inicioDelDia(ahora);
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

    if (periodo === "ano") {
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
    }

    const inicio =
      desde
        ? inicioDelDia(
            new Date(`${desde}T00:00:00`)
          )
        : null;

    let fin: Date | null = null;

    if (hasta) {
      fin = inicioDelDia(
        new Date(`${hasta}T00:00:00`)
      );
      fin.setDate(fin.getDate() + 1);
    }

    return { inicio, fin };
  }, [periodo, desde, hasta]);

  function fechaDentro(
    valor: string | null | undefined
  ) {
    if (!valor) return false;

    const fecha = new Date(valor);

    if (
      rango.inicio &&
      fecha < rango.inicio
    ) {
      return false;
    }

    if (
      rango.fin &&
      fecha >= rango.fin
    ) {
      return false;
    }

    return true;
  }

  const paymentsFiltrados = useMemo(() => {
    if (periodo === "todo") {
      return payments;
    }

    return payments.filter((p) =>
      fechaDentro(
        p.created_at ||
          p.updated_at ||
          p.released_at
      )
    );
  }, [payments, rango, periodo]);

  const changeOrdersFiltrados = useMemo(() => {
    const pagados =
      changeOrders.filter(
        (c) =>
          c.payment_status === "paid" ||
          Boolean(c.paid_at)
      );

    if (periodo === "todo") {
      return pagados;
    }

    return pagados.filter((c) =>
      fechaDentro(
        c.paid_at ||
          c.created_at
      )
    );
  }, [changeOrders, rango, periodo]);

  const resumen = useMemo(() => {
    const volumenBase =
      paymentsFiltrados.reduce(
        (acc, p) =>
          acc +
          Number(
            p.customer_total_amount || 0
          ),
        0
      );

    const valorServiciosBase =
      paymentsFiltrados.reduce(
        (acc, p) =>
          acc +
          Number(p.job_amount || 0),
        0
      );

    const tarifasClienteBase =
      paymentsFiltrados.reduce(
        (acc, p) =>
          acc +
          Number(
            p.customer_fee_amount || 0
          ),
        0
      );

    const comisionesProBase =
      paymentsFiltrados.reduce(
        (acc, p) =>
          acc +
          Number(
            p.provider_commission_amount ||
              0
          ),
        0
      );

    const ingresoRelydoBase =
      paymentsFiltrados.reduce(
        (acc, p) =>
          acc +
          Number(
            p.platform_revenue_amount ||
              0
          ),
        0
      );

    const netoProfesionalBase =
      paymentsFiltrados.reduce(
        (acc, p) =>
          acc +
          Number(
            p.provider_net_amount || 0
          ),
        0
      );

    const reembolsos =
      paymentsFiltrados.reduce(
        (acc, p) =>
          acc +
          Number(
            p.refunded_amount || 0
          ),
        0
      );

    const volumenAdicional =
      changeOrdersFiltrados.reduce(
        (acc, c) =>
          acc +
          Number(
            c.additional_customer_total_amount ||
              0
          ),
        0
      );

    const tarifasClienteAdicionales =
      changeOrdersFiltrados.reduce(
        (acc, c) =>
          acc +
          Number(
            c.additional_customer_fee_amount ||
              0
          ),
        0
      );

    const comisionesProAdicionales =
      changeOrdersFiltrados.reduce(
        (acc, c) =>
          acc +
          Number(
            c.additional_provider_commission_amount ||
              0
          ),
        0
      );

    const ingresoRelydoAdicional =
      changeOrdersFiltrados.reduce(
        (acc, c) =>
          acc +
          Number(
            c.additional_platform_revenue_amount ||
              0
          ),
        0
      );

    const netoProfesionalAdicional =
      changeOrdersFiltrados.reduce(
        (acc, c) =>
          acc +
          Number(
            c.additional_provider_net_amount ||
              0
          ),
        0
      );

    const retenido =
      paymentsFiltrados
        .filter(
          (p) =>
            !p.released_at &&
            !p.refunded_at &&
            ![
              "refunded",
              "released",
              "paid_out",
            ].includes(
              String(
                p.status || ""
              ).toLowerCase()
            )
        )
        .reduce(
          (acc, p) =>
            acc +
            Number(
              p.provider_net_amount || 0
            ),
          0
        );

    const liberado =
      paymentsFiltrados
        .filter(
          (p) =>
            Boolean(p.released_at) ||
            [
              "released",
              "paid_out",
            ].includes(
              String(
                p.status || ""
              ).toLowerCase()
            )
        )
        .reduce(
          (acc, p) =>
            acc +
            Number(
              p.provider_net_amount || 0
            ),
          0
        );

    return {
      volumenTotal:
        volumenBase + volumenAdicional,
      valorServicios:
        valorServiciosBase,
      tarifasCliente:
        tarifasClienteBase +
        tarifasClienteAdicionales,
      comisionesPro:
        comisionesProBase +
        comisionesProAdicionales,
      ingresoRelydo:
        ingresoRelydoBase +
        ingresoRelydoAdicional,
      pagadoProfesionales:
        netoProfesionalBase +
        netoProfesionalAdicional,
      reembolsos,
      retenido,
      liberado,
      changeOrdersPagados:
        changeOrdersFiltrados.length,
      pagos:
        paymentsFiltrados.length,
    };
  }, [
    paymentsFiltrados,
    changeOrdersFiltrados,
  ]);

  const movimientos = useMemo(() => {
    return paymentsFiltrados.map((p) => {
      const trabajo =
        requests.find(
          (r) =>
            r.id === p.request_id
        );

      const profesional =
        providers.find(
          (pro) =>
            pro.user_id ===
            p.provider_id
        );

      return {
        ...p,
        trabajo:
          trabajo?.title ||
          "Trabajo RELYDO",
        cliente:
          trabajo?.customer_name ||
          "Cliente RELYDO",
        profesional:
          profesional?.business_name ||
          "Profesional RELYDO",
      };
    });
  }, [
    paymentsFiltrados,
    requests,
    providers,
  ]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <div className="rounded-2xl bg-white px-8 py-7 font-bold text-slate-700 shadow">
          Cargando panel financiero...
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
            onClick={() =>
              router.push("/admin")
            }
            className="w-fit font-black text-blue-700 hover:underline"
          >
            ← Volver al panel Admin
          </button>

          <button
            type="button"
            onClick={cargar}
            className="w-fit rounded-xl border-2 border-violet-700 bg-white px-5 py-3 font-extrabold text-violet-700 hover:bg-violet-50"
          >
            ↻ Actualizar finanzas
          </button>
        </div>

        <section className="overflow-hidden rounded-3xl bg-slate-950 p-7 text-white shadow-xl">
          <p className="text-sm font-black uppercase tracking-widest text-violet-300">
            📊 Control financiero
          </p>

          <h1 className="mt-2 text-3xl font-black">
            Finanzas y ganancias de RELYDO
          </h1>

          <p className="mt-3 max-w-3xl text-slate-300">
            Controla el dinero procesado por la plataforma, los ingresos de RELYDO, pagos al profesional, retenciones y reembolsos.
          </p>
        </section>

        {error && (
          <div className="mt-6 rounded-2xl border border-red-300 bg-red-50 p-5 font-bold text-red-700">
            {error}
          </div>
        )}

        <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-wide text-slate-500">
                Período
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                {(
                  [
                    ["hoy", "Hoy"],
                    ["semana", "Esta semana"],
                    ["mes", "Este mes"],
                    ["ano", "Este año"],
                    ["todo", "Todo"],
                    ["personalizado", "Personalizado"],
                  ] as const
                ).map(([valor, texto]) => (
                  <button
                    key={valor}
                    type="button"
                    onClick={() =>
                      setPeriodo(valor)
                    }
                    className={`rounded-xl px-4 py-2 text-sm font-black transition ${
                      periodo === valor
                        ? "bg-violet-700 text-white"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    {texto}
                  </button>
                ))}
              </div>
            </div>

            {periodo ===
              "personalizado" && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label>
                  <span className="text-xs font-black uppercase text-slate-500">
                    Desde
                  </span>
                  <input
                    type="date"
                    value={desde}
                    onChange={(e) =>
                      setDesde(e.target.value)
                    }
                    className="mt-1 block rounded-xl border border-slate-300 px-4 py-2.5 font-bold"
                  />
                </label>

                <label>
                  <span className="text-xs font-black uppercase text-slate-500">
                    Hasta
                  </span>
                  <input
                    type="date"
                    value={hasta}
                    onChange={(e) =>
                      setHasta(e.target.value)
                    }
                    className="mt-1 block rounded-xl border border-slate-300 px-4 py-2.5 font-bold"
                  />
                </label>
              </div>
            )}
          </div>
        </section>

        <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Tarjeta
            titulo="Volumen total procesado"
            valor={dinero(
              resumen.volumenTotal
            )}
            descripcion="Total cobrado a clientes, incluyendo Change Orders pagados."
            clase="border-blue-200 bg-blue-50"
          />

          <Tarjeta
            titulo="Ingresos RELYDO"
            valor={dinero(
              resumen.ingresoRelydo
            )}
            descripcion="Tarifa del cliente + comisión del profesional registradas por la plataforma."
            clase="border-emerald-200 bg-emerald-50"
          />

          <Tarjeta
            titulo="Pagado a profesionales"
            valor={dinero(
              resumen.pagadoProfesionales
            )}
            descripcion="Importe neto calculado para los profesionales, incluyendo adicionales."
            clase="border-slate-200 bg-white"
          />

          <Tarjeta
            titulo="Reembolsos"
            valor={dinero(
              resumen.reembolsos
            )}
            descripcion="Importe registrado como devuelto a clientes."
            clase="border-red-200 bg-red-50"
          />

          <Tarjeta
            titulo="Tarifas de clientes"
            valor={dinero(
              resumen.tarifasCliente
            )}
            descripcion="Service fees cobrados al cliente."
            clase="border-violet-200 bg-violet-50"
          />

          <Tarjeta
            titulo="Comisiones de profesionales"
            valor={dinero(
              resumen.comisionesPro
            )}
            descripcion="Comisiones descontadas del precio del profesional."
            clase="border-amber-200 bg-amber-50"
          />

          <Tarjeta
            titulo="Dinero retenido"
            valor={dinero(
              resumen.retenido
            )}
            descripcion="Neto profesional que todavía no figura como liberado o reembolsado."
            clase="border-orange-200 bg-orange-50"
          />

          <Tarjeta
            titulo="Liberado a profesionales"
            valor={dinero(
              resumen.liberado
            )}
            descripcion="Neto profesional de pagos que figuran como liberados."
            clase="border-green-200 bg-green-50"
          />
        </section>

        <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Mini
              titulo="Pagos"
              valor={String(
                resumen.pagos
              )}
            />
            <Mini
              titulo="Change Orders pagados"
              valor={String(
                resumen.changeOrdersPagados
              )}
            />
            <Mini
              titulo="Valor base servicios"
              valor={dinero(
                resumen.valorServicios
              )}
            />
            <Mini
              titulo="Moneda"
              valor={
                paymentsFiltrados[0]
                  ?.currency ||
                "USD"
              }
            />
          </div>
        </section>

        <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-wide text-violet-700">
                Historial financiero
              </p>

              <h2 className="mt-1 text-2xl font-black text-slate-950">
                Movimientos de pagos
              </h2>
            </div>

            <span className="text-sm font-bold text-slate-500">
              {movimientos.length} movimiento
              {movimientos.length === 1
                ? ""
                : "s"}
            </span>
          </div>

          {movimientos.length === 0 ? (
            <div className="mt-5 rounded-2xl bg-slate-50 p-8 text-center font-bold text-slate-500">
              No hay movimientos en este período.
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              {movimientos.map((p) => (
                <article
                  key={p.id}
                  className="rounded-2xl border border-slate-200 p-5"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <h3 className="font-black text-slate-950">
                        {p.trabajo}
                      </h3>

                      <p className="mt-1 text-sm text-slate-600">
                        {p.cliente} ·{" "}
                        {p.profesional}
                      </p>

                      <p className="mt-2 break-all text-xs font-semibold text-slate-400">
                        Orden: {p.request_id}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <Importe
                        titulo="Cliente"
                        valor={
                          p.customer_total_amount
                        }
                      />
                      <Importe
                        titulo="RELYDO"
                        valor={
                          p.platform_revenue_amount
                        }
                      />
                      <Importe
                        titulo="Profesional"
                        valor={
                          p.provider_net_amount
                        }
                      />
                      <Importe
                        titulo="Reembolso"
                        valor={
                          p.refunded_amount || 0
                        }
                      />
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-full bg-slate-100 px-3 py-1.5 font-black text-slate-700">
                      Estado: {p.status}
                    </span>

                    {p.released_at && (
                      <span className="rounded-full bg-green-100 px-3 py-1.5 font-black text-green-800">
                        Liberado {fechaCorta(
                          p.released_at
                        )}
                      </span>
                    )}

                    {p.refunded_at && (
                      <span className="rounded-full bg-blue-100 px-3 py-1.5 font-black text-blue-800">
                        Reembolsado {fechaCorta(
                          p.refunded_at
                        )}
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() =>
                        router.push(
                          `/admin/trabajos/${p.request_id}`
                        )
                      }
                      className="ml-auto rounded-lg bg-blue-700 px-3 py-2 font-black text-white"
                    >
                      Ver expediente →
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}

          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <p className="font-black text-amber-950">
              Nota sobre “ganancia”
            </p>

            <p className="mt-2 text-sm leading-6 text-amber-900">
              “Ingresos RELYDO” representa las comisiones y tarifas registradas en la base de datos. No se presenta como beneficio neto contable porque aquí todavía no se están descontando automáticamente costos externos como comisiones de Stripe, impuestos, publicidad u otros gastos operativos.
            </p>
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
  clase,
}: {
  titulo: string;
  valor: string;
  descripcion: string;
  clase: string;
}) {
  return (
    <article
      className={`rounded-3xl border p-6 shadow-sm ${clase}`}
    >
      <p className="text-sm font-black text-slate-600">
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

function Mini({
  titulo,
  valor,
}: {
  titulo: string;
  valor: string;
}) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="text-xs font-black uppercase tracking-wide text-slate-500">
        {titulo}
      </p>
      <p className="mt-2 text-xl font-black text-slate-950">
        {valor}
      </p>
    </div>
  );
}

function Importe({
  titulo,
  valor,
}: {
  titulo: string;
  valor: number;
}) {
  return (
    <div className="min-w-[105px] rounded-xl bg-slate-50 p-3">
      <p className="text-xs font-bold text-slate-500">
        {titulo}
      </p>
      <p className="mt-1 font-black text-slate-950">
        {dinero(valor)}
      </p>
    </div>
  );
}