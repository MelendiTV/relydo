"use client";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseBrowser";
import { useLanguage } from "./LanguageProvider";
import { customerReferralLink, customerReferralMessage, type CustomerReferralSummary } from "../lib/customerReferralProgram";

export default function CustomerReferralCard() {
  const { language } = useLanguage();
  const es = language === "es";
  const [summary, setSummary] = useState<CustomerReferralSummary | null>(null);
  const [failed, setFailed] = useState(false);
  const [notice, setNotice] = useState("");
  async function load() {
    const { data, error } = await supabase.rpc("my_customer_referral_summary");
    setFailed(!!error);
    if (!error) setSummary(data as CustomerReferralSummary);
  }
  useEffect(() => {
    let active = true;
    void supabase.rpc("my_customer_referral_summary").then(({ data, error }) => {
      if (!active) return;
      setFailed(!!error);
      if (!error) setSummary(data as CustomerReferralSummary);
    });
    return () => { active = false; };
  }, []);
  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); setNotice(es ? "Copiado" : "Copied"); }
    catch { setNotice(es ? "No se pudo copiar. Copia el enlace mostrado abajo." : "Could not copy. Copy the link shown below."); }
  }
  async function share() {
    if (!summary) return;
    const url = customerReferralLink(summary.code, window.location.origin);
    if (!navigator.share) { await copy(`${customerReferralMessage(es)} ${url}`); return; }
    try { await navigator.share({ title: "RELYDO", text: customerReferralMessage(es), url }); }
    catch (error) { if (!(error instanceof DOMException && error.name === "AbortError")) await copy(`${customerReferralMessage(es)} ${url}`); }
  }
  return <section className="my-4 rounded-2xl border border-slate-200 bg-white p-5 text-slate-900">
    <h2 className="text-xl font-bold">{es ? "Invita y gana $15" : "Invite and earn $15"}</h2>
    <p className="my-2">{customerReferralMessage(es)}</p>
    {failed ? <button onClick={() => void load()}>{es ? "No pudimos cargar tus referidos. Reintentar" : "Could not load your referrals. Retry"}</button> : !summary ? <p>{es ? "Cargando…" : "Loading…"}</p> : <>
      <p className="font-bold">{summary.code}</p>
      <p>{es ? "Saldo promocional disponible" : "Available promotional credit"}: ${(summary.availableCents / 100).toFixed(2)}</p>
      <p>{es ? "Registrados" : "Registered"}: {summary.registered} · {es ? "Pendientes del primer trabajo válido" : "Pending first qualifying job"}: {summary.pending} · {es ? "Premiados" : "Rewarded"}: {summary.rewarded}</p>
      {summary.referred && <p className="my-2">{summary.awarded ? (es ? "Tu premio de referido fue acreditado." : "Your referral reward was credited.") : (es ? "Tu referido quedó registrado. El crédito se otorga tras tu primer trabajo válido y la liberación del pago al profesional." : "Your referral was recorded. Credit is awarded after your first qualifying job and payment release to the professional.")}</p>}
      <div className="my-3 flex gap-4"><button onClick={() => void copy(summary.code)}>{es ? "Copiar código" : "Copy code"}</button><button onClick={() => void share()}>{es ? "Compartir" : "Share"}</button></div>
      <a className="break-all text-blue-700" href={customerReferralLink(summary.code, typeof window === "undefined" ? undefined : window.location.origin)}>{customerReferralLink(summary.code, typeof window === "undefined" ? undefined : window.location.origin)}</a>
    </>}
    <p role="status" aria-live="polite">{notice}</p>
  </section>;
}
