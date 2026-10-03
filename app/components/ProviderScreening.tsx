"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/app/lib/supabaseBrowser";
type Status = { payment_status: string; amount: number; currency: string; invitation_status: string | null; background_status: string; identity_status: string; decision_state: string };
export default function ProviderScreening({ providerId }: { providerId?: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;
      const response = await fetch(`/api/provider/screening${providerId ? `?providerId=${encodeURIComponent(providerId)}` : ""}`, { headers: { Authorization: `Bearer ${data.session.access_token}` }, cache: "no-store" });
      const result = await response.json();
      if (!response.ok) { setMessage(result.error); return; }
      setStatus(result.screening); setEnabled(result.enabled);
    } catch { setMessage("No se pudo consultar la verificación"); }
  }, [providerId]);
  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  async function act(action: "pay" | "start") {
    setBusy(true); setMessage("");
    try {
      const { data } = await supabase.auth.getSession();
      const response = await fetch("/api/provider/screening", { method: "POST", headers: { Authorization: `Bearer ${data.session?.access_token || ""}`, "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (result.url) { window.location.assign(result.url); return; }
      setMessage(result.message); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "No disponible"); }
    finally { setBusy(false); }
  }
  return <section className="my-4 rounded-xl border bg-white p-5 text-slate-900">
    <h2 className="font-bold">Verificación de identidad y antecedentes</h2>
    <p>Pago: {status?.payment_status || "sin iniciar"}. Antecedentes: {status?.background_status || "pending"}. Identidad: {status?.identity_status || "pending"}.</p>
    {status && <p>Tarifa: {(status.amount / 100).toFixed(2)} {status.currency.toUpperCase()}. Decisión: {status.decision_state}.</p>}
    {status?.background_status === "consider" && <p>Requiere revisión humana. Este resultado no implica rechazo automático.</p>}
    {!providerId && enabled && <>
      {(!status || status.payment_status === "unpaid") && <button disabled={busy} className="m-2 rounded bg-blue-700 p-2 text-white" onClick={() => act("pay")}>Revisar y pagar tarifa</button>}
      {status?.payment_status === "paid" && !status.invitation_status && <button disabled={busy} className="m-2 rounded bg-blue-700 p-2 text-white" onClick={() => act("start")}>Solicitar invitación Checkr</button>}
      {status?.invitation_status && <p>Invitación: {status.invitation_status}. Revisa el email de Checkr para entregar información y consentimiento.</p>}
    </>}
    {!enabled && <p>El flujo aún no está habilitado.</p>}
    <button disabled={busy} className="m-2 underline" onClick={() => void load()}>Actualizar estado</button>
    {message && <p role="status">{message}</p>}
  </section>;
}
