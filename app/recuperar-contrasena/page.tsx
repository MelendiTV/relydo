"use client";

import {
  Suspense,
  useEffect,
  useState,
} from "react";

import {
  createClient,
} from "@supabase/supabase-js";

import {
  useRouter,
  useSearchParams,
} from "next/navigation";

import {
  useLanguage,
} from "@/app/components/LanguageProvider";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

type TipoCuenta =
  | "cliente"
  | "profesional";

type Modo =
  | "request"
  | "checking"
  | "reset";

function RecuperarContrasenaContenido() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { language } = useLanguage();

  const tipoParam =
    searchParams.get("tipo");

  const tipo: TipoCuenta =
    tipoParam === "profesional"
      ? "profesional"
      : "cliente";

  const loginDestino =
    tipo === "profesional"
      ? "/login-profesional"
      : "/login-cliente";

  const [modo, setModo] =
    useState<Modo>("checking");

  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [
    confirmPassword,
    setConfirmPassword,
  ] = useState("");

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  const [mensaje, setMensaje] =
    useState("");

  const text =
    language === "es"
      ? {
          verificando:
            "Verificando enlace...",
          recuperarTitulo:
            "Recuperar contraseña",
          recuperarDescripcion:
            "Escribe el correo de tu cuenta y te enviaremos un enlace seguro para crear una nueva contraseña.",
          email:
            "Correo electrónico",
          emailPlaceholder:
            "tu@email.com",
          enviar:
            "Enviar enlace de recuperación",
          enviando:
            "Enviando...",
          correoEnviado:
            "Te enviamos un enlace para recuperar tu contraseña. Revisa también Spam o correo no deseado.",
          correoNoEnviado:
            "No se pudo enviar el correo de recuperación",
          nuevaTitulo:
            "Nueva contraseña",
          nuevaDescripcion:
            "Crea una nueva contraseña para tu cuenta.",
          nuevaPassword:
            "Nueva contraseña",
          confirmarPassword:
            "Confirmar contraseña",
          minimo:
            "Mínimo 8 caracteres, con mayúscula, minúscula, número y carácter especial",
          repetir:
            "Repite la contraseña",
          actualizando:
            "Actualizando...",
          cambiar:
            "Cambiar contraseña",
          actualizado:
            "Contraseña actualizada correctamente.",
          redirigiendo:
            "Redirigiendo al inicio de sesión...",
          enlaceInvalido:
            "El enlace de recuperación no es válido o ha expirado. Solicita uno nuevo.",
          enlaceYaNoValido:
            "El enlace de recuperación ya no es válido. Solicita uno nuevo.",
          minimoError:
            "La contraseña debe tener al menos 8 caracteres e incluir mayúscula, minúscula, número y carácter especial.",
          noCoinciden:
            "Las contraseñas no coinciden.",
          noValidar:
            "No se pudo validar el enlace de recuperación.",
          noCambiar:
            "No se pudo cambiar la contraseña",
          emailRequerido:
            "Escribe tu correo electrónico.",
        }
      : {
          verificando:
            "Verifying link...",
          recuperarTitulo:
            "Reset password",
          recuperarDescripcion:
            "Enter the email for your account and we will send you a secure link to create a new password.",
          email:
            "Email address",
          emailPlaceholder:
            "you@email.com",
          enviar:
            "Send recovery link",
          enviando:
            "Sending...",
          correoEnviado:
            "We sent you a password recovery link. Check your Spam or Junk folder as well.",
          correoNoEnviado:
            "We could not send the recovery email",
          nuevaTitulo:
            "New password",
          nuevaDescripcion:
            "Create a new password for your account.",
          nuevaPassword:
            "New password",
          confirmarPassword:
            "Confirm password",
          minimo:
            "Minimum 8 characters, with uppercase, lowercase, number, and special character",
          repetir:
            "Repeat your password",
          actualizando:
            "Updating...",
          cambiar:
            "Change password",
          actualizado:
            "Password updated successfully.",
          redirigiendo:
            "Redirecting to sign in...",
          enlaceInvalido:
            "The recovery link is invalid or has expired. Request a new one.",
          enlaceYaNoValido:
            "The recovery link is no longer valid. Request a new one.",
          minimoError:
            "The password must be at least 8 characters and include an uppercase letter, lowercase letter, number, and special character.",
          noCoinciden:
            "The passwords do not match.",
          noValidar:
            "We could not validate the recovery link.",
          noCambiar:
            "We could not change the password",
          emailRequerido:
            "Enter your email address.",
        };

  useEffect(() => {
    let mounted = true;

    const currentUrl =
      new URL(
        window.location.href
      );

    const code =
      currentUrl.searchParams.get(
        "code"
      );

    const tokenHash =
      currentUrl.searchParams.get(
        "token_hash"
      );

    const recoveryType =
      currentUrl.searchParams.get(
        "type"
      );

    const hash =
      window.location.hash;

    const tieneEnlaceRecuperacion =
      Boolean(
        code ||
        tokenHash ||
        hash
      );

    /*
      Si el usuario llegó desde el login
      y todavía NO abrió un enlace de email,
      mostramos primero el formulario
      para solicitar la recuperación.
    */

    if (!tieneEnlaceRecuperacion) {
      setModo("request");

      return () => {
        mounted = false;
      };
    }

    /*
      Escuchamos PASSWORD_RECOVERY antes
      de procesar el enlace.
    */

    const {
      data: {
        subscription,
      },
    } =
      supabase.auth.onAuthStateChange(
        (event) => {
          if (
            event ===
              "PASSWORD_RECOVERY" &&
            mounted
          ) {
            setModo("reset");
            setError("");
          }
        }
      );

    async function comprobarRecuperacion() {
      setModo("checking");
      setError("");

      try {
        /*
          1. FLUJO CON TOKEN HASH

          /recuperar-contrasena?token_hash=...&type=recovery

          Este es el flujo que usamos en la plantilla
          personalizada de Reset password.
        */

        if (
          tokenHash &&
          recoveryType === "recovery"
        ) {
          const {
            error:
              verifyError,
          } =
            await supabase.auth
              .verifyOtp({
                token_hash:
                  tokenHash,
                type:
                  "recovery",
              });

          if (verifyError) {
            throw new Error(
              verifyError.message
            );
          }

          window.history.replaceState(
            {},
            document.title,
            `/recuperar-contrasena?tipo=${tipo}`
          );
        }

        /*
          2. FLUJO PKCE

          /recuperar-contrasena?tipo=cliente&code=...
        */

        if (code) {
          const {
            error:
              exchangeError,
          } =
            await supabase.auth
              .exchangeCodeForSession(
                code
              );

          if (exchangeError) {
            throw new Error(
              exchangeError.message
            );
          }

          window.history.replaceState(
            {},
            document.title,
            `/recuperar-contrasena?tipo=${tipo}`
          );
        }

        /*
          3. SOPORTE FLUJO IMPLICIT

          #access_token=...
          &refresh_token=...
          &type=recovery
        */

        if (hash) {
          const params =
            new URLSearchParams(
              hash.startsWith("#")
                ? hash.substring(1)
                : hash
            );

          const accessToken =
            params.get(
              "access_token"
            );

          const refreshToken =
            params.get(
              "refresh_token"
            );

          if (
            accessToken &&
            refreshToken
          ) {
            const {
              error:
                sessionError,
            } =
              await supabase.auth
                .setSession({
                  access_token:
                    accessToken,
                  refresh_token:
                    refreshToken,
                });

            if (sessionError) {
              throw new Error(
                sessionError.message
              );
            }

            window.history.replaceState(
              {},
              document.title,
              `/recuperar-contrasena?tipo=${tipo}`
            );
          }
        }

        /*
          4. CONFIRMAR SESIÓN DE RECUPERACIÓN
        */

        const {
          data: {
            session,
          },
          error:
            sessionCheckError,
        } =
          await supabase.auth
            .getSession();

        if (
          sessionCheckError ||
          !session
        ) {
          throw new Error(
            text.enlaceInvalido
          );
        }

        const {
          data: {
            user,
          },
          error:
            userError,
        } =
          await supabase.auth
            .getUser();

        if (
          userError ||
          !user
        ) {
          throw new Error(
            text.enlaceInvalido
          );
        }

        if (mounted) {
          setModo("reset");
          setError("");
        }
      } catch (err) {
        if (!mounted) {
          return;
        }

        console.error(
          "Error validando recuperación:",
          err
        );

        setModo("request");

        setError(
          err instanceof Error &&
          err.message
            ? err.message
            : text.noValidar
        );
      }
    }

    comprobarRecuperacion();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [tipo, language]);

  async function solicitarRecuperacion(
    e: React.FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    if (loading) {
      return;
    }

    setError("");
    setMensaje("");

    const emailLimpio =
      email.trim().toLowerCase();

    if (!emailLimpio) {
      setError(
        text.emailRequerido
      );

      return;
    }

    setLoading(true);

    try {
      const redirectTo =
        `https://relydo.co/recuperar-contrasena?tipo=${tipo}`;

      const {
        error:
          resetError,
      } =
        await supabase.auth
          .resetPasswordForEmail(
            emailLimpio,
            {
              redirectTo,
            }
          );

      if (resetError) {
        throw new Error(
          resetError.message
        );
      }

      setMensaje(
        text.correoEnviado
      );
    } catch (err) {
      console.error(
        "Error solicitando recuperación de contraseña:",
        err
      );

      /*
        Mensaje deliberadamente genérico:
        no exponemos detalles internos de Supabase
        ni información que permita inferir si el correo existe.
      */
      setError(text.correoNoEnviado);
    } finally {
      setLoading(false);
    }
  }

  async function cambiarPassword(
    e: React.FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    if (loading) {
      return;
    }

    setError("");
    setMensaje("");

    const passwordSegura =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

    if (!passwordSegura.test(password)) {
      setError(
        text.minimoError
      );

      return;
    }

    if (
      password !==
      confirmPassword
    ) {
      setError(
        text.noCoinciden
      );

      return;
    }

    setLoading(true);

    try {
      const {
        error:
          updateError,
      } =
        await supabase.auth
          .updateUser({
            password,
          });

      if (updateError) {
        throw new Error(
          updateError.message
        );
      }

      setPassword("");
      setConfirmPassword("");

      setMensaje(
        text.actualizado
      );

      await supabase.auth.signOut();

      window.setTimeout(
        () => {
          router.replace(
            loginDestino
          );
        },
        1800
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? `${text.noCambiar}: ${err.message}`
          : text.noCambiar
      );
    } finally {
      setLoading(false);
    }
  }

  if (modo === "checking") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <div className="rounded-2xl border border-slate-200 bg-white px-8 py-7 shadow-lg">
          <p className="font-bold text-slate-700">
            {text.verificando}
          </p>
        </div>
      </main>
    );
  }

  const esReset =
    modo === "reset";

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl">

        <div className="bg-blue-700 px-8 py-7 text-white">
          <div className="text-2xl font-black">
            RELYDO
          </div>

          <h1 className="mt-2 text-3xl font-extrabold">
            {esReset
              ? text.nuevaTitulo
              : text.recuperarTitulo}
          </h1>

          <p className="mt-2 text-blue-100">
            {esReset
              ? text.nuevaDescripcion
              : text.recuperarDescripcion}
          </p>
        </div>

        <div className="p-8">

          {error && (
            <div className="mb-6 rounded-xl border border-red-300 bg-red-50 p-4 text-red-700">
              {error}
            </div>
          )}

          {mensaje && (
            <div className="mb-6 rounded-xl border border-green-300 bg-green-50 p-4 text-green-700">
              {mensaje}

              {esReset && (
                <p className="mt-2 text-sm">
                  {text.redirigiendo}
                </p>
              )}
            </div>
          )}

          {!esReset ? (
            <form
              onSubmit={
                solicitarRecuperacion
              }
              className="space-y-5"
            >
              <div>
                <label
                  htmlFor="recovery-email"
                  className="mb-2 block font-bold text-slate-900"
                >
                  {text.email}
                </label>

                <input
                  id="recovery-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) =>
                    setEmail(
                      e.target.value
                    )
                  }
                  placeholder={
                    text.emailPlaceholder
                  }
                  disabled={loading}
                  className="w-full rounded-xl border border-slate-300 p-4 text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-blue-700 px-6 py-4 text-lg font-extrabold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading
                  ? text.enviando
                  : text.enviar}
              </button>
            </form>
          ) : !mensaje ? (
            <form
              onSubmit={
                cambiarPassword
              }
              className="space-y-6"
            >
              <div>
                <label
                  htmlFor="new-password"
                  className="mb-2 block font-bold text-slate-900"
                >
                  {text.nuevaPassword}
                </label>

                <input
                  id="new-password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) =>
                    setPassword(
                      e.target.value
                    )
                  }
                  placeholder={
                    text.minimo
                  }
                  disabled={loading}
                  className="w-full rounded-xl border border-slate-300 p-4 text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
                />
              </div>

              <div>
                <label
                  htmlFor="confirm-password"
                  className="mb-2 block font-bold text-slate-900"
                >
                  {text.confirmarPassword}
                </label>

                <input
                  id="confirm-password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={
                    confirmPassword
                  }
                  onChange={(e) =>
                    setConfirmPassword(
                      e.target.value
                    )
                  }
                  placeholder={
                    text.repetir
                  }
                  disabled={loading}
                  className="w-full rounded-xl border border-slate-300 p-4 text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-blue-700 px-6 py-4 text-lg font-extrabold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading
                  ? text.actualizando
                  : text.cambiar}
              </button>
            </form>
          ) : null}

        </div>
      </div>
    </main>
  );
}

function RecuperarContrasenaFallback() {
  const { language } =
    useLanguage();

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100">
      <div className="rounded-2xl bg-white px-8 py-7 shadow-lg">
        <p className="font-bold text-slate-700">
          {language === "es"
            ? "Cargando..."
            : "Loading..."}
        </p>
      </div>
    </main>
  );
}

export default function RecuperarContrasena() {
  return (
    <Suspense
      fallback={
        <RecuperarContrasenaFallback />
      }
    >
      <RecuperarContrasenaContenido />
    </Suspense>
  );
}