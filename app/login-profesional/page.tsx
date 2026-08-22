"use client";

import { useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/app/components/LanguageProvider";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

export default function LoginProfesional() {
  const router = useRouter();
  const { language } = useLanguage();

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

  const [cargando, setCargando] = useState(false);

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

  async function handleLogin(
    e: React.FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    setError("");
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
      */

      if (
        profile.role === "admin"
      ) {
        router.replace(
          "/admin"
        );

        return;
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
          "/panel-profesional"
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

  function irARecuperarContrasena() {
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
    <main className="min-h-screen bg-slate-100 flex items-center justify-center px-4 py-10">

      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl">

        {/* HEADER */}

        <div className="bg-blue-700 px-8 py-8 text-white">

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

        {/* FORM */}

        <form
          onSubmit={handleLogin}
          className="space-y-6 p-8"
        >

          <div>

            <label className="mb-2 block font-bold text-slate-900">
              {text.email}
            </label>

            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) =>
                setEmail(
                  e.target.value
                )
              }
              placeholder={text.emailPlaceholder}
              className="w-full rounded-xl border border-slate-300 bg-white p-4 text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
            />

          </div>

          <div>

            <label className="mb-2 block font-bold text-slate-900">
              {text.password}
            </label>

            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) =>
                setPassword(
                  e.target.value
                )
              }
              placeholder={text.passwordPlaceholder}
              className="w-full rounded-xl border border-slate-300 bg-white p-4 text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
            />

            <div className="mt-3 text-right">

              <button
                type="button"
                onClick={
                  irARecuperarContrasena
                }
                disabled={
                  cargando
                }
                className="text-sm font-bold text-blue-700 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
              >
                {text.olvidoPassword}
              </button>

            </div>

          </div>

          {error && (
            <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm font-medium text-red-700">
              {error}
            </div>
          )}



          <button
            type="submit"
            disabled={
              cargando
            }
            className="w-full rounded-xl bg-blue-700 py-4 text-lg font-extrabold text-white shadow-md transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {cargando
              ? text.entrando
              : text.iniciarSesion}
          </button>

        </form>

      </div>

    </main>
  );
}