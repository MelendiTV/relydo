"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/app/lib/supabaseBrowser";
import { useRouter } from "next/navigation";
import {
  hasAdminPermission,
  isAdminRole,
} from "@/app/lib/adminPermissions";


type PaymentSettings = {
  id: string;
  provider_commission_percent: number;
  customer_service_fee_percent: number;
  customer_cancel_on_the_way_percent: number;
  customer_cancel_arrived_percent: number;
  cancellation_provider_percent: number;
  currency: string;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export default function ConfiguracionFinancieraPage() {
  const router = useRouter();

  const [
    paymentSettings,
    setPaymentSettings,
  ] = useState<PaymentSettings | null>(
    null
  );

  const [
    providerCommissionInput,
    setProviderCommissionInput,
  ] = useState("10");

  const [
    customerFeeInput,
    setCustomerFeeInput,
  ] = useState("5");

  const [
    cancelOnTheWayInput,
    setCancelOnTheWayInput,
  ] = useState("10");

  const [
    cancelArrivedInput,
    setCancelArrivedInput,
  ] = useState("20");

  const [
    cancellationProviderInput,
    setCancellationProviderInput,
  ] = useState("80");

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    guardando,
    setGuardando,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");

  const [
    mensaje,
    setMensaje,
  ] = useState("");

  useEffect(() => {
    verificarAdminYCargar();
  }, []);

  async function verificarAdminYCargar() {
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
        !isAdminRole(adminProfile.admin_role) ||
        !hasAdminPermission(
          adminProfile.admin_role,
          "financial_settings"
        )
      ) {
        router.replace("/admin");
        return;
      }

      await cargarConfiguracion();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No pudimos cargar la configuración financiera."
      );
    } finally {
      setLoading(false);
    }
  }

  async function cargarConfiguracion() {
    const {
      data,
      error: settingsError,
    } = await supabase
      .from("payment_settings")
      .select(`
        id,
        provider_commission_percent,
        customer_service_fee_percent,
        customer_cancel_on_the_way_percent,
        customer_cancel_arrived_percent,
        cancellation_provider_percent,
        currency,
        active,
        created_at,
        updated_at
      `)
      .eq("active", true)
      .order("created_at", {
        ascending: false,
      })
      .limit(1)
      .maybeSingle();

    if (settingsError) {
      throw new Error(
        `Error cargando configuración de pagos: ${settingsError.message}`
      );
    }

    if (!data) {
      setPaymentSettings(null);
      return;
    }

    const settings =
      data as PaymentSettings;

    setPaymentSettings(settings);

    setProviderCommissionInput(
      String(
        settings.provider_commission_percent
      )
    );

    setCustomerFeeInput(
      String(
        settings.customer_service_fee_percent
      )
    );

    setCancelOnTheWayInput(
      String(
        settings.customer_cancel_on_the_way_percent
      )
    );

    setCancelArrivedInput(
      String(
        settings.customer_cancel_arrived_percent
      )
    );

    setCancellationProviderInput(
      String(
        settings.cancellation_provider_percent
      )
    );
  }

  async function guardarConfiguracion() {
    setError("");
    setMensaje("");

    if (!paymentSettings) {
      setError(
        "No se encontró una configuración de pagos activa."
      );
      return;
    }

    const providerPercent =
      Number(providerCommissionInput);

    const customerPercent =
      Number(customerFeeInput);

    const cancelOnTheWayPercent =
      Number(cancelOnTheWayInput);

    const cancelArrivedPercent =
      Number(cancelArrivedInput);

    const cancellationProviderPercent =
      Number(cancellationProviderInput);

    const porcentajes = [
      providerPercent,
      customerPercent,
      cancelOnTheWayPercent,
      cancelArrivedPercent,
      cancellationProviderPercent,
    ];

    if (
      porcentajes.some(
        (valor) =>
          !Number.isFinite(valor) ||
          valor < 0 ||
          valor > 100
      )
    ) {
      setError(
        "Todos los porcentajes deben estar entre 0% y 100%."
      );
      return;
    }

    const confirmar =
      window.confirm(
        `¿Guardar esta configuración?\n\nComisión profesional: ${providerPercent.toFixed(
          2
        )}%\nTarifa cliente: ${customerPercent.toFixed(
          2
        )}%\nCancelación en camino: ${cancelOnTheWayPercent.toFixed(
          2
        )}%\nCancelación al llegar: ${cancelArrivedPercent.toFixed(
          2
        )}%\nDe la penalidad para el profesional: ${cancellationProviderPercent.toFixed(
          2
        )}%`
      );

    if (!confirmar) {
      return;
    }

    setGuardando(true);

    try {
      const {
        data,
        error: updateError,
      } = await supabase
        .from("payment_settings")
        .update({
          provider_commission_percent:
            providerPercent,
          customer_service_fee_percent:
            customerPercent,
          customer_cancel_on_the_way_percent:
            cancelOnTheWayPercent,
          customer_cancel_arrived_percent:
            cancelArrivedPercent,
          cancellation_provider_percent:
            cancellationProviderPercent,
          updated_at:
            new Date().toISOString(),
        })
        .eq(
          "id",
          paymentSettings.id
        )
        .select(`
          id,
          provider_commission_percent,
          customer_service_fee_percent,
          customer_cancel_on_the_way_percent,
          customer_cancel_arrived_percent,
          cancellation_provider_percent,
          currency,
          active,
          created_at,
          updated_at
        `)
        .single();

      if (updateError) {
        throw new Error(
          updateError.message
        );
      }

      const settings =
        data as PaymentSettings;

      setPaymentSettings(settings);

      setMensaje(
        "Configuración financiera guardada correctamente."
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No pudimos guardar la configuración."
      );
    } finally {
      setGuardando(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <div className="rounded-2xl bg-white px-8 py-7 font-bold text-slate-700 shadow-lg">
          Cargando configuración financiera...
        </div>
      </main>
    );
  }

  const providerPercent =
    Number(providerCommissionInput) || 0;

  const customerPercent =
    Number(customerFeeInput) || 0;

  const ejemploServicio = 300;

  const ejemploCliente =
    ejemploServicio +
    (ejemploServicio *
      customerPercent) /
      100;

  const ejemploProfesional =
    ejemploServicio -
    (ejemploServicio *
      providerPercent) /
      100;

  const ejemploFixFlow =
    ejemploServicio *
      (providerPercent / 100) +
    ejemploServicio *
      (customerPercent / 100);

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-10">
      <div className="mx-auto max-w-5xl">
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

          <span className="w-fit rounded-full bg-emerald-100 px-4 py-2 text-sm font-black text-emerald-800">
            💰 Finanzas
          </span>
        </div>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl">
          <div className="bg-slate-950 p-7 text-white">
            <p className="text-sm font-black uppercase tracking-widest text-emerald-300">
              Configuración administrativa
            </p>

            <h1 className="mt-2 text-3xl font-black">
              Configuración financiera
            </h1>

            <p className="mt-3 max-w-3xl text-slate-300">
              Administra las comisiones de FixFlow, la tarifa de servicio al cliente y las reglas económicas de cancelación.
            </p>
          </div>

          <div className="p-7">
            {error && (
              <div className="mb-5 rounded-2xl border border-red-300 bg-red-50 p-5 font-bold text-red-700">
                {error}
              </div>
            )}

            {mensaje && (
              <div className="mb-5 rounded-2xl border border-emerald-300 bg-emerald-50 p-5 font-bold text-emerald-800">
                ✅ {mensaje}
              </div>
            )}

            {!paymentSettings ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
                No se encontró una configuración financiera activa.
              </div>
            ) : (
              <>
                <div>
                  <p className="text-sm font-black uppercase tracking-wide text-emerald-700">
                    Comisiones principales
                  </p>

                  <h2 className="mt-2 text-2xl font-black text-slate-950">
                    Tarifas de la plataforma
                  </h2>
                </div>

                <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">
                  <label className="block">
                    <span className="text-sm font-extrabold text-slate-700">
                      Comisión al profesional (%)
                    </span>

                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={providerCommissionInput}
                      onChange={(e) =>
                        setProviderCommissionInput(
                          e.target.value
                        )
                      }
                      className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg font-extrabold text-slate-900 outline-none focus:border-blue-500"
                    />

                    <p className="mt-2 text-sm text-slate-500">
                      Se descuenta del precio acordado con el profesional.
                    </p>
                  </label>

                  <label className="block">
                    <span className="text-sm font-extrabold text-slate-700">
                      Tarifa de servicio al cliente (%)
                    </span>

                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={customerFeeInput}
                      onChange={(e) =>
                        setCustomerFeeInput(
                          e.target.value
                        )
                      }
                      className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg font-extrabold text-slate-900 outline-none focus:border-blue-500"
                    />

                    <p className="mt-2 text-sm text-slate-500">
                      Se añade al total que paga el cliente.
                    </p>
                  </label>
                </div>

                <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="rounded-2xl bg-slate-50 p-5">
                    <p className="text-sm font-bold text-slate-500">
                      Moneda
                    </p>

                    <p className="mt-1 text-xl font-black text-slate-900">
                      {paymentSettings.currency}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-emerald-50 p-5">
                    <p className="text-sm font-bold text-emerald-700">
                      Configuración
                    </p>

                    <p className="mt-1 text-xl font-black text-emerald-900">
                      {paymentSettings.active
                        ? "Activa"
                        : "Inactiva"}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-blue-50 p-5">
                    <p className="text-sm font-bold text-blue-700">
                      Ejemplo $300
                    </p>

                    <p className="mt-1 text-sm font-extrabold text-blue-900">
                      Cliente: $
                      {ejemploCliente.toFixed(2)}
                    </p>

                    <p className="mt-1 text-sm font-extrabold text-blue-900">
                      Profesional: $
                      {ejemploProfesional.toFixed(2)}
                    </p>
                  </div>
                </div>

                <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                  <p className="font-extrabold text-emerald-900">
                    Ingreso estimado de FixFlow en un trabajo de $300
                  </p>

                  <p className="mt-2 text-3xl font-black text-emerald-800">
                    ${ejemploFixFlow.toFixed(2)}
                  </p>
                </div>

                <div className="mt-8 border-t border-slate-200 pt-8">
                  <p className="text-sm font-black uppercase tracking-wide text-amber-700">
                    Cancelaciones
                  </p>

                  <h2 className="mt-2 text-2xl font-black text-slate-950">
                    Reglas económicas de cancelación
                  </h2>

                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Define la penalidad según la etapa del trabajo y cuánto de esa penalidad corresponde al profesional.
                  </p>

                  <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-3">
                    <label className="block">
                      <span className="text-sm font-extrabold text-slate-700">
                        Pro en camino (%)
                      </span>

                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={cancelOnTheWayInput}
                        onChange={(e) =>
                          setCancelOnTheWayInput(
                            e.target.value
                          )
                        }
                        className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 font-bold text-slate-900 outline-none focus:border-blue-500"
                      />
                    </label>

                    <label className="block">
                      <span className="text-sm font-extrabold text-slate-700">
                        Pro ya llegó (%)
                      </span>

                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={cancelArrivedInput}
                        onChange={(e) =>
                          setCancelArrivedInput(
                            e.target.value
                          )
                        }
                        className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 font-bold text-slate-900 outline-none focus:border-blue-500"
                      />
                    </label>

                    <label className="block">
                      <span className="text-sm font-extrabold text-slate-700">
                        De la penalidad para el Pro (%)
                      </span>

                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={cancellationProviderInput}
                        onChange={(e) =>
                          setCancellationProviderInput(
                            e.target.value
                          )
                        }
                        className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 font-bold text-slate-900 outline-none focus:border-blue-500"
                      />
                    </label>
                  </div>

                  <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm font-semibold leading-6 text-slate-600">
                    Contratado: cancelación gratis · Trabajo iniciado: no se cancela, pasa a reclamo · El resto de la penalidad corresponde a FixFlow.
                  </div>
                </div>

                <button
                  type="button"
                  disabled={guardando}
                  onClick={guardarConfiguracion}
                  className="mt-8 w-full rounded-xl bg-emerald-600 px-6 py-4 text-lg font-extrabold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {guardando
                    ? "Guardando..."
                    : "💰 Guardar configuración financiera"}
                </button>
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
