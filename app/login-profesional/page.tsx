"use client";

import { useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useRouter, useSearchParams } from "next/navigation";
import { useLanguage } from "@/app/components/LanguageProvider";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);


type SolicitudDocumentoPendiente = {
  id: string;
  provider_id: string;
  document_type: string | null;
  message: string;
  status: string;
  requested_at: string;
  submitted_at: string | null;
};

export default function LoginProfesional() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { language } = useLanguage();

  const redirectParam = searchParams.get("redirect");

  const redirectProfesional =
    redirectParam &&
    redirectParam.startsWith("/") &&
    !redirectParam.startsWith("//") &&
    !redirectParam.startsWith("/login-profesional")
      ? redirectParam
      : "/panel-profesional";

  const text =
    language === "es"
      ? {
          noIniciarSesion: "No se pudo iniciar sesión.",
          noComprobarCuenta: "No se pudo comprobar tu cuenta",
          perfilNoValido:
            "No se encontró un perfil válido para esta cuenta.",
          noCargarPerfil:
            "No se pudo cargar el perfil profesional",
          sinAcceso:
            "Esta cuenta no tiene acceso al portal profesional.",
          errorLogin:
            "Ocurrió un error inesperado al iniciar sesión.",
          escribeEmail:
            "Escribe primero tu correo para recuperar tu contraseña.",
          correoRecuperacion:
            "Te enviamos un correo para cambiar tu contraseña. Revisa también la carpeta de Spam o correo no deseado.",
          limiteCorreos:
            "Se han solicitado demasiados correos en poco tiempo. Espera antes de intentarlo de nuevo.",
          noEnviarCorreo:
            "No se pudo enviar el correo",
          noEnviarRecuperacion:
            "No se pudo enviar el correo de recuperación de contraseña.",
          titulo: "Iniciar sesión como profesional",
          descripcion:
            "Inicia sesión para acceder a tu cuenta.",
          volverInicio: "Volver al inicio",
          continuarGoogle: "Continuar con Google",
          conectandoGoogle: "Conectando con Google...",
          separador: "o continúa con email",
          errorGoogle: "No se pudo iniciar sesión con Google.",
          email: "Email",
          emailPlaceholder: "tu@email.com",
          password: "Contraseña",
          passwordPlaceholder: "Tu contraseña",
          enviandoCorreo: "Enviando correo...",
          olvidoPassword: "¿Olvidaste tu contraseña?",
          entrando: "Entrando...",
          iniciarSesion: "Iniciar sesión",
          noCuenta: "¿Todavía no tienes cuenta?",
          registrate: "Regístrate como profesional",
        }
      : {
          noIniciarSesion: "Unable to sign in.",
          noComprobarCuenta: "We could not verify your account",
          perfilNoValido:
            "No valid profile was found for this account.",
          noCargarPerfil:
            "We could not load the professional profile",
          sinAcceso:
            "This account does not have access to the professional portal.",
          errorLogin:
            "An unexpected error occurred while signing in.",
          escribeEmail:
            "Enter your email first to reset your password.",
          correoRecuperacion:
            "We sent you an email to change your password. Check your Spam or Junk folder as well.",
          limiteCorreos:
            "Too many emails have been requested in a short period. Please wait before trying again.",
          noEnviarCorreo:
            "We could not send the email",
          noEnviarRecuperacion:
            "We could not send the password recovery email.",
          titulo: "Professional sign in",
          descripcion:
            "Sign in to access your account.",
          volverInicio: "Back to home",
          continuarGoogle: "Continue with Google",
          conectandoGoogle: "Connecting with Google...",
          separador: "or continue with email",
          errorGoogle: "Unable to sign in with Google.",
          email: "Email",
          emailPlaceholder: "you@email.com",
          password: "Password",
          passwordPlaceholder: "Your password",
          enviandoCorreo: "Sending email...",
          olvidoPassword: "Forgot your password?",
          entrando: "Signing in...",
          iniciarSesion: "Sign in",
          noCuenta: "Don't have an account yet?",
          registrate: "Register as a professional",
        };

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");

  const [cargando, setCargando] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [recuperando, setRecuperando] = useState(false);

  const [
    estadoCuenta,
    setEstadoCuenta,
  ] = useState<
    "pending" | "rejected" | "suspended" | null
  >(null);

  const [
    nombreNegocio,
    setNombreNegocio,
  ] = useState("");

  const [
    solicitudesDocumentos,
    setSolicitudesDocumentos,
  ] =
    useState<SolicitudDocumentoPendiente[]>([]);

  const [
    archivosSolicitud,
    setArchivosSolicitud,
  ] =
    useState<Record<string, File | null>>({});

  const [
    enviandoSolicitud,
    setEnviandoSolicitud,
  ] =
    useState<string | null>(null);

  const [
    mensajeDocumentos,
    setMensajeDocumentos,
  ] =
    useState("");

  /*
    ASEGURAR QUE LA ESPECIALIDAD
    EXISTA EN provider_services
  */

  async function asegurarServicioProfesional(
    providerId: string,
    trade: string | null
  ) {
    if (!trade) {
      return;
    }

    const {
      data: servicio,
      error: servicioError,
    } = await supabase
      .from("services")
      .select("id, slug")
      .eq("slug", trade)
      .eq("active", true)
      .maybeSingle();

    if (servicioError) {
      console.error(
        "Error buscando servicio:",
        servicioError
      );
      return;
    }

    if (!servicio) {
      console.warn(
        `No existe un servicio activo con slug "${trade}".`
      );
      return;
    }

    const {
      data: relacionExistente,
      error: relacionError,
    } = await supabase
      .from("provider_services")
      .select("provider_id, service_id")
      .eq("provider_id", providerId)
      .eq("service_id", servicio.id)
      .maybeSingle();

    if (relacionError) {
      console.error(
        "Error comprobando provider_services:",
        relacionError
      );
      return;
    }

    if (relacionExistente) {
      return;
    }

    const {
      error: insertError,
    } = await supabase
      .from("provider_services")
      .insert({
        provider_id: providerId,
        service_id: servicio.id,
      });

    if (insertError) {
      console.error(
        "Error asignando especialidad:",
        insertError
      );
    }
  }

  function nombreTipoDocumento(
    tipo: string | null
  ) {
    if (tipo === "license") {
      return language === "es"
        ? "Licencia"
        : "License";
    }

    if (tipo === "insurance") {
      return language === "es"
        ? "Seguro"
        : "Insurance";
    }

    if (tipo === "bond") {
      return language === "es"
        ? "Bond / Fianza"
        : "Bond";
    }

    if (tipo === "other") {
      return language === "es"
        ? "Otro documento"
        : "Other document";
    }

    return language === "es"
      ? "Documentación adicional"
      : "Additional documentation";
  }

  async function cargarSolicitudesDocumentos(
    providerId: string
  ) {
    const {
      data,
      error:
        solicitudesError,
    } =
      await supabase
        .from(
          "provider_document_requests"
        )
        .select(`
          id,
          provider_id,
          document_type,
          message,
          status,
          requested_at,
          submitted_at
        `)
        .eq(
          "provider_id",
          providerId
        )
        .in(
          "status",
          [
            "pending",
            "submitted",
          ]
        )
        .order(
          "requested_at",
          {
            ascending: false,
          }
        );

    if (solicitudesError) {
      console.error(
        "No se pudieron cargar las solicitudes de documentos:",
        solicitudesError
      );

      setSolicitudesDocumentos(
        []
      );
      return;
    }

    setSolicitudesDocumentos(
      (data ||
        []) as SolicitudDocumentoPendiente[]
    );
  }

  function seleccionarArchivoSolicitud(
    solicitudId: string,
    file: File | null
  ) {
    setError("");
    setMensajeDocumentos("");

    if (!file) {
      setArchivosSolicitud(
        (actual) => ({
          ...actual,
          [solicitudId]:
            null,
        })
      );
      return;
    }

    const esImagen =
      file.type.startsWith(
        "image/"
      );

    const esPdf =
      file.type ===
      "application/pdf";

    if (!esImagen && !esPdf) {
      setError(
        language === "es"
          ? "El documento debe ser una imagen o un archivo PDF."
          : "The document must be an image or PDF file."
      );
      return;
    }

    if (
      file.size >
      10 * 1024 * 1024
    ) {
      setError(
        language === "es"
          ? "El documento no puede superar 10 MB."
          : "The document cannot exceed 10 MB."
      );
      return;
    }

    setArchivosSolicitud(
      (actual) => ({
        ...actual,
        [solicitudId]:
          file,
      })
    );
  }

  async function enviarDocumentoSolicitado(
    solicitud: SolicitudDocumentoPendiente
  ) {
    const file =
      archivosSolicitud[
        solicitud.id
      ];

    if (!file) {
      setError(
        language === "es"
          ? "Selecciona primero una foto o archivo."
          : "Select a photo or file first."
      );
      return;
    }

    setError("");
    setMensajeDocumentos("");
    setEnviandoSolicitud(
      solicitud.id
    );

    try {
      const {
        data: {
          user,
        },
        error:
          userError,
      } =
        await supabase.auth.getUser();

      if (
        userError ||
        !user
      ) {
        throw new Error(
          language === "es"
            ? "Tu sesión ya no está disponible."
            : "Your session is no longer available."
        );
      }

      if (
        user.id !==
        solicitud.provider_id
      ) {
        throw new Error(
          language === "es"
            ? "Esta solicitud no pertenece a tu cuenta."
            : "This request does not belong to your account."
        );
      }

      const documentType =
        solicitud.document_type ||
        "other";

      const extensionOriginal =
        file.name
          .split(".")
          .pop()
          ?.toLowerCase();

      const extension =
        extensionOriginal &&
        /^[a-z0-9]{1,8}$/.test(
          extensionOriginal
        )
          ? extensionOriginal
          : file.type ===
            "application/pdf"
          ? "pdf"
          : "jpg";

      const ruta =
        `${user.id}/${documentType}-${Date.now()}.${extension}`;

      const {
        error:
          uploadError,
      } =
        await supabase.storage
          .from(
            "provider-documents"
          )
          .upload(
            ruta,
            file,
            {
              cacheControl:
                "3600",
              upsert:
                false,
            }
          );

      if (uploadError) {
        throw new Error(
          `${
            language === "es"
              ? "No se pudo subir el documento"
              : "Could not upload the document"
          }: ${uploadError.message}`
        );
      }

      const {
        error:
          insertError,
      } =
        await supabase
          .from(
            "provider_documents"
          )
          .insert({
            user_id:
              user.id,
            document_type:
              documentType,
            file_path:
              ruta,
            status:
              "pending",
            rejection_reason:
              null,
          });

      if (insertError) {
        await supabase.storage
          .from(
            "provider-documents"
          )
          .remove(
            [ruta]
          );

        throw new Error(
          `${
            language === "es"
              ? "El archivo subió, pero no se pudo registrar"
              : "The file uploaded, but could not be registered"
          }: ${insertError.message}`
        );
      }

      const ahora =
        new Date().toISOString();

      const {
        error:
          requestError,
      } =
        await supabase
          .from(
            "provider_document_requests"
          )
          .update({
            status:
              "submitted",
            submitted_at:
              ahora,
            updated_at:
              ahora,
          })
          .eq(
            "id",
            solicitud.id
          )
          .eq(
            "provider_id",
            user.id
          );

      if (requestError) {
        await supabase
          .from("provider_documents")
          .delete()
          .eq("user_id", user.id)
          .eq("file_path", ruta);

        await supabase.storage
          .from("provider-documents")
          .remove([ruta]);

        throw new Error(
          `${
            language === "es"
              ? "El documento se guardó, pero no se pudo actualizar la solicitud"
              : "The document was saved, but the request could not be updated"
          }: ${requestError.message}`
        );
      }

      setArchivosSolicitud(
        (actual) => ({
          ...actual,
          [solicitud.id]:
            null,
        })
      );

      setMensajeDocumentos(
        language === "es"
          ? "Documento enviado correctamente. RELYDO lo revisará antes de aprobar tu cuenta."
          : "Document sent successfully. RELYDO will review it before approving your account."
      );

      await cargarSolicitudesDocumentos(
        user.id
      );
    } catch (err) {
      console.error(
        "Error enviando documento solicitado:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : language ===
            "es"
          ? "No se pudo enviar el documento."
          : "Could not send the document."
      );
    } finally {
      setEnviandoSolicitud(
        null
      );
    }
  }

  async function iniciarSesionGoogle() {
    if (
      cargando ||
      googleLoading ||
      recuperando
    ) {
      return;
    }

    setGoogleLoading(true);
    setError("");
    setMensaje("");

    try {
      window.localStorage.setItem(
        "relydo_provider_oauth_redirect",
        redirectProfesional
      );

      const redirectTo =
        `${window.location.origin}/auth/google/profesional`;

      const {
        error: googleError,
      } =
        await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo,
          },
        });

      if (googleError) {
        window.localStorage.removeItem(
          "relydo_provider_oauth_redirect"
        );

        throw googleError;
      }
    } catch (err) {
      console.error(
        "Error iniciando sesión profesional con Google:",
        err
      );

      setError(
        err instanceof Error
          ? `${text.errorGoogle} ${err.message}`
          : text.errorGoogle
      );

      setGoogleLoading(false);
    }
  }

  async function handleLogin(
    e: React.FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    setError("");
    setMensaje("");
    setCargando(true);

    try {
      const emailLimpio =
        email.trim().toLowerCase();

      /*
        INICIAR SESIÓN
      */

      const {
        data,
        error: loginError,
      } = await supabase.auth.signInWithPassword({
        email: emailLimpio,
        password,
      });

      if (loginError) {
        throw new Error(
          loginError.message
        );
      }

      if (!data.user) {
        throw new Error(
          text.noIniciarSesion
        );
      }

      const user = data.user;

      /*
        BUSCAR profiles

        IMPORTANTE:
        Un profesional recién registrado
        puede todavía NO tener profiles.

        En ese caso comprobamos los metadata
        guardados durante el registro.
      */

      const {
        data: profile,
        error: profileError,
      } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) {
        throw new Error(
          `${text.noComprobarCuenta}: ${profileError.message}`
        );
      }

      /*
        PERFIL TODAVÍA NO CREADO

        Si viene del registro profesional,
        lo mandamos a completar su perfil.
      */

      if (!profile) {
        const signupType =
          user.user_metadata?.signup_type;

        if (
          signupType === "provider"
        ) {
          router.replace(
            "/completar-perfil-profesional"
          );

          return;
        }

        await supabase.auth.signOut();

        throw new Error(
          text.perfilNoValido
        );
      }

      /*
        ADMIN
        El acceso administrativo debe realizarse exclusivamente
        desde /login-admin. Cerramos esta sesión para evitar
        accesos cruzados entre portales.
      */

      if (profile.role === "admin") {
        await supabase.auth.signOut();
        throw new Error(text.sinAcceso);
      }

      /*
        PROFESIONAL
      */

      if (
        profile.role === "provider"
      ) {
        const {
          data: providerProfile,
          error: providerError,
        } = await supabase
          .from("provider_profiles")
          .select(`
            user_id,
            business_name,
            trade,
            verification_status,
            verified,
            active
          `)
          .eq(
            "user_id",
            user.id
          )
          .maybeSingle();

        if (providerError) {
          throw new Error(
            `${text.noCargarPerfil}: ${providerError.message}`
          );
        }

        /*
          SI profiles EXISTE
          PERO provider_profiles NO,
          TERMINAMOS DE CREAR EL PERFIL.
        */

        if (!providerProfile) {
          router.replace(
            "/completar-perfil-profesional"
          );

          return;
        }

        setNombreNegocio(
          providerProfile.business_name ||
            ""
        );

        /*
          COMPROBAR DOCUMENTOS DE VERIFICACIÓN

          Un profesional con estado "pending" NO debe
          aparecer como "en revisión" si todavía no ha
          subido ningún documento.

          Flujo correcto:
          0 documentos -> completar-verificacion
          documentos + pending -> cuenta en revisión
        */

        const {
          data: documentos,
          error: documentosError,
        } = await supabase
          .from("provider_documents")
          .select("id")
          .eq("user_id", user.id)
          .limit(1);

        if (documentosError) {
          throw new Error(
            `${text.noComprobarCuenta}: ${documentosError.message}`
          );
        }

        const tieneDocumentos =
          Array.isArray(documentos) &&
          documentos.length > 0;

        if (
          providerProfile.verification_status ===
            "pending" &&
          !tieneDocumentos
        ) {
          router.replace(
            "/completar-verificacion"
          );

          return;
        }

        if (
          providerProfile.verification_status ===
          "pending"
        ) {
          await cargarSolicitudesDocumentos(
            user.id
          );

          setEstadoCuenta("pending");
          setCargando(false);
          return;
        }

        if (
          providerProfile.verification_status ===
          "rejected"
        ) {
          setEstadoCuenta("rejected");
          setCargando(false);
          return;
        }

        if (
          providerProfile.verified === true &&
          providerProfile.active !== true
        ) {
          setEstadoCuenta("suspended");
          setCargando(false);
          return;
        }

        const accesoAprobado =
          providerProfile.verification_status ===
            "verified" &&
          providerProfile.verified === true &&
          providerProfile.active === true;

        if (!accesoAprobado) {
          setEstadoCuenta("pending");
          setCargando(false);
          return;
        }

        /*
          ASEGURAR provider_services

          Esto también repara automáticamente
          cuentas antiguas a las que les falte
          la relación con su especialidad.
        */

        await asegurarServicioProfesional(
          user.id,
          providerProfile.trade
        );

        /*
          PANEL PROFESIONAL
        */

        router.replace(
          redirectProfesional
        );

        router.refresh();

        return;
      }

      /*
        OTROS ROLES
      */

      await supabase.auth.signOut();

      throw new Error(
        text.sinAcceso
      );
    } catch (err) {
      console.error(err);

      if (err instanceof Error) {
        setError(
          err.message
        );
      } else {
        setError(
          text.errorLogin
        );
      }

      setCargando(false);
    }
  }

  function recuperarContrasena() {
    setError("");
    setMensaje("");

    router.push(
      "/recuperar-contrasena?tipo=profesional"
    );
  }

  async function salirCuentaPendiente() {
    await supabase.auth.signOut();
    setEstadoCuenta(null);
    setPassword("");
  }

  if (estadoCuenta) {
    const esPendiente =
      estadoCuenta === "pending";

    const esRechazada =
      estadoCuenta === "rejected";

    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
        <div className="w-full max-w-xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
          <div className="bg-blue-700 px-7 py-9 text-center text-white">
            <div className="text-2xl font-black">
              RELYDO
            </div>

            <h1 className="mt-3 text-3xl font-black">
              {esPendiente
                ? language === "es"
                  ? "Tu cuenta está en revisión"
                  : "Your account is under review"
                : esRechazada
                ? language === "es"
                  ? "Revisión no aprobada"
                  : "Review not approved"
                : language === "es"
                ? "Cuenta suspendida"
                : "Account suspended"}
            </h1>

            {nombreNegocio && (
              <p className="mt-2 text-blue-100">
                {nombreNegocio}
              </p>
            )}
          </div>

          <div className="p-7 md:p-9">
            {esPendiente ? (
              <>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
                <p className="text-lg font-black">
                  ⏳{" "}
                  {language === "es"
                    ? "Pendiente de verificación"
                    : "Verification pending"}
                </p>

                <p className="mt-3 leading-7">
                  {language === "es"
                    ? "Tu correo fue aceptado y tu registro profesional está en RELYDO. Nuestro equipo debe revisar tu información y documentos antes de habilitar el acceso a trabajos."
                    : "Your email was accepted and your professional registration is in RELYDO. Our team must review your information and documents before enabling access to jobs."}
                </p>

                <p className="mt-3 text-sm font-bold">
                  {language === "es"
                    ? "No necesitas registrarte nuevamente."
                    : "You do not need to register again."}
                </p>
              </div>

              {solicitudesDocumentos.length > 0 && (
                <div className="mt-5 space-y-4">
                  <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
                    <p className="text-lg font-black text-blue-950">
                      📄{" "}
                      {language === "es"
                        ? "RELYDO necesita documentación adicional"
                        : "RELYDO needs additional documentation"}
                    </p>

                    <p className="mt-2 text-sm leading-6 text-blue-900">
                      {language === "es"
                        ? "Puedes subir aquí los documentos solicitados aunque tu cuenta siga en revisión."
                        : "You can upload the requested documents here even while your account is still under review."}
                    </p>
                  </div>

                  {solicitudesDocumentos.map(
                    (solicitud) => (
                      <div
                        key={
                          solicitud.id
                        }
                        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-black text-slate-900">
                              {nombreTipoDocumento(
                                solicitud.document_type
                              )}
                            </p>

                            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                              {
                                solicitud.message
                              }
                            </p>
                          </div>

                          <span
                            className={`rounded-full px-3 py-1 text-xs font-black ${
                              solicitud.status ===
                              "submitted"
                                ? "bg-blue-100 text-blue-800"
                                : "bg-amber-100 text-amber-800"
                            }`}
                          >
                            {solicitud.status ===
                            "submitted"
                              ? language ===
                                "es"
                                ? "Enviado · en revisión"
                                : "Submitted · under review"
                              : language ===
                                "es"
                              ? "Pendiente"
                              : "Pending"}
                          </span>
                        </div>

                        {solicitud.status ===
                          "pending" && (
                          <div className="mt-4 space-y-3">
                            <input
                              type="file"
                              accept="image/*,application/pdf"
                              disabled={
                                enviandoSolicitud ===
                                solicitud.id
                              }
                              onChange={(e) =>
                                seleccionarArchivoSolicitud(
                                  solicitud.id,
                                  e.target.files?.[
                                    0
                                  ] ||
                                    null
                                )
                              }
                              className="block w-full rounded-xl border border-slate-300 bg-slate-50 p-3 text-sm text-slate-700"
                            />

                            <button
                              type="button"
                              disabled={
                                enviandoSolicitud ===
                                  solicitud.id ||
                                !archivosSolicitud[
                                  solicitud.id
                                ]
                              }
                              onClick={() =>
                                enviarDocumentoSolicitado(
                                  solicitud
                                )
                              }
                              className="w-full rounded-xl bg-blue-700 px-5 py-3.5 font-black text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {enviandoSolicitud ===
                              solicitud.id
                                ? language ===
                                  "es"
                                  ? "Subiendo..."
                                  : "Uploading..."
                                : language ===
                                  "es"
                                ? "Subir documento solicitado"
                                : "Upload requested document"}
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  )}

                  {mensajeDocumentos && (
                    <div className="rounded-xl border border-green-300 bg-green-50 p-4 text-sm font-bold text-green-800">
                      {
                        mensajeDocumentos
                      }
                    </div>
                  )}
                </div>
              )}
              </>
            ) : esRechazada ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-950">
                <p className="text-lg font-black">
                  {language === "es"
                    ? "Tu cuenta profesional no fue aprobada."
                    : "Your professional account was not approved."}
                </p>

                <p className="mt-3 leading-7">
                  {language === "es"
                    ? "Contacta con RELYDO si necesitas aclarar o actualizar la información de tu verificación."
                    : "Contact RELYDO if you need to clarify or update your verification information."}
                </p>
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-300 bg-slate-50 p-5 text-slate-900">
                <p className="text-lg font-black">
                  {language === "es"
                    ? "Tu cuenta está temporalmente suspendida."
                    : "Your account is temporarily suspended."}
                </p>

                <p className="mt-3 leading-7 text-slate-700">
                  {language === "es"
                    ? "Mientras la cuenta esté suspendida no podrás acceder a nuevos trabajos. Contacta con RELYDO para obtener más información."
                    : "While the account is suspended, you cannot access new jobs. Contact RELYDO for more information."}
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={salirCuentaPendiente}
              className="mt-6 w-full rounded-xl border-2 border-blue-700 bg-white px-5 py-3.5 font-black text-blue-700 hover:bg-blue-50"
            >
              {language === "es"
                ? "Cerrar sesión"
                : "Sign out"}
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-10">
      <div className="mx-auto w-full max-w-md">
        <button
          type="button"
          onClick={() => router.push("/")}
          disabled={
            cargando ||
            googleLoading ||
            recuperando
          }
          className="font-bold text-blue-700 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
        >
          ← {text.volverInicio}
        </button>

        <div className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl">
          <div className="bg-blue-700 p-8 text-white">
            <div className="text-2xl font-black">
              RELYDO
            </div>

            <h1 className="mt-2 text-3xl font-extrabold">
              {text.titulo}
            </h1>

            <p className="mt-2 text-blue-100">
              {text.descripcion}
            </p>
          </div>

          <div className="p-8">
            {error && (
              <div className="mb-6 rounded-xl border border-red-300 bg-red-50 p-4 text-sm font-medium text-red-700">
                {error}
              </div>
            )}

            {mensaje && (
              <div className="mb-6 rounded-xl border border-green-300 bg-green-50 p-4 text-sm font-medium text-green-700">
                {mensaje}
              </div>
            )}

            <button
              type="button"
              onClick={iniciarSesionGoogle}
              disabled={
                cargando ||
                googleLoading ||
                recuperando
              }
              className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white px-4 py-4 text-base font-extrabold text-slate-900 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-6 w-6"
              >
                <path
                  fill="#4285F4"
                  d="M21.6 12.23c0-.71-.06-1.23-.2-1.77H12v3.4h5.52a4.71 4.71 0 0 1-2.05 3.09l-.02.11 2.98 2.3.21.02c1.94-1.79 2.96-4.43 2.96-7.15Z"
                />
                <path
                  fill="#34A853"
                  d="M12 22c2.7 0 4.97-.89 6.63-2.42l-3.17-2.44c-.85.57-1.98.97-3.46.97a6 6 0 0 1-5.67-4.15l-.1.01-3.1 2.4-.04.1A10 10 0 0 0 12 22Z"
                />
                <path
                  fill="#FBBC05"
                  d="M6.33 13.96A6.17 6.17 0 0 1 6 12c0-.68.12-1.34.32-1.96v-.12L3.18 7.48l-.1.05A10 10 0 0 0 2 12c0 1.61.39 3.13 1.08 4.47l3.25-2.51Z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.89c1.88 0 3.15.81 3.88 1.49l2.82-2.75C16.97 3.02 14.7 2 12 2a10 10 0 0 0-8.92 5.53l3.24 2.51A6.01 6.01 0 0 1 12 5.89Z"
                />
              </svg>

              <span>
                {googleLoading
                  ? text.conectandoGoogle
                  : text.continuarGoogle}
              </span>
            </button>

            <div className="my-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-200" />
              <span className="text-center text-xs font-bold uppercase tracking-wide text-slate-500">
                {text.separador}
              </span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>

            <form
              onSubmit={handleLogin}
              className="space-y-5"
            >
              <div>
                <label
                  htmlFor="email"
                  className="mb-2 block font-bold text-slate-900"
                >
                  {text.email}
                </label>

                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) =>
                    setEmail(
                      e.target.value
                    )
                  }
                  disabled={
                    cargando ||
                    googleLoading ||
                    recuperando
                  }
                  placeholder={text.emailPlaceholder}
                  className="w-full rounded-xl border border-slate-300 bg-white p-4 text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="mb-2 block font-bold text-slate-900"
                >
                  {text.password}
                </label>

                <input
                  id="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) =>
                    setPassword(
                      e.target.value
                    )
                  }
                  disabled={
                    cargando ||
                    googleLoading ||
                    recuperando
                  }
                  placeholder={text.passwordPlaceholder}
                  className="w-full rounded-xl border border-slate-300 bg-white p-4 text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                />

                <div className="mt-3 text-right">
                  <button
                    type="button"
                    onClick={recuperarContrasena}
                    disabled={
                      cargando ||
                      googleLoading ||
                      recuperando
                    }
                    className="font-bold text-blue-700 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {text.olvidoPassword}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={
                  cargando ||
                  googleLoading ||
                  recuperando
                }
                className="w-full rounded-xl bg-blue-700 py-4 text-lg font-extrabold text-white shadow-md transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {cargando
                  ? text.entrando
                  : text.iniciarSesion}
              </button>
            </form>

            <div className="mt-6 border-t border-slate-200 pt-6">
              <p className="text-center text-slate-600">
                {text.noCuenta}{" "}
                <a
                  href="/registro-profesional"
                  className="font-bold text-blue-700 hover:underline"
                >
                  {text.registrate}
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}