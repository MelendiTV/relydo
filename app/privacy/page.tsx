"use client";

import { useRouter } from "next/navigation";
import { useLanguage } from "@/app/components/LanguageProvider";

export default function PrivacyPage() {
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
          {es ? "Privacidad" : "Privacy"}
        </h1>

        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-950">
          {es
            ? "Documento operativo provisional. La política legal definitiva debe ser revisada y aprobada antes del lanzamiento público."
            : "Provisional operational document. The final legal policy should be reviewed and approved before public launch."}
        </div>

        <div className="mt-8 space-y-6 text-sm leading-7 text-slate-700">
          <section>
            <h2 className="font-black text-slate-950">{es ? "Información que usa RELYDO" : "Information RELYDO uses"}</h2>
            <p>{es
              ? "RELYDO utiliza información de cuenta, perfil, ubicación de servicio, solicitudes, presupuestos, mensajes, documentos de verificación, evidencias, pagos y actividad necesaria para operar el marketplace."
              : "RELYDO uses account, profile, service-location, request, quote, message, verification-document, evidence, payment, and activity information needed to operate the marketplace."}</p>
          </section>

          <section>
            <h2 className="font-black text-slate-950">{es ? "Finalidad" : "Purpose"}</h2>
            <p>{es
              ? "La información se usa para prestar el servicio, verificar cuentas, coordinar trabajos, procesar pagos, prevenir fraude, gestionar reclamos, enviar notificaciones y mejorar la seguridad y funcionamiento de RELYDO."
              : "Information is used to provide the service, verify accounts, coordinate jobs, process payments, prevent fraud, manage claims, send notifications, and improve RELYDO security and operation."}</p>
          </section>

          <section>
            <h2 className="font-black text-slate-950">{es ? "Proveedores externos" : "External providers"}</h2>
            <p>{es
              ? "RELYDO puede utilizar proveedores tecnológicos para autenticación, base de datos, alojamiento, pagos, correo y notificaciones. Cada proveedor procesa únicamente la información necesaria para su función."
              : "RELYDO may use technology providers for authentication, database services, hosting, payments, email, and notifications. Each provider processes only the information needed for its function."}</p>
          </section>

          <section>
            <h2 className="font-black text-slate-950">{es ? "Privacidad entre usuarios" : "Privacy between users"}</h2>
            <p>{es
              ? "RELYDO procura limitar la exposición de datos personales entre clientes y profesionales a la información necesaria para ejecutar el servicio, y conserva registros relevantes para seguridad, pagos y reclamos."
              : "RELYDO aims to limit personal-data exposure between customers and professionals to information necessary to perform the service and retains relevant records for security, payments, and claims."}</p>
          </section>
        </div>
      </div>
    </main>
  );
}
