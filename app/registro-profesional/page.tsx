"use client";

import { useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/app/components/LanguageProvider";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

export default function RegistroProfesional() {
  const router = useRouter();
  const { language } = useLanguage();
  const T = (es: string, en: string) => (language === "es" ? es : en);

  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [registroCompletado, setRegistroCompletado] = useState(false);
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [mostrarConfirmPassword, setMostrarConfirmPassword] = useState(false);
  const [requiereLicencia, setRequiereLicencia] = useState("");
  const [tieneSeguro, setTieneSeguro] = useState("");

  async function handleSubmit(
    e: React.FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    setError("");
    setMensaje("");
    setEnviando(true);

    const form = e.currentTarget;
    const formData = new FormData(form);

    const legalName = String(
      formData.get("legal_name") || ""
    ).trim();

    const businessName = String(
      formData.get("business_name") || ""
    ).trim();

    const email = String(
      formData.get("email") || ""
    )
      .trim()
      .toLowerCase();

    const phone = String(
      formData.get("phone") || ""
    ).trim();

    const password = String(
      formData.get("password") || ""
    );

    const confirmPassword = String(
      formData.get("confirm_password") || ""
    );

    const acceptedTerms =
      formData.get("accepted_terms") === "yes";

    const trade = String(
      formData.get("trade") || ""
    ).trim();

    const bio = String(
      formData.get("bio") || ""
    ).trim();

    const yearsExperience = Number(
      formData.get("years_experience") || 0
    );

    const serviceRadiusMiles = Number(
      formData.get("service_radius_miles") || 25
    );

    const city = String(
      formData.get("city") || ""
    ).trim();

    const state = String(
      formData.get("state") || ""
    )
      .trim()
      .toUpperCase();

    const zipCode = String(
      formData.get("zip_code") || ""
    ).trim();

    const address = String(
      formData.get("address") || ""
    ).trim();

    const licenseRequired =
      formData.get("license_required") === "yes";

    const licenseNumber = String(
      formData.get("license_number") || ""
    ).trim();

    const licenseState = String(
      formData.get("license_state") || ""
    )
      .trim()
      .toUpperCase();

    const licenseExpiration = String(
      formData.get("license_expiration") || ""
    ).trim();

    const insured =
      formData.get("insured") === "yes";

    const insuranceCompany = String(
      formData.get("insurance_company") || ""
    ).trim();

    const insuranceExpiration = String(
      formData.get("insurance_expiration") || ""
    ).trim();

    const bonded =
      formData.get("bonded") === "yes";

    /*
      VALIDACIONES
    */

    if (password.length < 8) {
      setError(
        T("La contraseña debe tener al menos 8 caracteres.", "Password must be at least 8 characters.")
      );
      setEnviando(false);
      return;
    }

    if (password !== confirmPassword) {
      setError(
        T("Las contraseñas no coinciden.", "Passwords do not match.")
      );
      setEnviando(false);
      return;
    }

    if (!acceptedTerms) {
      setError(
        T(
          "Debes aceptar los Términos de servicio y la Política de privacidad para crear tu cuenta.",
          "You must accept the Terms of Service and Privacy Policy to create your account."
        )
      );
      setEnviando(false);
      return;
    }

    if (
      !legalName ||
      !businessName ||
      !email ||
      !phone ||
      !trade ||
      !bio ||
      !city ||
      !state ||
      !zipCode ||
      !address
    ) {
      setError(
        T("Completa todos los campos obligatorios.", "Complete all required fields.")
      );
      setEnviando(false);
      return;
    }

    if (
      yearsExperience < 0 ||
      !Number.isFinite(yearsExperience)
    ) {
      setError(
        T("Los años de experiencia no son válidos.", "Years of experience are not valid.")
      );
      setEnviando(false);
      return;
    }

    if (
      serviceRadiusMiles < 1 ||
      !Number.isFinite(serviceRadiusMiles)
    ) {
      setError(
        T("El radio de servicio debe ser de al menos 1 milla.", "Service radius must be at least 1 mile.")
      );
      setEnviando(false);
      return;
    }

    if (
      licenseRequired &&
      (!licenseNumber ||
        !licenseState)
    ) {
      setError(
        T("Si tu trabajo requiere licencia, debes indicar el número y el estado que la emitió.", "If your work requires a license, enter the license number and issuing state.")
      );
      setEnviando(false);
      return;
    }

    if (
      insured &&
      !insuranceCompany
    ) {
      setError(
        T("Si indicas que tienes seguro, escribe el nombre de la compañía aseguradora.", "If you indicate that you have insurance, enter the insurance company name.")
      );
      setEnviando(false);
      return;
    }

    try {
      /*
        1. COMPROBAR SI EL EMAIL YA ESTÁ EN USO

        Esta RPC revisa tanto Authentication como public.profiles.
        Así RELYDO puede mostrar un mensaje claro antes de intentar
        crear una segunda cuenta con el mismo correo.
      */

      const {
        data: emailExiste,
        error: emailCheckError,
      } = await supabase.rpc(
        "relydo_email_exists",
        {
          check_email: email,
        }
      );

      if (emailCheckError) {
        throw new Error(
          T(
            `No pudimos comprobar el correo: ${emailCheckError.message}`,
            `We could not verify the email address: ${emailCheckError.message}`
          )
        );
      }

      if (emailExiste === true) {
        setError(
          T(
            "Este correo ya está asociado a una cuenta en RELYDO. Inicia sesión o utiliza otro correo.",
            "This email is already associated with a RELYDO account. Sign in or use a different email."
          )
        );

        setEnviando(false);
        return;
      }

      /*
        2. CREAR USUARIO EN AUTH

        El trigger de Supabase que instalaremos crea inmediatamente:
        - profiles
        - provider_profiles
        - provider_services (si existe la categoría)

        El profesional queda:
        verification_status = pending
        verified = false
        active = false

        Por eso Admin puede verlo desde el mismo momento del registro,
        incluso antes de que confirme el correo.
      */

      const {
        data: authData,
        error: authError,
      } = await supabase.auth.signUp({
        email,
        password,

        options: {
          emailRedirectTo:
            `${window.location.origin}/login-profesional`,

          /*
            Guardamos temporalmente la información
            no sensible del registro.

            Después de confirmar email e iniciar
            sesión, la usaremos para crear las
            tablas reales del profesional.
          */

          data: {
            signup_type: "provider",

            legal_name: legalName,
            business_name: businessName,
            phone,

            trade,
            bio,

            years_experience:
              yearsExperience,

            service_radius_miles:
              serviceRadiusMiles,

            city,
            state,
            zip_code: zipCode,
            address,

            license_required:
              licenseRequired,

            license_number:
              licenseRequired ? licenseNumber || null : null,

            license_state:
              licenseRequired ? licenseState || null : null,

            license_expiration:
              licenseRequired ? licenseExpiration || null : null,

            insured,

            insurance_company:
              insured ? insuranceCompany || null : null,

            insurance_expiration:
              insured ? insuranceExpiration || null : null,

            bonded,
          },
        },
      });

      if (authError) {
        throw new Error(
          authError.message
        );
      }

      if (!authData.user) {
        throw new Error(
          T("No se pudo crear la cuenta.", "The account could not be created.")
        );
      }

      /*
        Protección adicional:
        con Confirm Email activado Supabase puede responder de forma
        deliberadamente ambigua si el correo ya existía.
        Una lista identities vacía es una señal de que no se creó
        una identidad nueva.
      */

      if (
        Array.isArray(authData.user.identities) &&
        authData.user.identities.length === 0
      ) {
        setError(
          T(
            "Este correo ya está asociado a una cuenta en RELYDO. Inicia sesión o utiliza otro correo.",
            "This email is already associated with a RELYDO account. Sign in or use a different email."
          )
        );

        setEnviando(false);
        return;
      }

      form.reset();

      /*
        Si Confirm Email está activado,
        normalmente session será null.

        Eso es correcto.
      */

      if (!authData.session) {
        setMensaje(
          T(
            "Registro procesado con éxito. Revisa tu bandeja de entrada y confirma tu correo electrónico. Al confirmar el enlace, RELYDO te llevará automáticamente a la pantalla de inicio de sesión.",
            "Registration completed successfully. Check your inbox and confirm your email address. After you confirm the link, RELYDO will automatically take you to the sign-in screen."
          )
        );

        setRegistroCompletado(true);
        return;
      }

      /*
        Si en algún momento desactivamos
        Confirm Email y Supabase devuelve
        una sesión inmediatamente,
        podemos continuar al siguiente paso.
      */

      setMensaje(
        T(
          "Cuenta creada correctamente. Continúa para completar tu perfil profesional.",
          "Account created successfully. Continue to complete your professional profile."
        )
      );

      setRegistroCompletado(true);
    } catch (err) {
      console.error(err);

      if (err instanceof Error) {
        const mensajeError =
          err.message.toLowerCase();

        if (
          mensajeError.includes("rate limit") ||
          mensajeError.includes("email rate limit")
        ) {
          setError(
            T(
              "Se han enviado demasiados correos en poco tiempo. Espera unos minutos e inténtalo nuevamente.",
              "Too many emails have been sent in a short period. Wait a few minutes and try again."
            )
          );
        } else if (
          mensajeError.includes("already registered") ||
          mensajeError.includes("already exists") ||
          mensajeError.includes("user already registered")
        ) {
          setError(
            T(
              "Este correo ya está asociado a una cuenta en RELYDO. Inicia sesión o utiliza otro correo.",
              "This email is already associated with a RELYDO account. Sign in or use a different email."
            )
          );
        } else {
          setError(err.message);
        }
      } else {
        setError(
          T("Ocurrió un error inesperado.", "An unexpected error occurred.")
        );
      }
    } finally {
      setEnviando(false);
    }
  }

  const inputClass =
    "w-full rounded-xl border border-slate-300 bg-white px-4 py-3.5 text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100";

  const labelClass =
    "mb-2 block text-sm font-bold text-slate-900";

  const sectionTitleClass =
    "mb-5 flex items-center gap-2 text-xl font-extrabold text-blue-700";

  if (registroCompletado) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
        <div className="w-full max-w-2xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
          <div className="bg-gradient-to-br from-blue-700 to-blue-600 px-6 py-10 text-center text-white md:px-10 md:py-14">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-white text-4xl font-black text-green-600 shadow-lg">
              ✓
            </div>

            <p className="mb-3 text-sm font-extrabold uppercase tracking-[0.22em] text-blue-100">
              RELYDO
            </p>

            <h1 className="text-3xl font-black tracking-tight md:text-5xl">
              {T(
                "¡Registro procesado con éxito!",
                "Registration completed successfully!"
              )}
            </h1>

            <p className="mx-auto mt-5 max-w-xl text-lg leading-8 text-blue-50 md:text-xl">
              {T(
                "Revisa tu bandeja de entrada. Te enviamos un correo para verificar tu dirección de email.",
                "Check your inbox. We sent you an email to verify your email address."
              )}
            </p>
          </div>

          <div className="px-6 py-8 text-center md:px-10">
            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
              <p className="text-lg font-extrabold text-slate-900">
                {T(
                  "Confirma tu correo para continuar",
                  "Confirm your email to continue"
                )}
              </p>

              <p className="mt-2 text-sm leading-6 text-slate-600">
                {mensaje}
              </p>
            </div>

            <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <p className="font-bold text-slate-800">
                {T(
                  "Después de confirmar el correo, RELYDO abrirá automáticamente la pantalla de inicio de sesión.",
                  "After confirming your email, RELYDO will automatically open the sign-in screen."
                )}
              </p>

              <p className="mt-2 text-sm text-slate-500">
                {T(
                  "Puedes dejar esta ventana abierta o cerrarla.",
                  "You can leave this window open or close it."
                )}
              </p>
            </div>

          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-10">

      <div className="mx-auto max-w-6xl">

        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl">

          {/* HEADER */}

          <div className="bg-blue-700 px-8 py-7 text-white">

            <button
              type="button"
              onClick={() => router.back()}
              className="mb-5 inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-4 py-2 text-sm font-bold text-white transition hover:bg-white/20"
              aria-label={T("Regresar", "Go back")}
            >
              <span aria-hidden="true">←</span>
              {T("Regresar", "Back")}
            </button>

            <div className="flex flex-col gap-2">

              <div className="text-2xl font-black tracking-tight">
                RELYDO
              </div>

              <h1 className="text-3xl font-extrabold md:text-4xl">
                {T("Registrarse como profesional", "Register as a professional")}
              </h1>

              <p className="text-base text-blue-100">
                {T("Crea tu cuenta. Después de confirmar tu correo podrás completar la verificación.", "Create your account. After confirming your email, you can complete verification.")}
              </p>

            </div>

          </div>

          <form
            onSubmit={handleSubmit}
            className="p-6 md:p-8"
          >

            <div className="grid gap-8 lg:grid-cols-2">

              {/* IZQUIERDA */}

              <div className="space-y-8">

                {/* CUENTA */}

                <section>

                  <h2 className={sectionTitleClass}>
                    <span>👤</span>
                    {T("Información de la cuenta", "Account information")}
                  </h2>

                  <div className="space-y-5">

                    <div>
                      <label className={labelClass}>
                        {T("Nombre legal completo *", "Full legal name *")}
                      </label>

                      <input
                        name="legal_name"
                        required
                        type="text"
                        autoComplete="name"
                        placeholder={T("Ej: Carlos Rodríguez", "Example: John Smith")}
                        className={inputClass}
                      />
                    </div>

                    <div>
                      <label className={labelClass}>
                        {T("Nombre del negocio *", "Business name *")}
                      </label>

                      <input
                        name="business_name"
                        required
                        type="text"
                        placeholder={T("Ej: Carlos Plumbing LLC", "Example: John Smith Plumbing LLC")}
                        className={inputClass}
                      />
                    </div>

                    <div className="grid gap-5 md:grid-cols-2">

                      <div>

                        <label className={labelClass}>
                          Email *
                        </label>

                        <input
                          name="email"
                          required
                          type="email"
                          autoComplete="email"
                          placeholder={T("tu@email.com", "you@email.com")}
                          className={inputClass}
                        />

                      </div>

                      <div>

                        <label className={labelClass}>
                          {T("Teléfono *", "Phone *")}
                        </label>

                        <input
                          name="phone"
                          required
                          type="tel"
                          autoComplete="tel"
                          placeholder="(555) 123-4567"
                          className={inputClass}
                        />

                      </div>

                    </div>

                    <div>

                      <label className={labelClass}>
                        {T("Contraseña *", "Password *")}
                      </label>

                      <div className="relative">
                        <input
                          name="password"
                          required
                          type={mostrarPassword ? "text" : "password"}
                          minLength={8}
                          autoComplete="new-password"
                          placeholder={T("Mínimo 8 caracteres", "Minimum 8 characters")}
                          className={`${inputClass} pr-14`}
                        />

                        <button
                          type="button"
                          onClick={() => setMostrarPassword((actual) => !actual)}
                          className="absolute inset-y-0 right-0 flex w-14 items-center justify-center text-xl text-slate-500 transition hover:text-blue-700"
                          aria-label={mostrarPassword
                            ? T("Ocultar contraseña", "Hide password")
                            : T("Mostrar contraseña", "Show password")}
                          title={mostrarPassword
                            ? T("Ocultar contraseña", "Hide password")
                            : T("Mostrar contraseña", "Show password")}
                        >
                          {mostrarPassword ? "🙈" : "👁️"}
                        </button>
                      </div>

                    </div>

                    <div>

                      <label className={labelClass}>
                        {T("Confirmar contraseña *", "Confirm password *")}
                      </label>

                      <div className="relative">
                        <input
                          name="confirm_password"
                          required
                          type={mostrarConfirmPassword ? "text" : "password"}
                          minLength={8}
                          autoComplete="new-password"
                          placeholder={T("Escribe nuevamente tu contraseña", "Enter your password again")}
                          className={`${inputClass} pr-14`}
                        />

                        <button
                          type="button"
                          onClick={() => setMostrarConfirmPassword((actual) => !actual)}
                          className="absolute inset-y-0 right-0 flex w-14 items-center justify-center text-xl text-slate-500 transition hover:text-blue-700"
                          aria-label={mostrarConfirmPassword
                            ? T("Ocultar confirmación de contraseña", "Hide password confirmation")
                            : T("Mostrar confirmación de contraseña", "Show password confirmation")}
                          title={mostrarConfirmPassword
                            ? T("Ocultar confirmación de contraseña", "Hide password confirmation")
                            : T("Mostrar confirmación de contraseña", "Show password confirmation")}
                        >
                          {mostrarConfirmPassword ? "🙈" : "👁️"}
                        </button>
                      </div>

                    </div>

                  </div>

                </section>

                <div className="border-t border-slate-200" />

                {/* LICENCIA */}

                <section>

                  <h2 className={sectionTitleClass}>
                    <span>🪪</span>
                    {T("Licencia profesional", "Professional license")}
                  </h2>

                  <div className="space-y-5">

                    <div>

                      <label className={labelClass}>
                        {T("¿Tu trabajo requiere licencia? *", "Does your work require a license? *")}
                      </label>

                      <select
                        name="license_required"
                        required
                        value={requiereLicencia}
                        onChange={(e) => setRequiereLicencia(e.target.value)}
                        className={inputClass}
                      >
                        <option value="">
                          {T("Selecciona", "Select")}
                        </option>

                        <option value="yes">
                          {T("Sí", "Yes")}
                        </option>

                        <option value="no">
                          {T("No", "No")}
                        </option>
                      </select>

                    </div>

                    {requiereLicencia === "yes" && (
                      <>
                    <div className="grid gap-5 md:grid-cols-2">

                      <div>

                        <label className={labelClass}>
                          {T("Número de licencia", "License number")}
                        </label>

                        <input
                          name="license_number"
                          type="text"
                          placeholder={T("Ej: 012345", "Example: 012345")}
                          className={inputClass}
                        />

                      </div>

                      <div>

                        <label className={labelClass}>
                          {T("Estado que emitió la licencia", "License issuing state")}
                        </label>

                        <input
                          name="license_state"
                          type="text"
                          maxLength={2}
                          placeholder="NV"
                          className={inputClass}
                        />

                      </div>

                    </div>

                    <div>

                      <label className={labelClass}>
                        {T("Vencimiento de la licencia", "License expiration")}
                      </label>

                      <input
                        name="license_expiration"
                        type="date"
                        className={inputClass}
                      />

                    </div>

                    <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
                      {T("La copia de tu licencia se solicitará después de confirmar tu correo e iniciar sesión.", "A copy of your license will be requested after you confirm your email and sign in.")}
                    </div>
                      </>
                    )}

                  </div>

                </section>

                <div className="border-t border-slate-200" />

                {/* BOND */}

                <section>

                  <h2 className={sectionTitleClass}>
                    <span>🛡️</span>
                    {T("Bond / Fianza", "Bond")}
                  </h2>

                  <div>

                    <label className={labelClass}>
                      {T("¿Tienes bond o fianza comercial? *", "Do you have a commercial bond? *")}
                    </label>

                    <select
                      name="bonded"
                      required
                      className={inputClass}
                    >
                      <option value="">
                        {T("Selecciona", "Select")}
                      </option>

                      <option value="yes">
                        {T("Sí", "Yes")}
                      </option>

                      <option value="no">
                        {T("No", "No")}
                      </option>
                    </select>

                  </div>

                </section>

              </div>

              {/* DERECHA */}

              <div className="space-y-8">

                {/* INFORMACIÓN PROFESIONAL */}

                <section>

                  <h2 className={sectionTitleClass}>
                    <span>💼</span>
                    {T("Información profesional", "Professional information")}
                  </h2>

                  <div className="space-y-5">

                    <div>

                      <label className={labelClass}>
                        {T("Profesión / especialidad *", "Profession / specialty *")}
                      </label>

                      <select
                        name="trade"
                        required
                        className={inputClass}
                      >

                        <option value="">
                          {T("Selecciona una especialidad", "Select a specialty")}
                        </option>

                        <option value="plumbing">
                          {T("Plomería", "Plumbing")}
                        </option>

                        <option value="electrical">
                          {T("Electricidad", "Electrical")}
                        </option>

                        <option value="hvac">
                          {T("HVAC / Aire acondicionado", "HVAC / Air conditioning")}
                        </option>

                        <option value="ac_rental">
                          {T("Renta de aires acondicionados", "Air conditioner rental")}
                        </option>

                        <option value="carpentry">
                          {T("Carpintería", "Carpentry")}
                        </option>

                        <option value="painting">
                          {T("Pintura", "Painting")}
                        </option>

                        <option value="landscaping">
                          {T("Jardinería", "Landscaping")}
                        </option>

                        <option value="cleaning">
                          {T("Limpieza", "Cleaning")}
                        </option>

                        <option value="moving">
                          {T("Mudanzas", "Moving")}
                        </option>

                        <option value="other">
                          {T("Otro", "Other")}
                        </option>

                      </select>

                    </div>

                    <div>

                      <label className={labelClass}>
                        {T("Sobre ti o tu negocio *", "About you or your business *")}
                      </label>

                      <textarea
                        name="bio"
                        required
                        rows={4}
                        placeholder={T("Describe tu experiencia, especialidades y trabajos que realizas.", "Describe your experience, specialties, and the work you perform.")}
                        className={inputClass}
                      />

                    </div>

                    <div className="grid gap-5 md:grid-cols-2">

                      <div>

                        <label className={labelClass}>
                          {T("Años de experiencia *", "Years of experience *")}
                        </label>

                        <input
                          name="years_experience"
                          required
                          min="0"
                          type="number"
                          placeholder="5"
                          className={inputClass}
                        />

                      </div>

                      <div>

                        <label className={labelClass}>
                          {T("Radio de servicio (millas) *", "Service radius (miles) *")}
                        </label>

                        <input
                          name="service_radius_miles"
                          required
                          min="1"
                          type="number"
                          defaultValue="25"
                          className={inputClass}
                        />

                      </div>

                    </div>

                    <div className="grid gap-5 md:grid-cols-3">

                      <div>

                        <label className={labelClass}>
                          {T("Ciudad *", "City *")}
                        </label>

                        <input
                          name="city"
                          required
                          placeholder="Las Vegas"
                          className={inputClass}
                        />

                      </div>

                      <div>

                        <label className={labelClass}>
                          {T("Estado *", "State *")}
                        </label>

                        <input
                          name="state"
                          required
                          maxLength={2}
                          placeholder="NV"
                          className={inputClass}
                        />

                      </div>

                      <div>

                        <label className={labelClass}>
                          ZIP *
                        </label>

                        <input
                          name="zip_code"
                          required
                          placeholder="89101"
                          className={inputClass}
                        />

                      </div>

                    </div>

                    <div>
                      <label className={labelClass}>
                        {T("Dirección completa *", "Full address *")}
                      </label>

                      <input
                        name="address"
                        required
                        type="text"
                        autoComplete="street-address"
                        placeholder={T(
                          "Ej: 1234 Main St, Apt 5",
                          "Example: 1234 Main St, Apt 5"
                        )}
                        className={inputClass}
                      />

                      <p className="mt-2 text-xs leading-5 text-slate-500">
                        {T(
                          "Usa la dirección física donde RELYDO pueda localizarte si fuera necesario.",
                          "Enter the physical address where RELYDO can locate you if necessary."
                        )}
                      </p>
                    </div>

                  </div>

                </section>

                <div className="border-t border-slate-200" />

                {/* SEGURO */}

                <section>

                  <h2 className={sectionTitleClass}>
                    <span>🛡️</span>
                    {T("Seguro", "Insurance")}
                  </h2>

                  <div className="space-y-5">

                    <div>

                      <label className={labelClass}>
                        {T("¿Tienes seguro de responsabilidad? *", "Do you have liability insurance? *")}
                      </label>

                      <select
                        name="insured"
                        required
                        value={tieneSeguro}
                        onChange={(e) => setTieneSeguro(e.target.value)}
                        className={inputClass}
                      >

                        <option value="">
                          {T("Selecciona", "Select")}
                        </option>

                        <option value="yes">
                          {T("Sí", "Yes")}
                        </option>

                        <option value="no">
                          {T("No", "No")}
                        </option>

                      </select>

                    </div>

                    {tieneSeguro === "yes" && (
                      <>
                    <div>

                      <label className={labelClass}>
                        {T("Compañía de seguros", "Insurance company")}
                      </label>

                      <input
                        name="insurance_company"
                        type="text"
                        placeholder={T("Nombre de la aseguradora", "Insurance company name")}
                        className={inputClass}
                      />

                    </div>

                    <div>

                      <label className={labelClass}>
                        {T("Vencimiento del seguro", "Insurance expiration")}
                      </label>

                      <input
                        name="insurance_expiration"
                        type="date"
                        className={inputClass}
                      />

                    </div>

                    <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
                      {T("Los comprobantes de seguro y bond se subirán después de confirmar tu email.", "Insurance and bond documents will be uploaded after you confirm your email.")}
                    </div>
                      </>
                    )}

                  </div>

                </section>

                {/* AVISO */}

                <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5">

                  <div className="flex gap-3">

                    <div className="text-2xl">
                      ⚠️
                    </div>

                    <div>

                      <h3 className="font-extrabold text-amber-900">
                        {T("Verificación requerida", "Verification required")}
                      </h3>

                      <p className="mt-1 text-sm leading-6 text-amber-800">
                        {T("Enviar documentos no significa que tu cuenta ya esté verificada. Tu estado permanecerá pendiente hasta que RELYDO complete la revisión.", "Submitting documents does not mean your account is already verified. Your status will remain pending until RELYDO completes the review.")}
                      </p>

                    </div>

                  </div>

                </div>

                {/* ERROR */}

                {error && (
                  <div className="rounded-xl border border-red-300 bg-red-50 p-4 font-medium text-red-700">
                    {error}
                  </div>
                )}

                {/* SUCCESS */}

                {mensaje && (
                  <div className="rounded-xl border border-green-300 bg-green-50 p-4 font-medium text-green-700">
                    {mensaje}
                  </div>
                )}

                <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      name="accepted_terms"
                      value="yes"
                      required
                      className="mt-1 h-5 w-5 shrink-0 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                    />

                    <span className="text-sm leading-6 text-slate-700">
                      {T(
                        "Confirmo que la información suministrada es correcta, acepto el proceso de verificación de RELYDO y acepto los ",
                        "I confirm that the information provided is accurate, I agree to RELYDO’s verification process, and I accept the "
                      )}
                      <a
                        href="/terms"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-bold text-blue-700 hover:underline"
                      >
                        {T("Términos de servicio", "Terms of Service")}
                      </a>
                      {T(" y la ", " and the ")}
                      <a
                        href="/privacy"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-bold text-blue-700 hover:underline"
                      >
                        {T("Política de privacidad", "Privacy Policy")}
                      </a>
                      .
                    </span>
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={enviando}
                  className="w-full rounded-xl bg-blue-700 px-6 py-4 text-lg font-extrabold text-white shadow-md transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {enviando
                    ? T("Creando cuenta...", "Creating account...")
                    : T("Crear cuenta profesional", "Create professional account")}
                </button>


              </div>

            </div>

          </form>

        </div>

      </div>

    </main>
  );
}