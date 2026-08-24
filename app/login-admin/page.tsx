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

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

export default function LoginAdminPage() {
  const router = useRouter();

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
        data: profile,
      } = await supabase
        .from("profiles")
        .select(`
          id,
          role
        `)
        .eq("id", user.id)
        .maybeSingle();

      if (
        profile?.role === "admin"
      ) {
        router.replace(
          "/admin"
        );
        return;
      }

      await supabase.auth.signOut();
    } finally {
      setCheckingSession(false);
    }
  }

  async function iniciarSesion(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setError("");

    const emailLimpio =
      email.trim().toLowerCase();

    if (!emailLimpio) {
      setError(
        "Escribe el correo del administrador."
      );
      return;
    }

    if (!password) {
      setError(
        "Escribe tu contraseña."
      );
      return;
    }

    setLoading(true);

    try {
      const {
        data,
        error: loginError,
      } =
        await supabase.auth
          .signInWithPassword({
            email: emailLimpio,
            password,
          });

      if (
        loginError ||
        !data.user
      ) {
        throw new Error(
          "Correo o contraseña incorrectos."
        );
      }

      const {
        data: profile,
        error: profileError,
      } = await supabase
        .from("profiles")
        .select(`
          id,
          role,
          email,
          full_name
        `)
        .eq(
          "id",
          data.user.id
        )
        .maybeSingle();

      if (profileError) {
        await supabase.auth.signOut();

        throw new Error(
          `No pudimos verificar tus permisos: ${profileError.message}`
        );
      }

      if (
        !profile ||
        profile.role !== "admin"
      ) {
        await supabase.auth.signOut();

        throw new Error(
          "Esta cuenta no tiene permisos de administrador."
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
          : "No se pudo iniciar sesión."
      );
    } finally {
      setLoading(false);
    }
  }

  if (checkingSession) {
    return (
      <main className="min-h-screen bg-slate-100 flex items-center justify-center px-4">
        <div className="rounded-3xl bg-white px-8 py-10 shadow-xl border border-slate-200 text-center">
          <div className="mx-auto mb-4 h-12 w-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center text-2xl font-black">
            R
          </div>

          <p className="font-bold text-slate-900">
            Verificando sesión administrativa...
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="overflow-hidden rounded-[32px] bg-white shadow-2xl border border-slate-200">
          <div className="bg-gradient-to-br from-blue-600 to-indigo-700 px-8 py-10 text-white">
            <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/20 bg-white/10 text-2xl font-black">
              R
            </div>

            <p className="mb-2 text-xs font-black uppercase tracking-[0.25em] text-blue-100">
              RELYDO ADMIN
            </p>

            <h1 className="text-3xl font-black tracking-tight">
              Panel administrativo
            </h1>

            <p className="mt-3 text-sm leading-6 text-blue-100">
              Acceso exclusivo para administradores autorizados de RELYDO.
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
                Correo administrativo
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
                Contraseña
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
                placeholder="Tu contraseña"
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
                ? "Verificando acceso..."
                : "Entrar a RELYDO Admin"}
            </button>

            <div className="rounded-2xl bg-slate-50 px-4 py-4 text-center text-xs leading-5 text-slate-500">
              🔒 El acceso está restringido a cuentas con rol{" "}
              <strong className="text-slate-700">
                admin
              </strong>
              .
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}