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
  return <section className="space-y-4 text-inherit" aria-label={es ? "Créditos y referidos" : "Credits and referrals"}>
    <h2 className="text-xl font-black">{es ? "Créditos y referidos" : "Credits and referrals"}</h2>
    {failed ? <button type="button" className="min-h-11 rounded-xl border px-4 py-2 font-semibold" onClick={() => void load()}>{es ? "No pudimos cargar tus referidos. Reintentar" : "Could not load your referrals. Retry"}</button> : !summary ? <p role="status">{es ? "Cargando…" : "Loading…"}</p> : <>
      <div className="rounded-2xl border border-current/15 bg-current/5 p-5">
        <h3 className="text-sm font-semibold opacity-75">{es ? "Saldo promocional disponible" : "Available promotional credit"}</h3>
        <p className="mt-2 text-3xl font-black">${(summary.availableCents / 100).toFixed(2)}</p>
        <p className="mt-2 text-sm opacity-75">{es ? "Puedes usar tu crédito al pagar un trabajo." : "You can use your credit when paying for a job."}</p>
      </div>
      <div className="rounded-2xl border border-current/15 p-5">
        <h3 className="text-lg font-bold">🎁 {es ? "Invita y gana $15" : "Invite and earn $15"}</h3>
        <p className="mt-2 text-sm leading-6 opacity-75">{customerReferralMessage(es)}</p>
        <p className="mt-4 text-xs font-semibold uppercase tracking-wide opacity-75">{es ? "Tu código de invitación" : "Your invitation code"}</p>
        <p className="mt-1 break-all text-xl font-black tracking-wide">{summary.code}</p>
        <div className="my-4 flex flex-wrap gap-3">
          <button type="button" className="min-h-11 rounded-xl bg-blue-600 px-4 py-2 font-bold text-white hover:bg-blue-700" onClick={() => void copy(summary.code)}>{es ? "Copiar código" : "Copy code"}</button>
          <button type="button" className="min-h-11 rounded-xl border border-current/25 px-4 py-2 font-bold" onClick={() => void share()}>{es ? "Compartir" : "Share"}</button>
        </div>
        <a className="break-all text-sm underline underline-offset-4" href={customerReferralLink(summary.code, typeof window === "undefined" ? undefined : window.location.origin)}>{customerReferralLink(summary.code, typeof window === "undefined" ? undefined : window.location.origin)}</a>
        <div className="mt-5 border-t border-current/15 pt-4">
          <h4 className="font-semibold">{es ? "Personas que invitaste" : "People you invited"}</h4>
          {summary.registered === 0 && summary.pending === 0 && summary.rewarded === 0 ? <p className="mt-2 text-sm opacity-75">{es ? "Tus invitaciones aparecerán aquí cuando alguien se registre con tu código." : "Your invitations will appear here when someone signs up with your code."}</p> : <dl className="mt-3 grid gap-3 sm:grid-cols-3">
            {[[es ? "Registrados" : "Registered", summary.registered], [es ? "Pendientes del primer trabajo válido" : "Pending first qualifying job", summary.pending], [es ? "Premiados" : "Rewarded", summary.rewarded]].map(([label, count]) => <div key={label} className="rounded-xl bg-current/5 p-3"><dt className="text-sm opacity-75">{label}</dt><dd className="mt-1 text-xl font-bold">{count}</dd></div>)}
          </dl>}
        </div>
      </div>
      {summary.referred && <div className="rounded-2xl border border-current/15 p-5">
        <h3 className="font-bold">{es ? "Fuiste referido" : "You were referred"}</h3>
        <p className="mt-2 text-sm leading-6 opacity-75">{summary.awarded ? (es ? "Tu premio de referido fue acreditado." : "Your referral reward was credited.") : (es ? "Tu referido quedó registrado. El crédito se otorga tras tu primer trabajo válido y la liberación del pago al profesional." : "Your referral was recorded. Credit is awarded after your first qualifying job and payment release to the professional.")}</p>
      </div>}
    </>}
    <p role="status" aria-live="polite" className="text-sm">{notice}</p>
  </section>;
}
