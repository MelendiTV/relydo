"use client";

import { useRouter } from "next/navigation";
import { LegalPrivacy, useLegalLanguage } from "@/app/components/LegalTerms";

export default function PrivacyPage() {
  const router = useRouter();
  const language = useLegalLanguage();
  const es = language === "es";

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900">
      <div className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
        <button
          type="button"
          onClick={() => router.back()}
          className="mb-6 rounded-xl border border-slate-300 px-4 py-2 text-sm font-black hover:bg-slate-50"
        >
          {es ? "← Regresar" : "← Back"}
        </button>

        <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-700">RELYDO</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight">
          {es ? "Privacidad" : "Privacy"}
        </h1>

        <LegalPrivacy />
      </div>
    </main>
  );
}
