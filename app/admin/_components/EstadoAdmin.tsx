type ContextoEstado = "orden" | "trabajo";

export function presentacionEstadoAdmin(
  status: string,
  jobStage: string | null,
  contexto: ContextoEstado
) {
  let etiqueta = status;
  let estilo = "bg-slate-100 text-slate-700";
  let inconsistencia = false;
  let etapaSecundaria: string | null = null;

  switch (status) {
    case "open":
      etiqueta = contexto === "orden" ? "Abierta" : "Abierto";
      estilo = "bg-blue-100 text-blue-800";
      inconsistencia = jobStage !== null;
      break;
    case "completed":
      etiqueta = contexto === "orden" ? "Completada" : "Completado";
      estilo = "bg-green-100 text-green-800";
      break;
    case "cancelled":
      etiqueta = contexto === "orden" ? "Cancelada" : "Cancelado";
      estilo = "bg-red-100 text-red-800";
      break;
    case "quoted":
      etiqueta = "Cotizada";
      etapaSecundaria = jobStage;
      break;
    case "assigned":
      etiqueta = "Asignada";
      etapaSecundaria = jobStage;
      break;
    case "in_progress":
      switch (jobStage) {
        case null:
        case "hired":
          etiqueta = "Profesional contratado";
          estilo = "bg-emerald-100 text-emerald-800";
          break;
        case "on_the_way":
          etiqueta = "Profesional en camino";
          estilo = "bg-sky-100 text-sky-800";
          break;
        case "arrived":
          etiqueta = "Profesional llegó";
          estilo = "bg-purple-100 text-purple-800";
          break;
        case "working":
          etiqueta = "Trabajo iniciado";
          estilo = "bg-amber-100 text-amber-800";
          break;
        case "completed":
          etiqueta = "Posible inconsistencia";
          inconsistencia = true;
          break;
        default:
          etapaSecundaria = jobStage;
      }
      break;
    default:
      etapaSecundaria = jobStage;
  }

  return { etiqueta, estilo, inconsistencia, etapaSecundaria };
}

export function EstadoAdmin({
  status,
  jobStage,
  contexto,
}: {
  status: string;
  jobStage: string | null;
  contexto: ContextoEstado;
}) {
  const estado = presentacionEstadoAdmin(status, jobStage, contexto);
  const detalle = contexto === "trabajo";
  const estilo = estado.inconsistencia
    ? "bg-amber-100 text-amber-900"
    : detalle ? "bg-white/10" : estado.estilo;

  return (
    <div className="min-w-0">
      <span
        className={
          (detalle
            ? "inline-block w-fit rounded-full px-4 py-2 text-sm font-black "
            : "rounded-full px-3 py-1 text-sm font-extrabold ") + estilo
        }
      >
        {estado.etiqueta}
      </span>
      {estado.inconsistencia && (
        <div className="mt-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {estado.etiqueta !== "Posible inconsistencia" && (
            <p className="font-extrabold">Posible inconsistencia</p>
          )}
          <p className="break-all">
            status: {status} · job_stage: {jobStage}
          </p>
        </div>
      )}
      {estado.etapaSecundaria !== null && (
        <p className={"mt-2 break-all text-sm " + (detalle ? "text-slate-300" : "text-slate-500")}>
          Etapa registrada (job_stage): {estado.etapaSecundaria}
        </p>
      )}
    </div>
  );
}
