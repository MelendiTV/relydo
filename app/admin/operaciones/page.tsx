"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import {
  AdminRole,
  hasAdminPermission,
  isAdminRole,
} from "@/app/lib/adminPermissions";
import {
  getProviderRequirements,
  requirementLabel,
} from "@/app/lib/providerRequirements";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

type Provider = {
  user_id: string;
  business_name: string | null;
  bio: string | null;
  trade: string | null;

  legal_name?: string | null;
  email?: string | null;
  phone?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  zip_code?: string | null;

  years_experience: number | null;
  service_radius_miles: number | null;

  license_required: boolean | null;
  license_number: string | null;
  license_state: string | null;
  license_expiration: string | null;

  insured: boolean | null;
  insurance_company: string | null;
  insurance_expiration: string | null;

  bonded: boolean | null;

  verification_status: string | null;
  verified: boolean | null;
  active: boolean | null;

  average_rating: number | null;
  completed_jobs: number | null;

  created_at?: string | null;
};

type ProviderContact = {
  id: string;
  full_name?: string | null;
  legal_name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  apartment?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  zip_code?: string | null;
};

type DocumentRow = {
  id?: string;
  user_id: string;
  document_type: string;
  file_path: string;
  status: string | null;
  rejection_reason?: string | null;
  created_at?: string | null;
  reviewed_at?: string | null;
  expiration_date?: string | null;
  approved_at?: string | null;
  reviewed_by?: string | null;
};

type ProviderDocumentRequest = {
  id: string;
  provider_id: string;
  requested_by: string | null;
  request_type: string;
  document_type: string | null;
  message: string;
  status: string;
  requested_at: string;
  submitted_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type ReassignmentHistory = {
  id: string;
  request_id: string;
  provider_id: string | null;
  action: string;
  reason: string | null;
  created_at: string;
};

type TrabajoHistorial = {
  id: string;
  title: string;
  city: string;
  state: string;
  status: string;
};

type ProviderHistorial = {
  user_id: string;
  business_name: string | null;
  trade: string | null;
};

type HistorialCompleto = ReassignmentHistory & {
  trabajo: TrabajoHistorial | null;
  profesional: ProviderHistorial | null;
};

type SolicitudAdmin = {
  id: string;
  customer_id: string | null;
  title: string;
  description: string;
  address_line1: string | null;
  address_line2: string | null;
  city: string;
  state: string;
  zip_code: string;
  preferred_date: string | null;
  preferred_time: string | null;
  status: string;
  created_at: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  preferred_provider_id: string | null;
  job_stage: string | null;
  cancellation_reason: string | null;
  cancelled_at: string | null;
};

type JobClaim = {
  id: string;
  request_id: string;
  customer_id: string;
  provider_id: string;
  reason: string;
  description: string | null;
  customer_evidence_note: string | null;
  provider_response: string | null;
  provider_response_deadline: string | null;
  provider_responded_at: string | null;
  status: "open" | "reviewing" | "resolved" | "rejected";
  resolution_notes: string | null;
  resolution_type:
    | "pay_provider"
    | "refund_customer"
    | "partial"
    | null;
  provider_award_amount: number | null;
  customer_refund_amount: number | null;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
  updated_at: string;
};

type ClaimEvidenceAdmin = {
  id: string;
  claim_id: string;
  uploaded_by: string;
  uploaded_by_role: "customer" | "provider";
  file_type: "image" | "video";
  file_url: string;
  file_path: string;
  created_at: string;
  signed_url: string | null;
};

type FiltroOrden =
  | "todas"
  | "open"
  | "in_progress"
  | "completed"
  | "cancelled";

type FiltroProfesional =
  | "todos"
  | "activos"
  | "suspendidos"
  | "pendientes"
  | "rechazados";

type FiltroReclamo =
  | "todos"
  | "open"
  | "reviewing"
  | "closed";

function nombreOficio(
  trade: string | null
) {
  const nombres: Record<string, string> = {
    plumbing: "Plomería",
    electrical: "Electricidad",
    hvac: "HVAC / Aire acondicionado",
    carpentry: "Carpintería",
    painting: "Pintura",
    landscaping: "Jardinería",
    cleaning: "Limpieza",
    moving: "Mudanzas",
    other: "Otros servicios",
  };

  if (!trade) {
    return "No indicado";
  }

  return nombres[trade] || trade;
}

function formatearFecha(
  fecha: string | null | undefined
) {
  if (!fecha) {
    return "Sin fecha";
  }

  const valor = String(fecha).trim();
  if (!valor) {
    return "Sin fecha";
  }

  const fechaObj = new Date(valor);
  if (Number.isNaN(fechaObj.getTime())) {
    return "Fecha no disponible";
  }

  try {
    return new Intl.DateTimeFormat(
      "es-US",
      {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }
    ).format(fechaObj);
  } catch {
    return "Fecha no disponible";
  }
}

function calcularEstadoPlazoProfesional(
  deadline: string | null,
  providerResponse: string | null
) {
  if (providerResponse) {
    return {
      vencido: false,
      puedeResolver: true,
      texto: "Profesional respondió",
    };
  }

  if (!deadline) {
    return {
      vencido: false,
      puedeResolver: false,
      texto: "Esperando fecha límite",
    };
  }

  const diferencia =
    new Date(deadline).getTime() -
    Date.now();

  if (diferencia <= 0) {
    return {
      vencido: true,
      puedeResolver: true,
      texto: "Plazo vencido",
    };
  }

  const totalMinutos =
    Math.floor(
      diferencia / 60000
    );

  const horas =
    Math.floor(
      totalMinutos / 60
    );

  const minutos =
    totalMinutos % 60;

  return {
    vencido: false,
    puedeResolver: false,
    texto:
      horas > 0
        ? `${horas} h ${minutos} min restantes`
        : `${minutos} min restantes`,
  };
}

function nombreAccion(
  action: string
) {
  if (
    action ===
    "provider_released"
  ) {
    return "Profesional liberó el trabajo";
  }

  return action;
}

function nombreEstadoReclamo(
  status: JobClaim["status"]
) {
  if (status === "open") {
    return "Abierto";
  }

  if (status === "reviewing") {
    return "En revisión";
  }

  if (status === "resolved") {
    return "Resuelto";
  }

  return "Rechazado";
}

function estiloEstadoReclamo(
  status: JobClaim["status"]
) {
  if (status === "open") {
    return "bg-red-100 text-red-800";
  }

  if (status === "reviewing") {
    return "bg-amber-100 text-amber-800";
  }

  if (status === "resolved") {
    return "bg-green-100 text-green-800";
  }

  return "bg-slate-200 text-slate-700";
}

function nombreEstadoCuenta(
  provider: Provider
) {
  if (
    provider.verification_status ===
    "rejected"
  ) {
    return "Rechazado";
  }

  if (
    provider.verified === true &&
    provider.active === true
  ) {
    return "Activo";
  }

  if (
    provider.verified === true &&
    provider.active !== true
  ) {
    return "Suspendido";
  }

  if (
    provider.verification_status ===
    "pending"
  ) {
    return "Pendiente";
  }

  return "Inactivo";
}

function estiloEstadoCuenta(
  provider: Provider
) {
  if (
    provider.verification_status ===
    "rejected"
  ) {
    return "bg-red-100 text-red-800";
  }

  if (
    provider.verified === true &&
    provider.active === true
  ) {
    return "bg-green-100 text-green-800";
  }

  if (
    provider.verified === true &&
    provider.active !== true
  ) {
    return "bg-amber-100 text-amber-800";
  }

  if (
    provider.verification_status ===
    "pending"
  ) {
    return "bg-blue-100 text-blue-800";
  }

  return "bg-slate-100 text-slate-700";
}

function nombreEstadoOrden(
  status: string,
  jobStage: string | null
) {
  if (status === "open") {
    return "Abierta";
  }

  if (status === "completed") {
    return "Completada";
  }

  if (status === "cancelled") {
    return "Cancelada";
  }

  if (status === "in_progress") {
    if (jobStage === "on_the_way") {
      return "Profesional en camino";
    }

    if (jobStage === "arrived") {
      return "Profesional llegó";
    }

    if (jobStage === "working") {
      return "Trabajo iniciado";
    }

    return "Profesional contratado";
  }

  return status;
}

function estiloEstadoOrden(
  status: string,
  jobStage: string | null
) {
  if (status === "open") {
    return "bg-blue-100 text-blue-800";
  }

  if (status === "completed") {
    return "bg-green-100 text-green-800";
  }

  if (status === "cancelled") {
    return "bg-red-100 text-red-800";
  }

  if (status === "in_progress") {
    if (jobStage === "working") {
      return "bg-amber-100 text-amber-800";
    }

    if (jobStage === "arrived") {
      return "bg-purple-100 text-purple-800";
    }

    if (jobStage === "on_the_way") {
      return "bg-sky-100 text-sky-800";
    }

    return "bg-emerald-100 text-emerald-800";
  }

  return "bg-slate-100 text-slate-700";
}

export default function AdminPage() {
  const router =
    useRouter();

  /*
    PROFESIONALES PENDIENTES
  */

  const [
    providers,
    setProviders,
  ] =
    useState<Provider[]>([]);

  /*
    TODOS LOS PROFESIONALES
  */

  const [
    todosProviders,
    setTodosProviders,
  ] =
    useState<Provider[]>([]);

  const [
    providerContacts,
    setProviderContacts,
  ] =
    useState<Record<string, ProviderContact>>({});

  const [
    documents,
    setDocuments,
  ] =
    useState<DocumentRow[]>([]);

  const [
    solicitudesDocumentos,
    setSolicitudesDocumentos,
  ] =
    useState<ProviderDocumentRequest[]>([]);

  const [
    expedientesAbiertos,
    setExpedientesAbiertos,
  ] =
    useState<string[]>([]);

  const [
    gestionProfesionalesAbierta,
    setGestionProfesionalesAbierta,
  ] = useState(false);

  const [
    historial,
    setHistorial,
  ] =
    useState<HistorialCompleto[]>(
      []
    );

  const [
    solicitudesAdmin,
    setSolicitudesAdmin,
  ] =
    useState<SolicitudAdmin[]>(
      []
    );

  const [
    reclamos,
    setReclamos,
  ] =
    useState<JobClaim[]>(
      []
    );

  const [
    evidenciasReclamos,
    setEvidenciasReclamos,
  ] =
    useState<ClaimEvidenceAdmin[]>(
      []
    );

  const [
    filtroReclamo,
    setFiltroReclamo,
  ] =
    useState<FiltroReclamo>(
      "todos"
    );

  const [
    procesandoReclamo,
    setProcesandoReclamo,
  ] =
    useState<string | null>(
      null
    );

  const [
    relojReclamos,
    setRelojReclamos,
  ] =
    useState(
      Date.now()
    );

  const [
    buscandoOrden,
    setBuscandoOrden,
  ] =
    useState("");

  const [
    filtroOrden,
    setFiltroOrden,
  ] =
    useState<FiltroOrden>(
      "todas"
    );

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    verificandoAdmin,
    setVerificandoAdmin,
  ] =
    useState(true);

  const [
    error,
    setError,
  ] =
    useState("");

  const [
    adminEmail,
    setAdminEmail,
  ] =
    useState("");

  const [
    adminRole,
    setAdminRole,
  ] =
    useState<AdminRole | null>(
      null
    );

  const [
    mensaje,
    setMensaje,
  ] =
    useState("");

  const [
    procesando,
    setProcesando,
  ] =
    useState<string | null>(
      null
    );

  const [
    buscando,
    setBuscando,
  ] =
    useState("");

  const [
    filtro,
    setFiltro,
  ] =
    useState<FiltroProfesional>(
      "todos"
    );

  /*
    SOLICITAR DOCUMENTOS AL PROFESIONAL
  */

  const [
    solicitudDocsProvider,
    setSolicitudDocsProvider,
  ] =
    useState<Provider | null>(
      null
    );

  const [
    solicitudDocsTipo,
    setSolicitudDocsTipo,
  ] =
    useState<
      | "all"
      | "license"
      | "insurance"
      | "bond"
      | "other"
    >("all");

  const [
    solicitudDocsMensaje,
    setSolicitudDocsMensaje,
  ] =
    useState("");

  const [
    solicitudDocsError,
    setSolicitudDocsError,
  ] =
    useState("");

  const [
    solicitandoDocs,
    setSolicitandoDocs,
  ] =
    useState(false);

  const [
    solicitudDocsPorEmail,
    setSolicitudDocsPorEmail,
  ] =
    useState(true);

  const [
    solicitudDocsPorSms,
    setSolicitudDocsPorSms,
  ] =
    useState(false);


  /*
    MODAL DE RESOLUCIÓN PARCIAL
  */

  const [
    reclamoParcial,
    setReclamoParcial,
  ] =
    useState<JobClaim | null>(
      null
    );

  const [
    totalPagoParcial,
    setTotalPagoParcial,
  ] =
    useState(0);

  const [
    maxProfesionalParcial,
    setMaxProfesionalParcial,
  ] =
    useState(0);

  const [
    montoProfesionalParcial,
    setMontoProfesionalParcial,
  ] =
    useState("");

  const [
    notaParcial,
    setNotaParcial,
  ] =
    useState("");

  const [
    errorParcial,
    setErrorParcial,
  ] =
    useState("");

  const [
    cargandoParcial,
    setCargandoParcial,
  ] =
    useState(false);

  /*
    CARGA INICIAL
  */

  useEffect(() => {
    verificarAdmin();
  }, []);

  useEffect(() => {
    const timer =
      window.setInterval(
        () => {
          setRelojReclamos(
            Date.now()
          );
        },
        60 * 1000
      );

    return () => {
      window.clearInterval(
        timer
      );
    };
  }, []);

  /*
    VERIFICAR ADMIN
  */

  async function verificarAdmin() {
    setVerificandoAdmin(
      true
    );

    setError("");

    const {
      data: {
        user,
      },
      error:
        authError,
    } =
      await supabase.auth.getUser();

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
        email,
        admin_role
      `)
      .eq("id", user.id)
      .maybeSingle();

    if (
      adminProfileError ||
      !adminProfile ||
      adminProfile.role !== "admin" ||
      !isAdminRole(adminProfile.admin_role)
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
        "providers"
      )
    ) {
      router.replace("/admin");
      return;
    }

    setAdminEmail(
      user.email ||
      adminProfile.email ||
      "Administrador"
    );

    setAdminRole(
      adminProfile.admin_role
    );

    setVerificandoAdmin(
      false
    );

    await cargarDatos();
  }

  /*
    CARGAR DATOS
  */

  async function cargarDatos(mostrarLoading = true) {
    if (mostrarLoading) {
      setLoading(
        true
      );
    }

    setError("");

    try {

      /*
        TODOS LOS PROFESIONALES
      */

      const {
        data:
          todosProviderData,
        error:
          todosProviderError,
      } = await supabase
        .from(
          "provider_profiles"
        )
        .select("*")
        .order(
          "created_at",
          {
            ascending: false,
          }
        );

      if (
        todosProviderError
      ) {
        throw new Error(
          `Error cargando profesionales: ${todosProviderError.message}`
        );
      }

      const todos =
        (todosProviderData ||
          []) as Provider[];

      setTodosProviders(
        todos
      );

      /*
        DATOS PERSONALES / CONTACTO DE PROFESIONALES
      */

      const providerIds = todos
        .map((provider) => provider.user_id)
        .filter(Boolean);

      if (providerIds.length > 0) {
        const {
          data: providerContactData,
          error: providerContactError,
        } = await supabase
          .from("profiles")
          .select("*")
          .in("id", providerIds);

        if (providerContactError) {
          console.error(
            "No se pudo cargar la información personal de los profesionales:",
            providerContactError
          );

          setProviderContacts({});
        } else {
          const contactos =
            (providerContactData || []) as ProviderContact[];

          const contactosPorId = contactos.reduce<
            Record<string, ProviderContact>
          >((acumulado, contacto) => {
            acumulado[contacto.id] = contacto;
            return acumulado;
          }, {});

          setProviderContacts(contactosPorId);
        }
      } else {
        setProviderContacts({});
      }

      /*
        SOLO PENDIENTES
      */

      const pendientes =
        todos.filter(
          (provider) =>
            provider.verification_status ===
            "pending"
        );

      setProviders(
        pendientes
      );

      /*
        DOCUMENTOS
      */

      const {
        data:
          documentData,
        error:
          documentError,
      } = await supabase
        .from(
          "provider_documents"
        )
        .select("*");

      if (
        documentError
      ) {
        throw new Error(
          `Error cargando documentos: ${documentError.message}`
        );
      }

      setDocuments(
        (documentData ||
          []) as DocumentRow[]
      );

      /*
        SOLICITUDES DE DOCUMENTACIÓN
      */

      const {
        data: solicitudesDocumentosData,
        error: solicitudesDocumentosError,
      } = await supabase
        .from(
          "provider_document_requests"
        )
        .select(`
          id,
          provider_id,
          requested_by,
          request_type,
          document_type,
          message,
          status,
          requested_at,
          submitted_at,
          completed_at,
          created_at,
          updated_at
        `)
        .order(
          "requested_at",
          { ascending: false }
        );

      if (solicitudesDocumentosError) {
        throw new Error(
          `Error cargando solicitudes de documentación: ${solicitudesDocumentosError.message}`
        );
      }

      setSolicitudesDocumentos(
        (solicitudesDocumentosData ||
          []) as ProviderDocumentRequest[]
      );

      /*
        TODAS LAS ÓRDENES
        DE LA PLATAFORMA
      */

      const {
        data: solicitudesData,
        error: solicitudesError,
      } = await supabase
        .from(
          "service_requests"
        )
        .select(`
          id,
          customer_id,
          title,
          description,
          address_line1,
          address_line2,
          city,
          state,
          zip_code,
          preferred_date,
          preferred_time,
          status,
          created_at,
          customer_name,
          customer_phone,
          customer_email,
          preferred_provider_id,
          job_stage,
          cancellation_reason,
          cancelled_at
        `)
        .order(
          "created_at",
          {
            ascending: false,
          }
        )
        .limit(1000);

      if (solicitudesError) {
        throw new Error(
          `Error cargando órdenes: ${solicitudesError.message}`
        );
      }

      setSolicitudesAdmin(
        (solicitudesData ||
          []) as SolicitudAdmin[]
      );

      /*
        RECLAMOS
      */

      const {
        data: reclamosData,
        error: reclamosError,
      } = await supabase
        .from("job_claims")
        .select(`
          id,
          request_id,
          customer_id,
          provider_id,
          reason,
          description,
          customer_evidence_note,
          provider_response,
          provider_response_deadline,
          provider_responded_at,
          status,
          resolution_notes,
          resolution_type,
          provider_award_amount,
          customer_refund_amount,
          resolved_at,
          resolved_by,
          created_at,
          updated_at
        `)
        .order(
          "created_at",
          {
            ascending: false,
          }
        )
        .limit(500);

      if (reclamosError) {
        throw new Error(
          `Error cargando reclamos: ${reclamosError.message}`
        );
      }

      setReclamos(
        (reclamosData || []) as JobClaim[]
      );

      /*
        EVIDENCIAS DE RECLAMOS
      */

      const {
        data: evidenciasData,
        error: evidenciasError,
      } = await supabase
        .from("claim_evidence")
        .select(`
          id,
          claim_id,
          uploaded_by,
          uploaded_by_role,
          file_type,
          file_url,
          file_path,
          created_at
        `)
        .order(
          "created_at",
          {
            ascending: true,
          }
        )
        .limit(2000);

      if (evidenciasError) {
        console.error(
          "Error cargando evidencias de reclamos:",
          evidenciasError
        );

        setEvidenciasReclamos([]);
      } else {
        const evidenciasBase =
          (evidenciasData ||
            []) as Omit<
              ClaimEvidenceAdmin,
              "signed_url"
            >[];

        const evidenciasConUrl =
          await Promise.all(
            evidenciasBase.map(
              async (
                evidencia
              ) => {
                const ruta =
                  evidencia.file_path ||
                  evidencia.file_url;

                const {
                  data:
                    signedData,
                  error:
                    signedError,
                } =
                  await supabase.storage
                    .from(
                      "claim-evidence"
                    )
                    .createSignedUrl(
                      ruta,
                      60 * 60
                    );

                if (signedError) {
                  console.error(
                    "No se pudo crear URL firmada para evidencia:",
                    evidencia.id,
                    signedError
                  );
                }

                return {
                  ...evidencia,
                  signed_url:
                    signedData?.signedUrl ||
                    null,
                };
              }
            )
          );

        setEvidenciasReclamos(
          evidenciasConUrl
        );
      }

      /*
        HISTORIAL
      */

      const {
        data:
          historialData,
        error:
          historialError,
      } = await supabase
        .from(
          "job_reassignment_history"
        )
        .select(`
          id,
          request_id,
          provider_id,
          action,
          reason,
          created_at
        `)
        .order(
          "created_at",
          {
            ascending: false,
          }
        )
        .limit(
          500
        );

      if (
        historialError
      ) {
        throw new Error(
          `Error cargando historial de reasignaciones: ${historialError.message}`
        );
      }

      const historialBase =
        (historialData ||
          []) as ReassignmentHistory[];

      if (
        historialBase.length ===
        0
      ) {
        setHistorial(
          []
        );

        return;
      }

      /*
        REQUEST IDS
      */

      const requestIds =
        [
          ...new Set(
            historialBase.map(
              (item) =>
                item.request_id
            )
          ),
        ];

      /*
        PROVIDER IDS
      */

      const historialProviderIds: string[] = [
        ...new Set(
          historialBase.flatMap((item) =>
            item.provider_id ? [item.provider_id] : []
          )
        ),
      ];

      /*
        DATOS DE TRABAJOS
      */

      let trabajos:
        TrabajoHistorial[] =
        [];

      if (
        requestIds.length >
        0
      ) {
        const {
          data:
            trabajosData,
          error:
            trabajosError,
        } = await supabase
          .from(
            "service_requests"
          )
          .select(`
            id,
            title,
            city,
            state,
            status
          `)
          .in(
            "id",
            requestIds
          );

        if (
          trabajosError
        ) {
          console.error(
            "No se pudo cargar información de los trabajos:",
            trabajosError
          );
        } else {
          trabajos =
            (trabajosData ||
              []) as TrabajoHistorial[];
        }
      }

      /*
        DATOS PROFESIONALES
        DEL HISTORIAL
      */

      let profesionales:
        ProviderHistorial[] =
        [];

      if (
        historialProviderIds.length >
        0
      ) {
        const {
          data:
            profesionalesData,
          error:
            profesionalesError,
        } = await supabase
          .from(
            "provider_profiles"
          )
          .select(`
            user_id,
            business_name,
            trade
          `)
          .in(
            "user_id",
            historialProviderIds
          );

        if (
          profesionalesError
        ) {
          console.error(
            "No se pudo cargar información de los profesionales:",
            profesionalesError
          );
        } else {
          profesionales =
            (profesionalesData ||
              []) as ProviderHistorial[];
        }
      }

      /*
        COMBINAR HISTORIAL
      */

      const historialCompleto =
        historialBase.map(
          (item) => ({
            ...item,

            trabajo:
              trabajos.find(
                (trabajo) =>
                  trabajo.id ===
                  item.request_id
              ) ||
              null,

            profesional:
              item.provider_id
                ? profesionales.find(
                    (
                      profesional
                    ) =>
                      profesional.user_id ===
                      item.provider_id
                  ) ||
                  null
                : null,
          })
        );

      setHistorial(
        historialCompleto
      );
    } catch (err) {
      console.error(
        "Error cargando admin:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : "Ocurrió un error inesperado."
      );
    } finally {
      if (mostrarLoading) {
        setLoading(
          false
        );
      }
    }
  }

  /*
    CONTAR LIBERACIONES
  */

  function contarLiberaciones(
    providerId: string
  ) {
    return historial.filter(
      (item) =>
        item.provider_id ===
          providerId &&
        item.action ===
          "provider_released"
    ).length;
  }

  function datosContactoProfesional(
    provider: Provider
  ) {
    const profile =
      providerContacts[provider.user_id] || null;

    const nombre =
      profile?.full_name ||
      profile?.legal_name ||
      provider.legal_name ||
      "No registrado";

    const email =
      profile?.email ||
      provider.email ||
      "No registrado";

    const phone =
      profile?.phone ||
      provider.phone ||
      "No registrado";

    const addressLine1 =
      profile?.address_line1 ||
      profile?.address ||
      provider.address_line1 ||
      "";

    const addressLine2 =
      profile?.address_line2 ||
      profile?.apartment ||
      provider.address_line2 ||
      "";

    const city =
      profile?.city ||
      provider.city ||
      "";

    const state =
      profile?.state ||
      provider.state ||
      "";

    const zip =
      profile?.zip ||
      profile?.zip_code ||
      provider.zip ||
      provider.zip_code ||
      "";

    const direccionPartes = [
      addressLine1,
      addressLine2,
    ].filter((parte) => String(parte || "").trim());

    return {
      nombre,
      email,
      phone,
      direccion:
        direccionPartes.length > 0
          ? direccionPartes.join(", ")
          : "No registrada",
      city: city || "No registrada",
      state: state || "No registrado",
      zip: zip || "No registrado",
    };
  }

  function direccionRegistradaLimpia(contacto: {
    direccion: string;
    city: string;
    state: string;
    zip: string;
  }) {
    let direccion = String(contacto.direccion || "").trim();

    const partesUbicacion = [
      contacto.city,
      contacto.state,
      contacto.zip,
    ].filter(
      (valor) =>
        valor &&
        !String(valor).toLowerCase().startsWith("no ")
    );

    const sufijo = partesUbicacion.join(", ");

    if (
      sufijo &&
      direccion.toLowerCase().endsWith(
        sufijo.toLowerCase()
      )
    ) {
      direccion = direccion
        .slice(0, direccion.length - sufijo.length)
        .replace(/,\s*$/, "")
        .trim();
    }

    return direccion || "No registrada";
  }

  /*
    DOCUMENTOS USUARIO
  */

  function docsDelUsuario(
    userId: string
  ) {
    return documents.filter(
      (doc) =>
        doc.user_id ===
        userId
    );
  }


  function documentosOrdenados(userId: string) {
    return docsDelUsuario(userId).slice().sort((a, b) =>
      new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    );
  }

  function fechaDocumentoVencida(
    fecha: string | null | undefined
  ) {
    const valor =
      String(fecha || "").trim();

    if (!valor) {
      return false;
    }

    const fechaObj =
      /^\d{4}-\d{2}-\d{2}$/.test(valor)
        ? new Date(
            `${valor}T23:59:59.999`
          )
        : new Date(valor);

    if (
      Number.isNaN(
        fechaObj.getTime()
      )
    ) {
      return false;
    }

    return (
      fechaObj.getTime() <
      Date.now()
    );
  }

  function vencimientoDocumentoBase(
    doc: DocumentRow,
    provider?: Provider | null
  ) {
    if (doc.expiration_date) {
      return doc.expiration_date;
    }

    if (
      provider &&
      doc.document_type === "license"
    ) {
      return provider.license_expiration;
    }

    if (
      provider &&
      doc.document_type === "insurance"
    ) {
      return provider.insurance_expiration;
    }

    return null;
  }

  function documentoAprobadoYVigente(
    doc: DocumentRow,
    provider?: Provider | null
  ) {
    if (
      doc.status !== "approved"
    ) {
      return false;
    }

    const vencimiento =
      vencimientoDocumentoBase(
        doc,
        provider
      );

    return !fechaDocumentoVencida(
      vencimiento
    );
  }

  function documentoVigente(
    userId: string,
    tipo: string,
    provider?: Provider | null
  ) {
    return (
      documentosOrdenados(userId).find(
        (doc) =>
          doc.document_type === tipo &&
          documentoAprobadoYVigente(
            doc,
            provider
          )
      ) || null
    );
  }

  function requisitosProfesional(
    provider: Provider
  ) {
    return getProviderRequirements({
      trade: provider.trade,
      state: provider.state,
      declaredLicenseRequired:
        provider.license_required,
      declaredInsured:
        provider.insured,
      declaredBonded:
        provider.bonded,
    });
  }

  function documentoEsRequerido(
    provider: Provider,
    tipo: string
  ) {
    const requisitos =
      requisitosProfesional(provider);

    if (tipo === "license") {
      return requisitos.effectiveLicenseRequired;
    }

    if (tipo === "insurance") {
      return requisitos.effectiveInsuranceRequired;
    }

    if (tipo === "bond") {
      return requisitos.effectiveBondRequired;
    }

    return false;
  }

  function tiposDocumentosRequeridos(
    provider: Provider
  ) {
    return ["license", "insurance", "bond"].filter(
      (tipo) => documentoEsRequerido(provider, tipo)
    );
  }

  function documentosRequeridosFaltantes(
    provider: Provider
  ) {
    return tiposDocumentosRequeridos(provider).filter(
      (tipo) =>
        !documentoVigente(
          provider.user_id,
          tipo,
          provider
        )
    );
  }

  function documentosPendientesRevision(userId: string) {
    return documentosOrdenados(userId).filter(
      (doc) => doc.status === "pending" || doc.status === "submitted"
    );
  }

  function documentosHistoricos(
    userId: string,
    provider?: Provider | null
  ) {
    const ordenados =
      documentosOrdenados(userId);

    const vigentes =
      new Set<string>();

    for (
      const tipo of [
        "license",
        "insurance",
        "bond",
        "other",
      ]
    ) {
      const actual =
        documentoVigente(
          userId,
          tipo,
          provider
        );

      if (actual?.id) {
        vigentes.add(actual.id);
      }
    }

    return ordenados.filter(
      (doc) =>
        doc.status !== "pending" &&
        doc.status !== "submitted" &&
        (
          !doc.id ||
          !vigentes.has(doc.id)
        )
    );
  }

  async function revisarDocumento(doc: DocumentRow, decision: "approved" | "rejected") {
    if (!doc.id) {
      setError("Este documento no tiene un ID válido.");
      return;
    }

    let motivo = "";
    if (decision === "rejected") {
      const respuesta = window.prompt("Escribe el motivo del rechazo para que el profesional pueda corregirlo:");
      if (respuesta === null) return;
      motivo = respuesta.trim();
      if (!motivo) {
        setError("Debes escribir el motivo del rechazo.");
        return;
      }
    }

    const confirmar = window.confirm(
      decision === "approved"
        ? `¿Aprobar este documento de ${nombreTipoDocumento(doc.document_type)}? Se convertirá en el documento vigente.`
        : `¿Rechazar este documento de ${nombreTipoDocumento(doc.document_type)}?`
    );
    if (!confirmar) return;

    setProcesando(doc.id);
    setError("");
    setMensaje("");

    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) throw new Error("No pudimos verificar tu sesión de administrador.");

      const ahora = new Date().toISOString();
      const { error: docError } = await supabase
        .from("provider_documents")
        .update({
          status: decision,
          rejection_reason: decision === "rejected" ? motivo : null,
          reviewed_at: ahora,
          reviewed_by: user.id,
          approved_at: decision === "approved" ? ahora : null,
        })
        .eq("id", doc.id);
      if (docError) throw new Error(`No se pudo actualizar el documento: ${docError.message}`);

      const solicitudesRelacionadas = solicitudesDocsDelUsuario(doc.user_id).filter(
        (solicitud) =>
          (solicitud.status === "submitted" || solicitud.status === "pending") &&
          (solicitud.document_type === doc.document_type || solicitud.document_type === null)
      );

      if (solicitudesRelacionadas.length > 0) {
        const solicitud = solicitudesRelacionadas[0];
        const { error: solicitudError } = await supabase
          .from("provider_document_requests")
          .update(
            decision === "approved"
              ? { status: "completed", completed_at: ahora, updated_at: ahora }
              : { status: "pending", submitted_at: null, completed_at: null, updated_at: ahora }
          )
          .eq("id", solicitud.id);
        if (solicitudError) throw new Error(`El documento cambió, pero no pudimos actualizar la solicitud: ${solicitudError.message}`);

        if (decision === "rejected") {
          try {
            const {
              data: { session },
            } = await supabase.auth.getSession();

            if (!session?.access_token) {
              throw new Error("La sesión de Admin no tiene un token disponible.");
            }

            const response = await fetch("/api/provider-document-request", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({
                requestId: solicitud.id,
                sendEmail: true,
                sendSms: false,
                notificationType: "rejection",
                documentType: doc.document_type,
                rejectionReason: motivo,
              }),
            });

            const resultado = await response.json().catch(() => ({}));

            if (!response.ok || !resultado?.email?.sent) {
              throw new Error(
                resultado?.email?.error ||
                  resultado?.error ||
                  "No se pudo enviar el correo de rechazo."
              );
            }
          } catch (notificationError) {
            console.error(
              "Documento rechazado, pero falló la notificación al profesional:",
              notificationError
            );

            setError(
              `El documento fue rechazado correctamente, pero no se pudo enviar el correo al profesional: ${
                notificationError instanceof Error
                  ? notificationError.message
                  : "error de notificación"
              }`
            );
          }
        }
      }

      setMensaje(
        decision === "approved"
          ? `${nombreTipoDocumento(doc.document_type)} aprobado. Ya es el documento vigente.`
          : `${nombreTipoDocumento(doc.document_type)} rechazado. El profesional deberá enviarlo nuevamente.`
      );
      await cargarDatos(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo revisar el documento.");
    } finally {
      setProcesando(null);
    }
  }

  function solicitudesDocsDelUsuario(
    userId: string
  ) {
    return solicitudesDocumentos.filter(
      (solicitud) =>
        solicitud.provider_id ===
        userId
    );
  }

  async function eliminarSolicitudDocumentos(
    solicitud: ProviderDocumentRequest
  ) {
    const confirmar =
      window.confirm(
        solicitud.status ===
          "submitted"
          ? "¿Eliminar esta solicitud de documentos? El documento que el profesional ya haya subido NO se eliminará del expediente."
          : "¿Eliminar esta solicitud de documentos? El profesional dejará de verla como solicitud pendiente."
      );

    if (!confirmar) {
      return;
    }

    setProcesando(
      solicitud.id
    );
    setError("");
    setMensaje("");

    try {
      const {
        error:
          deleteError,
      } =
        await supabase
          .from(
            "provider_document_requests"
          )
          .delete()
          .eq(
            "id",
            solicitud.id
          );

      if (deleteError) {
        throw new Error(
          `No se pudo eliminar la solicitud: ${deleteError.message}`
        );
      }

      setMensaje(
        "Solicitud de documentación eliminada correctamente."
      );

      await cargarDatos(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo eliminar la solicitud de documentación."
      );
    } finally {
      setProcesando(
        null
      );
    }
  }

  function toggleExpediente(
    userId: string
  ) {
    setExpedientesAbiertos(
      (actuales) =>
        actuales.includes(userId)
          ? actuales.filter(
              (id) => id !== userId
            )
          : [...actuales, userId]
    );
  }

  function nombreTipoDocumento(
    documentType: string | null
  ) {
    if (!documentType) {
      return "Varios documentos / información adicional";
    }

    if (documentType === "license") {
      return "Licencia";
    }

    if (documentType === "insurance") {
      return "Seguro";
    }

    if (documentType === "bond") {
      return "Bond / Fianza";
    }

    if (documentType === "other") {
      return "Otro documento";
    }

    return documentType;
  }

  function fechaDocumento(
    fecha: string | null | undefined
  ) {
    if (!fecha) {
      return "Sin fecha";
    }

    const valor = String(fecha).trim();
    if (!valor) {
      return "Sin fecha";
    }

    const fechaObj = /^\d{4}-\d{2}-\d{2}$/.test(valor)
      ? new Date(`${valor}T12:00:00`)
      : new Date(valor);

    if (Number.isNaN(fechaObj.getTime())) {
      return "Fecha no disponible";
    }

    try {
      return new Intl.DateTimeFormat(
        "es-US",
        {
          year: "numeric",
          month: "short",
          day: "numeric",
        }
      ).format(fechaObj);
    } catch {
      return "Fecha no disponible";
    }
  }

  function vencimientoDocumento(
    doc: DocumentRow,
    provider: Provider
  ) {
    return vencimientoDocumentoBase(
      doc,
      provider
    );
  }

  /*
    ABRIR DOCUMENTO
  */

  async function abrirDocumento(
    filePath: string | null | undefined
  ) {
    setError("");

    const ruta = String(filePath || "").trim();

    if (!ruta) {
      setError(
        "Este documento no tiene una ruta de archivo válida."
      );
      return;
    }

    const {
      data,
      error: signedUrlError,
    } = await supabase.storage
      .from("provider-documents")
      .createSignedUrl(ruta, 60);

    if (signedUrlError) {
      setError(
        `No se pudo abrir el documento: ${signedUrlError.message}`
      );
      return;
    }

    if (!data?.signedUrl) {
      setError(
        "No se pudo generar el enlace del documento."
      );
      return;
    }

    window.open(
      data.signedUrl,
      "_blank",
      "noopener,noreferrer"
    );
  }

  /*
    SOLICITAR DOCUMENTOS
  */

  function abrirSolicitudDocumentos(
    provider: Provider
  ) {
    const contacto =
      datosContactoProfesional(
        provider
      );

    const tieneEmail =
      contacto.email !==
      "No registrado";

    const tieneTelefono =
      contacto.phone !==
      "No registrado";

    setSolicitudDocsProvider(
      provider
    );
    setSolicitudDocsTipo(
      "all"
    );
    setSolicitudDocsMensaje(
      ""
    );
    setSolicitudDocsError(
      ""
    );

    // Email queda seleccionado por defecto cuando existe.
    // Si no hay email pero sí teléfono, usamos SMS por defecto.
    setSolicitudDocsPorEmail(
      tieneEmail
    );
    setSolicitudDocsPorSms(
      !tieneEmail &&
        tieneTelefono
    );
  }

  function cerrarSolicitudDocumentos() {
    if (solicitandoDocs) {
      return;
    }

    setSolicitudDocsProvider(
      null
    );
    setSolicitudDocsTipo(
      "all"
    );
    setSolicitudDocsMensaje(
      ""
    );
    setSolicitudDocsError(
      ""
    );
    setSolicitudDocsPorEmail(
      true
    );
    setSolicitudDocsPorSms(
      false
    );
  }

  async function solicitarDocumentos() {
    if (!solicitudDocsProvider) {
      return;
    }

    const mensajeSolicitud =
      solicitudDocsMensaje.trim();

    if (!mensajeSolicitud) {
      setSolicitudDocsError(
        "Escribe qué documento o información necesita enviar el profesional."
      );
      return;
    }

    const contacto =
      datosContactoProfesional(
        solicitudDocsProvider
      );

    const tieneEmail =
      contacto.email !==
      "No registrado";

    const tieneTelefono =
      contacto.phone !==
      "No registrado";

    if (
      solicitudDocsPorEmail &&
      !tieneEmail
    ) {
      setSolicitudDocsError(
        "Este profesional no tiene un correo electrónico registrado."
      );
      return;
    }

    if (
      solicitudDocsPorSms &&
      !tieneTelefono
    ) {
      setSolicitudDocsError(
        "Este profesional no tiene un teléfono registrado."
      );
      return;
    }

    setSolicitandoDocs(true);
    setSolicitudDocsError(
      ""
    );
    setError(
      ""
    );
    setMensaje(
      ""
    );

    try {
      const {
        data: { user },
        error: authError,
      } =
        await supabase.auth.getUser();

      if (authError || !user) {
        throw new Error(
          "No pudimos verificar tu sesión de administrador."
        );
      }

      const documentType =
        solicitudDocsTipo ===
        "all"
          ? null
          : solicitudDocsTipo;

      const {
        data:
          solicitudCreada,
        error:
          insertError,
      } =
        await supabase
          .from(
            "provider_document_requests"
          )
          .insert({
            provider_id:
              solicitudDocsProvider.user_id,
            requested_by:
              user.id,
            request_type:
              "manual",
            document_type:
              documentType,
            message:
              mensajeSolicitud,
            status:
              "pending",
          })
          .select("id")
          .single();

      if (
        insertError ||
        !solicitudCreada?.id
      ) {
        throw new Error(
          `No se pudo crear la solicitud de documentos: ${
            insertError?.message ||
            "No se obtuvo el ID de la solicitud."
          }`
        );
      }

      const nombre =
        solicitudDocsProvider.business_name ||
        "el profesional";

      let avisoNotificacion =
        "";

      if (
        solicitudDocsPorEmail ||
        solicitudDocsPorSms
      ) {
        const {
          data: {
            session,
          },
        } =
          await supabase.auth.getSession();

        if (!session?.access_token) {
          avisoNotificacion =
            " La solicitud quedó guardada, pero no se pudo iniciar el envío externo porque la sesión de Admin no tiene un token disponible.";
        } else {
          try {
            const response =
              await fetch(
                "/api/provider-document-request",
                {
                  method:
                    "POST",
                  headers: {
                    "Content-Type":
                      "application/json",
                    Authorization:
                      `Bearer ${session.access_token}`,
                  },
                  body:
                    JSON.stringify({
                      requestId:
                        solicitudCreada.id,
                      sendEmail:
                        solicitudDocsPorEmail,
                      sendSms:
                        solicitudDocsPorSms,
                    }),
                }
              );

            const resultado =
              await response.json();

            if (!response.ok) {
              avisoNotificacion =
                ` La solicitud quedó guardada, pero hubo un problema enviando la notificación: ${
                  resultado?.error ||
                  "Error de notificación."
                }`;
            } else {
              const partes:
                string[] =
                [];

              if (
                solicitudDocsPorEmail
              ) {
                partes.push(
                  resultado?.email?.sent
                    ? "correo enviado"
                    : `correo no enviado${
                        resultado?.email?.error
                          ? ` (${resultado.email.error})`
                          : ""
                      }`
                );
              }

              if (
                solicitudDocsPorSms
              ) {
                partes.push(
                  resultado?.sms?.sent
                    ? "SMS enviado"
                    : `SMS no enviado${
                        resultado?.sms?.error
                          ? ` (${resultado.sms.error})`
                          : ""
                      }`
                );
              }

              if (
                partes.length >
                0
              ) {
                avisoNotificacion =
                  ` Notificación: ${partes.join(
                    " · "
                  )}.`;
              }
            }
          } catch (notificationError) {
            console.error(
              "Error enviando notificación de documentos:",
              notificationError
            );

            avisoNotificacion =
              " La solicitud quedó guardada, pero no se pudo completar el envío externo.";
          }
        }
      }

      setMensaje(
        `Solicitud de documentos creada correctamente para ${nombre}.${avisoNotificacion}`
      );

      setSolicitudDocsProvider(
        null
      );
      setSolicitudDocsTipo(
        "all"
      );
      setSolicitudDocsMensaje(
        ""
      );
      setSolicitudDocsError(
        ""
      );
      setSolicitudDocsPorEmail(
        true
      );
      setSolicitudDocsPorSms(
        false
      );

      await cargarDatos(false);
    } catch (err) {
      setSolicitudDocsError(
        err instanceof Error
          ? err.message
          : "No se pudo enviar la solicitud de documentos."
      );
    } finally {
      setSolicitandoDocs(
        false
      );
    }
  }

  /*
    APROBAR / RECHAZAR
  */

  async function cambiarEstado(
    userId: string,
    nuevoEstado:
      | "verified"
      | "rejected"
  ) {
    setError("");
    setMensaje("");

    const userDocs = docsDelUsuario(userId);
    const docsPendientes = documentosPendientesRevision(userId);
    const solicitudesPendientes = solicitudesDocsDelUsuario(userId).filter(
      (solicitud) =>
        solicitud.status === "pending" ||
        solicitud.status === "submitted"
    );

    const provider =
      todosProviders.find(
        (item) => item.user_id === userId
      ) ||
      providers.find(
        (item) => item.user_id === userId
      ) ||
      null;

    if (
      nuevoEstado === "verified" &&
      !provider
    ) {
      setError(
        "No pudimos cargar la información del profesional para validar sus requisitos."
      );
      return;
    }

    const requeridosFaltantes =
      provider
        ? documentosRequeridosFaltantes(
            provider
          )
        : [];

    const requisitos =
      provider
        ? requisitosProfesional(provider)
        : null;

    if (
      nuevoEstado === "verified" &&
      requisitos?.manualReview === true &&
      adminRole !== "super_admin"
    ) {
      setError(
        "Este oficio requiere revisión manual. Solo el Super Admin puede aprobar manualmente este expediente después de revisar sus requisitos."
      );
      return;
    }

    if (
      nuevoEstado === "verified" &&
      requeridosFaltantes.length > 0
    ) {
      setError(
        `Faltan documentos obligatorios aprobados: ${requeridosFaltantes
          .map((tipo) => nombreTipoDocumento(tipo))
          .join(", ")}.`
      );
      return;
    }

    if (nuevoEstado === "verified" && docsPendientes.length > 0) {
      setError(
        "Todavía hay documentos pendientes de revisión. Apruébalos o recházalos antes de aprobar al profesional."
      );
      return;
    }

    if (nuevoEstado === "verified" && solicitudesPendientes.length > 0) {
      setError(
        "Todavía hay solicitudes de documentación abiertas. Complétalas antes de aprobar al profesional."
      );
      return;
    }

    const requiereOverrideManual =
      nuevoEstado === "verified" &&
      requisitos?.manualReview === true &&
      adminRole === "super_admin";

    const confirmar =
      window.confirm(
        nuevoEstado ===
          "verified"
          ? requiereOverrideManual
            ? "Este expediente requiere revisión manual. Como Super Admin puedes tomar la decisión final. ¿Confirmas que revisaste los requisitos y deseas aprobar este profesional?"
            : "¿Seguro que deseas aprobar este profesional?"
          : "¿Seguro que deseas rechazar este profesional?"
      );

    if (!confirmar) {
      return;
    }

    setProcesando(
      userId
    );

    setError("");
    setMensaje("");

    try {
      const esVerificado =
        nuevoEstado ===
        "verified";

      const {
        error:
          profileError,
      } = await supabase
        .from(
          "provider_profiles"
        )
        .update({
          verification_status:
            nuevoEstado,

          verified:
            esVerificado,

          active:
            esVerificado,
        })
        .eq(
          "user_id",
          userId
        );

      if (
        profileError
      ) {
        throw new Error(
          `No se pudo actualizar el profesional: ${profileError.message}`
        );
      }

      // Los documentos se revisan individualmente. Aprobar la cuenta NO debe
      // aprobar automáticamente archivos pendientes o previamente rechazados.
      if (!esVerificado && userDocs.length > 0) {
        const { error: documentError } = await supabase
          .from("provider_documents")
          .update({ status: "rejected" })
          .eq("user_id", userId)
          .in("status", ["pending", "submitted"]);

        if (documentError) {
          throw new Error(
            `El perfil cambió, pero hubo un problema actualizando los documentos pendientes: ${documentError.message}`
          );
        }
      }

      setMensaje(
        esVerificado
          ? "Profesional verificado correctamente."
          : "Profesional rechazado correctamente."
      );

      await cargarDatos(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Ocurrió un error inesperado."
      );
    } finally {
      setProcesando(
        null
      );
    }
  }

  /*
    REABRIR VERIFICACIÓN
  */

  async function reabrirVerificacion(
    provider: Provider
  ) {
    setError("");
    setMensaje("");

    if (
      provider.verification_status !==
      "rejected"
    ) {
      setError(
        "Solo puedes reabrir un expediente que esté rechazado."
      );
      return;
    }

    const nombre =
      provider.business_name ||
      "este profesional";

    const confirmar =
      window.confirm(
        `¿Reabrir la verificación de ${nombre}? El profesional volverá a estado pendiente y seguirá sin poder operar hasta que sea aprobado nuevamente.`
      );

    if (!confirmar) {
      return;
    }

    setProcesando(
      provider.user_id
    );

    try {
      const { error: profileError } =
        await supabase
          .from(
            "provider_profiles"
          )
          .update({
            verification_status:
              "pending",
            verified: false,
            active: false,
          })
          .eq(
            "user_id",
            provider.user_id
          );

      if (profileError) {
        throw new Error(
          `No se pudo reabrir la verificación: ${profileError.message}`
        );
      }

      // Reabrir el expediente NO borra ni modifica documentos anteriores.
      // Tampoco aprueba la cuenta: el profesional permanece bloqueado en pending.
      setMensaje(
        `Verificación reabierta para ${nombre}. El expediente volvió a estado pendiente.`
      );

      await cargarDatos(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo reabrir la verificación."
      );
    } finally {
      setProcesando(
        null
      );
    }
  }

  /*
    SUSPENDER / REACTIVAR
  */

  async function cambiarActivo(
    provider: Provider,
    nuevoActivo: boolean
  ) {
    setError("");
    setMensaje("");

    if (
      provider.verified !==
      true
    ) {
      setError(
        "Solo puedes suspender o reactivar profesionales que ya estén verificados."
      );

      return;
    }

    const nombre =
      provider.business_name ||
      "este profesional";

    const confirmar =
      window.confirm(
        nuevoActivo
          ? `¿Seguro que deseas reactivar a ${nombre}?`
          : `¿Seguro que deseas suspender a ${nombre}? Mientras esté suspendido no podrá acceder a nuevos trabajos.`
      );

    if (!confirmar) {
      return;
    }

    setProcesando(
      provider.user_id
    );

    try {
      const {
        error:
          updateError,
      } = await supabase
        .from(
          "provider_profiles"
        )
        .update({
          active:
            nuevoActivo,
        })
        .eq(
          "user_id",
          provider.user_id
        );

      if (
        updateError
      ) {
        throw new Error(
          `No se pudo actualizar la cuenta: ${updateError.message}`
        );
      }

      setMensaje(
        nuevoActivo
          ? `${nombre} fue reactivado correctamente.`
          : `${nombre} fue suspendido correctamente.`
      );

      await cargarDatos(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo cambiar el estado del profesional."
      );
    } finally {
      setProcesando(
        null
      );
    }
  }

  /*
    PASAR RECLAMO A REVISIÓN
  */

  async function pasarReclamoARevision(
    reclamo: JobClaim
  ) {
    setError("");
    setMensaje("");

    const confirmar =
      window.confirm(
        "¿Marcar este reclamo como En revisión? El pago continuará retenido."
      );

    if (!confirmar) {
      return;
    }

    setProcesandoReclamo(
      reclamo.id
    );

    try {
      const {
        error: updateError,
      } = await supabase
        .from("job_claims")
        .update({
          status: "reviewing",
          updated_at:
            new Date().toISOString(),
        })
        .eq(
          "id",
          reclamo.id
        );

      if (updateError) {
        throw new Error(
          updateError.message
        );
      }

      setMensaje(
        "Reclamo marcado como En revisión. El pago continúa retenido."
      );

      await cargarDatos(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo actualizar el reclamo."
      );
    } finally {
      setProcesandoReclamo(
        null
      );
    }
  }

  /*
    ABRIR RESOLUCIÓN PARCIAL
  */

  async function abrirResolucionParcial(
    reclamo: JobClaim
  ) {
    setError("");
    setMensaje("");
    setErrorParcial("");
    setNotaParcial("");
    setMontoProfesionalParcial("");
    setCargandoParcial(true);

    try {
      const pago =
        await supabase
          .from("payments")
          .select(`
            provider_net_amount,
            customer_total_amount
          `)
          .eq(
            "request_id",
            reclamo.request_id
          )
          .eq(
            "provider_id",
            reclamo.provider_id
          )
          .eq(
            "customer_id",
            reclamo.customer_id
          )
          .order(
            "updated_at",
            {
              ascending: false,
            }
          )
          .limit(1)
          .maybeSingle();

      if (pago.error) {
        throw new Error(
          `No pudimos consultar los importes del pago: ${pago.error.message}`
        );
      }

      if (!pago.data) {
        throw new Error(
          "No encontramos el pago relacionado con este reclamo."
        );
      }

      const total =
        Number(
          pago.data.customer_total_amount
        );

      const maxProfesional =
        Number(
          pago.data.provider_net_amount
        );

      if (
        !Number.isFinite(total) ||
        total <= 0 ||
        !Number.isFinite(
          maxProfesional
        ) ||
        maxProfesional <= 0
      ) {
        throw new Error(
          "Los importes guardados del pago no son válidos."
        );
      }

      setTotalPagoParcial(
        Math.round(
          (total +
            Number.EPSILON) *
            100
        ) / 100
      );

      setMaxProfesionalParcial(
        Math.round(
          (maxProfesional +
            Number.EPSILON) *
            100
        ) / 100
      );

      setReclamoParcial(
        reclamo
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo abrir la resolución parcial."
      );
    } finally {
      setCargandoParcial(false);
    }
  }

  function cerrarResolucionParcial() {
    if (procesandoReclamo) {
      return;
    }

    setReclamoParcial(null);
    setMontoProfesionalParcial("");
    setNotaParcial("");
    setErrorParcial("");
    setTotalPagoParcial(0);
    setMaxProfesionalParcial(0);
  }

  function montoProfesionalParcialNumero() {
    const numero =
      Number(
        montoProfesionalParcial
      );

    if (
      !Number.isFinite(numero)
    ) {
      return 0;
    }

    return Math.round(
      (numero +
        Number.EPSILON) *
        100
    ) / 100;
  }

  function reembolsoClienteParcialNumero() {
    const profesional =
      montoProfesionalParcialNumero();

    return Math.max(
      0,
      Math.round(
        (
          totalPagoParcial -
          profesional +
          Number.EPSILON
        ) *
          100
      ) / 100
    );
  }

  async function confirmarResolucionParcial() {
    if (!reclamoParcial) {
      return;
    }

    setErrorParcial("");

    const profesional =
      montoProfesionalParcialNumero();

    const cliente =
      reembolsoClienteParcialNumero();

    if (
      !montoProfesionalParcial.trim()
    ) {
      setErrorParcial(
        "Escribe cuánto recibirá el profesional."
      );
      return;
    }

    if (
      !Number.isFinite(
        profesional
      ) ||
      profesional < 0
    ) {
      setErrorParcial(
        "El importe para el profesional no es válido."
      );
      return;
    }

    if (
      profesional >
      maxProfesionalParcial
    ) {
      setErrorParcial(
        `El profesional no puede recibir más de $${maxProfesionalParcial.toFixed(
          2
        )}.`
      );
      return;
    }

    if (
      profesional >
      totalPagoParcial
    ) {
      setErrorParcial(
        `El profesional no puede recibir más de los $${totalPagoParcial.toFixed(
          2
        )} disponibles.`
      );
      return;
    }

    if (!notaParcial.trim()) {
      setErrorParcial(
        "Escribe una nota explicando la resolución."
      );
      return;
    }

    const confirmar =
      window.confirm(
        `¿Confirmas esta resolución?\n\nProfesional: $${profesional.toFixed(
          2
        )}\nCliente: $${cliente.toFixed(
          2
        )}\nTotal: $${totalPagoParcial.toFixed(
          2
        )}`
      );

    if (!confirmar) {
      return;
    }

    await resolverReclamo(
      reclamoParcial,
      "partial",
      {
        notes:
          notaParcial.trim(),
        providerAwardAmount:
          profesional,
        customerRefundAmount:
          cliente,
      }
    );
  }

  /*
    RESOLVER RECLAMO CON DECISIÓN ECONÓMICA
  */

  async function resolverReclamo(
    reclamo: JobClaim,
    action:
      | "pay_provider"
      | "refund_customer"
      | "partial",
    partialData?: {
      notes: string;
      providerAwardAmount: number;
      customerRefundAmount: number;
    }
  ) {
    setError("");
    setMensaje("");

    const estadoPlazo =
      calcularEstadoPlazoProfesional(
        reclamo.provider_response_deadline,
        reclamo.provider_response
      );

    const requiereOverridePlazo =
      !reclamo.provider_response &&
      !estadoPlazo.vencido;

    let overrideResponseWindow =
      false;

    if (requiereOverridePlazo) {
      const confirmarAnticipado =
        window.confirm(
          `El profesional todavía está dentro de su plazo de 24 horas para responder (${estadoPlazo.texto}).\n\n¿Deseas resolver este reclamo ahora de todos modos?`
        );

      if (!confirmarAnticipado) {
        return;
      }

      overrideResponseWindow =
        true;
    }

    let notes = "";
    let providerAwardAmount:
      number | undefined;
    let customerRefundAmount:
      number | undefined;

    if (action === "pay_provider") {
      const respuesta =
        window.prompt(
          "Escribe una nota explicando por qué el pago debe liberarse al profesional:"
        );

      if (respuesta === null) {
        return;
      }

      notes =
        respuesta.trim();

      if (!notes) {
        setError(
          "Debes escribir una nota para resolver el reclamo."
        );
        return;
      }

      const confirmar =
        window.confirm(
          "¿Confirmas que deseas cerrar el reclamo y liberar al profesional el importe que le corresponde?"
        );

      if (!confirmar) {
        return;
      }
    }

    if (action === "refund_customer") {
      const respuesta =
        window.prompt(
          "Escribe una nota explicando por qué el cliente recibirá un reembolso completo:"
        );

      if (respuesta === null) {
        return;
      }

      notes =
        respuesta.trim();

      if (!notes) {
        setError(
          "Debes escribir una nota para resolver el reclamo."
        );
        return;
      }

      const confirmar =
        window.confirm(
          "¿Confirmas que deseas cerrar el reclamo y reembolsar al cliente el total pagado?"
        );

      if (!confirmar) {
        return;
      }
    }

    if (action === "partial") {
      if (!partialData) {
        await abrirResolucionParcial(
          reclamo
        );
        return;
      }

      notes =
        partialData.notes;

      providerAwardAmount =
        partialData.providerAwardAmount;

      customerRefundAmount =
        partialData.customerRefundAmount;
    }

    setProcesandoReclamo(
      reclamo.id
    );

    try {
      const {
        data: sessionData,
        error: sessionError,
      } =
        await supabase.auth.getSession();

      if (
        sessionError ||
        !sessionData.session
      ) {
        throw new Error(
          "No pudimos verificar tu sesión de administrador."
        );
      }

      const response =
        await fetch(
          "/api/admin/claims/resolve",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
              Authorization:
                `Bearer ${sessionData.session.access_token}`,
            },
            body: JSON.stringify({
              claimId:
                reclamo.id,
              action,
              notes,
              providerAwardAmount,
              customerRefundAmount,
              overrideResponseWindow,
            }),
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "No se pudo resolver el reclamo."
        );
      }

      if (
        action === "pay_provider"
      ) {
        setMensaje(
          `Reclamo resuelto. Se liberaron $${Number(
            data.providerAwardAmount
          ).toFixed(
            2
          )} al profesional.`
        );
      } else if (
        action ===
        "refund_customer"
      ) {
        setMensaje(
          `Reclamo resuelto. Se reembolsaron $${Number(
            data.customerRefundAmount
          ).toFixed(
            2
          )} al cliente.`
        );
      } else {
        setMensaje(
          `Resolución parcial completada. Profesional: $${Number(
            data.providerAwardAmount
          ).toFixed(
            2
          )} · Cliente: $${Number(
            data.customerRefundAmount
          ).toFixed(
            2
          )}.`
        );

        setReclamoParcial(
          null
        );
        setMontoProfesionalParcial(
          ""
        );
        setNotaParcial(
          ""
        );
        setErrorParcial(
          ""
        );
        setTotalPagoParcial(
          0
        );
        setMaxProfesionalParcial(
          0
        );
      }

      await cargarDatos(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo resolver el reclamo."
      );
    } finally {
      setProcesandoReclamo(
        null
      );
    }
  }


  /*
    NAVEGACIÓN RÁPIDA DEL ADMIN
  */

  function irASeccionAdmin(
    id: string
  ) {
    window.setTimeout(() => {
      document
        .getElementById(id)
        ?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
    }, 50);
  }

  function abrirGestionProfesionales() {
    if (gestionProfesionalesAbierta) {
      setGestionProfesionalesAbierta(false);
      return;
    }

    setGestionProfesionalesAbierta(true);
    irASeccionAdmin("profesionales-admin");
  }

  /*
    CERRAR SESIÓN
  */

  async function cerrarSesion() {
    await supabase.auth.signOut();

    router.replace(
      "/login-admin"
    );
  }

  /*
    CONTADORES
  */

  const totalActivos =
    todosProviders.filter(
      (provider) =>
        provider.verified ===
          true &&
        provider.active ===
          true
    ).length;

  const totalSuspendidos =
    todosProviders.filter(
      (provider) =>
        provider.verified ===
          true &&
        provider.active !==
          true
    ).length;

  const totalRechazados =
    todosProviders.filter(
      (provider) =>
        provider.verification_status ===
        "rejected"
    ).length;

  const totalPendientes =
    todosProviders.filter(
      (provider) =>
        provider.verification_status ===
        "pending"
    ).length;


  const totalDocumentosPendientesRevision =
    documents.filter(
      (doc) =>
        doc.status === "pending" ||
        doc.status === "submitted"
    ).length;

  const totalAlertasProfesionales =
    totalPendientes + totalDocumentosPendientesRevision;

  const profesionalesPorOficio = [
    "plumbing",
    "electrical",
    "hvac",
    "carpentry",
    "painting",
    "landscaping",
    "cleaning",
    "moving",
    "other",
  ]
    .map((trade) => ({
      trade,
      nombre: nombreOficio(trade),
      total: todosProviders.filter(
        (provider) =>
          provider.trade === trade
      ).length,
    }))
    .filter(
      (item) => item.total > 0
    )
    .sort(
      (a, b) =>
        b.total - a.total
    );

  const totalReclamosActivos =
    reclamos.filter(
      (reclamo) =>
        reclamo.status === "open" ||
        reclamo.status === "reviewing"
    ).length;

  const totalReclamosAbiertos =
    reclamos.filter(
      (reclamo) =>
        reclamo.status === "open"
    ).length;

  const totalReclamosRevision =
    reclamos.filter(
      (reclamo) =>
        reclamo.status === "reviewing"
    ).length;

  const totalReclamosCerrados =
    reclamos.filter(
      (reclamo) =>
        reclamo.status === "resolved" ||
        reclamo.status === "rejected"
    ).length;

  const totalOrdenesAbiertas =
    solicitudesAdmin.filter(
      (solicitud) =>
        solicitud.status ===
        "open"
    ).length;

  const totalOrdenesProgreso =
    solicitudesAdmin.filter(
      (solicitud) =>
        solicitud.status ===
        "in_progress"
    ).length;

  const totalOrdenesCompletadas =
    solicitudesAdmin.filter(
      (solicitud) =>
        solicitud.status ===
        "completed"
    ).length;

  const totalOrdenesCanceladas =
    solicitudesAdmin.filter(
      (solicitud) =>
        solicitud.status ===
        "cancelled"
    ).length;

  const reclamosFiltrados =
    useMemo(
      () => {
        if (
          filtroReclamo ===
          "open"
        ) {
          return reclamos.filter(
            (reclamo) =>
              reclamo.status ===
              "open"
          );
        }

        if (
          filtroReclamo ===
          "reviewing"
        ) {
          return reclamos.filter(
            (reclamo) =>
              reclamo.status ===
              "reviewing"
          );
        }

        if (
          filtroReclamo ===
          "closed"
        ) {
          return reclamos.filter(
            (reclamo) =>
              reclamo.status ===
                "resolved" ||
              reclamo.status ===
                "rejected"
          );
        }

        return reclamos;
      },
      [
        reclamos,
        filtroReclamo,
      ]
    );

  const ordenesFiltradas =
    useMemo(
      () => {
        const texto =
          buscandoOrden
            .trim()
            .toLowerCase();

        return solicitudesAdmin.filter(
          (solicitud) => {
            if (
              filtroOrden !==
                "todas" &&
              solicitud.status !==
                filtroOrden
            ) {
              return false;
            }

            if (!texto) {
              return true;
            }

            const profesional =
              solicitud.preferred_provider_id
                ? todosProviders.find(
                    (provider) =>
                      provider.user_id ===
                      solicitud.preferred_provider_id
                  )
                : null;

            const campos = [
              solicitud.title,
              solicitud.description,
              solicitud.customer_name || "",
              solicitud.customer_email || "",
              solicitud.customer_phone || "",
              solicitud.city,
              solicitud.state,
              solicitud.zip_code,
              solicitud.id,
              solicitud.customer_id || "",
              solicitud.preferred_provider_id || "",
              profesional?.business_name || "",
              profesional?.trade || "",
            ]
              .join(" ")
              .toLowerCase();

            return campos.includes(
              texto
            );
          }
        );
      },
      [
        solicitudesAdmin,
        buscandoOrden,
        filtroOrden,
        todosProviders,
      ]
    );

  /*
    FILTRAR PROFESIONALES
  */

  const profesionalesFiltrados =
    useMemo(
      () => {
        const texto =
          buscando
            .trim()
            .toLowerCase();

        return todosProviders.filter(
          (provider) => {
            /*
              FILTRO ESTADO
            */

            let pasaFiltro =
              true;

            if (
              filtro ===
              "activos"
            ) {
              pasaFiltro =
                provider.verified ===
                  true &&
                provider.active ===
                  true;
            }

            if (
              filtro ===
              "suspendidos"
            ) {
              pasaFiltro =
                provider.verified ===
                  true &&
                provider.active !==
                  true;
            }

            if (
              filtro ===
              "pendientes"
            ) {
              pasaFiltro =
                provider.verification_status ===
                "pending";
            }

            if (
              filtro ===
              "rechazados"
            ) {
              pasaFiltro =
                provider.verification_status ===
                "rejected";
            }

            if (
              !pasaFiltro
            ) {
              return false;
            }

            /*
              BUSCADOR
            */

            if (!texto) {
              return true;
            }

            const nombre =
              (
                provider.business_name ||
                ""
              ).toLowerCase();

            const oficio =
              nombreOficio(
                provider.trade
              ).toLowerCase();

            const id =
              provider.user_id.toLowerCase();

            return (
              nombre.includes(
                texto
              ) ||
              oficio.includes(
                texto
              ) ||
              id.includes(
                texto
              )
            );
          }
        );
      },
      [
        todosProviders,
        buscando,
        filtro,
      ]
    );

  /*
    CARGANDO
  */

  if (
    verificandoAdmin
  ) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">

        <div className="rounded-2xl border border-slate-200 bg-white px-8 py-7 shadow-lg">

          <p className="font-bold text-slate-800">
            Verificando acceso de administrador...
          </p>

        </div>

      </main>
    );
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">

        <div className="rounded-2xl border border-slate-200 bg-white px-8 py-7 shadow-lg">

          <p className="font-bold text-slate-800">
            Cargando panel...
          </p>

        </div>

      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8">

      <div className="mx-auto max-w-6xl">

        {/* HEADER */}

        <div className="mb-6 rounded-3xl bg-blue-700 px-8 py-7 text-white shadow-lg">

          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">

            <div>

              <div className="text-2xl font-black">
                RELYDO
              </div>

              <h1 className="mt-2 text-3xl font-extrabold">
                Panel de administrador
              </h1>

              <p className="mt-2 text-blue-100">
                Verifica profesionales, supervisa su actividad y controla la plataforma.
              </p>

            </div>

            <div className="flex flex-col items-start gap-3 md:items-end">

              <div className="rounded-xl bg-blue-800 px-4 py-2 text-sm font-semibold">
                Administrador
              </div>

              <div className="text-sm text-blue-100">
                {adminEmail || "Administrador"}
              </div>

              <button
                type="button"
                onClick={
                  cerrarSesion
                }
                className="rounded-lg border border-white/30 bg-white/10 px-4 py-2 text-sm font-bold text-white hover:bg-white/20"
              >
                Cerrar sesión
              </button>

            </div>

          </div>

        </div>

        {/* MENSAJES */}

        {error && (
          <div className="mb-6 rounded-xl border border-red-300 bg-red-50 p-4 font-medium text-red-700">
            {error}
          </div>
        )}

        {mensaje && (
          <div className="mb-6 rounded-xl border border-green-300 bg-green-50 p-4 font-medium text-green-700">
            {mensaje}
          </div>
        )}

        {/* ACCESOS ADMINISTRATIVOS */}

        <section className="mb-10">
          <div className="mb-5">
            <p className="text-sm font-bold uppercase tracking-wide text-blue-700">
              Accesos administrativos
            </p>

            <h2 className="mt-1 text-3xl font-extrabold text-slate-900">
              Herramientas de control
            </h2>

            <p className="mt-2 text-slate-600">
              Entra directamente a las áreas que necesitas administrar sin llenar el panel principal.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
            <button
              type="button"
              onClick={() =>
                router.push(
                  "/admin/configuracion-financiera"
                )
              }
              className="rounded-3xl border border-emerald-200 bg-white p-6 text-left shadow transition hover:-translate-y-0.5 hover:border-emerald-400 hover:shadow-lg"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-2xl">
                  💰
                </div>

                <span className="text-xl font-black text-emerald-700">
                  →
                </span>
              </div>

              <h3 className="mt-5 text-xl font-black text-slate-950">
                Configuración financiera
              </h3>

              <p className="mt-2 text-sm leading-6 text-slate-600">
                Comisiones, tarifa al cliente, cancelaciones y porcentajes para el profesional.
              </p>

              <p className="mt-5 text-sm font-black text-emerald-700">
                Administrar configuración
              </p>
            </button>

            <button
              type="button"
              onClick={() =>
                router.push(
                  "/admin/reclamos"
                )
              }
              className="rounded-3xl border border-red-200 bg-white p-6 text-left shadow transition hover:-translate-y-0.5 hover:border-red-400 hover:shadow-lg"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-100 text-2xl">
                  ⚠️
                </div>

                <span className="text-xl font-black text-red-700">
                  →
                </span>
              </div>

              <h3 className="mt-5 text-xl font-black text-slate-950">
                Reclamos de trabajos
              </h3>

              <p className="mt-2 text-sm leading-6 text-slate-600">
                Revisa disputas abiertas, en revisión y reclamos ya resueltos.
              </p>

              <p className="mt-5 text-sm font-black text-red-700">
                {totalReclamosActivos} reclamo{totalReclamosActivos === 1 ? "" : "s"} activo{totalReclamosActivos === 1 ? "" : "s"}
              </p>
            </button>

            <button
              type="button"
              onClick={() =>
                router.push(
                  "/admin/ordenes"
                )
              }
              className="rounded-3xl border border-blue-200 bg-white p-6 text-left shadow transition hover:-translate-y-0.5 hover:border-blue-400 hover:shadow-lg"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-100 text-2xl">
                  📋
                </div>

                <span className="text-xl font-black text-blue-700">
                  →
                </span>
              </div>

              <h3 className="mt-5 text-xl font-black text-slate-950">
                Control de órdenes
              </h3>

              <p className="mt-2 text-sm leading-6 text-slate-600">
                Consulta todas las órdenes y abre el expediente completo de cada trabajo.
              </p>

              <p className="mt-5 text-sm font-black text-blue-700">
                {solicitudesAdmin.length} orden{solicitudesAdmin.length === 1 ? "" : "es"} registrada{solicitudesAdmin.length === 1 ? "" : "s"}
              </p>
            </button>

            <button
              type="button"
              onClick={() =>
                router.push(
                  "/admin/finanzas"
                )
              }
              className="rounded-3xl border border-violet-200 bg-white p-6 text-left shadow transition hover:-translate-y-0.5 hover:border-violet-400 hover:shadow-lg"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 text-2xl">
                  📊
                </div>

                <span className="text-xl font-black text-violet-700">
                  →
                </span>
              </div>

              <h3 className="mt-5 text-xl font-black text-slate-950">
                Finanzas y ganancias
              </h3>

              <p className="mt-2 text-sm leading-6 text-slate-600">
                Controla ingresos de RELYDO, volumen procesado, pagos al profesional, retenciones y reembolsos.
              </p>

              <p className="mt-5 text-sm font-black text-violet-700">
                Abrir panel financiero
              </p>
            </button>

            <button
              type="button"
              onClick={() =>
                router.push(
                  "/admin/usuarios"
                )
              }
              className="rounded-3xl border border-cyan-200 bg-white p-6 text-left shadow transition hover:-translate-y-0.5 hover:border-cyan-400 hover:shadow-lg"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-100 text-2xl">
                  👥
                </div>

                <span className="text-xl font-black text-cyan-700">
                  →
                </span>
              </div>

              <h3 className="mt-5 text-xl font-black text-slate-950">
                Gestión de usuarios
              </h3>

              <p className="mt-2 text-sm leading-6 text-slate-600">
                Consulta clientes y profesionales, teléfonos, contacto y actividad dentro de RELYDO.
              </p>

              <p className="mt-5 text-sm font-black text-cyan-700">
                Abrir gestión de usuarios
              </p>
            </button>

            <button
              type="button"
              onClick={abrirGestionProfesionales}
              className="rounded-3xl border border-purple-200 bg-white p-6 text-left shadow transition hover:-translate-y-0.5 hover:border-purple-400 hover:shadow-lg"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-100 text-2xl">
                  🧰
                </div>

                <div className="flex items-center gap-2">
                  {totalAlertasProfesionales > 0 && (
                    <span className="rounded-full bg-red-600 px-2.5 py-1 text-xs font-black text-white shadow-sm">
                      {totalAlertasProfesionales} pendiente{totalAlertasProfesionales === 1 ? "" : "s"}
                    </span>
                  )}
                  <span className="text-xl font-black text-purple-700">
                    →
                  </span>
                </div>
              </div>

              <h3 className="mt-5 text-xl font-black text-slate-950">
                Gestión de profesionales
              </h3>

              <p className="mt-2 text-sm leading-6 text-slate-600">
                Controla cuántos profesionales tienes, su estado de aprobación y las categorías que cubren.
              </p>

              <div className="mt-5 grid grid-cols-2 gap-2 text-xs font-black">
                <div className="rounded-xl bg-slate-100 px-3 py-2 text-slate-700">
                  Total: {todosProviders.length}
                </div>

                <div className="rounded-xl bg-green-50 px-3 py-2 text-green-700">
                  Aprobados: {totalActivos}
                </div>

                <div className="rounded-xl bg-blue-50 px-3 py-2 text-blue-700">
                  Pendientes: {totalPendientes}
                </div>

                <div className="rounded-xl bg-amber-50 px-3 py-2 text-amber-700">
                  Suspendidos: {totalSuspendidos}
                </div>
              </div>

              {totalAlertasProfesionales > 0 && (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-black text-red-700">
                  🔔 {totalAlertasProfesionales} elemento{totalAlertasProfesionales === 1 ? "" : "s"} requiere{totalAlertasProfesionales === 1 ? "" : "n"} revisión
                </div>
              )}

              <p className="mt-5 text-sm font-black text-purple-700">
                {gestionProfesionalesAbierta ? "Ocultar gestión profesional" : "Abrir gestión profesional"}
              </p>
            </button>

            <button
              type="button"
              onClick={() =>
                router.push(
                  "/admin/alertas"
                )
              }
              className="rounded-3xl border border-amber-200 bg-white p-6 text-left shadow transition hover:-translate-y-0.5 hover:border-amber-400 hover:shadow-lg"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-2xl">
                  🔔
                </div>
                <span className="text-xl font-black text-amber-700">→</span>
              </div>
              <h3 className="mt-5 text-xl font-black text-slate-950">
                Centro de alertas
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Revisa reclamos activos, profesionales pendientes y situaciones que requieren atención.
              </p>
              <p className="mt-5 text-sm font-black text-amber-700">
                {totalReclamosActivos + providers.length} alerta{totalReclamosActivos + providers.length === 1 ? "" : "s"} pendiente{totalReclamosActivos + providers.length === 1 ? "" : "s"}
              </p>
            </button>

            <button
              type="button"
              onClick={() =>
                router.push(
                  "/admin/actividad"
                )
              }
              className="rounded-3xl border border-indigo-200 bg-white p-6 text-left shadow transition hover:-translate-y-0.5 hover:border-indigo-400 hover:shadow-lg"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-100 text-2xl">
                  📈
                </div>

                <span className="text-xl font-black text-indigo-700">
                  →
                </span>
              </div>

              <h3 className="mt-5 text-xl font-black text-slate-950">
                Actividad de la plataforma
              </h3>

              <p className="mt-2 text-sm leading-6 text-slate-600">
                Mide trabajos, ofertas, clientes, profesionales y el rendimiento operativo de RELYDO.
              </p>

              <p className="mt-5 text-sm font-black text-indigo-700">
                Ver actividad
              </p>
            </button>
          </div>
        </section>

        {gestionProfesionalesAbierta && (
          <>
        {/* CONTROL PROFESIONALES */}

        <section id="profesionales-admin" className="mb-10 scroll-mt-6">

          <div className="mb-5">

            <p className="text-sm font-bold uppercase tracking-wide text-purple-700">
              Control
            </p>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">

              <div>

                <h2 className="mt-1 text-3xl font-extrabold text-slate-900">
                  Control de profesionales
                </h2>

                <p className="mt-2 text-slate-600">
                  Revisa actividad, calificaciones, liberaciones y estado de cada cuenta.
                </p>

              </div>

              <button
                type="button"
                onClick={() =>
                  cargarDatos()
                }
                className="w-fit rounded-xl border-2 border-blue-700 bg-white px-5 py-3 font-extrabold text-blue-700 hover:bg-blue-50"
              >
                ↻ Actualizar
              </button>

            </div>

          </div>

          {/* RESUMEN DE LA RED PROFESIONAL */}

          <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-black uppercase tracking-wide text-slate-500">
                Total
              </p>
              <p className="mt-1 text-3xl font-black text-slate-950">
                {todosProviders.length}
              </p>
            </div>

            <div className="rounded-2xl border border-green-200 bg-green-50 p-4 shadow-sm">
              <p className="text-xs font-black uppercase tracking-wide text-green-700">
                Aprobados
              </p>
              <p className="mt-1 text-3xl font-black text-green-700">
                {totalActivos}
              </p>
            </div>

            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 shadow-sm">
              <p className="text-xs font-black uppercase tracking-wide text-blue-700">
                Pendientes
              </p>
              <p className="mt-1 text-3xl font-black text-blue-700">
                {totalPendientes}
              </p>
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
              <p className="text-xs font-black uppercase tracking-wide text-amber-700">
                Suspendidos
              </p>
              <p className="mt-1 text-3xl font-black text-amber-700">
                {totalSuspendidos}
              </p>
            </div>

            <div className="col-span-2 rounded-2xl border border-red-200 bg-red-50 p-4 shadow-sm md:col-span-1">
              <p className="text-xs font-black uppercase tracking-wide text-red-700">
                Rechazados
              </p>
              <p className="mt-1 text-3xl font-black text-red-700">
                {totalRechazados}
              </p>
            </div>
          </div>

          <div className="mb-5 rounded-3xl border border-purple-200 bg-white p-5 shadow">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-black uppercase tracking-wide text-purple-700">
                  Cobertura por categoría
                </p>

                <p className="mt-1 text-sm text-slate-600">
                  Cantidad de profesionales registrados en cada oficio.
                </p>
              </div>

              <p className="text-sm font-black text-slate-500">
                {profesionalesPorOficio.length} categoría{profesionalesPorOficio.length === 1 ? "" : "s"} con profesionales
              </p>
            </div>

            {profesionalesPorOficio.length === 0 ? (
              <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm font-semibold text-slate-500">
                Aún no hay profesionales clasificados por categoría.
              </p>
            ) : (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {profesionalesPorOficio.map((item) => (
                  <div
                    key={item.trade}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-3"
                  >
                    <p className="text-sm font-extrabold text-slate-800">
                      {item.nombre}
                    </p>

                    <p className="mt-1 text-2xl font-black text-purple-700">
                      {item.total}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* BUSCADOR */}

          <div className="mb-5 rounded-3xl border border-slate-200 bg-white p-5 shadow">

            <input
              type="text"
              value={
                buscando
              }
              onChange={(e) =>
                setBuscando(
                  e.target.value
                )
              }
              placeholder="Buscar por negocio, especialidad o ID..."
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none focus:border-blue-500"
            />

            <div className="mt-4 flex flex-wrap gap-2">

              <FiltroBoton
                activo={
                  filtro ===
                  "todos"
                }
                texto="Todos"
                onClick={() =>
                  setFiltro(
                    "todos"
                  )
                }
              />

              <FiltroBoton
                activo={
                  filtro ===
                  "activos"
                }
                texto="Activos"
                onClick={() =>
                  setFiltro(
                    "activos"
                  )
                }
              />

              <FiltroBoton
                activo={
                  filtro ===
                  "suspendidos"
                }
                texto="Suspendidos"
                onClick={() =>
                  setFiltro(
                    "suspendidos"
                  )
                }
              />

              <FiltroBoton
                activo={
                  filtro ===
                  "pendientes"
                }
                texto="Pendientes"
                onClick={() =>
                  setFiltro(
                    "pendientes"
                  )
                }
              />

              <FiltroBoton
                activo={
                  filtro ===
                  "rechazados"
                }
                texto="Rechazados"
                onClick={() =>
                  setFiltro(
                    "rechazados"
                  )
                }
              />

            </div>

          </div>

          {profesionalesFiltrados.length ===
          0 ? (
            <div className="rounded-3xl bg-white p-8 text-center shadow">

              <p className="font-bold text-slate-700">
                No encontramos profesionales con esos filtros.
              </p>

            </div>
          ) : (
            <div className="space-y-4">

              {profesionalesFiltrados.map(
                (
                  provider
                ) => {
                  const liberaciones =
                    contarLiberaciones(
                      provider.user_id
                    );

                  const userDocs =
                    docsDelUsuario(
                      provider.user_id
                    );

                  const userSolicitudes =
                    solicitudesDocsDelUsuario(
                      provider.user_id
                    );

                  const solicitudesPendientes =
                    userSolicitudes.filter(
                      (solicitud) =>
                        solicitud.status ===
                          "pending" ||
                        solicitud.status ===
                          "submitted"
                    );

                  const expedienteAbierto =
                    expedientesAbiertos.includes(
                      provider.user_id
                    );

                  const contacto =
                    datosContactoProfesional(
                      provider
                    );

                  return (
                    <article
                      key={
                        provider.user_id
                      }
                      className="rounded-3xl border border-slate-200 bg-white p-6 shadow"
                    >

                      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">

                        <div>

                          <h3 className="text-2xl font-extrabold text-slate-900">
                            {provider.business_name ||
                              "Profesional RELYDO"}
                          </h3>

                          <p className="mt-1 font-semibold text-blue-700">
                            {nombreOficio(
                              provider.trade
                            )}
                          </p>

                          <p className="mt-2 break-all text-xs text-slate-400">
                            {
                              provider.user_id
                            }
                          </p>

                        </div>

                        <span
                          className={`w-fit rounded-full px-4 py-2 text-sm font-extrabold ${estiloEstadoCuenta(
                            provider
                          )}`}
                        >
                          {nombreEstadoCuenta(
                            provider
                          )}
                        </span>

                      </div>

                      {/* INFORMACIÓN PERSONAL Y DE CONTACTO */}

                      <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50/50 p-5">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-sm font-bold uppercase tracking-wide text-blue-700">
                              Información del profesional
                            </p>
                            <p className="mt-1 text-sm text-slate-600">
                              Datos de identidad, contacto y ubicación registrados en RELYDO.
                            </p>
                          </div>
                        </div>

                        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          <div className="rounded-xl border border-blue-100 bg-white p-4">
                            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Nombre completo</p>
                            <p className="mt-1 break-words font-extrabold text-slate-900">{contacto.nombre}</p>
                          </div>

                          <div className="rounded-xl border border-blue-100 bg-white p-4">
                            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Correo electrónico</p>
                            <p className="mt-1 break-all font-extrabold text-slate-900">{contacto.email}</p>
                          </div>

                          <div className="rounded-xl border border-blue-100 bg-white p-4">
                            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Teléfono</p>
                            <p className="mt-1 break-words font-extrabold text-slate-900">{contacto.phone}</p>
                          </div>

                          <div className="rounded-xl border border-blue-100 bg-white p-4 sm:col-span-2 lg:col-span-3">
                            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Dirección registrada</p>
                            <p className="mt-1 break-words font-extrabold text-slate-900">{direccionRegistradaLimpia(contacto)}</p>
                          </div>

                          <div className="rounded-xl border border-blue-100 bg-white p-4">
                            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Ciudad</p>
                            <p className="mt-1 font-extrabold text-slate-900">{contacto.city}</p>
                          </div>

                          <div className="rounded-xl border border-blue-100 bg-white p-4">
                            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Estado</p>
                            <p className="mt-1 font-extrabold text-slate-900">{contacto.state}</p>
                          </div>

                          <div className="rounded-xl border border-blue-100 bg-white p-4">
                            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">ZIP</p>
                            <p className="mt-1 font-extrabold text-slate-900">{contacto.zip}</p>
                          </div>
                        </div>
                      </div>

                      {/* INFORMACIÓN PROFESIONAL REGISTRADA */}

                      <div className="mt-6 rounded-2xl border border-indigo-100 bg-indigo-50/40 p-5">
                        <div>
                          <p className="text-sm font-bold uppercase tracking-wide text-indigo-700">
                            Información profesional registrada
                          </p>
                          <p className="mt-1 text-sm text-slate-600">
                            Datos declarados por el profesional durante su registro en RELYDO.
                          </p>
                        </div>

                        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          <div className="rounded-xl border border-indigo-100 bg-white p-4">
                            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Nombre del negocio</p>
                            <p className="mt-1 break-words font-extrabold text-slate-900">{provider.business_name || "No indicado"}</p>
                          </div>

                          <div className="rounded-xl border border-indigo-100 bg-white p-4">
                            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Profesión / especialidad</p>
                            <p className="mt-1 font-extrabold text-slate-900">{nombreOficio(provider.trade)}</p>
                          </div>

                          <div className="rounded-xl border border-indigo-100 bg-white p-4">
                            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Años de experiencia</p>
                            <p className="mt-1 font-extrabold text-slate-900">{provider.years_experience ?? 0} años</p>
                          </div>

                          <div className="rounded-xl border border-indigo-100 bg-white p-4">
                            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Radio de servicio</p>
                            <p className="mt-1 font-extrabold text-slate-900">{provider.service_radius_miles ?? 0} millas</p>
                          </div>

                          <div className="rounded-xl border border-indigo-100 bg-white p-4">
                            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Licencia profesional</p>
                            <p className="mt-1 font-extrabold text-slate-900">{provider.license_required ? "Requerida / declarada" : "No requerida / no declarada"}</p>
                            <p className="mt-1 text-sm text-slate-600">N.º: {provider.license_number || "No indicado"}</p>
                            <p className="text-sm text-slate-600">Estado: {provider.license_state || "No indicado"}</p>
                            <p className="text-sm text-slate-600">Vence: {provider.license_expiration ? fechaDocumento(provider.license_expiration) : "No indicado"}</p>
                          </div>

                          <div className="rounded-xl border border-indigo-100 bg-white p-4">
                            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Seguro de responsabilidad</p>
                            <p className="mt-1 font-extrabold text-slate-900">{provider.insured ? "Sí" : "No"}</p>
                            <p className="mt-1 text-sm text-slate-600">Compañía: {provider.insurance_company || "No indicada"}</p>
                            <p className="text-sm text-slate-600">Vence: {provider.insurance_expiration ? fechaDocumento(provider.insurance_expiration) : "No indicado"}</p>
                          </div>

                          <div className="rounded-xl border border-indigo-100 bg-white p-4">
                            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Bond / Fianza</p>
                            <p className="mt-1 font-extrabold text-slate-900">{provider.bonded ? "Sí" : "No"}</p>
                          </div>

                          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 sm:col-span-2">
                            <p className="text-xs font-bold uppercase tracking-wide text-amber-700">Background check</p>
                            <p className="mt-1 font-extrabold text-amber-900">Pendiente de implementación</p>
                            <p className="mt-1 text-sm text-amber-800">
                              Este espacio queda preparado para mostrar el resultado del proveedor de background check cuando se integre: pendiente, aprobado, revisión requerida o rechazado.
                            </p>
                          </div>

                          <div className="rounded-xl border border-indigo-100 bg-white p-4 sm:col-span-2 lg:col-span-3">
                            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Sobre el profesional / negocio</p>
                            <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-800">{provider.bio || "No se registró una descripción."}</p>
                          </div>
                        </div>
                      </div>

                      {/* ESTADÍSTICAS */}

                      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">

                        <div className="rounded-2xl bg-green-50 p-5">

                          <p className="text-sm font-bold text-green-700">
                            ✅ Completados
                          </p>

                          <p className="mt-2 text-3xl font-black text-green-900">
                            {provider.completed_jobs ??
                              0}
                          </p>

                        </div>

                        <div className="rounded-2xl bg-amber-50 p-5">

                          <p className="text-sm font-bold text-amber-700">
                            ⭐ Calificación
                          </p>

                          <p className="mt-2 text-3xl font-black text-amber-900">
                            {Number(
                              provider.average_rating ||
                                0
                            ).toFixed(
                              1
                            )}
                          </p>

                        </div>

                        <div
                          className={`rounded-2xl p-5 ${
                            liberaciones >=
                            3
                              ? "border border-red-200 bg-red-50"
                              : liberaciones >
                                0
                              ? "border border-amber-200 bg-amber-50"
                              : "bg-slate-50"
                          }`}
                        >

                          <p
                            className={`text-sm font-bold ${
                              liberaciones >=
                              3
                                ? "text-red-700"
                                : liberaciones >
                                  0
                                ? "text-amber-700"
                                : "text-slate-600"
                            }`}
                          >
                            🔄 Trabajos liberados
                          </p>

                          <p className="mt-2 text-3xl font-black text-slate-900">
                            {
                              liberaciones
                            }
                          </p>

                        </div>

                        <div className="rounded-2xl bg-blue-50 p-5">

                          <p className="text-sm font-bold text-blue-700">
                            🛠️ Experiencia
                          </p>

                          <p className="mt-2 text-3xl font-black text-blue-900">
                            {provider.years_experience ??
                              0}
                          </p>

                          <p className="text-sm text-blue-700">
                            años
                          </p>

                        </div>

                      </div>

                      {/* ALERTA */}

                      {liberaciones >=
                        3 && (
                        <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4">

                          <p className="font-extrabold text-red-800">
                            ⚠️ Atención
                          </p>

                          <p className="mt-1 text-sm text-red-700">
                            Este profesional ha liberado varias órdenes. Revisa su historial antes de decidir si debe continuar activo.
                          </p>

                        </div>
                      )}

                      {/* EXPEDIENTE DOCUMENTAL PERMANENTE */}

                      <div className="mt-6 border-t border-slate-200 pt-5">

                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">

                          <div>
                            <p className="text-sm font-bold uppercase tracking-wide text-purple-700">
                              Expediente de verificación
                            </p>

                            <p className="mt-1 text-sm text-slate-600">
                              Documentos, vencimientos y solicitudes de esta cuenta.
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-extrabold text-slate-700">
                              {userDocs.length} documentos
                            </span>

                            {solicitudesPendientes.length > 0 && (
                              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-extrabold text-amber-800">
                                {solicitudesPendientes.length} solicitud(es) activa(s)
                              </span>
                            )}
                          </div>

                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            toggleExpediente(
                              provider.user_id
                            )
                          }
                          className="mt-4 w-full rounded-xl border-2 border-purple-200 bg-purple-50 px-5 py-3 font-extrabold text-purple-800 transition hover:bg-purple-100"
                        >
                          {expedienteAbierto
                            ? "Ocultar expediente documental"
                            : "📂 Ver expediente documental"}
                        </button>

                        {expedienteAbierto && (
                          <div className="mt-5 space-y-5 rounded-2xl border border-purple-100 bg-slate-50 p-5">

                            <div>
                              <div className="flex items-center justify-between gap-3">
                                <h4 className="font-extrabold text-slate-900">Documentos vigentes</h4>
                                <span className={`rounded-full px-3 py-1 text-xs font-extrabold ${estiloEstadoCuenta(provider)}`}>
                                  {nombreEstadoCuenta(provider)}
                                </span>
                              </div>

                              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                                {["license", "insurance", "bond", "other"].map((tipo) => {
                                  const doc = documentoVigente(provider.user_id, tipo, provider);
                                  const requerido = documentoEsRequerido(provider, tipo);
                                  const vencimiento = doc ? vencimientoDocumento(doc, provider) : null;
                                  return (
                                    <div key={tipo} className="rounded-xl border border-slate-200 bg-white p-4">
                                      <div className="flex items-start justify-between gap-3">
                                        <div>
                                          <p className="font-extrabold text-slate-900">{nombreTipoDocumento(tipo)}</p>
                                          {tipo !== "other" && (
                                            <p className="mt-1 text-xs font-semibold text-slate-500">
                                              Regla {requisitosProfesional(provider).jurisdiction}:{" "}
                                              {requirementLabel(
                                                tipo === "license"
                                                  ? requisitosProfesional(provider).license
                                                  : tipo === "insurance"
                                                  ? requisitosProfesional(provider).insurance
                                                  : requisitosProfesional(provider).bond,
                                                "es"
                                              )}
                                            </p>
                                          )}
                                          <span className={`mt-2 inline-block rounded-full px-3 py-1 text-xs font-extrabold ${
                                            doc
                                              ? "bg-green-100 text-green-800"
                                              : requerido
                                              ? "bg-amber-100 text-amber-800"
                                              : "bg-slate-100 text-slate-600"
                                          }`}>
                                            {doc
                                              ? "Aprobado"
                                              : requerido
                                              ? "Documento requerido"
                                              : "No requerido"}
                                          </span>
                                        </div>
                                        {doc && (
                                          <button type="button" onClick={() => abrirDocumento(doc.file_path)} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-700">Ver</button>
                                        )}
                                      </div>
                                      {doc && (
                                        <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                                          <p><strong>Vence:</strong> {vencimiento ? fechaDocumento(vencimiento) : "No aplica / sin registrar"}</p>
                                          <p><strong>Aprobado:</strong> {doc.approved_at ? formatearFecha(doc.approved_at) : "Sin registrar"}</p>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>

                              {documentosPendientesRevision(provider.user_id).length > 0 && (
                                <div className="mt-5 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
                                  <div className="flex items-center justify-between gap-3">
                                    <div>
                                      <h4 className="font-extrabold text-amber-950">⚠️ Documentos pendientes de revisión</h4>
                                      <p className="mt-1 text-sm text-amber-800">Los nuevos archivos no sustituyen al documento vigente hasta que los apruebes.</p>
                                    </div>
                                    <span className="rounded-full bg-amber-200 px-3 py-1 text-xs font-extrabold text-amber-900">{documentosPendientesRevision(provider.user_id).length} pendiente(s)</span>
                                  </div>
                                  <div className="mt-4 space-y-3">
                                    {documentosPendientesRevision(provider.user_id).map((doc, index) => (
                                      <div key={`${doc.id || doc.file_path}-${index}`} className="rounded-xl border border-amber-200 bg-white p-4">
                                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                          <div>
                                            <p className="font-extrabold text-slate-900">{nombreTipoDocumento(doc.document_type)}</p>
                                            <p className="mt-1 text-xs text-slate-500">Enviado: {doc.created_at ? formatearFecha(doc.created_at) : "Sin fecha"}</p>
                                          </div>
                                          <div className="flex flex-wrap gap-2">
                                            <button type="button" onClick={() => abrirDocumento(doc.file_path)} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-extrabold text-white">Ver</button>
                                            <button type="button" disabled={procesando === doc.id} onClick={() => revisarDocumento(doc, "approved")} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-extrabold text-white disabled:opacity-50">✓ Aprobar</button>
                                            <button type="button" disabled={procesando === doc.id} onClick={() => revisarDocumento(doc, "rejected")} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-extrabold text-white disabled:opacity-50">✕ Rechazar</button>
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {documentosHistoricos(provider.user_id, provider).length > 0 && (
                                <details className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
                                  <summary className="cursor-pointer font-extrabold text-slate-700">Historial de documentos ({documentosHistoricos(provider.user_id, provider).length})</summary>
                                  <div className="mt-3 space-y-2">
                                    {documentosHistoricos(provider.user_id, provider).map((doc, index) => (
                                      <div key={`${doc.id || doc.file_path}-hist-${index}`} className="flex flex-col gap-2 rounded-lg bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                                        <div>
                                          <p className="font-bold text-slate-800">{nombreTipoDocumento(doc.document_type)}</p>
                                          <p className="text-xs text-slate-500">Estado: {doc.status || "sin estado"}{doc.rejection_reason ? ` · ${doc.rejection_reason}` : ""}</p>
                                        </div>
                                        <button type="button" onClick={() => abrirDocumento(doc.file_path)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold">Ver</button>
                                      </div>
                                    ))}
                                  </div>
                                </details>
                              )}
                            </div>

                            <div className="border-t border-slate-200 pt-5">
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <h4 className="font-extrabold text-slate-900">
                                  Solicitudes de documentación
                                </h4>

                                <button
                                  type="button"
                                  onClick={() =>
                                    abrirSolicitudDocumentos(
                                      provider
                                    )
                                  }
                                  className="rounded-lg border border-amber-400 bg-amber-50 px-4 py-2 text-sm font-extrabold text-amber-800 hover:bg-amber-100"
                                >
                                  📄 Solicitar documentos
                                </button>
                              </div>

                              {userSolicitudes.length === 0 ? (
                                <p className="mt-3 rounded-xl bg-white p-4 text-sm text-slate-600">
                                  No hay solicitudes de documentación registradas.
                                </p>
                              ) : (
                                <div className="mt-3 space-y-3">
                                  {userSolicitudes.map(
                                    (solicitud) => (
                                      <div
                                        key={solicitud.id}
                                        className="rounded-xl border border-slate-200 bg-white p-4"
                                      >
                                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                          <div className="min-w-0 flex-1">
                                            <p className="font-extrabold text-slate-900">
                                              {nombreTipoDocumento(
                                                solicitud.document_type
                                              )}
                                            </p>

                                            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                                              {solicitud.message}
                                            </p>
                                          </div>

                                          <div className="flex shrink-0 flex-wrap items-center gap-2">
                                            <span
                                              className={`w-fit rounded-full px-3 py-1 text-xs font-extrabold ${
                                                solicitud.status === "completed"
                                                  ? "bg-green-100 text-green-800"
                                                  : solicitud.status === "cancelled"
                                                  ? "bg-slate-200 text-slate-700"
                                                  : solicitud.status === "submitted"
                                                  ? "bg-blue-100 text-blue-800"
                                                  : "bg-amber-100 text-amber-800"
                                              }`}
                                            >
                                              {solicitud.status === "completed"
                                                ? "Completada"
                                                : solicitud.status === "cancelled"
                                                ? "Cancelada"
                                                : solicitud.status === "submitted"
                                                ? "Enviada"
                                                : "Pendiente"}
                                            </span>

                                            <button
                                              type="button"
                                              disabled={
                                                procesando ===
                                                solicitud.id
                                              }
                                              onClick={() =>
                                                eliminarSolicitudDocumentos(
                                                  solicitud
                                                )
                                              }
                                              className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-extrabold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                                            >
                                              {procesando ===
                                              solicitud.id
                                                ? "Eliminando..."
                                                : "🗑 Eliminar"}
                                            </button>
                                          </div>
                                        </div>

                                        <p className="mt-3 text-xs text-slate-500">
                                          Solicitado:{" "}
                                          {formatearFecha(
                                            solicitud.requested_at
                                          )}
                                        </p>
                                      </div>
                                    )
                                  )}
                                </div>
                              )}
                            </div>

                          </div>
                        )}

                      </div>

                      {/* DECISIÓN DE VERIFICACIÓN */}

                      {provider.verified !== true &&
                        provider.verification_status !== "rejected" && (
                          <div className="mt-6 border-t border-slate-200 pt-5">
                            <p className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
                              Decisión de verificación
                            </p>

                            {(() => {
                              const requeridosFaltantes =
                                documentosRequeridosFaltantes(
                                  provider
                                );
                              const pendientesRevision = documentosPendientesRevision(
                                provider.user_id
                              );
                              const solicitudesAbiertas = userSolicitudes.filter(
                                (solicitud) =>
                                  solicitud.status === "pending" ||
                                  solicitud.status === "submitted"
                              );
                              const requisitos =
                                requisitosProfesional(
                                  provider
                                );
                              const puedeResolverRevisionManual =
                                requisitos.manualReview === false ||
                                adminRole === "super_admin";

                              const puedeAprobar =
                                puedeResolverRevisionManual &&
                                requeridosFaltantes.length === 0 &&
                                pendientesRevision.length === 0 &&
                                solicitudesAbiertas.length === 0;

                              return (
                                <>
                                  {requisitos.manualReview &&
                                    adminRole === "super_admin" &&
                                    requeridosFaltantes.length === 0 &&
                                    pendientesRevision.length === 0 &&
                                    solicitudesAbiertas.length === 0 && (
                                      <div className="mb-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
                                        <p className="font-extrabold">
                                          Revisión manual requerida
                                        </p>
                                        <p className="mt-1">
                                          La matriz de {requisitos.jurisdiction} no puede decidir automáticamente este caso. Como Super Admin puedes aprobarlo después de revisar el oficio y confirmar que el profesional cumple los requisitos aplicables.
                                        </p>
                                      </div>
                                    )}

                                  {!puedeAprobar && (
                                    <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                                      <p className="font-extrabold">Aprobación bloqueada temporalmente</p>
                                      <p className="mt-1">
                                        {requisitos.manualReview &&
                                        adminRole !== "super_admin"
                                          ? `La matriz de ${requisitos.jurisdiction} marca este oficio para revisión manual. Solo el Super Admin puede tomar la decisión final. `
                                          : ""}
                                        {requeridosFaltantes.length > 0
                                          ? `Faltan documentos obligatorios aprobados: ${requeridosFaltantes
                                              .map((tipo) => nombreTipoDocumento(tipo))
                                              .join(", ")}. `
                                          : ""}
                                        {pendientesRevision.length > 0
                                          ? `Hay ${pendientesRevision.length} documento(s) pendiente(s) de revisión. `
                                          : ""}
                                        {solicitudesAbiertas.length > 0
                                          ? `Hay ${solicitudesAbiertas.length} solicitud(es) de documentación abierta(s).`
                                          : ""}
                                      </p>
                                    </div>
                                  )}

                                  <div className="grid gap-3 md:grid-cols-3">
                                    <button
                                      type="button"
                                      disabled={
                                        procesando === provider.user_id || !puedeAprobar
                                      }
                                      onClick={() =>
                                        cambiarEstado(provider.user_id, "verified")
                                      }
                                      className="rounded-xl bg-green-600 px-5 py-3 font-extrabold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-40"
                                    >
                                      {procesando === provider.user_id
                                        ? "Procesando..."
                                        : puedeAprobar
                                        ? "✅ Aprobar profesional"
                                        : "Aprobación pendiente"}
                                    </button>

                                    <button
                                      type="button"
                                      disabled={procesando === provider.user_id}
                                      onClick={() => abrirSolicitudDocumentos(provider)}
                                      className="rounded-xl border-2 border-amber-500 bg-amber-50 px-5 py-3 font-extrabold text-amber-800 transition hover:bg-amber-100 disabled:opacity-50"
                                    >
                                      📄 Solicitar documentos
                                    </button>

                                    <button
                                      type="button"
                                      disabled={procesando === provider.user_id}
                                      onClick={() =>
                                        cambiarEstado(provider.user_id, "rejected")
                                      }
                                      className="rounded-xl bg-red-600 px-5 py-3 font-extrabold text-white transition hover:bg-red-700 disabled:opacity-50"
                                    >
                                      {procesando === provider.user_id
                                        ? "Procesando..."
                                        : "✕ Rechazar profesional"}
                                    </button>
                                  </div>
                                </>
                              );
                            })()}
                          </div>
                        )}

                      {/* REABRIR VERIFICACIÓN RECHAZADA */}

                      {provider.verification_status ===
                        "rejected" && (
                          <div className="mt-6 border-t border-slate-200 pt-5">
                            <p className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
                              Verificación rechazada
                            </p>

                            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                              <p className="font-extrabold text-blue-950">
                                Puedes reabrir este expediente
                              </p>
                              <p className="mt-1 text-sm text-blue-900">
                                El profesional volverá a estado pendiente. Sus documentos e historial se conservarán y seguirá sin poder operar hasta que Admin lo apruebe nuevamente.
                              </p>

                              <button
                                type="button"
                                disabled={
                                  procesando ===
                                  provider.user_id
                                }
                                onClick={() =>
                                  reabrirVerificacion(
                                    provider
                                  )
                                }
                                className="mt-4 w-full rounded-xl bg-blue-700 px-5 py-3 font-extrabold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {procesando ===
                                provider.user_id
                                  ? "Procesando..."
                                  : "↻ Reabrir verificación"}
                              </button>
                            </div>
                          </div>
                        )}

                      {/* CONTROLES ADMIN */}

                      {provider.verified ===
                        true &&
                        provider.verification_status !==
                          "rejected" && (
                          <div className="mt-6 border-t border-slate-200 pt-5">

                            <p className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
                              Control de cuenta
                            </p>

                            <div className="space-y-3">

                              <button
                                type="button"
                                disabled={
                                  procesando ===
                                  provider.user_id
                                }
                                onClick={() =>
                                  abrirSolicitudDocumentos(
                                    provider
                                  )
                                }
                                className="w-full rounded-xl border-2 border-amber-500 bg-amber-50 px-5 py-3 font-extrabold text-amber-800 transition hover:bg-amber-100 disabled:opacity-50"
                              >
                                📄 Solicitar documentos
                              </button>

                              {provider.active ===
                              true ? (
                                <button
                                  type="button"
                                  disabled={
                                    procesando ===
                                    provider.user_id
                                  }
                                  onClick={() =>
                                    cambiarActivo(
                                      provider,
                                      false
                                    )
                                  }
                                  className="w-full rounded-xl border-2 border-red-600 bg-white px-5 py-3 font-extrabold text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                                >
                                  {procesando ===
                                  provider.user_id
                                    ? "Procesando..."
                                    : "⛔ Suspender profesional"}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled={
                                    procesando ===
                                    provider.user_id
                                  }
                                  onClick={() =>
                                    cambiarActivo(
                                      provider,
                                      true
                                    )
                                  }
                                  className="w-full rounded-xl bg-green-600 px-5 py-3 font-extrabold text-white transition hover:bg-green-700 disabled:opacity-50"
                                >
                                  {procesando ===
                                  provider.user_id
                                    ? "Procesando..."
                                    : "✅ Reactivar profesional"}
                                </button>
                              )}

                            </div>

                          </div>
                        )}

                    </article>
                  );
                }
              )}

            </div>
          )}

        </section>

        {/* VERIFICACIONES PENDIENTES */}

        <section>

          <div className="mb-5">

            <p className="text-sm font-bold uppercase tracking-wide text-blue-700">
              Verificación
            </p>

            <h2 className="mt-1 text-3xl font-extrabold text-slate-900">
              Profesionales pendientes
            </h2>

            <p className="mt-2 text-slate-600">
              Revisa los documentos antes de aprobar una cuenta profesional.
            </p>

          </div>

          {providers.length ===
          0 ? (
            <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center shadow">

              <div className="text-5xl">
                ✅
              </div>

              <h2 className="mt-4 text-2xl font-extrabold text-slate-900">
                No hay verificaciones pendientes
              </h2>

              <p className="mt-2 text-slate-600">
                Cuando un profesional complete su perfil y envíe sus documentos aparecerá aquí.
              </p>

            </div>
          ) : (
            <div className="space-y-6">

              {providers.map(
                (
                  provider
                ) => {
                  const userDocs =
                    docsDelUsuario(
                      provider.user_id
                    );

                  const contacto =
                    datosContactoProfesional(
                      provider
                    );

                  return (
                    <article
                      key={
                        provider.user_id
                      }
                      className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-lg"
                    >

                      <div className="border-b border-slate-200 bg-slate-50 px-7 py-5">

                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">

                          <div>

                            <h2 className="text-2xl font-extrabold text-slate-900">
                              {provider.business_name ||
                                "Profesional sin nombre"}
                            </h2>

                            <p className="mt-1 break-all text-sm text-slate-500">
                              ID:{" "}
                              {
                                provider.user_id
                              }
                            </p>

                          </div>

                          <span className="w-fit rounded-full bg-amber-100 px-4 py-2 text-sm font-bold text-amber-800">
                            Pendiente
                          </span>

                        </div>

                      </div>

                      <div className="grid gap-8 p-7 lg:grid-cols-2">

                        {/* INFORMACIÓN */}

                        <div>

                          <h3 className="mb-4 text-lg font-extrabold text-blue-700">
                            Información profesional
                          </h3>

                          <div className="space-y-3 text-slate-700">

                            <div className="mb-5 grid gap-3 sm:grid-cols-2">
                              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Nombre completo</p>
                                <p className="mt-1 break-words font-extrabold text-slate-900">{contacto.nombre}</p>
                              </div>
                              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Correo electrónico</p>
                                <p className="mt-1 break-all font-extrabold text-slate-900">{contacto.email}</p>
                              </div>
                              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Teléfono</p>
                                <p className="mt-1 break-words font-extrabold text-slate-900">{contacto.phone}</p>
                              </div>
                              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Dirección registrada</p>
                                <p className="mt-1 break-words font-extrabold text-slate-900">{direccionRegistradaLimpia(contacto)}</p>
                              </div>
                            </div>

                            <p>
                              <strong>
                                Especialidad:
                              </strong>{" "}
                              {nombreOficio(
                                provider.trade
                              )}
                            </p>

                            <p>
                              <strong>
                                Experiencia:
                              </strong>{" "}
                              {provider.years_experience ??
                                0}{" "}
                              años
                            </p>

                            <p>
                              <strong>
                                Radio de servicio:
                              </strong>{" "}
                              {provider.service_radius_miles ??
                                0}{" "}
                              millas
                            </p>

                            <p>
                              <strong>
                                Licencia requerida:
                              </strong>{" "}
                              {provider.license_required
                                ? "Sí"
                                : "No"}
                            </p>

                            <p>
                              <strong>
                                Número de licencia:
                              </strong>{" "}
                              {provider.license_number ||
                                "No indicado"}
                            </p>

                            <p>
                              <strong>
                                Estado licencia:
                              </strong>{" "}
                              {provider.license_state ||
                                "No indicado"}
                            </p>

                            <p>
                              <strong>
                                Vencimiento licencia:
                              </strong>{" "}
                              {provider.license_expiration ||
                                "No indicado"}
                            </p>

                            <p>
                              <strong>
                                Seguro:
                              </strong>{" "}
                              {provider.insured
                                ? "Sí"
                                : "No"}
                            </p>

                            <p>
                              <strong>
                                Aseguradora:
                              </strong>{" "}
                              {provider.insurance_company ||
                                "No indicada"}
                            </p>

                            <p>
                              <strong>
                                Vencimiento seguro:
                              </strong>{" "}
                              {provider.insurance_expiration ||
                                "No indicado"}
                            </p>

                            <p>
                              <strong>
                                Bond/Fianza:
                              </strong>{" "}
                              {provider.bonded
                                ? "Sí"
                                : "No"}
                            </p>

                          </div>

                          {provider.bio && (
                            <div className="mt-5 rounded-xl bg-slate-50 p-4">

                              <p className="text-sm font-bold text-slate-900">
                                Descripción
                              </p>

                              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                                {
                                  provider.bio
                                }
                              </p>

                            </div>
                          )}

                        </div>

                        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
                          <p className="text-sm font-extrabold text-amber-900">Background check</p>
                          <p className="mt-1 text-sm text-amber-800">
                            Pendiente de implementación. Cuando integremos el proveedor de background check, aquí Admin verá su estado y resultado sin mezclarlo con la aprobación documental.
                          </p>
                        </div>

                        {/* DOCUMENTOS */}

                        <div>

                          <h3 className="mb-4 text-lg font-extrabold text-blue-700">
                            Documentos
                          </h3>

                          {userDocs.length ===
                          0 ? (
                            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">

                              <p className="font-bold">
                                Sin documentos
                              </p>

                              <p className="mt-1 text-sm">
                                Este profesional todavía no tiene documentos registrados y no puede ser aprobado.
                              </p>

                            </div>
                          ) : (
                            <div className="space-y-3">

                              {userDocs.map(
                                (
                                  doc,
                                  index
                                ) => (
                                  <div
                                    key={`${doc.file_path}-${index}`}
                                    className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between"
                                  >

                                    <div>

                                      <p className="font-bold text-slate-900">
                                        {doc.document_type ===
                                        "license"
                                          ? "Licencia"
                                          : doc.document_type ===
                                            "insurance"
                                          ? "Seguro"
                                          : doc.document_type ===
                                            "bond"
                                          ? "Bond / Fianza"
                                          : doc.document_type}
                                      </p>

                                      <p className="mt-1 text-xs text-slate-500">
                                        Estado:{" "}
                                        {doc.status ||
                                          "pending"}
                                      </p>

                                    </div>

                                    <button
                                      type="button"
                                      onClick={() =>
                                        abrirDocumento(
                                          doc.file_path
                                        )
                                      }
                                      className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700"
                                    >
                                      Ver documento
                                    </button>

                                  </div>
                                )
                              )}

                            </div>
                          )}

                        </div>

                      </div>

                      {/* APROBAR / SOLICITAR DOCUMENTOS / RECHAZAR */}

                      <div className="grid gap-3 border-t border-slate-200 bg-slate-50 p-6 md:grid-cols-3">

                        <button
                          type="button"
                          disabled={
                            procesando ===
                              provider.user_id ||
                            userDocs.length ===
                              0
                          }
                          onClick={() =>
                            cambiarEstado(
                              provider.user_id,
                              "verified"
                            )
                          }
                          className="rounded-xl bg-green-600 px-5 py-3 font-extrabold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {procesando ===
                          provider.user_id
                            ? "Procesando..."
                            : userDocs.length ===
                              0
                            ? "Faltan documentos"
                            : "Aprobar profesional"}
                        </button>

                        <button
                          type="button"
                          disabled={
                            procesando ===
                            provider.user_id
                          }
                          onClick={() =>
                            abrirSolicitudDocumentos(
                              provider
                            )
                          }
                          className="rounded-xl border-2 border-amber-500 bg-amber-50 px-5 py-3 font-extrabold text-amber-800 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          📄 Solicitar documentos
                        </button>

                        <button
                          type="button"
                          disabled={
                            procesando ===
                            provider.user_id
                          }
                          onClick={() =>
                            cambiarEstado(
                              provider.user_id,
                              "rejected"
                            )
                          }
                          className="rounded-xl bg-red-600 px-5 py-3 font-extrabold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {procesando ===
                          provider.user_id
                            ? "Procesando..."
                            : "Rechazar profesional"}
                        </button>

                      </div>

                    </article>
                  );
                }
              )}

            </div>
          )}

        </section>
          </>
        )}

        {/* El historial de reasignaciones se gestiona ahora en /admin/ordenes */}

        {/* DATOS EXTRA */}

        {totalRechazados >
          0 && (
          <div className="mt-8 text-center text-sm text-slate-500">
            Profesionales rechazados registrados:{" "}
            {totalRechazados}
          </div>
        )}

      </div>

      {solicitudDocsProvider && (
        <div
          className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-950/60 p-4 sm:p-6"
          onMouseDown={(e) => {
            if (
              e.target ===
              e.currentTarget
            ) {
              cerrarSolicitudDocumentos();
            }
          }}
        >

          <div className="my-auto w-full max-w-xl max-h-[calc(100vh-2rem)] overflow-y-auto rounded-3xl bg-white shadow-2xl sm:max-h-[calc(100vh-3rem)]">

            <div className="bg-amber-500 px-7 py-6 text-slate-950">

              <div className="flex items-start justify-between gap-4">

                <div>
                  <p className="text-sm font-black uppercase tracking-wider">
                    RELYDO · Verificación
                  </p>

                  <h2 className="mt-2 text-2xl font-black">
                    Solicitar documentos
                  </h2>

                  <p className="mt-2 text-sm font-semibold text-amber-950/80">
                    {solicitudDocsProvider.business_name ||
                      "Profesional"}
                  </p>
                </div>

                <button
                  type="button"
                  disabled={solicitandoDocs}
                  onClick={cerrarSolicitudDocumentos}
                  className="rounded-lg bg-white/40 px-3 py-2 font-black hover:bg-white/60 disabled:opacity-50"
                  aria-label="Cerrar"
                >
                  ✕
                </button>

              </div>

            </div>

            <div className="space-y-5 p-7">

              <div>
                <label className="mb-2 block text-sm font-extrabold text-slate-700">
                  Documento solicitado
                </label>

                <select
                  value={solicitudDocsTipo}
                  disabled={solicitandoDocs}
                  onChange={(e) =>
                    setSolicitudDocsTipo(
                      e.target.value as
                        | "all"
                        | "license"
                        | "insurance"
                        | "bond"
                        | "other"
                    )
                  }
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-semibold text-slate-900 outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-100"
                >
                  <option value="all">
                    Varios documentos / información adicional
                  </option>
                  <option value="license">
                    Licencia
                  </option>
                  <option value="insurance">
                    Seguro
                  </option>
                  <option value="bond">
                    Bond / Fianza
                  </option>
                  <option value="other">
                    Otro documento
                  </option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-extrabold text-slate-700">
                  Explica exactamente qué necesita RELYDO
                </label>

                <textarea
                  value={solicitudDocsMensaje}
                  disabled={solicitandoDocs}
                  onChange={(e) =>
                    setSolicitudDocsMensaje(
                      e.target.value
                    )
                  }
                  rows={6}
                  maxLength={1500}
                  placeholder="Ejemplo: La copia de la licencia está borrosa. Sube una imagen o PDF legible donde se vea el número y la fecha de vencimiento."
                  className="w-full resize-none rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-100 disabled:bg-slate-100"
                />

                <div className="mt-2 text-right text-xs font-semibold text-slate-400">
                  {solicitudDocsMensaje.length}/1500
                </div>
              </div>

              {(() => {
                const contacto =
                  datosContactoProfesional(
                    solicitudDocsProvider
                  );

                const tieneEmail =
                  contacto.email !==
                  "No registrado";

                const tieneTelefono =
                  contacto.phone !==
                  "No registrado";

                return (
                  <div className="space-y-4">
                    <div>
                      <p className="mb-2 text-sm font-extrabold text-slate-700">
                        Enviar solicitud por
                      </p>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <label
                          className={`flex items-start gap-3 rounded-xl border p-4 ${
                            tieneEmail
                              ? "cursor-pointer border-slate-300 bg-white"
                              : "cursor-not-allowed border-slate-200 bg-slate-100 opacity-60"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={
                              solicitudDocsPorEmail &&
                              tieneEmail
                            }
                            disabled={
                              solicitandoDocs ||
                              !tieneEmail
                            }
                            onChange={(e) =>
                              setSolicitudDocsPorEmail(
                                e.target.checked
                              )
                            }
                            className="mt-1 h-4 w-4"
                          />

                          <span>
                            <span className="block font-extrabold text-slate-900">
                              ✉️ Correo electrónico
                            </span>
                            <span className="mt-1 block break-all text-sm text-slate-600">
                              {tieneEmail
                                ? contacto.email
                                : "No hay correo registrado"}
                            </span>
                          </span>
                        </label>

                        <label
                          className={`flex items-start gap-3 rounded-xl border p-4 ${
                            tieneTelefono
                              ? "cursor-pointer border-slate-300 bg-white"
                              : "cursor-not-allowed border-slate-200 bg-slate-100 opacity-60"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={
                              solicitudDocsPorSms &&
                              tieneTelefono
                            }
                            disabled={
                              solicitandoDocs ||
                              !tieneTelefono
                            }
                            onChange={(e) =>
                              setSolicitudDocsPorSms(
                                e.target.checked
                              )
                            }
                            className="mt-1 h-4 w-4"
                          />

                          <span>
                            <span className="block font-extrabold text-slate-900">
                              📱 Mensaje de texto (SMS)
                            </span>
                            <span className="mt-1 block text-sm text-slate-600">
                              {tieneTelefono
                                ? contacto.phone
                                : "No hay teléfono registrado"}
                            </span>
                          </span>
                        </label>
                      </div>

                      <p className="mt-2 text-xs font-semibold text-slate-500">
                        RELYDO detecta automáticamente el correo y el teléfono guardados por el profesional. No tienes que escribirlos manualmente.
                      </p>
                    </div>

                    <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
                      La solicitud siempre quedará registrada en RELYDO. Si seleccionas correo o SMS, el profesional recibirá un enlace para iniciar sesión y subir únicamente la documentación solicitada aunque su cuenta continúe en revisión.
                    </div>
                  </div>
                );
              })()}

              {solicitudDocsError && (
                <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm font-bold text-red-700">
                  {solicitudDocsError}
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">

                <button
                  type="button"
                  disabled={solicitandoDocs}
                  onClick={cerrarSolicitudDocumentos}
                  className="rounded-xl border-2 border-slate-300 bg-white px-5 py-3 font-extrabold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  disabled={
                    solicitandoDocs ||
                    !solicitudDocsMensaje.trim()
                  }
                  onClick={solicitarDocumentos}
                  className="rounded-xl bg-amber-500 px-5 py-3 font-extrabold text-slate-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {solicitandoDocs
                    ? "Enviando..."
                    : "📄 Enviar solicitud"}
                </button>

              </div>

            </div>

          </div>

        </div>
      )}

      {reclamoParcial && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
          onMouseDown={(e) => {
            if (
              e.target ===
              e.currentTarget
            ) {
              cerrarResolucionParcial();
            }
          }}
        >
          <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">

            <div className="bg-purple-700 px-6 py-5 text-white sm:px-8">
              <div className="flex items-start justify-between gap-4">

                <div>
                  <p className="text-sm font-extrabold uppercase tracking-wide text-purple-200">
                    ⚖️ Resolución parcial
                  </p>

                  <h3 className="mt-1 text-2xl font-black">
                    Dividir el dinero del reclamo
                  </h3>

                  <p className="mt-2 text-sm leading-6 text-purple-100">
                    Escribe cuánto recibirá el profesional. RELYDO calcula automáticamente cuánto se devuelve al cliente.
                  </p>
                </div>

                <button
                  type="button"
                  disabled={
                    procesandoReclamo ===
                    reclamoParcial.id
                  }
                  onClick={
                    cerrarResolucionParcial
                  }
                  className="rounded-xl bg-white/10 px-3 py-2 text-xl font-black text-white hover:bg-white/20 disabled:opacity-50"
                  aria-label="Cerrar"
                >
                  ×
                </button>

              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-6 sm:p-8">

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">

                <div className="rounded-2xl bg-slate-100 p-4">
                  <p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">
                    Total pagado
                  </p>
                  <p className="mt-1 text-2xl font-black text-slate-900">
                    ${totalPagoParcial.toFixed(2)}
                  </p>
                </div>

                <div className="rounded-2xl bg-green-50 p-4">
                  <p className="text-xs font-extrabold uppercase tracking-wide text-green-700">
                    Profesional
                  </p>
                  <p className="mt-1 text-2xl font-black text-green-800">
                    ${montoProfesionalParcialNumero().toFixed(2)}
                  </p>
                </div>

                <div className="rounded-2xl bg-blue-50 p-4">
                  <p className="text-xs font-extrabold uppercase tracking-wide text-blue-700">
                    Cliente
                  </p>
                  <p className="mt-1 text-2xl font-black text-blue-800">
                    ${reembolsoClienteParcialNumero().toFixed(2)}
                  </p>
                </div>

              </div>

              <div className="mt-6">

                <label className="block">

                  <span className="text-sm font-extrabold text-slate-800">
                    ¿Cuánto recibirá el profesional?
                  </span>

                  <div className="mt-2 flex items-center rounded-2xl border-2 border-slate-300 bg-white px-4 focus-within:border-purple-600">

                    <span className="text-xl font-black text-slate-500">
                      $
                    </span>

                    <input
                      type="number"
                      min="0"
                      max={
                        maxProfesionalParcial
                      }
                      step="0.01"
                      inputMode="decimal"
                      value={
                        montoProfesionalParcial
                      }
                      onChange={(e) => {
                        setMontoProfesionalParcial(
                          e.target.value
                        );
                        setErrorParcial("");
                      }}
                      placeholder="0.00"
                      className="w-full bg-transparent px-3 py-4 text-2xl font-black text-slate-900 outline-none"
                      autoFocus
                    />

                  </div>

                  <p className="mt-2 text-sm text-slate-500">
                    Máximo que puede recibir el profesional:{" "}
                    <span className="font-extrabold text-slate-700">
                      ${maxProfesionalParcial.toFixed(2)}
                    </span>
                  </p>

                </label>

              </div>

              <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-5">

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">

                  <div>
                    <p className="text-sm font-extrabold text-blue-900">
                      Reembolso automático al cliente
                    </p>
                    <p className="mt-1 text-sm text-blue-700">
                      Total pagado − pago al profesional
                    </p>
                  </div>

                  <div className="text-3xl font-black text-blue-900">
                    ${reembolsoClienteParcialNumero().toFixed(2)}
                  </div>

                </div>

              </div>

              <div className="mt-5">

                <label className="block">

                  <span className="text-sm font-extrabold text-slate-800">
                    Nota de resolución *
                  </span>

                  <textarea
                    value={
                      notaParcial
                    }
                    onChange={(e) => {
                      setNotaParcial(
                        e.target.value
                      );
                      setErrorParcial("");
                    }}
                    rows={4}
                    maxLength={1000}
                    placeholder="Explica brevemente por qué se decidió esta distribución..."
                    className="mt-2 w-full resize-none rounded-2xl border-2 border-slate-300 px-4 py-3 text-slate-900 outline-none focus:border-purple-600"
                  />

                  <div className="mt-1 text-right text-xs text-slate-400">
                    {notaParcial.length}/1000
                  </div>

                </label>

              </div>

              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">

                <div className="flex items-center justify-between gap-4">
                  <span className="font-bold text-slate-600">
                    Comprobación
                  </span>

                  <span className="font-black text-slate-900">
                    ${montoProfesionalParcialNumero().toFixed(2)}
                    {" + "}
                    ${reembolsoClienteParcialNumero().toFixed(2)}
                    {" = "}
                    ${totalPagoParcial.toFixed(2)}
                  </span>
                </div>

              </div>

              {errorParcial && (
                <div className="mt-5 rounded-2xl border border-red-300 bg-red-50 p-4 font-bold text-red-700">
                  {errorParcial}
                </div>
              )}

              <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">

                <button
                  type="button"
                  disabled={
                    procesandoReclamo ===
                    reclamoParcial.id
                  }
                  onClick={
                    cerrarResolucionParcial
                  }
                  className="rounded-xl border-2 border-slate-300 bg-white px-6 py-3 font-extrabold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  disabled={
                    procesandoReclamo ===
                    reclamoParcial.id
                  }
                  onClick={
                    confirmarResolucionParcial
                  }
                  className="rounded-xl bg-purple-700 px-6 py-3 font-extrabold text-white hover:bg-purple-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {procesandoReclamo ===
                  reclamoParcial.id
                    ? "Procesando..."
                    : "⚖️ Confirmar resolución"}
                </button>

              </div>

            </div>

          </div>
        </div>
      )}

    </main>
  );
}

/*
  TARJETA RESUMEN
*/

function EvidenciaAdminCard({
  evidencia,
}: {
  evidencia: ClaimEvidenceAdmin;
}) {
  const url =
    evidencia.signed_url;

  if (!url) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4">
        <p className="text-sm font-extrabold text-red-800">
          No se pudo abrir este archivo.
        </p>

        <p className="mt-1 text-xs text-red-600">
          Actualiza los reclamos para generar un nuevo enlace seguro.
        </p>
      </div>
    );
  }

  if (
    evidencia.file_type ===
    "video"
  ) {
    return (
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">

        <video
          controls
          preload="metadata"
          className="h-48 w-full bg-black object-contain"
          src={url}
        >
          Tu navegador no puede reproducir este video.
        </video>

        <div className="p-3">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full rounded-lg bg-slate-900 px-3 py-2 text-center text-sm font-extrabold text-white hover:bg-slate-700"
          >
            🎥 Abrir video
          </a>
        </div>

      </div>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="group overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
    >
      <img
        src={url}
        alt="Evidencia del reclamo"
        className="h-48 w-full object-cover transition duration-300 group-hover:scale-105"
      />

      <div className="p-3 text-center text-sm font-extrabold text-blue-700">
        🖼️ Abrir foto
      </div>
    </a>
  );
}

function TarjetaResumen({
  titulo,
  valor,
  clase,
  onClick,
  activo = false,
}: {
  titulo: string;
  valor: number;
  clase: string;
  onClick?: () => void;
  activo?: boolean;
}) {
  if (!onClick) {
    return (
      <div className="rounded-2xl bg-white p-6 shadow">

        <p className="text-sm font-bold text-slate-500">
          {titulo}
        </p>

        <p
          className={`mt-2 text-3xl font-black ${clase}`}
        >
          {valor}
        </p>

      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={
        onClick
      }
      className={`group w-full cursor-pointer rounded-2xl bg-white p-6 text-left shadow transition duration-200 hover:-translate-y-1 hover:shadow-lg focus:outline-none focus:ring-4 focus:ring-blue-100 ${
        activo
          ? "ring-2 ring-blue-500"
          : ""
      }`}
      title={`Ver ${titulo}`}
    >

      <div className="flex items-start justify-between gap-3">

        <p className="text-sm font-bold text-slate-500 transition group-hover:text-slate-800">
          {titulo}
        </p>

        <span className="text-lg font-black text-slate-300 transition group-hover:translate-x-1 group-hover:text-blue-600">
          →
        </span>

      </div>

      <p
        className={`mt-2 text-3xl font-black ${clase}`}
      >
        {valor}
      </p>

    </button>
  );
}

/*
  BOTÓN FILTRO
*/

function FiltroBoton({
  activo,
  texto,
  onClick,
}: {
  activo: boolean;
  texto: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={
        onClick
      }
      className={`rounded-xl px-4 py-2 text-sm font-extrabold transition ${
        activo
          ? "bg-blue-700 text-white"
          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
      }`}
    >
      {texto}
    </button>
  );
}