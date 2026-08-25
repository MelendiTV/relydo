"use client";

import {
  FormEvent,
  useEffect,
  useState,
} from "react";

import {
  createClient,
} from "@supabase/supabase-js";

import {
  useRouter,
} from "next/navigation";

import {
  useLanguage,
} from "@/app/components/LanguageProvider";

import {
  isAdminRole,
} from "@/app/lib/adminPermissions";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

export default function LoginAdminPage() {
  const router =
    useRouter();

  const {
    language,
  } = useLanguage();

  const T = (
    es: string,
    en: string
  ) =>
    language === "es"
      ? es
      : en;

  const [
    email,
    setEmail,
  ] = useState("");

  const [
    password,
    setPassword,
  ] = useState("");

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    checkingSession,
    setCheckingSession,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState("");

  useEffect(() => {
    revisarSesionExistente();
  }, []);

  async function revisarSesionExistente() {
    setCheckingSession(true);

    try {
      const {
        data: {
          user,
        },
      } =
        await supabase.auth.getUser();

      if (!user) {
        return;
      }

      const {
        data:
          profile,
        error:
          profileError,
      } = await supabase
        .from("profiles")
        .select(`
          id,
          role,
          admin_role
        `)
        .eq(
          "id",
          user.id
        )
        .maybeSingle();

      if (
        profileError ||
        !profile ||
        profile.role !==
          "admin" ||
        !isAdminRole(
          profile.admin_role
        )
      ) {
        await supabase.auth.signOut();
        return;
      }

      /*
        Todos los roles administrativos entran
        primero al Home Admin.
      */
      router.replace(
        "/admin"
      );
    } finally {
      setCheckingSession(false);
    }
  }

  async function iniciarSesion(
    event:
      FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setError("");

    const emailLimpio =
      email
        .trim()
        .toLowerCase();

    if (!emailLimpio) {
      setError(
        T(
          "Escribe el correo del administrador.",
          "Enter the administrator email."
        )
      );
      return;
    }

    if (!password) {
      setError(
        T(
          "Escribe tu contraseña.",
          "Enter your password."
        )
      );
      return;
    }

    setLoading(true);

    try {
      const {
        data,
        error:
          loginError,
      } =
        await supabase.auth
          .signInWithPassword({
            email:
              emailLimpio,
            password,
          });

      if (
        loginError ||
        !data.user
      ) {
        throw new Error(
          T(
            "Correo o contraseña incorrectos.",
            "Incorrect email or password."
          )
        );
      }

      const {
        data:
          profile,
        error:
          profileError,
      } = await supabase
        .from("profiles")
        .select(`
          id,
          role,
          admin_role,
          email,
          full_name
        `)
        .eq(
          "id",
          data.user.id
        )
        .maybeSingle();

      if (
        profileError
      ) {
        await supabase.auth.signOut();

        throw new Error(
          `${T(
            "No pudimos verificar tus permisos",
            "We could not verify your permissions"
          )}: ${profileError.message}`
        );
      }

      if (
        !profile ||
        profile.role !==
          "admin"
      ) {
        await supabase.auth.signOut();

        throw new Error(
          T(
            "Esta cuenta no tiene permisos administrativos.",
            "This account does not have administrative permissions."
          )
        );
      }

      if (
        !isAdminRole(
          profile.admin_role
        )
      ) {
        await supabase.auth.signOut();

        throw new Error(
          T(
            "Esta cuenta administrativa no tiene un rol válido asignado.",
            "This administrative account does not have a valid role assigned."
          )
        );
      }

      router.replace(
        "/admin"
      );

      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : T(
              "No se pudo iniciar sesión.",
              "Could not sign in."
            )
      );
    } finally {
      setLoading(false);
    }
  }

  if (checkingSession) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <div className="rounded-3xl border border-slate-200 bg-white px-8 py-10 text-center shadow-xl">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-2xl font-black text-white">
            R
          </div>

          <p className="font-bold text-slate-900">
            {T(
              "Verificando sesión administrativa...",
              "Verifying administrative session..."
            )}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-2xl">
          <div className="bg-gradient-to-br from-blue-600 to-indigo-700 px-8 py-10 text-white">
            <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/20 bg-white/10 text-2xl font-black">
              R
            </div>

            <p className="mb-2 text-xs font-black uppercase tracking-[0.25em] text-blue-100">
              RELYDO ADMIN
            </p>

            <h1 className="text-3xl font-black tracking-tight">
              {T(
                "Panel administrativo",
                "Administrative panel"
              )}
            </h1>

            <p className="mt-3 text-sm leading-6 text-blue-100">
              {T(
                "Acceso exclusivo para personal autorizado de RELYDO.",
                "Exclusive access for authorized RELYDO staff."
              )}
            </p>
          </div>

          <form
            onSubmit={iniciarSesion}
            className="space-y-6 p-8"
          >
            <div>
              <label
                htmlFor="email"
                className="mb-2 block text-sm font-bold text-slate-900"
              >
                {T(
                  "Correo administrativo",
                  "Administrative email"
                )}
              </label>

              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) =>
                  setEmail(
                    event.target.value
                  )
                }
                placeholder="admin@relydo.co"
                disabled={loading}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-4 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:opacity-60"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-2 block text-sm font-bold text-slate-900"
              >
                {T(
                  "Contraseña",
                  "Password"
                )}
              </label>

              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) =>
                  setPassword(
                    event.target.value
                  )
                }
                placeholder={T(
                  "Tu contraseña",
                  "Your password"
                )}
                disabled={loading}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-4 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:opacity-60"
              />
            </div>

            {error && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm font-semibold text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl bg-blue-600 px-5 py-4 text-base font-black text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading
                ? T(
                    "Verificando acceso...",
                    "Verifying access..."
                  )
                : T(
                    "Entrar a RELYDO Admin",
                    "Enter RELYDO Admin"
                  )}
            </button>

            <div className="rounded-2xl bg-slate-50 px-4 py-4 text-center text-xs leading-5 text-slate-500">
              🔒{" "}
              {T(
                "El acceso está restringido a cuentas administrativas autorizadas.",
                "Access is restricted to authorized administrative accounts."
              )}
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}