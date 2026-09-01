"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/app/components/LanguageProvider";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

const ADMIN_EMAIL = "info@melendivip.com";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const ALLOWED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
];

type ProviderProfile = {
  user_id: string;
  business_name: string | null;

  license_required: boolean | null;
  license_number: string | null;

  insured: boolean | null;
  insurance_company: string | null;

  bonded: boolean | null;

  verification_status: string | null;
  verified: boolean | null;
  active: boolean | null;
};

type ProviderDocument = {
  id: string;
  document_type: string;
  status: string | null;
};

type DocumentType =
  | "license"
  | "insurance"
  | "bond"
  | "other";

export default function CompletarVerificacion() {
  const router = useRouter();
  const { language } = useLanguage();

  const text =
    language === "es"
      ? {
          cuentaNoEncontrada:
            "No pudimos encontrar tu cuenta de RELYDO.",

          perfilIncompleto:
            "Tu perfil profesional todavía no está completo.",

          soloArchivos:
            "solo se permiten archivos PDF, JPG o PNG.",

          maximoArchivo:
            "el archivo no puede superar 10 MB.",

          usuarioNoAutenticado:
            "No hay un usuario autenticado.",

          errorSubida:
            "No se pudo subir",

          errorRegistroArchivo:
            "El archivo se subió, pero no pudo registrarse en la base de datos",

          perfilNoIdentificado:
            "No pudimos identificar tu perfil profesional.",

          licenciaObligatoria:
            "Tu perfil indica que necesitas licencia. Debes subir una copia de tu licencia.",

          seguroObligatorio:
            "Tu perfil indica que tienes seguro. Debes subir un comprobante de seguro.",

          bondObligatorio:
            "Tu perfil indica que tienes bond/fianza. Debes subir un comprobante.",

          documentoMinimo:
            "Debes subir al menos un documento para solicitar la verificación.",

          actualizarEstado:
            "Los documentos se enviaron, pero no se pudo actualizar tu estado",

          errorInesperado:
            "Ocurrió un error inesperado.",

          comprobandoSesion:
            "Comprobando sesión...",

          noCargarVerificacion:
            "No pudimos cargar la verificación",

          cerrarSesion:
            "Cerrar sesión",

          completarVerificacion:
            "Completar verificación profesional",

          subirDocumentos:
            "Sube tus documentos para solicitar la revisión de tu cuenta.",

          volverPanel:
            "Volver al panel",

          cuenta:
            "Cuenta",

          documentosRequeridos:
            "Documentos requeridos",

          licencia:
            "Licencia",

          requerida:
            "Requerida",

          noRequerida:
            "No requerida",

          seguro:
            "Seguro",

          requerido:
            "Requerido",

          noRequerido:
            "No requerido",

          bondFianza:
            "Bond/Fianza",

          licenciaProfesional:
            "Licencia profesional",

          licenciaDescripcionSi:
            "Este documento es obligatorio según la información de tu perfil.",

          licenciaDescripcionNo:
            "Sube este documento si corresponde a tu actividad.",

          seguroDescripcionSi:
            "Tu perfil indica que tienes seguro. Debes subir un comprobante vigente.",

          seguroDescripcionNo:
            "Sube el comprobante si tienes seguro de responsabilidad.",

          bondDescripcionSi:
            "Tu perfil indica que tienes bond/fianza. Debes subir el comprobante.",

          bondDescripcionNo:
            "Sube este documento si corresponde.",

          otroDocumento:
            "Otro documento de verificación",

          otroDocumentoDescripcion:
            "Si tu actividad no requiere licencia, seguro o bond/fianza, puedes enviar otro documento relacionado con tu negocio o actividad profesional para revisión.",

          verificacionRequerida:
            "Verificación requerida",

          avisoVerificacion:
            "Enviar documentos no significa que tu cuenta ya esté verificada. Tu estado permanecerá pendiente hasta que RELYDO complete la revisión.",

          formatosPermitidos:
            "Formatos permitidos: PDF, JPG y PNG. Máximo 10 MB por archivo.",

          subiendo:
            "Enviando documentos...",

          enviar:
            "Enviar documentos para verificación",

          // PANTALLA FINAL
          documentacionEnviada:
            "Documentación enviada con éxito",

          documentosRecibidos:
            "Hemos recibido correctamente tus documentos de verificación.",

          estadoRevision:
            "Tu cuenta está en revisión",

          revisionDescripcion:
            "RELYDO revisará la información y los documentos que enviaste.",

          notificacionDescripcion:
            "Te notificaremos cuando tu cuenta haya sido aprobada o si necesitamos información o documentación adicional.",

          accesoTrabajos:
            "Mientras tu cuenta esté en revisión, todavía no tendrás acceso a los trabajos disponibles.",

          noReenviar:
            "No necesitas enviar los documentos nuevamente.",

          cerrarVentana:
            "Ya puedes cerrar esta ventana de forma segura.",

          salir:
            "Cerrar sesión",

          documentosRegistrados:
            "Documentos recibidos",

          enRevision:
            "En revisión",
        }
      : {
          cuentaNoEncontrada:
            "We could not find your RELYDO account.",

          perfilIncompleto:
            "Your professional profile is not complete yet.",

          soloArchivos:
            "only PDF, JPG, or PNG files are allowed.",

          maximoArchivo:
            "the file cannot exceed 10 MB.",

          usuarioNoAutenticado:
            "There is no authenticated user.",

          errorSubida:
            "Could not upload",

          errorRegistroArchivo:
            "The file was uploaded, but it could not be saved in the database",

          perfilNoIdentificado:
            "We could not identify your professional profile.",

          licenciaObligatoria:
            "Your profile indicates that a license is required. You must upload a copy of your license.",

          seguroObligatorio:
            "Your profile indicates that you are insured. You must upload proof of insurance.",

          bondObligatorio:
            "Your profile indicates that you are bonded. You must upload proof of bond.",

          documentoMinimo:
            "You must upload at least one document to request verification.",

          actualizarEstado:
            "The documents were submitted, but we could not update your status",

          errorInesperado:
            "An unexpected error occurred.",

          comprobandoSesion:
            "Checking session...",

          noCargarVerificacion:
            "We couldn't load verification",

          cerrarSesion:
            "Sign out",

          completarVerificacion:
            "Complete professional verification",

          subirDocumentos:
            "Upload your documents to request an account review.",

          volverPanel:
            "Back to dashboard",

          cuenta:
            "Account",

          documentosRequeridos:
            "Required documents",

          licencia:
            "License",

          requerida:
            "Required",

          noRequerida:
            "Not required",

          seguro:
            "Insurance",

          requerido:
            "Required",

          noRequerido:
            "Not required",

          bondFianza:
            "Bond",

          licenciaProfesional:
            "Professional license",

          licenciaDescripcionSi:
            "This document is required based on your profile information.",

          licenciaDescripcionNo:
            "Upload this document if it applies to your work.",

          seguroDescripcionSi:
            "Your profile indicates that you are insured. You must upload valid proof of insurance.",

          seguroDescripcionNo:
            "Upload proof if you carry liability insurance.",

          bondDescripcionSi:
            "Your profile indicates that you are bonded. You must upload proof of bond.",

          bondDescripcionNo:
            "Upload this document if applicable.",

          otroDocumento:
            "Other verification document",

          otroDocumentoDescripcion:
            "If your work does not require a license, insurance, or bond, you may submit another document related to your business or professional activity for review.",

          verificacionRequerida:
            "Verification required",

          avisoVerificacion:
            "Submitting documents does not mean your account is verified. Your status will remain pending until RELYDO completes the review.",

          formatosPermitidos:
            "Allowed formats: PDF, JPG, and PNG. Maximum 10 MB per file.",

          subiendo:
            "Submitting documents...",

          enviar:
            "Submit documents for verification",

          // FINAL SCREEN
          documentacionEnviada:
            "Documents submitted successfully",

          documentosRecibidos:
            "We have successfully received your verification documents.",

          estadoRevision:
            "Your account is under review",

          revisionDescripcion:
            "RELYDO will review the information and documents you submitted.",

          notificacionDescripcion:
            "We will notify you when your account has been approved or if we need additional information or documentation.",

          accesoTrabajos:
            "While your account is under review, you will not yet have access to available jobs.",

          noReenviar:
            "You do not need to submit your documents again.",

          cerrarVentana:
            "You may now safely close this window.",

          salir:
            "Sign out",

          documentosRegistrados:
            "Documents received",

          enRevision:
            "Under review",
        };

  const [loading, setLoading] = useState(true);
  const [subiendo, setSubiendo] = useState(false);

  const [error, setError] = useState("");

  const [userId, setUserId] =
    useState<string | null>(null);

  const [email, setEmail] = useState("");

  const [profile, setProfile] =
    useState<ProviderProfile | null>(null);

  const [documents, setDocuments] =
    useState<ProviderDocument[]>([]);

  const [documentacionEnviada, setDocumentacionEnviada] =
    useState(false);

  useEffect(() => {
    cargarUsuario();
  }, []);

  async function cargarUsuario() {
    setLoading(true);
    setError("");

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      router.replace("/login-profesional");
      return;
    }

    const userEmail =
      user.email?.toLowerCase() || "";

    if (
      userEmail ===
      ADMIN_EMAIL.toLowerCase()
    ) {
      router.replace("/admin");
      return;
    }

    const {
      data: baseProfile,
      error: baseProfileError,
    } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (
      baseProfileError ||
      !baseProfile
    ) {
      setError(
        text.cuentaNoEncontrada
      );

      setLoading(false);
      return;
    }

    if (baseProfile.role !== "provider") {
      router.replace("/");
      return;
    }

    const {
      data: providerProfile,
      error: providerError,
    } = await supabase
      .from("provider_profiles")
      .select(`
        user_id,
        business_name,
        license_required,
        license_number,
        insured,
        insurance_company,
        bonded,
        verification_status,
        verified,
        active
      `)
      .eq("user_id", user.id)
      .single();

    if (
      providerError ||
      !providerProfile
    ) {
      setError(
        text.perfilIncompleto
      );

      setLoading(false);
      return;
    }

    /*
      IMPORTANTE:

      provider_documents usa user_id.
      No usamos provider_id porque esa columna
      no existe en esta tabla.
    */

    const {
      data: providerDocuments,
      error: documentsError,
    } = await supabase
      .from("provider_documents")
      .select(`
        id,
        document_type,
        status
      `)
      .eq("user_id", user.id);

    if (documentsError) {
      console.error(
        "Error cargando documentos:",
        documentsError
      );

      setError(
        documentsError.message
      );

      setLoading(false);
      return;
    }

    const docs =
      (providerDocuments || []) as ProviderDocument[];

    setUserId(user.id);
    setEmail(user.email || "");
    setProfile(providerProfile);
    setDocuments(docs);

    /*
      Si ya tiene documentos registrados
      y todavía no está verificado/activo,
      NO debe volver a ver el formulario.

      Se muestra directamente la pantalla
      "Documentación enviada / En revisión".
    */

    if (
      docs.length > 0 &&
      providerProfile.verified !== true
    ) {
      setDocumentacionEnviada(true);
    }

    /*
      Si por alguna razón llega aquí
      estando completamente aprobado,
      lo mandamos al panel profesional.
    */

    if (
      providerProfile.verified === true &&
      providerProfile.active === true &&
      providerProfile.verification_status ===
        "verified"
    ) {
      router.replace("/panel-profesional");
      return;
    }

    setLoading(false);
  }

  function validarArchivo(
    file: File,
    nombre: string
  ) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      throw new Error(
        `${nombre}: ${text.soloArchivos}`
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new Error(
        `${nombre}: ${text.maximoArchivo}`
      );
    }
  }

  async function subirDocumento(
    file: File,
    documentType: DocumentType
  ) {
    if (!userId) {
      throw new Error(
        text.usuarioNoAutenticado
      );
    }

    validarArchivo(
      file,
      documentType
    );

    const extension =
      file.name
        .split(".")
        .pop()
        ?.toLowerCase() || "file";

    const uniqueId =
      crypto.randomUUID();

    const fileName =
      `${documentType}-${uniqueId}.${extension}`;

    /*
      La primera carpeta SIEMPRE es el UID.

      Esto coincide con las políticas RLS
      configuradas en Storage.
    */

    const filePath =
      `${userId}/${fileName}`;

    const {
      error: uploadError,
    } = await supabase.storage
      .from("provider-documents")
      .upload(
        filePath,
        file,
        {
          cacheControl: "3600",
          upsert: false,
        }
      );

    if (uploadError) {
      throw new Error(
        `${text.errorSubida} ${documentType}: ${uploadError.message}`
      );
    }

    const {
      data: insertedDocument,
      error: documentError,
    } = await supabase
      .from("provider_documents")
      .insert({
        user_id: userId,
        document_type: documentType,
        file_path: filePath,
        status: "pending",
      })
      .select(`
        id,
        document_type,
        status
      `)
      .single();

    if (documentError) {
      await supabase.storage
        .from("provider-documents")
        .remove([filePath]);

      throw new Error(
        `${text.errorRegistroArchivo}: ${documentError.message}`
      );
    }

    return insertedDocument as ProviderDocument;
  }

  async function handleSubmit(
    e: React.FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    /*
      Protección adicional:
      si ya se está enviando o ya fueron enviados,
      no hacemos absolutamente nada.
    */

    if (
      subiendo ||
      documentacionEnviada
    ) {
      return;
    }

    if (!profile || !userId) {
      setError(
        text.perfilNoIdentificado
      );

      return;
    }

    setError("");
    setSubiendo(true);

    const form = e.currentTarget;

    const formData =
      new FormData(form);

    const licenseFile =
      formData.get("license_file") instanceof File
        ? (formData.get(
            "license_file"
          ) as File)
        : null;

    const insuranceFile =
      formData.get("insurance_file") instanceof File
        ? (formData.get(
            "insurance_file"
          ) as File)
        : null;

    const bondFile =
      formData.get("bond_file") instanceof File
        ? (formData.get(
            "bond_file"
          ) as File)
        : null;

    const otherFile =
      formData.get("other_file") instanceof File
        ? (formData.get(
            "other_file"
          ) as File)
        : null;

    const tieneLicencia =
      !!licenseFile &&
      licenseFile.size > 0;

    const tieneSeguro =
      !!insuranceFile &&
      insuranceFile.size > 0;

    const tieneBond =
      !!bondFile &&
      bondFile.size > 0;

    const tieneOtro =
      !!otherFile &&
      otherFile.size > 0;

    /*
      REQUISITOS SEGÚN PERFIL
    */

    if (
      profile.license_required &&
      !tieneLicencia
    ) {
      setError(
        text.licenciaObligatoria
      );

      setSubiendo(false);
      return;
    }

    if (
      profile.insured &&
      !tieneSeguro
    ) {
      setError(
        text.seguroObligatorio
      );

      setSubiendo(false);
      return;
    }

    if (
      profile.bonded &&
      !tieneBond
    ) {
      setError(
        text.bondObligatorio
      );

      setSubiendo(false);
      return;
    }

    /*
      RELYDO necesita al menos un documento.
    */

    if (
      !tieneLicencia &&
      !tieneSeguro &&
      !tieneBond &&
      !tieneOtro
    ) {
      setError(
        text.documentoMinimo
      );

      setSubiendo(false);
      return;
    }

    try {
      const nuevosDocumentos:
        ProviderDocument[] = [];

      if (
        tieneLicencia &&
        licenseFile
      ) {
        const doc =
          await subirDocumento(
            licenseFile,
            "license"
          );

        nuevosDocumentos.push(doc);
      }

      if (
        tieneSeguro &&
        insuranceFile
      ) {
        const doc =
          await subirDocumento(
            insuranceFile,
            "insurance"
          );

        nuevosDocumentos.push(doc);
      }

      if (
        tieneBond &&
        bondFile
      ) {
        const doc =
          await subirDocumento(
            bondFile,
            "bond"
          );

        nuevosDocumentos.push(doc);
      }

      if (
        tieneOtro &&
        otherFile
      ) {
        const doc =
          await subirDocumento(
            otherFile,
            "other"
          );

        nuevosDocumentos.push(doc);
      }

      /*
        DOCUMENTOS ENVIADOS:

        pending
        verified = false
        active = false

        Solo Admin podrá aprobar la cuenta.
      */

      const {
        error: profileError,
      } = await supabase
        .from("provider_profiles")
        .update({
          verification_status:
            "pending",

          verified: false,

          active: false,
        })
        .eq(
          "user_id",
          userId
        );

      if (profileError) {
        throw new Error(
          `${text.actualizarEstado}: ${profileError.message}`
        );
      }

      setProfile({
        ...profile,

        verification_status:
          "pending",

        verified: false,

        active: false,
      });

      setDocuments(
        nuevosDocumentos
      );

      /*
        ÉXITO.

        A partir de aquí desaparece completamente
        el formulario y el profesional entra
        en la pantalla de revisión.
      */

      setDocumentacionEnviada(true);

      form.reset();

    } catch (err) {
      console.error(err);

      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError(
          text.errorInesperado
        );
      }

    } finally {
      setSubiendo(false);
    }
  }

  async function cerrarSesion() {
    await supabase.auth.signOut();

    router.replace(
      "/login-profesional"
    );
  }

  /*
    LOADING
  */

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-100 flex items-center justify-center px-4">

        <div className="rounded-2xl bg-white px-8 py-7 shadow-lg">

          <p className="font-semibold text-slate-700">
            {text.comprobandoSesion}
          </p>

        </div>

      </main>
    );
  }

  /*
    ERROR DE CARGA
  */

  if (error && !profile) {
    return (
      <main className="min-h-screen bg-slate-100 flex items-center justify-center px-4">

        <div className="w-full max-w-lg rounded-3xl bg-white p-8 shadow-xl">

          <h1 className="text-2xl font-extrabold text-red-700">
            {text.noCargarVerificacion}
          </h1>

          <p className="mt-4 text-slate-700">
            {error}
          </p>

          <button
            type="button"
            onClick={cerrarSesion}
            className="mt-6 w-full rounded-xl bg-slate-900 px-5 py-3 font-bold text-white"
          >
            {text.cerrarSesion}
          </button>

        </div>

      </main>
    );
  }

  /*
    =====================================================
    DOCUMENTOS YA ENVIADOS
    =====================================================

    El profesional NO tiene acceso al formulario
    mientras esté pendiente de revisión.
  */

  if (
    documentacionEnviada &&
    profile
  ) {
    return (
      <main className="min-h-screen bg-slate-100 px-4 py-10">

        <div className="mx-auto max-w-2xl">

          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl">

            {/* HEADER */}

            <div className="bg-blue-700 px-8 py-8 text-white">

              <div className="text-2xl font-black">
                RELYDO
              </div>

              <h1 className="mt-3 text-3xl font-extrabold">
                {text.documentacionEnviada}
              </h1>

              <p className="mt-2 text-blue-100">
                {text.documentosRecibidos}
              </p>

            </div>

            <div className="p-8 sm:p-10">

              {/* CHECK */}

              <div className="flex justify-center">

                <div className="flex h-24 w-24 items-center justify-center rounded-full bg-green-100 text-5xl">
                  ✓
                </div>

              </div>

              {/* ESTADO */}

              <div className="mt-7 text-center">

                <div className="inline-flex rounded-full bg-amber-100 px-5 py-2 text-sm font-extrabold text-amber-800">
                  ⏳ {text.enRevision}
                </div>

                <h2 className="mt-5 text-2xl font-extrabold text-slate-900">
                  {text.estadoRevision}
                </h2>

                {profile.business_name && (
                  <p className="mt-2 font-semibold text-slate-600">
                    {profile.business_name}
                  </p>
                )}

              </div>

              {/* INFORMACIÓN */}

              <div className="mt-8 rounded-2xl border border-blue-200 bg-blue-50 p-6">

                <p className="font-semibold leading-7 text-slate-800">
                  {text.revisionDescripcion}
                </p>

                <p className="mt-3 leading-7 text-slate-700">
                  {text.notificacionDescripcion}
                </p>

              </div>

              {/* DOCUMENTOS RECIBIDOS */}

              <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-6">

                <div className="flex items-center justify-between gap-4">

                  <div>

                    <p className="font-extrabold text-slate-900">
                      {text.documentosRegistrados}
                    </p>

                    <p className="mt-1 text-sm text-slate-600">
                      {email}
                    </p>

                  </div>

                  <div className="rounded-xl bg-white px-4 py-2 text-xl font-black text-blue-700 shadow-sm">
                    {documents.length}
                  </div>

                </div>

              </div>

              {/* ACCESO BLOQUEADO */}

              <div className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-6">

                <p className="font-bold leading-7 text-amber-900">
                  {text.accesoTrabajos}
                </p>

                <p className="mt-3 leading-7 text-amber-800">
                  {text.noReenviar}
                </p>

              </div>

              {/* CERRAR VENTANA */}

              <div className="mt-8 text-center">

                <p className="text-lg font-extrabold text-slate-900">
                  {text.cerrarVentana}
                </p>

              </div>

              {/* LOGOUT */}

              <button
                type="button"
                onClick={cerrarSesion}
                className="mt-7 w-full rounded-xl border-2 border-blue-700 bg-white px-6 py-4 text-lg font-extrabold text-blue-700 transition hover:bg-blue-50"
              >
                {text.salir}
              </button>

            </div>

          </div>

        </div>

      </main>
    );
  }

  /*
    =====================================================
    FORMULARIO PARA QUIEN TODAVÍA NO HA ENVIADO DOCUMENTOS
    =====================================================
  */

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-10">

      <div className="mx-auto max-w-3xl">

        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl">

          {/* HEADER */}

          <div className="bg-blue-700 px-8 py-7 text-white">

            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">

              <div>

                <div className="text-2xl font-black">
                  RELYDO
                </div>

                <h1 className="mt-2 text-3xl font-extrabold">
                  {text.completarVerificacion}
                </h1>

                <p className="mt-2 text-blue-100">
                  {text.subirDocumentos}
                </p>

              </div>

              <button
                type="button"
                onClick={() =>
                  router.push(
                    "/panel-profesional"
                  )
                }
                className="w-fit rounded-xl border border-white/30 bg-white/10 px-4 py-2 text-sm font-bold text-white hover:bg-white/20"
              >
                {text.volverPanel}
              </button>

            </div>

          </div>

          <div className="p-8">

            {/* CUENTA */}

            <div className="mb-8 rounded-2xl border border-blue-200 bg-blue-50 p-5">

              <p className="font-bold text-slate-900">
                {text.cuenta}
              </p>

              <p className="mt-1 text-slate-700">
                {email}
              </p>

              {profile?.business_name && (
                <p className="mt-1 font-semibold text-slate-900">
                  {profile.business_name}
                </p>
              )}

            </div>

            {/* REQUISITOS */}

            <div className="mb-8 rounded-2xl border border-slate-200 bg-slate-50 p-5">

              <h2 className="font-extrabold text-slate-900">
                {text.documentosRequeridos}
              </h2>

              <div className="mt-3 space-y-2 text-sm text-slate-700">

                <p>
                  {text.licencia}:{" "}
                  <strong>
                    {profile?.license_required
                      ? text.requerida
                      : text.noRequerida}
                  </strong>
                </p>

                <p>
                  {text.seguro}:{" "}
                  <strong>
                    {profile?.insured
                      ? text.requerido
                      : text.noRequerido}
                  </strong>
                </p>

                <p>
                  {text.bondFianza}:{" "}
                  <strong>
                    {profile?.bonded
                      ? text.requerido
                      : text.noRequerido}
                  </strong>
                </p>

              </div>

            </div>

            <form
              onSubmit={handleSubmit}
              className="space-y-8"
            >

              {/* LICENCIA */}

              <section>

                <h2 className="mb-3 text-xl font-extrabold text-blue-700">
                  🪪 {text.licenciaProfesional}
                </h2>

                <p className="mb-4 text-sm text-slate-600">
                  {profile?.license_required
                    ? text.licenciaDescripcionSi
                    : text.licenciaDescripcionNo}
                </p>

                <input
                  name="license_file"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  disabled={subiendo}
                  className="w-full rounded-xl border border-slate-300 bg-white p-4 text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                />

              </section>

              <div className="border-t border-slate-200" />

              {/* SEGURO */}

              <section>

                <h2 className="mb-3 text-xl font-extrabold text-blue-700">
                  🛡️ {text.seguro}
                </h2>

                <p className="mb-4 text-sm text-slate-600">
                  {profile?.insured
                    ? text.seguroDescripcionSi
                    : text.seguroDescripcionNo}
                </p>

                <input
                  name="insurance_file"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  disabled={subiendo}
                  className="w-full rounded-xl border border-slate-300 bg-white p-4 text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                />

              </section>

              <div className="border-t border-slate-200" />

              {/* BOND */}

              <section>

                <h2 className="mb-3 text-xl font-extrabold text-blue-700">
                  🛡️ {text.bondFianza}
                </h2>

                <p className="mb-4 text-sm text-slate-600">
                  {profile?.bonded
                    ? text.bondDescripcionSi
                    : text.bondDescripcionNo}
                </p>

                <input
                  name="bond_file"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  disabled={subiendo}
                  className="w-full rounded-xl border border-slate-300 bg-white p-4 text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                />

              </section>

              <div className="border-t border-slate-200" />

              {/* OTRO */}

              <section>

                <h2 className="mb-3 text-xl font-extrabold text-blue-700">
                  📄 {text.otroDocumento}
                </h2>

                <p className="mb-4 text-sm text-slate-600">
                  {text.otroDocumentoDescripcion}
                </p>

                <input
                  name="other_file"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  disabled={subiendo}
                  className="w-full rounded-xl border border-slate-300 bg-white p-4 text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                />

              </section>

              {/* AVISO */}

              <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5">

                <h3 className="font-extrabold text-amber-900">
                  {text.verificacionRequerida}
                </h3>

                <p className="mt-2 text-sm leading-6 text-amber-800">
                  {text.avisoVerificacion}
                </p>

                <p className="mt-2 text-sm text-amber-800">
                  {text.formatosPermitidos}
                </p>

              </div>

              {/* ERROR */}

              {error && (
                <div className="rounded-xl border border-red-300 bg-red-50 p-4 font-medium text-red-700">
                  {error}
                </div>
              )}

              {/* BOTÓN */}

              <button
                type="submit"
                disabled={
                  subiendo ||
                  documentacionEnviada
                }
                className="w-full rounded-xl bg-blue-700 px-6 py-4 text-lg font-extrabold text-white shadow-md transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {subiendo
                  ? text.subiendo
                  : text.enviar}
              </button>

            </form>

          </div>

        </div>

      </div>

    </main>
  );
}