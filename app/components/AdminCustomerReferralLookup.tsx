"use client";
import { useState } from "react";
import { supabase } from "../lib/supabaseBrowser";

export default function AdminCustomerReferralLookup() {
  const [id, setId] = useState("");
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);
  async function lookup() {
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("admin_customer_referrals", { p_customer_id: id.trim() });
      setResult(error ? "No se pudo consultar. Revisa el ID y tus permisos." : JSON.stringify(data, null, 2));
    } finally { setBusy(false); }
  }
  return <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6">
    <h2 className="font-bold">Referidos de clientes</h2>
    <label className="block">ID de cliente <input className="m-2 rounded border p-2" value={id} onChange={e => setId(e.target.value)} /></label>
    <button disabled={busy || !id.trim()} onClick={() => void lookup()}>{busy ? "Consultando…" : "Consultar referidos"}</button>
    <pre className="mt-3 overflow-auto text-sm" role="status">{result}</pre>
  </section>;
}
