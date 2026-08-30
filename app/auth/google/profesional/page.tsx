"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  createClient,
} from "@supabase/supabase-js";

import {
  useLanguage,
} from "@/app/components/LanguageProvider";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

function obtenerDestinoGuardado() {
  const guardado =
    window.localStorage.getItem(
      "relydo_provider_oauth_redirect"
    );

  if (
    guardado &&
    guardado.startsWith("/") &&
    !guardado.startsWith("//")
  ) {
    return guardado;
  }

  return "/panel-profesional";
}

export default function GoogleProviderCallbackPage() {
  const { language } =
    useLanguage();

  const [error, setError] =
    useState("");

  const text =
    language === "es"
      ? {
          procesando:
            "Terminando tu inicio de sesión profesional con Google...",
          error:
            "No pudimos completar el inicio de sesión profesional con Google.",
          volver:
            "Volver al inicio de sesión",
        }
      : {
          procesando:
            "Finishing your professional Google sign-in...",
          error:
            "We could not complete your professional Google sign-in.",
          volver:
            "Back to sign in",
        };

  useEffect(() => {
    let activo = true;

    async function finalizarOAuth() {
      try {
        let {
          data: sessionData,
        } =
          await supabase.auth.getSession();

        if (!sessionData.session) {
          await new Promise(
            (resolve) =>
              setTimeout(
                resolve,
                500
              )
          );

          const retry =
            await supabase.auth.getSession();

          sessionData =
            retry.data;
        }

        const session =
          sessionData.session;

        if (!session) {
          throw new Error(
            language === "es"
              ? "No se encontró una sesión válida de Google."
              : "No valid Google session was found."
          );
        }

        const response =
          await fetch(
            "/api/auth/google/professional",
            {
              method: "POST",
              headers: {
                Authorization:
                  `Bearer ${session.access_token}`,
              },
            }
          );

        const result =
          await response.json();

        if (!response.ok) {
          throw new Error(
            result?.error ||
              text.error
          );
        }

        const destino =
          obtenerDestinoGuardado();

        window.localStorage.removeItem(
          "relydo_provider_oauth_redirect"
        );

        if (
          result?.needsProviderProfile ===
          true
        ) {
          window.location.href =
            "/completar-perfil-profesional";
          return;
        }

        if (
          result?.needsVerification ===
          true
        ) {
          window.location.href =
            "/completar-verificacion";
          return;
        }

        if (
          result?.accountStatus ===
            "pending" ||
          result?.accountStatus ===
            "rejected" ||
          result?.accountStatus ===
            "suspended"
        ) {
          window.location.href =
            "/login-profesional";
          return;
        }

        window.location.href =
          destino;
      } catch (err) {
        console.error(
          "Google provider OAuth callback error:",
          err
        );

        await supabase.auth.signOut();

        window.localStorage.removeItem(
          "relydo_provider_oauth_redirect"
        );

        if (!activo) {
          return;
        }

        setError(
          err instanceof Error
            ? `${text.error} ${err.message}`
            : text.error
        );
      }
    }

    finalizarOAuth();

    return () => {
      activo = false;
    };
  }, [
    language,
    text.error,
  ]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl">
        <div className="text-2xl font-black text-blue-700">
          RELYDO
        </div>

        {!error ? (
          <>
            <div className="mx-auto mt-6 h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-blue-700" />

            <p className="mt-5 font-bold text-slate-700">
              {text.procesando}
            </p>
          </>
        ) : (
          <>
            <div className="mt-6 rounded-xl border border-red-300 bg-red-50 p-4 text-left text-red-700">
              {error}
            </div>

            <button
              type="button"
              onClick={() => {
                window.location.href =
                  "/login-profesional";
              }}
              className="mt-6 w-full rounded-xl bg-blue-700 py-4 font-extrabold text-white transition hover:bg-blue-800"
            >
              {text.volver}
            </button>
          </>
        )}
      </div>
    </main>
  );
}