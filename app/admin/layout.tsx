"use client";

import {
  ReactNode,
  useEffect,
  useState,
} from "react";

import {
  createClient,
} from "@supabase/supabase-js";

import {
  usePathname,
  useRouter,
} from "next/navigation";

import {
  hasAdminPermission,
  isAdminRole,
  permissionForAdminPath,
} from "@/app/lib/adminPermissions";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

export default function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const router =
    useRouter();

  const pathname =
    usePathname();

  const [
    checking,
    setChecking,
  ] = useState(true);

  const [
    allowed,
    setAllowed,
  ] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function verifyAccess() {
      setChecking(true);
      setAllowed(false);

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
          "admin"
      ) {
        await supabase.auth.signOut();

        router.replace(
          "/login-admin"
        );
        return;
      }

      if (
        !isAdminRole(
          profile.admin_role
        )
      ) {
        await supabase.auth.signOut();

        router.replace(
          "/login-admin"
        );
        return;
      }

      const permission =
        permissionForAdminPath(
          pathname
        );

      /*
        Ruta Admin desconocida:
        regresar al Home Admin.
      */
      if (!permission) {
        router.replace(
          "/admin"
        );
        return;
      }

      /*
        Ruta conocida pero no autorizada:
        regresar al Home Admin.

        Nunca redirigir automáticamente a otra
        sección interna. Así evitamos bucles.
      */
      if (
        !hasAdminPermission(
          profile.admin_role,
          permission
        )
      ) {
        router.replace(
          "/admin"
        );
        return;
      }

      if (!mounted) {
        return;
      }

      setAllowed(true);
      setChecking(false);
    }

    verifyAccess();

    return () => {
      mounted = false;
    };
  }, [
    pathname,
    router,
  ]);

  if (
    checking ||
    !allowed
  ) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <div className="rounded-3xl border border-slate-200 bg-white px-8 py-10 text-center shadow-xl">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-2xl font-black text-white">
            R
          </div>

          <p className="font-bold text-slate-900">
            Verificando permisos administrativos...
          </p>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}