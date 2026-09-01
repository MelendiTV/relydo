"use client";

import {
  Suspense,
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

function LoginClienteContenido() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { language } = useLanguage();

  const redirectParam =
    searchParams.get("redirect");

  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  const [googleLoading, setGoogleLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  const text =
    language === "es"
      ? {
          volverInicio: "Volver al inicio",
          iniciarSesion: "Iniciar sesión",
          descripcion:
            "Accede a tus solicitudes y trabajos.",
          continuar:
            "Inicia sesión para continuar.",

          continuarGoogle:
            "Continuar con Google",

          conectandoGoogle:
            "Conectando con Google...",

          separador:
            "o continúa con email",

          email: "Email",

          password:
            "Contraseña",

          passwordPlaceholder:
            "Tu contraseña",

          iniciando:
            "Iniciando sesión...",

          olvidastePassword:
            "¿Olvidaste tu contraseña?",

          cargando:
            "Cargando...",

          errorUsuario:
            "No se pudo identificar el usuario.",

          errorPerfil:
            "No se encontró el perfil de esta cuenta.",

          errorRol:
            "Esta cuenta no está registrada como cliente.",

          credencialesInvalidas:
            "El correo electrónico o la contraseña son incorrectos.",

          correoNoVerificado:
            "Debes verificar tu correo electrónico antes de iniciar sesión. Revisa tu bandeja de entrada o solicita un nuevo correo de verificación.",

          errorGoogle:
            "No se pudo iniciar sesión con Google.",

          errorInesperado:
            "Ocurrió un error inesperado.",
        }
      : {
          volverInicio:
            "Back to home",

          iniciarSesion:
            "Sign in",

          descripcion:
            "Access your requests and jobs.",

          continuar:
            "Sign in to continue.",

          continuarGoogle:
            "Continue with Google",

          conectandoGoogle:
            "Connecting with Google...",

          separador:
            "or continue with email",

          email:
            "Email",

          password:
            "Password",

          passwordPlaceholder:
            "Your password",

          iniciando:
            "Signing in...",

          olvidastePassword:
            "Forgot your password?",

          cargando:
            "Loading...",

          errorUsuario:
            "Unable to identify the user.",

          errorPerfil:
            "No profile was found for this account.",

          errorRol:
            "This account is not registered as a customer.",

          credencialesInvalidas:
            "The email address or password is incorrect.",

          correoNoVerificado:
            "You must verify your email address before signing in. Check your inbox or request a new verification email.",

          errorGoogle:
            "Unable to sign in with Google.",

          errorInesperado:
            "An unexpected error occurred.",
        };

  /*
    DESTINO SEGURO

    Solo permitimos rutas internas.
  */

  function obtenerDestinoSeguro() {
    if (
      redirectParam &&
      redirectParam.startsWith("/") &&
      !redirectParam.startsWith("//")
    ) {
      return redirectParam;
    }

    return "/mis-solicitudes";
  }

  /*
    INICIAR SESIÓN CON GOOGLE

    Guardamos el destino antes de salir
    hacia Google.

    Cuando Google regrese a RELYDO,
    /auth/google/cliente continuará
    el proceso.
  */

  async function iniciarSesionGoogle() {
    if (
      loading ||
      googleLoading
    ) {
      return;
    }

    setGoogleLoading(true);
    setError("");

    try {
      const destino =
        obtenerDestinoSeguro();

      window.localStorage.setItem(
        "relydo_customer_oauth_redirect",
        destino
      );

      const redirectTo =
        `${window.location.origin}/auth/google/cliente`;

      const {
        error: googleError,
      } =
        await supabase.auth.signInWithOAuth({
          provider:
            "google",

          options: {
            redirectTo,
          },
        });

      if (googleError) {
        window.localStorage.removeItem(
          "relydo_customer_oauth_redirect"
        );

        throw googleError;
      }

      /*
        Si no hubo error,
        Supabase redirigirá el navegador
        hacia Google.

        Mantenemos googleLoading activo
        para evitar doble clic.
      */
    } catch (err) {
      console.error(
        "Error iniciando sesión con Google:",
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

  /*
    INICIAR SESIÓN CON EMAIL / CONTRASEÑA
  */

  async function iniciarSesion(
    e: React.FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    if (
      loading ||
      googleLoading
    ) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      /*
        1. LOGIN EN SUPABASE
      */

      const {
        data,
        error: loginError,
      } =
        await supabase.auth.signInWithPassword({
          email:
            email
              .trim()
              .toLowerCase(),

          password,
        });

      if (loginError) {
        /*
          No mostramos al usuario
          el mensaje técnico de Supabase.
        */

        const mensajeLogin =
          loginError.message.toLowerCase();

        if (
          mensajeLogin.includes(
            "invalid login credentials"
          )
        ) {
          throw new Error(
            text.credencialesInvalidas
          );
        }

        if (
          mensajeLogin.includes(
            "email not confirmed"
          ) ||
          mensajeLogin.includes(
            "email not verified"
          )
        ) {
          throw new Error(
            text.correoNoVerificado
          );
        }

        throw new Error(
          text.errorInesperado
        );
      }

      const user =
        data.user;

      if (!user) {
        throw new Error(
          text.errorUsuario
        );
      }

      /*
        2. COMPROBAR PERFIL
      */

      const {
        data: profile,
        error: profileError,
      } =
        await supabase
          .from("profiles")
          .select(`
            id,
            role
          `)
          .eq(
            "id",
            user.id
          )
          .maybeSingle();

      if (
        profileError ||
        !profile
      ) {
        await supabase.auth.signOut();

        throw new Error(
          text.errorPerfil
        );
      }

      /*
        3. SOLO CLIENTES
      */

      if (
        profile.role !==
        "customer"
      ) {
        await supabase.auth.signOut();

        throw new Error(
          text.errorRol
        );
      }

      /*
        4. DESTINO DESPUÉS DEL LOGIN
      */

      const destino =
        obtenerDestinoSeguro();

      window.location.href =
        destino;
    } catch (err) {
      console.error(
        "Error iniciando sesión del cliente:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : text.errorInesperado
      );

      setLoading(false);
    }
  }

  /*
    RECUPERAR CONTRASEÑA
  */

  function irARecuperarPassword() {
    router.push(
      "/recuperar-contrasena?tipo=cliente"
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-10">

      <div className="mx-auto w-full max-w-md">

        {/* VOLVER */}

        <button
          type="button"
          onClick={() =>
            router.push("/")
          }
          disabled={
            loading ||
            googleLoading
          }
          className="font-bold text-blue-700 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
        >
          ← {text.volverInicio}
        </button>

        <div className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl">

          {/* HEADER */}

          <div className="bg-blue-700 p-8 text-white">

            <div className="text-2xl font-black">
              RELYDO
            </div>

            <h1 className="mt-2 text-3xl font-extrabold">
              {text.iniciarSesion}
            </h1>

            <p className="mt-2 text-blue-100">
              {text.descripcion}
            </p>

          </div>

          {/* CONTENIDO */}

          <div className="p-8">

            {/* AVISO REDIRECT */}

            {redirectParam && (
              <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
                {text.continuar}
              </div>
            )}

            {/* ERROR */}

            {error && (
              <div className="mb-6 rounded-xl border border-red-300 bg-red-50 p-4 text-red-700">
                {error}
              </div>
            )}

            {/* GOOGLE */}

            <button
              type="button"
              onClick={
                iniciarSesionGoogle
              }
              disabled={
                loading ||
                googleLoading
              }
              className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white px-4 py-4 text-base font-extrabold text-slate-900 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >

              {/* LOGO GOOGLE */}

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

            {/* SEPARADOR */}

            <div className="my-6 flex items-center gap-3">

              <div className="h-px flex-1 bg-slate-200" />

              <span className="text-center text-xs font-bold uppercase tracking-wide text-slate-500">
                {text.separador}
              </span>

              <div className="h-px flex-1 bg-slate-200" />

            </div>

            {/* FORMULARIO */}

            <form
              onSubmit={iniciarSesion}
              className="space-y-5"
            >

              {/* EMAIL */}

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
                  value={email}
                  onChange={(e) =>
                    setEmail(
                      e.target.value
                    )
                  }
                  required
                  disabled={
                    loading ||
                    googleLoading
                  }
                  autoComplete="email"
                  placeholder="cliente@email.com"
                  className="w-full rounded-xl border border-slate-300 p-4 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                />

              </div>

              {/* PASSWORD */}

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
                  value={password}
                  onChange={(e) =>
                    setPassword(
                      e.target.value
                    )
                  }
                  required
                  disabled={
                    loading ||
                    googleLoading
                  }
                  autoComplete="current-password"
                  placeholder={
                    text.passwordPlaceholder
                  }
                  className="w-full rounded-xl border border-slate-300 p-4 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                />

              </div>

              {/* BOTÓN LOGIN */}

              <button
                type="submit"
                disabled={
                  loading ||
                  googleLoading
                }
                className="w-full rounded-xl bg-blue-700 py-4 text-lg font-extrabold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading
                  ? text.iniciando
                  : text.iniciarSesion}
              </button>

            </form>

            {/* RECUPERAR CONTRASEÑA */}

            <div className="mt-6 border-t border-slate-200 pt-6 text-center">

              <button
                type="button"
                onClick={
                  irARecuperarPassword
                }
                disabled={
                  loading ||
                  googleLoading
                }
                className="font-bold text-blue-700 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
              >
                {text.olvidastePassword}
              </button>

            </div>

          </div>

        </div>

      </div>

    </main>
  );
}

function LoginClienteFallback() {
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

export default function LoginClientePage() {
  return (
    <Suspense
      fallback={
        <LoginClienteFallback />
      }
    >
      <LoginClienteContenido />
    </Suspense>
  );
}