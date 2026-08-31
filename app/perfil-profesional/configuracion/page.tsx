"use client";

import { FormEvent, useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/app/components/LanguageProvider";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

type ProviderProfile = {
  user_id: string;
  business_name: string | null;
  bio: string | null;
  trade: string | null;
  years_experience: number | null;
  service_radius_miles: number | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  license_required: boolean | null;
  license_number: string | null;
  license_state: string | null;
  license_expiration: string | null;
  insured: boolean | null;
  insurance_company: string | null;
  insurance_expiration: string | null;
  bonded: boolean | null;
  verification_status: string | null;
  verified: boolean | null;
  active: boolean | null;
};

type BaseProfile = {
  role: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
};

const TRADES = [
  ["plumbing", "Plomería", "Plumbing"],
  ["electrical", "Electricidad", "Electrical"],
  ["hvac", "HVAC / Aire acondicionado", "HVAC / Air conditioning"],
  ["carpentry", "Carpintería", "Carpentry"],
  ["painting", "Pintura", "Painting"],
  ["landscaping", "Jardinería", "Landscaping"],
  ["cleaning", "Limpieza", "Cleaning"],
  ["moving", "Mudanzas", "Moving"],
  ["other", "Otros servicios", "Other services"],
] as const;

function normalizarFecha(valor: string | null | undefined) {
  if (!valor) return "";
  return String(valor).slice(0, 10);
}

export default function ConfiguracionPerfilProfesional() {
  const router = useRouter();
  const { language } = useLanguage();
  const T = (es: string, en: string) => (language === "es" ? es : en);

  const [loading, setLoading] = useState(true);
  const [perfilBloqueadoPorTrabajo, setPerfilBloqueadoPorTrabajo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [guardadoVisual, setGuardadoVisual] = useState(false);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [email, setEmail] = useState("");

  const [businessName, setBusinessName] = useState("");
  const [bio, setBio] = useState("");
  const [trade, setTrade] = useState("");
  const [yearsExperience, setYearsExperience] = useState("0");
  const [serviceRadius, setServiceRadius] = useState("25");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");

  const [licenseRequired, setLicenseRequired] = useState(false);
  const [licenseNumber, setLicenseNumber] = useState("");
  const [licenseState, setLicenseState] = useState("");
  const [licenseExpiration, setLicenseExpiration] = useState("");
  const [insured, setInsured] = useState(false);
  const [insuranceCompany, setInsuranceCompany] = useState("");
  const [insuranceExpiration, setInsuranceExpiration] = useState("");
  const [bonded, setBonded] = useState(false);

  useEffect(() => {
    cargarPerfil();
  }, []);

  async function cargarPerfil() {
    setLoading(true);
    setError("");

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.replace("/login-profesional");
        return;
      }

      const { data: baseProfile, error: baseError } = await supabase
        .from("profiles")
        .select("role, phone, email, address")
        .eq("id", user.id)
        .maybeSingle();

      if (baseError || !baseProfile) {
        throw new Error(
          baseError?.message ||
            T("No encontramos tu cuenta en RELYDO.", "We could not find your RELYDO account.")
        );
      }

      const base = baseProfile as BaseProfile;

      if (base.role !== "provider") {
        router.replace("/");
        return;
      }

      const { data: providerData, error: providerError } = await supabase
        .from("provider_profiles")
        .select(`
          user_id,
          business_name,
          bio,
          trade,
          years_experience,
          service_radius_miles,
          city,
          state,
          zip_code,
          license_required,
          license_number,
          license_state,
          license_expiration,
          insured,
          insurance_company,
          insurance_expiration,
          bonded,
          verification_status,
          verified,
          active
        `)
        .eq("user_id", user.id)
        .maybeSingle();

      if (providerError || !providerData) {
        router.replace("/completar-perfil-profesional");
        return;
      }

      const { count: trabajosActivos, error: trabajosActivosError } = await supabase
        .from("service_requests")
        .select("id", { count: "exact", head: true })
        .eq("preferred_provider_id", user.id)
        .eq("status", "in_progress");

      if (trabajosActivosError) {
        throw new Error(trabajosActivosError.message);
      }

      if ((trabajosActivos || 0) > 0) {
        setPerfilBloqueadoPorTrabajo(true);
      }

      const profile = providerData as ProviderProfile;

      setEmail(base.email || user.email || "");
      setPhone(base.phone || "");
      setAddress(base.address || "");
      setBusinessName(profile.business_name || "");
      setBio(profile.bio || "");
      setTrade(profile.trade || "");
      setYearsExperience(String(profile.years_experience ?? 0));
      setServiceRadius(String(profile.service_radius_miles ?? 25));
      setCity(profile.city || "");
      setState(profile.state || "");
      setZipCode(profile.zip_code || "");
      setLicenseRequired(profile.license_required === true);
      setLicenseNumber(profile.license_number || "");
      setLicenseState(profile.license_state || "");
      setLicenseExpiration(normalizarFecha(profile.license_expiration));
      setInsured(profile.insured === true);
      setInsuranceCompany(profile.insurance_company || "");
      setInsuranceExpiration(normalizarFecha(profile.insurance_expiration));
      setBonded(profile.bonded === true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : T("No pudimos cargar tu perfil.", "We could not load your profile.")
      );
    } finally {
      setLoading(false);
    }
  }

  async function guardarPerfil(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const experiencia = Number(yearsExperience);
    const radio = Number(serviceRadius);

    if (!businessName.trim() || !trade) {
      setError(
        T(
          "El nombre del negocio y el oficio son obligatorios.",
          "Business name and trade are required."
        )
      );
      return;
    }

    if (!Number.isFinite(experiencia) || experiencia < 0 || experiencia > 80) {
      setError(
        T(
          "La experiencia debe estar entre 0 y 80 años.",
          "Experience must be between 0 and 80 years."
        )
      );
      return;
    }

    if (!Number.isFinite(radio) || radio < 1 || radio > 250) {
      setError(
        T(
          "El radio de servicio debe estar entre 1 y 250 millas.",
          "Service radius must be between 1 and 250 miles."
        )
      );
      return;
    }

    setGuardando(true);
    setGuardadoVisual(false);
    setError("");
    setMensaje("");

    try {
      const { data, error: rpcError } = await supabase.rpc(
        "update_provider_profile_settings",
        {
          p_business_name: businessName.trim(),
          p_bio: bio.trim() || null,
          p_trade: trade,
          p_years_experience: experiencia,
          p_service_radius_miles: radio,
          p_city: city.trim() || null,
          p_state: state.trim().toUpperCase() || null,
          p_zip_code: zipCode.trim() || null,
          p_phone: phone.trim() || null,
          p_address: address.trim() || null,
          p_license_required: licenseRequired,
          p_license_number: licenseNumber.trim() || null,
          p_license_state: licenseState.trim().toUpperCase() || null,
          p_license_expiration: licenseExpiration || null,
          p_insured: insured,
          p_insurance_company: insuranceCompany.trim() || null,
          p_insurance_expiration: insuranceExpiration || null,
          p_bonded: bonded,
        }
      );

      if (rpcError) {
        throw new Error(rpcError.message);
      }

      const resultado = data as {
        success?: boolean;
        requires_reverification?: boolean;
      } | null;

      if (resultado?.requires_reverification) {
        setMensaje(
          T(
            "Perfil guardado. El cambio de seguro o bond requiere nueva verificación. Te llevaremos a documentos.",
            "Profile saved. Insurance or bond changes require verification again. We will take you to documents."
          )
        );

        window.setTimeout(() => {
          router.push("/completar-verificacion");
        }, 1200);
        return;
      }

      setMensaje(
        T(
          "Perfil actualizado correctamente.",
          "Profile updated successfully."
        )
      );
      setGuardadoVisual(true);
      window.setTimeout(() => {
        setGuardadoVisual(false);
      }, 1500);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : T("No pudimos guardar tu perfil.", "We could not save your profile.")
      );
    } finally {
      setGuardando(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-100 px-4 py-10">
        <div className="mx-auto max-w-4xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="font-bold text-slate-600">
            {T("Cargando tu perfil...", "Loading your profile...")}
          </p>
        </div>
      </main>
    );
  }

  if (perfilBloqueadoPorTrabajo) {
    return (
      <main className="min-h-screen bg-slate-100 px-4 py-6 md:py-10">
        <div className="mx-auto max-w-3xl">
          <button
            type="button"
            onClick={() => router.push("/panel-profesional")}
            className="mb-5 font-extrabold text-blue-700 hover:underline"
          >
            ← {T("Volver al panel", "Back to dashboard")}
          </button>

          <section className="rounded-3xl border border-amber-200 bg-white p-6 shadow-sm md:p-8">
            <div className="text-4xl">🔒</div>
            <h1 className="mt-3 text-2xl font-black text-slate-900">
              {T("Perfil temporalmente bloqueado", "Profile temporarily locked")}
            </h1>
            <p className="mt-3 font-semibold leading-7 text-slate-600">
              {T(
                "Tienes uno o más trabajos activos. Por seguridad, no puedes modificar tu perfil profesional hasta finalizar todos tus trabajos activos.",
                "You have one or more active jobs. For security, you cannot modify your professional profile until all active jobs are completed."
              )}
            </p>
            <p className="mt-3 text-sm font-bold text-amber-700">
              {T(
                "Esto evita cambios de verificación, seguro o bond mientras existe un trabajo contratado en curso.",
                "This prevents verification, insurance, or bond changes while a contracted job is in progress."
              )}
            </p>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 md:py-10">
      <div className="mx-auto max-w-5xl">
        <button
          type="button"
          onClick={() => router.push("/panel-profesional")}
          className="mb-5 font-extrabold text-blue-700 hover:underline"
        >
          ← {T("Volver al panel", "Back to dashboard")}
        </button>

        <section className="overflow-hidden rounded-3xl bg-slate-950 text-white shadow-xl">
          <div className="px-6 py-7 md:px-8">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-blue-300">
              {T("Mi perfil", "My profile")}
            </p>
            <h1 className="mt-2 text-3xl font-black md:text-4xl">
              {T("Editar perfil profesional", "Edit professional profile")}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300 md:text-base">
              {T(
                "Puedes actualizar tus datos de contacto y servicio. El correo nunca se puede editar aquí. El nombre del negocio, oficio y licencia están protegidos y requieren aprobación administrativa. Seguro y bond pueden actualizarse, pero requieren nueva verificación.",
                "You can update your contact and service information. Email can never be edited here. Business name, trade, and license are protected and require admin approval. Insurance and bond can be updated, but require verification again."
              )}
            </p>
          </div>
        </section>

        {error && (
          <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 font-bold text-red-800">
            {error}
          </div>
        )}

        {mensaje && (
          <div className="mt-5 rounded-2xl border border-green-200 bg-green-50 px-5 py-4 font-bold text-green-800">
            {mensaje}
          </div>
        )}

        <form onSubmit={guardarPerfil} className="mt-6 space-y-6">
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
            <h2 className="text-xl font-black text-slate-900">
              {T("Información profesional", "Professional information")}
            </h2>

            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <CampoBloqueado
                label={T("Nombre del negocio", "Business name")}
                value={businessName}
                note={T(
                  "Requiere aprobación de Admin para cambiarlo.",
                  "Admin approval is required to change it."
                )}
              />

              <div>
                <label className="text-sm font-extrabold text-slate-700">
                  {T("Correo", "Email")}
                </label>
                <input
                  value={email}
                  disabled
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-100 px-4 py-3 font-semibold text-slate-500"
                />
              </div>

              <Campo
                label={T("Teléfono", "Phone")}
                value={phone}
                onChange={setPhone}
                type="tel"
              />

              <div>
                <label className="text-sm font-extrabold text-slate-700">
                  {T("Oficio / especialidad", "Trade / specialty")}
                </label>
                <select
                  value={trade}
                  disabled
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-100 px-4 py-3 font-semibold text-slate-500"
                >
                  <option value="">
                    {T("Sin oficio", "No trade")}
                  </option>
                  {TRADES.map(([value, es, en]) => (
                    <option key={value} value={value}>
                      {language === "es" ? es : en}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs font-semibold text-amber-700">
                  {T(
                    "Requiere aprobación de Admin para cambiarlo.",
                    "Admin approval is required to change it."
                  )}
                </p>
              </div>

              <Campo
                label={T("Años de experiencia", "Years of experience")}
                value={yearsExperience}
                onChange={setYearsExperience}
                type="number"
                min="0"
                max="80"
              />

              <Campo
                label={T("Radio de servicio (millas)", "Service radius (miles)")}
                value={serviceRadius}
                onChange={setServiceRadius}
                type="number"
                min="1"
                max="250"
              />
            </div>

            <div className="mt-5">
              <label className="text-sm font-extrabold text-slate-700">
                {T("Bio profesional", "Professional bio")}
              </label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={5}
                maxLength={1500}
                className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-semibold text-slate-900 outline-none focus:border-blue-600"
              />
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
            <h2 className="text-xl font-black text-slate-900">
              {T("Área de servicio", "Service area")}
            </h2>

            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <div className="md:col-span-2">
                <Campo
                  label={T("Dirección", "Address")}
                  value={address}
                  onChange={setAddress}
                />
              </div>
              <Campo label={T("Ciudad", "City")} value={city} onChange={setCity} />
              <Campo
                label={T("Estado", "State")}
                value={state}
                onChange={(valor) => setState(valor.toUpperCase())}
                maxLength={2}
              />
              <Campo label="ZIP" value={zipCode} onChange={setZipCode} />
            </div>
          </section>

          <section className="rounded-3xl border border-amber-200 bg-white p-6 shadow-sm md:p-8">
            <div className="rounded-2xl bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-900">
              {T(
                "La licencia está bloqueada y solo Admin puede aprobar cambios. El seguro y el bond sí pueden actualizarse, pero cualquier cambio los envía nuevamente a verificación.",
                "License information is locked and only Admin can approve changes. Insurance and bond can be updated, but any change sends them back for verification."
              )}
            </div>

            <h2 className="mt-6 text-xl font-black text-slate-900">
              {T("Licencia, seguro y bond", "License, insurance and bond")}
            </h2>

            <div className="mt-5 space-y-5">
              <CheckBloqueado
                label={T("Mi trabajo requiere licencia", "My work requires a license")}
                checked={licenseRequired}
              />

              {licenseRequired && (
                <div className="grid gap-5 md:grid-cols-3">
                  <CampoBloqueado
                    label={T("Número de licencia", "License number")}
                    value={licenseNumber}
                  />
                  <CampoBloqueado
                    label={T("Estado de licencia", "License state")}
                    value={licenseState}
                  />
                  <CampoBloqueado
                    label={T("Vencimiento", "Expiration")}
                    value={licenseExpiration}
                    type="date"
                  />
                </div>
              )}

              <p className="-mt-2 text-xs font-semibold text-amber-700">
                {T(
                  "Los cambios de licencia requieren solicitud y aprobación de Admin.",
                  "License changes require an Admin request and approval."
                )}
              </p>

              <Check
                label={T("Tengo seguro", "I am insured")}
                checked={insured}
                onChange={setInsured}
              />

              {insured && (
                <div className="grid gap-5 md:grid-cols-2">
                  <Campo
                    label={T("Compañía de seguro", "Insurance company")}
                    value={insuranceCompany}
                    onChange={setInsuranceCompany}
                  />
                  <Campo
                    label={T("Vencimiento del seguro", "Insurance expiration")}
                    value={insuranceExpiration}
                    onChange={setInsuranceExpiration}
                    type="date"
                  />
                </div>
              )}

              <Check
                label={T("Tengo bond / fianza", "I am bonded")}
                checked={bonded}
                onChange={setBonded}
              />
            </div>
          </section>

          <div className="flex flex-col-reverse gap-3 pb-10 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => router.push("/panel-profesional")}
              className="rounded-xl border border-slate-300 bg-white px-6 py-3 font-extrabold text-slate-700"
            >
              {T("Cancelar", "Cancel")}
            </button>

            <button
              type="submit"
              disabled={guardando || guardadoVisual}
              className={`min-w-[180px] rounded-xl px-7 py-3 font-extrabold text-white shadow-sm transition-all duration-300 disabled:cursor-not-allowed ${
                guardadoVisual
                  ? "scale-[1.02] bg-emerald-600 shadow-emerald-600/20"
                  : "bg-blue-700 hover:bg-blue-800 disabled:opacity-70"
              }`}
            >
              <span className="inline-flex items-center justify-center gap-2">
                {guardando ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    {T("Guardando...", "Saving...")}
                  </>
                ) : guardadoVisual ? (
                  <>
                    <span className="text-lg">✓</span>
                    {T("Guardado", "Saved")}
                  </>
                ) : (
                  T("Guardar cambios", "Save changes")
                )}
              </span>
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}

function Campo({
  label,
  value,
  onChange,
  type = "text",
  required = false,
  min,
  max,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  min?: string;
  max?: string;
  maxLength?: number;
}) {
  return (
    <div>
      <label className="text-sm font-extrabold text-slate-700">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        min={min}
        max={max}
        maxLength={maxLength}
        className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-semibold text-slate-900 outline-none focus:border-blue-600"
      />
    </div>
  );
}


function CampoBloqueado({
  label,
  value,
  note,
  type = "text",
}: {
  label: string;
  value: string;
  note?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="text-sm font-extrabold text-slate-700">{label}</label>
      <input
        type={type}
        value={value}
        disabled
        className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-100 px-4 py-3 font-semibold text-slate-500"
      />
      {note && (
        <p className="mt-1 text-xs font-semibold text-amber-700">{note}</p>
      )}
    </div>
  );
}

function CheckBloqueado({
  label,
  checked,
}: {
  label: string;
  checked: boolean;
}) {
  return (
    <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-100 p-4">
      <input
        type="checkbox"
        checked={checked}
        disabled
        className="h-5 w-5"
      />
      <span className="font-extrabold text-slate-600">{label}</span>
    </label>
  );
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-5"
      />
      <span className="font-extrabold text-slate-800">{label}</span>
    </label>
  );
}
