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
  useSearchParams,
} from "next/navigation";

import {
  useLanguage,
} from "@/app/components/LanguageProvider";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

function obtenerDestinoSeguro(
  value: string | null
) {
  if (
    value &&
    value.startsWith("/") &&
    !value.startsWith("//")
  ) {
    return value;
  }

  return "/mis-solicitudes";
}

function CompletarPerfilClienteContenido() {
  const searchParams =
    useSearchParams();

  const { language } =
    useLanguage();

  const redirectParam =
    searchParams.get("redirect");

  const destino =
    obtenerDestinoSeguro(
      redirectParam
    );

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState("");

  const [name, setName] =
    useState("");

  const [email, setEmail] =
    useState("");

  const [phone, setPhone] =
    useState("");

  const [
    addressLine1,
    setAddressLine1,
  ] = useState("");

  const [
    addressLine2,
    setAddressLine2,
  ] = useState("");

  const [city, setCity] =
    useState("");

  const [state, setState] =
    useState("");

  const [zip, setZip] =
    useState("");

  const text =
    language === "es"
      ? {
          titulo:
            "Completa tu perfil",
          descripcion:
            "Google confirmó tu identidad. RELYDO necesita estos datos para gestionar tus servicios.",
          cuentaGoogle:
            "Cuenta de Google",
          telefono:
            "Teléfono",
          telefonoPlaceholder:
            "(702) 555-1234",
          direccion:
            "Dirección",
          direccionPlaceholder:
            "Número y nombre de la calle",
          direccion2:
            "Apartamento, unidad o suite (opcional)",
          direccion2Placeholder:
            "Apt 101",
          ciudad:
            "Ciudad",
          ciudadPlaceholder:
            "Las Vegas",
          estado:
            "Estado",
          codigoPostal:
            "Código postal",
          guardar:
            "Guardar y continuar",
          guardando:
            "Guardando...",
          cargando:
            "Cargando perfil...",
          errorSesion:
            "Tu sesión expiró. Inicia sesión nuevamente.",
          errorCarga:
            "No pudimos cargar tu perfil.",
          errorCampos:
            "Completa teléfono, dirección, ciudad, estado y código postal.",
        }
      : {
          titulo:
            "Complete your profile",
          descripcion:
            "Google confirmed your identity. RELYDO needs these details to manage your services.",
          cuentaGoogle:
            "Google account",
          telefono:
            "Phone",
          telefonoPlaceholder:
            "(702) 555-1234",
          direccion:
            "Street address",
          direccionPlaceholder:
            "Street number and name",
          direccion2:
            "Apartment, unit or suite (optional)",
          direccion2Placeholder:
            "Apt 101",
          ciudad:
            "City",
          ciudadPlaceholder:
            "Las Vegas",
          estado:
            "State",
          codigoPostal:
            "ZIP code",
          guardar:
            "Save and continue",
          guardando:
            "Saving...",
          cargando:
            "Loading profile...",
          errorSesion:
            "Your session expired. Please sign in again.",
          errorCarga:
            "We could not load your profile.",
          errorCampos:
            "Complete phone, address, city, state, and ZIP code.",
        };

  useEffect(() => {
    async function cargarPerfil() {
      try {
        const {
          data: sessionData,
        } =
          await supabase.auth.getSession();

        const session =
          sessionData.session;

        if (!session) {
          window.location.href =
            `/login-cliente?redirect=${encodeURIComponent(
              destino
            )}`;

          return;
        }

        const response =
          await fetch(
            "/api/auth/google/customer",
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
              text.errorCarga
          );
        }

        if (
          result?.needsProfileCompletion ===
          false
        ) {
          window.location.href =
            destino;

          return;
        }

        const profile =
          result?.profile || {};

        setName(
          profile.full_name || ""
        );

        setEmail(
          profile.email ||
            session.user.email ||
            ""
        );

        setPhone(
          profile.phone || ""
        );

        setAddressLine1(
          profile.address_line1 || ""
        );

        setAddressLine2(
          profile.address_line2 || ""
        );

        setCity(
          profile.city || ""
        );

        setState(
          profile.state || ""
        );

        setZip(
          profile.zip || ""
        );

        setLoading(false);
      } catch (err) {
        console.error(
          "Error loading Google customer profile:",
          err
        );

        setError(
          err instanceof Error
            ? err.message
            : text.errorCarga
        );

        setLoading(false);
      }
    }

    cargarPerfil();
  }, [
    destino,
    text.errorCarga,
  ]);

  async function guardar(
    e: React.FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    if (saving) {
      return;
    }

    const telefonoLimpio =
      phone.trim();

    const direccionLimpia =
      addressLine1.trim();

    const ciudadLimpia =
      city.trim();

    const estadoLimpio =
      state
        .trim()
        .toUpperCase()
        .slice(0, 2);

    const zipLimpio =
      zip.trim();

    if (
      !telefonoLimpio ||
      !direccionLimpia ||
      !ciudadLimpia ||
      !estadoLimpio ||
      !zipLimpio
    ) {
      setError(
        text.errorCampos
      );

      return;
    }

    setSaving(true);
    setError("");

    try {
      const {
        data: sessionData,
      } =
        await supabase.auth.getSession();

      const session =
        sessionData.session;

      if (!session) {
        throw new Error(
          text.errorSesion
        );
      }

      const response =
        await fetch(
          "/api/auth/google/customer",
          {
            method: "PATCH",
            headers: {
              "Content-Type":
                "application/json",
              Authorization:
                `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              phone:
                telefonoLimpio,
              address_line1:
                direccionLimpia,
              address_line2:
                addressLine2.trim(),
              city:
                ciudadLimpia,
              state:
                estadoLimpio,
              zip:
                zipLimpio,
            }),
          }
        );

      const result =
        await response.json();

      if (!response.ok) {
        throw new Error(
          result?.error ||
            text.errorCarga
        );
      }

      window.location.href =
        destino;
    } catch (err) {
      console.error(
        "Error saving Google customer profile:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : text.errorCarga
      );

      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <div className="rounded-2xl bg-white px-8 py-7 shadow-lg">
          <p className="font-bold text-slate-700">
            {text.cargando}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-10">
      <div className="mx-auto w-full max-w-2xl">

        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl">

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
              <div className="mb-6 rounded-xl border border-red-300 bg-red-50 p-4 text-red-700">
                {error}
              </div>
            )}

            <div className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="text-sm font-bold uppercase tracking-wide text-slate-500">
                {text.cuentaGoogle}
              </div>

              {name && (
                <div className="mt-2 font-extrabold text-slate-900">
                  {name}
                </div>
              )}

              {email && (
                <div className="mt-1 break-all text-sm text-slate-600">
                  {email}
                </div>
              )}
            </div>

            <form
              onSubmit={guardar}
              className="space-y-5"
            >

              <div>
                <label
                  htmlFor="phone"
                  className="mb-2 block font-bold text-slate-900"
                >
                  {text.telefono}
                </label>

                <input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) =>
                    setPhone(
                      e.target.value
                    )
                  }
                  required
                  disabled={saving}
                  autoComplete="tel"
                  placeholder={
                    text.telefonoPlaceholder
                  }
                  className="w-full rounded-xl border border-slate-300 p-4 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                />
              </div>

              <div>
                <label
                  htmlFor="addressLine1"
                  className="mb-2 block font-bold text-slate-900"
                >
                  {text.direccion}
                </label>

                <input
                  id="addressLine1"
                  type="text"
                  value={addressLine1}
                  onChange={(e) =>
                    setAddressLine1(
                      e.target.value
                    )
                  }
                  required
                  disabled={saving}
                  autoComplete="address-line1"
                  placeholder={
                    text.direccionPlaceholder
                  }
                  className="w-full rounded-xl border border-slate-300 p-4 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                />
              </div>

              <div>
                <label
                  htmlFor="addressLine2"
                  className="mb-2 block font-bold text-slate-900"
                >
                  {text.direccion2}
                </label>

                <input
                  id="addressLine2"
                  type="text"
                  value={addressLine2}
                  onChange={(e) =>
                    setAddressLine2(
                      e.target.value
                    )
                  }
                  disabled={saving}
                  autoComplete="address-line2"
                  placeholder={
                    text.direccion2Placeholder
                  }
                  className="w-full rounded-xl border border-slate-300 p-4 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">

                <div>
                  <label
                    htmlFor="city"
                    className="mb-2 block font-bold text-slate-900"
                  >
                    {text.ciudad}
                  </label>

                  <input
                    id="city"
                    type="text"
                    value={city}
                    onChange={(e) =>
                      setCity(
                        e.target.value
                      )
                    }
                    required
                    disabled={saving}
                    autoComplete="address-level2"
                    placeholder={
                      text.ciudadPlaceholder
                    }
                    className="w-full rounded-xl border border-slate-300 p-4 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                  />
                </div>

                <div>
                  <label
                    htmlFor="state"
                    className="mb-2 block font-bold text-slate-900"
                  >
                    {text.estado}
                  </label>

                  <input
                    id="state"
                    type="text"
                    value={state}
                    onChange={(e) =>
                      setState(
                        e.target.value
                          .toUpperCase()
                          .slice(
                            0,
                            2
                          )
                      )
                    }
                    required
                    disabled={saving}
                    autoComplete="address-level1"
                    maxLength={2}
                    placeholder="NV"
                    className="w-full rounded-xl border border-slate-300 p-4 uppercase text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                  />
                </div>

                <div>
                  <label
                    htmlFor="zip"
                    className="mb-2 block font-bold text-slate-900"
                  >
                    {text.codigoPostal}
                  </label>

                  <input
                    id="zip"
                    type="text"
                    value={zip}
                    onChange={(e) =>
                      setZip(
                        e.target.value
                      )
                    }
                    required
                    disabled={saving}
                    autoComplete="postal-code"
                    placeholder="89101"
                    className="w-full rounded-xl border border-slate-300 p-4 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                  />
                </div>

              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-xl bg-blue-700 py-4 text-lg font-extrabold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving
                  ? text.guardando
                  : text.guardar}
              </button>

            </form>

          </div>
        </div>
      </div>
    </main>
  );
}

function CompletarPerfilClienteFallback() {
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

export default function CompletarPerfilClientePage() {
  return (
    <Suspense
      fallback={
        <CompletarPerfilClienteFallback />
      }
    >
      <CompletarPerfilClienteContenido />
    </Suspense>
  );
}