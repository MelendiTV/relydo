"use client";

import { useRouter } from "next/navigation";
import { useLanguage } from "@/app/components/LanguageProvider";

export default function TermsPage() {
  const router = useRouter();
  const { language } = useLanguage();
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
          {es ? "Términos y condiciones" : "Terms and Conditions"}
        </h1>

        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-950">
          {es
            ? "Documento operativo provisional. El texto legal definitivo debe ser revisado y aprobado antes del lanzamiento público."
            : "Provisional operational document. Final legal wording should be reviewed and approved before public launch."}
        </div>

        <div className="mt-8 space-y-6 text-sm leading-7 text-slate-700">
          <section>
            <h2 className="font-black text-slate-950">{es ? "Uso de la plataforma" : "Platform use"}</h2>
            <p>{es
              ? "RELYDO conecta clientes con profesionales independientes para solicitar, presupuestar, coordinar y pagar servicios. Cada usuario es responsable de mantener información verdadera y de utilizar la plataforma de forma lícita."
              : "RELYDO connects customers with independent professionals to request, quote, coordinate, and pay for services. Each user is responsible for keeping information accurate and using the platform lawfully."}</p>
          </section>

          <section>
            <h2 className="font-black text-slate-950">{es ? "Profesionales" : "Professionals"}</h2>
            <p>{es
              ? "Los profesionales son responsables de las licencias, seguros, permisos y demás requisitos que correspondan a sus servicios y jurisdicción. La verificación de RELYDO no sustituye obligaciones legales o regulatorias."
              : "Professionals are responsible for licenses, insurance, permits, and other requirements applicable to their services and jurisdiction. RELYDO verification does not replace legal or regulatory obligations."}</p>
          </section>

          <section>
            <h2 className="font-black text-slate-950">{es ? "Pagos, cambios y reclamos" : "Payments, changes, and claims"}</h2>
            <p>{es
              ? "Los pagos, cambios de presupuesto, cancelaciones, reembolsos y reclamos se procesan conforme al flujo y a las tarifas mostradas en RELYDO en el momento de la operación."
              : "Payments, budget changes, cancellations, refunds, and claims are processed according to the flow and fees shown in RELYDO at the time of the transaction."}</p>
          </section>

          <section>
            <h2 className="font-black text-slate-950">{es ? "Conducta y seguridad" : "Conduct and safety"}</h2>
            <p>{es
              ? "No se permite fraude, suplantación, abuso, manipulación de pagos, acceso no autorizado ni uso de la plataforma para actividades ilegales. RELYDO puede limitar o suspender acceso cuando sea necesario para proteger a usuarios y a la plataforma."
              : "Fraud, impersonation, abuse, payment manipulation, unauthorized access, and use of the platform for illegal activity are prohibited. RELYDO may restrict or suspend access when necessary to protect users and the platform."}</p>
          </section>
        </div>
      </div>
    </main>
  );
}
