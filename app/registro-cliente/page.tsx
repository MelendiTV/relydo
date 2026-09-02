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

function RegistroClienteContenido() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { language } = useLanguage();

  const redirectParam =
    searchParams.get("redirect");

  const [fullName, setFullName] =
    useState("");

  const [email, setEmail] =
    useState("");

  const [phone, setPhone] =
    useState("");

  const [addressLine1, setAddressLine1] =
    useState("");

  const [addressLine2, setAddressLine2] =
    useState("");

  const [city, setCity] =
    useState("");

  const [state, setState] =
    useState("");

  const [zip, setZip] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [confirmPassword, setConfirmPassword] =
    useState("");

  const [showPassword, setShowPassword] =
    useState(false);

  const [showConfirmPassword, setShowConfirmPassword] =
    useState(false);

  const [acceptedTerms, setAcceptedTerms] =
    useState(false);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  const [success, setSuccess] =
    useState("");

  const [awaitingEmailConfirmation, setAwaitingEmailConfirmation] =
    useState(false);

  const [resendingVerification, setResendingVerification] =
    useState(false);

  const text =
    language === "es"
      ? {
          volver: "Volver al inicio",

          titulo: "Crear cuenta de cliente",
          descripcion:
            "Crea tu cuenta para solicitar servicios y administrar tus trabajos.",

          nombreCompleto: "Nombre completo",
          nombrePlaceholder:
            "Tu nombre y apellido",

          email: "Correo electrónico",
          emailPlaceholder:
            "cliente@email.com",

          emailRequerido:
            "Escribe tu correo electrónico.",

          correoYaRegistrado:
            "Este correo electrónico ya está registrado. Inicia sesión o usa otro correo.",

          verificandoCorreo:
            "Verificando correo...",

          errorVerificandoCorreo:
            "No pudimos verificar el correo electrónico. Intenta nuevamente.",

          revisarCorreoTitulo:
            "Revisa tu correo electrónico",

          revisarCorreoDescripcion:
            "Te enviamos un enlace de verificación. Debes confirmar tu correo antes de iniciar sesión.",

          irALogin:
            "Ir a iniciar sesión",

          reenviarVerificacion:
            "Reenviar correo de verificación",

          reenviandoVerificacion:
            "Reenviando correo...",

          verificacionReenviada:
            "Te enviamos un nuevo correo de verificación. Revisa también tu carpeta de spam.",

          errorReenviandoVerificacion:
            "No pudimos reenviar el correo de verificación. Intenta nuevamente en unos minutos.",

          rateLimitVerificacion:
            "Has solicitado demasiados correos de verificación. Espera unos minutos antes de intentarlo nuevamente.",

          telefono: "Teléfono",
          telefonoPlaceholder:
            "(702) 555-1234",

          direccion: "Dirección",
          direccionPlaceholder:
            "Número y nombre de la calle",

          direccion2:
            "Apartamento, unidad o suite (opcional)",
          direccion2Placeholder:
            "Apt 101",

          ciudad: "Ciudad",
          ciudadPlaceholder:
            "Las Vegas",

          estado: "Estado",
          estadoPlaceholder:
            "NV",

          codigoPostal: "Código postal",
          zipPlaceholder:
            "89101",

          password: "Contraseña",
          passwordPlaceholder:
            "Crea una contraseña",

          confirmPassword:
            "Confirmar contraseña",
          confirmPasswordPlaceholder:
            "Escribe nuevamente tu contraseña",

          mostrarPassword:
            "Mostrar contraseña",
          ocultarPassword:
            "Ocultar contraseña",

          aceptarInicio:
            "Confirmo que la información proporcionada es correcta y acepto los ",
          terminos:
            "Términos de servicio",
          conectorPrivacidad:
            " y la ",
          privacidad:
            "Política de privacidad",
          aceptarFinal:
            " de RELYDO.",
          terminosRequeridos:
            "Debes aceptar los Términos de servicio y la Política de privacidad para crear tu cuenta.",

          crearCuenta:
            "Crear cuenta",

          creando:
            "Creando cuenta...",

          yaCuenta:
            "¿Ya tienes una cuenta?",

          iniciarSesion:
            "Iniciar sesión",

          passwordsNoCoinciden:
            "Las contraseñas no coinciden.",

          passwordCorta:
            "La contraseña debe tener al menos 8 caracteres.",

          passwordInsegura:
            "La contraseña debe incluir al menos una mayúscula, una minúscula, un número y un carácter especial.",

          nombreRequerido:
            "Escribe tu nombre completo.",

          telefonoRequerido:
            "Escribe tu número de teléfono.",

          telefonoInvalido:
            "Escribe un número de teléfono válido de 10 a 15 dígitos.",

          direccionRequerida:
            "Escribe la dirección de la casa o apartamento.",

          ubicacionRequerida:
            "Completa ciudad, estado y código postal.",

          zipInvalido:
            "Escribe un código postal válido de 5 dígitos o ZIP+4.",

          usuarioNoCreado:
            "No se pudo crear el usuario.",

          creado:
            "Cuenta creada correctamente.",

          confirmarEmail:
            "Cuenta creada. Revisa tu correo electrónico para confirmar tu cuenta.",

          errorRegistro:
            "No se pudo crear la cuenta",

          errorInesperado:
            "Ocurrió un error inesperado.",

          cargando:
            "Cargando...",
        }
      : {
          volver: "Back to home",

          titulo: "Create customer account",
          descripcion:
            "Create your account to request services and manage your jobs.",

          nombreCompleto: "Full name",
          nombrePlaceholder:
            "Your first and last name",

          email: "Email address",
          emailPlaceholder:
            "customer@email.com",

          emailRequerido:
            "Enter your email address.",

          correoYaRegistrado:
            "This email address is already registered. Sign in or use a different email.",

          verificandoCorreo:
            "Checking email...",

          errorVerificandoCorreo:
            "We could not verify the email address. Please try again.",

          revisarCorreoTitulo:
            "Check your email",

          revisarCorreoDescripcion:
            "We sent you a verification link. You must confirm your email before signing in.",

          irALogin:
            "Go to sign in",

          reenviarVerificacion:
            "Resend verification email",

          reenviandoVerificacion:
            "Resending email...",

          verificacionReenviada:
            "We sent you a new verification email. Please also check your spam folder.",

          errorReenviandoVerificacion:
            "We could not resend the verification email. Please try again in a few minutes.",

          rateLimitVerificacion:
            "You have requested too many verification emails. Please wait a few minutes before trying again.",

          telefono: "Phone",
          telefonoPlaceholder:
            "(702) 555-1234",

          direccion: "Street address",
          direccionPlaceholder:
            "Street number and name",

          direccion2:
            "Apartment, unit or suite (optional)",
          direccion2Placeholder:
            "Apt 101",

          ciudad: "City",
          ciudadPlaceholder:
            "Las Vegas",

          estado: "State",
          estadoPlaceholder:
            "NV",

          codigoPostal: "ZIP code",
          zipPlaceholder:
            "89101",

          password: "Password",
          passwordPlaceholder:
            "Create a password",

          confirmPassword:
            "Confirm password",
          confirmPasswordPlaceholder:
            "Enter your password again",

          mostrarPassword:
            "Show password",
          ocultarPassword:
            "Hide password",

          aceptarInicio:
            "I confirm that the information provided is accurate and I accept RELYDO’s ",
          terminos:
            "Terms of Service",
          conectorPrivacidad:
            " and ",
          privacidad:
            "Privacy Policy",
          aceptarFinal:
            ".",
          terminosRequeridos:
            "You must accept the Terms of Service and Privacy Policy to create your account.",

          crearCuenta:
            "Create account",

          creando:
            "Creating account...",

          yaCuenta:
            "Already have an account?",

          iniciarSesion:
            "Sign in",

          passwordsNoCoinciden:
            "Passwords do not match.",

          passwordCorta:
            "Password must be at least 8 characters.",

          passwordInsegura:
            "Password must include at least one uppercase letter, one lowercase letter, one number, and one special character.",

          nombreRequerido:
            "Enter your full name.",

          telefonoRequerido:
            "Enter your phone number.",

          telefonoInvalido:
            "Enter a valid phone number with 10 to 15 digits.",

          direccionRequerida:
            "Enter your home or apartment address.",

          ubicacionRequerida:
            "Complete city, state, and ZIP code.",

          zipInvalido:
            "Enter a valid 5-digit ZIP code or ZIP+4.",

          usuarioNoCreado:
            "Unable to create the user.",

          creado:
            "Account created successfully.",

          confirmarEmail:
            "Account created. Check your email to confirm your account.",

          errorRegistro:
            "Unable to create account",

          errorInesperado:
            "An unexpected error occurred.",

          cargando:
            "Loading...",
        };

  function esErrorCorreoYaRegistrado(
    message: string
  ) {
    const mensaje =
      message.toLowerCase();

    return (
      mensaje.includes(
        "user already registered"
      ) ||
      mensaje.includes(
        "already registered"
      ) ||
      mensaje.includes(
        "already been registered"
      ) ||
      mensaje.includes(
        "email already exists"
      ) ||
      mensaje.includes(
        "email address already exists"
      )
    );
  }

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

  async function registrarCliente(
    e: React.FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    if (loading) {
      return;
    }

    setError("");
    setSuccess("");
    setAwaitingEmailConfirmation(false);

    const nombreLimpio =
      fullName.trim();

    const correoLimpio =
      email.trim().toLowerCase();

    const telefonoLimpio =
      phone.trim();

    const direccionLimpia =
      addressLine1.trim();

    const direccion2Limpia =
      addressLine2.trim();

    const ciudadLimpia =
      city.trim();

    const estadoLimpio =
      state.trim().toUpperCase();

    const zipLimpio =
      zip.trim();

    if (!nombreLimpio) {
      setError(text.nombreRequerido);
      return;
    }

    if (!telefonoLimpio) {
      setError(text.telefonoRequerido);
      return;
    }

    const telefonoTieneSoloCaracteresValidos =
      /^[+0-9() .-]+$/.test(
        telefonoLimpio
      );

    const telefonoDigitos =
      telefonoLimpio.replace(
        /\D/g,
        ""
      );

    if (
      !telefonoTieneSoloCaracteresValidos ||
      telefonoDigitos.length < 10 ||
      telefonoDigitos.length > 15
    ) {
      setError(text.telefonoInvalido);
      return;
    }

    if (!direccionLimpia) {
      setError(text.direccionRequerida);
      return;
    }

    if (
      !ciudadLimpia ||
      !estadoLimpio ||
      !zipLimpio
    ) {
      setError(text.ubicacionRequerida);
      return;
    }

    if (
      !/^\d{5}(-\d{4})?$/.test(
        zipLimpio
      )
    ) {
      setError(text.zipInvalido);
      return;
    }

    if (password.length < 8) {
      setError(text.passwordCorta);
      return;
    }

    const passwordSegura =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test(
        password
      );

    if (!passwordSegura) {
      setError(text.passwordInsegura);
      return;
    }

    if (
      password !==
      confirmPassword
    ) {
      setError(
        text.passwordsNoCoinciden
      );
      return;
    }

    if (!acceptedTerms) {
      setError(
        text.terminosRequeridos
      );
      return;
    }

    setLoading(true);

    try {
      /*
        PRIMERO:
        COMPROBAR SI EL CORREO YA EXISTE MEDIANTE LA RPC SEGURA.
      */

      const { data: emailExiste, error: emailCheckError } =
        await supabase.rpc("relydo_email_exists", {
          check_email: correoLimpio,
        });

      if (emailCheckError) {
        console.error("Error verificando correo:", emailCheckError);
        setError(text.errorVerificandoCorreo);
        setLoading(false);
        return;
      }

      if (emailExiste === true) {
        setError(text.correoYaRegistrado);
        setLoading(false);
        return;
      }

      /*
        CREAR USUARIO EN SUPABASE AUTH

        IMPORTANTE:
        Toda la información del cliente se envía
        como metadata.

        El trigger seguro de Supabase se encarga
        de crear automáticamente public.profiles.

        El navegador NO inserta directamente
        en profiles.
      */

      const {
        data,
        error: signUpError,
      } =
        await supabase.auth.signUp({
          email:
            correoLimpio,

          password,

          options: {
            emailRedirectTo:
              `${window.location.origin}/verificar-email`,

            data: {
              full_name:
                nombreLimpio,

              phone:
                telefonoLimpio,

              role:
                "customer",

              address_line1:
                direccionLimpia,

              address_line2:
                direccion2Limpia || null,

              city:
                ciudadLimpia,

              state:
                estadoLimpio,

              zip:
                zipLimpio,
            },
          },
        });

      if (signUpError) {
        if (
          esErrorCorreoYaRegistrado(
            signUpError.message
          )
        ) {
          setError(
            text.correoYaRegistrado
          );
          setLoading(false);
          return;
        }

        throw new Error(
          signUpError.message
        );
      }

      const user =
        data.user;

      if (!user) {
        throw new Error(
          text.usuarioNoCreado
        );
      }

      /*
        SI SUPABASE YA CREÓ UNA SESIÓN,
        ENTRAMOS DIRECTAMENTE.
      */

      if (data.session) {
        setSuccess(
          text.creado
        );

        router.push(obtenerDestinoSeguro());

        return;
      }

      /*
        SI SUPABASE REQUIERE CONFIRMAR EMAIL:

        NO redirigimos automáticamente.
        El cliente debe revisar su correo y confirmar
        la cuenta antes de iniciar sesión.
      */

      setSuccess(
        text.confirmarEmail
      );

      setAwaitingEmailConfirmation(true);
      setLoading(false);
      return;
    } catch (err) {
      console.error(
        "Error registrando cliente:",
        err
      );

      if (
        err instanceof Error &&
        esErrorCorreoYaRegistrado(
          err.message
        )
      ) {
        setError(
          text.correoYaRegistrado
        );
      } else {
        setError(
          text.errorInesperado
        );
      }

      setLoading(false);
    }
  }

  async function reenviarCorreoVerificacion() {
    if (resendingVerification) {
      return;
    }

    const correoLimpio =
      email.trim().toLowerCase();

    if (!correoLimpio) {
      setError(text.emailRequerido);
      return;
    }

    setError("");
    setSuccess("");
    setResendingVerification(true);

    try {
      const { error: resendError } =
        await supabase.auth.resend({
          type: "signup",
          email: correoLimpio,
          options: {
            emailRedirectTo:
              `${window.location.origin}/verificar-email`,
          },
        });

      if (resendError) {
        console.error(
          "Error reenviando verificación:",
          resendError
        );

        const mensajeError =
          resendError.message
            .toLowerCase();

        const esRateLimit =
          resendError.status === 429 ||
          mensajeError.includes(
            "rate limit"
          ) ||
          mensajeError.includes(
            "too many"
          ) ||
          mensajeError.includes(
            "email rate limit"
          );

        setError(
          esRateLimit
            ? text.rateLimitVerificacion
            : text.errorReenviandoVerificacion
        );
        return;
      }

      setSuccess(
        text.verificacionReenviada
      );
    } catch (err) {
      console.error(
        "Error inesperado reenviando verificación:",
        err
      );
      setError(
        text.errorReenviandoVerificacion
      );
    } finally {
      setResendingVerification(false);
    }
  }

  function irALogin() {
    const destino =
      obtenerDestinoSeguro();

    router.push(
      `/login-cliente?redirect=${encodeURIComponent(
        destino
      )}`
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-10">
      <div className="mx-auto w-full max-w-2xl">

        <button
          type="button"
          onClick={() =>
            router.push("/")
          }
          className="font-bold text-blue-700 hover:underline"
        >
          ← {text.volver}
        </button>

        <div className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl">

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

            {success && (
              <div className="mb-6 rounded-xl border border-green-300 bg-green-50 p-4 text-green-800">
                {success}
              </div>
            )}

            {awaitingEmailConfirmation ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
                <div className="text-4xl">
                  ✉️
                </div>

                <h2 className="mt-3 text-2xl font-extrabold text-emerald-900">
                  {text.revisarCorreoTitulo}
                </h2>

                <p className="mt-3 text-emerald-800">
                  {text.revisarCorreoDescripcion}
                </p>

                <p className="mt-3 break-all font-bold text-slate-900">
                  {email.trim().toLowerCase()}
                </p>

              </div>
            ) : (
            <form
              onSubmit={
                registrarCliente
              }
              className="space-y-5"
            >

              {/* NOMBRE */}

              <div>
                <label
                  htmlFor="fullName"
                  className="mb-2 block font-bold text-slate-900"
                >
                  {text.nombreCompleto}
                </label>

                <input
                  id="fullName"
                  type="text"
                  value={fullName}
                  onChange={(e) =>
                    setFullName(
                      e.target.value
                    )
                  }
                  required
                  disabled={loading}
                  autoComplete="name"
                  placeholder={
                    text.nombrePlaceholder
                  }
                  className="w-full rounded-xl border border-slate-300 p-4 text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
                />
              </div>

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
                  disabled={loading}
                  autoComplete="email"
                  placeholder={
                    text.emailPlaceholder
                  }
                  className="w-full rounded-xl border border-slate-300 p-4 text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
                />
              </div>

              {/* TELÉFONO */}

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
                  inputMode="tel"
                  minLength={10}
                  maxLength={20}
                  pattern="[0-9+() .-]{10,20}"
                  title={
                    text.telefonoInvalido
                  }
                  disabled={loading}
                  autoComplete="tel"
                  placeholder={
                    text.telefonoPlaceholder
                  }
                  className="w-full rounded-xl border border-slate-300 p-4 text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
                />
              </div>

              {/* DIRECCIÓN */}

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
                  disabled={loading}
                  autoComplete="address-line1"
                  placeholder={
                    text.direccionPlaceholder
                  }
                  className="w-full rounded-xl border border-slate-300 p-4 text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
                />
              </div>

              {/* APARTAMENTO */}

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
                  disabled={loading}
                  autoComplete="address-line2"
                  placeholder={
                    text.direccion2Placeholder
                  }
                  className="w-full rounded-xl border border-slate-300 p-4 text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
                />
              </div>

              {/* CIUDAD / ESTADO / ZIP */}

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
                    disabled={loading}
                    autoComplete="address-level2"
                    placeholder={
                      text.ciudadPlaceholder
                    }
                    className="w-full rounded-xl border border-slate-300 p-4 text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
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
                          .slice(0, 2)
                      )
                    }
                    required
                    disabled={loading}
                    autoComplete="address-level1"
                    maxLength={2}
                    placeholder={
                      text.estadoPlaceholder
                    }
                    className="w-full rounded-xl border border-slate-300 p-4 uppercase text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
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
                    inputMode="numeric"
                    maxLength={10}
                    pattern="[0-9]{5}(-[0-9]{4})?"
                    title={
                      text.zipInvalido
                    }
                    disabled={loading}
                    autoComplete="postal-code"
                    placeholder={
                      text.zipPlaceholder
                    }
                    className="w-full rounded-xl border border-slate-300 p-4 text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
                  />
                </div>

              </div>

              {/* CONTRASEÑA */}

              <div>
                <label
                  htmlFor="password"
                  className="mb-2 block font-bold text-slate-900"
                >
                  {text.password}
                </label>

                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) =>
                      setPassword(
                        e.target.value
                      )
                    }
                    required
                    disabled={loading}
                    autoComplete="new-password"
                    minLength={8}
                    pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).{8,}"
                    title={
                      text.passwordInsegura
                    }
                    placeholder={
                      text.passwordPlaceholder
                    }
                    className="w-full rounded-xl border border-slate-300 p-4 pr-14 text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setShowPassword(
                        (value) => !value
                      )
                    }
                    disabled={loading}
                    aria-label={
                      showPassword
                        ? text.ocultarPassword
                        : text.mostrarPassword
                    }
                    title={
                      showPassword
                        ? text.ocultarPassword
                        : text.mostrarPassword
                    }
                    className="absolute inset-y-0 right-0 flex w-14 items-center justify-center text-xl text-slate-500 transition hover:text-blue-700 disabled:opacity-50"
                  >
                    {showPassword ? "🙈" : "👁️"}
                  </button>
                </div>
              </div>

              {/* CONFIRMAR CONTRASEÑA */}

              <div>
                <label
                  htmlFor="confirmPassword"
                  className="mb-2 block font-bold text-slate-900"
                >
                  {text.confirmPassword}
                </label>

                <div className="relative">
                  <input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) =>
                      setConfirmPassword(
                        e.target.value
                      )
                    }
                    required
                    disabled={loading}
                    autoComplete="new-password"
                    minLength={8}
                    pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).{8,}"
                    title={
                      text.passwordInsegura
                    }
                    placeholder={
                      text.confirmPasswordPlaceholder
                    }
                    className="w-full rounded-xl border border-slate-300 p-4 pr-14 text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setShowConfirmPassword(
                        (value) => !value
                      )
                    }
                    disabled={loading}
                    aria-label={
                      showConfirmPassword
                        ? text.ocultarPassword
                        : text.mostrarPassword
                    }
                    title={
                      showConfirmPassword
                        ? text.ocultarPassword
                        : text.mostrarPassword
                    }
                    className="absolute inset-y-0 right-0 flex w-14 items-center justify-center text-xl text-slate-500 transition hover:text-blue-700 disabled:opacity-50"
                  >
                    {showConfirmPassword ? "🙈" : "👁️"}
                  </button>
                </div>
              </div>

              {/* TÉRMINOS Y PRIVACIDAD */}

              <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={acceptedTerms}
                    onChange={(e) =>
                      setAcceptedTerms(
                        e.target.checked
                      )
                    }
                    required
                    disabled={loading}
                    className="mt-1 h-5 w-5 shrink-0 rounded border-slate-300 text-blue-700 focus:ring-blue-600 disabled:opacity-50"
                  />

                  <span className="text-sm leading-6 text-slate-700">
                    {text.aceptarInicio}
                    <a
                      href="/terms"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-bold text-blue-700 hover:underline"
                    >
                      {text.terminos}
                    </a>
                    {text.conectorPrivacidad}
                    <a
                      href="/privacy"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-bold text-blue-700 hover:underline"
                    >
                      {text.privacidad}
                    </a>
                    {text.aceptarFinal}
                  </span>
                </label>
              </div>

              {/* CREAR CUENTA */}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-blue-700 py-4 text-lg font-extrabold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading
                  ? text.creando
                  : text.crearCuenta}
              </button>

            </form>
            )}

            {/* LOGIN */}

            {!awaitingEmailConfirmation && (
            <div className="mt-6 border-t border-slate-200 pt-6 text-center">

              <p className="text-sm text-slate-600">
                {text.yaCuenta}
              </p>

              <button
                type="button"
                onClick={
                  reenviarCorreoVerificacion
                }
                disabled={
                  resendingVerification
                }
                className="w-full rounded-xl border border-blue-700 bg-white px-4 py-3 font-extrabold text-blue-700 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {resendingVerification
                  ? text.reenviandoVerificacion
                  : text.reenviarVerificacion}
              </button>

              <button
                type="button"
                onClick={irALogin}
                disabled={loading}
                className="mt-2 font-bold text-blue-700 hover:underline disabled:opacity-50"
              >
                {text.iniciarSesion}
              </button>

            </div>
            )}

          </div>
        </div>
      </div>
    </main>
  );
}

function RegistroClienteFallback() {
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

export default function RegistroClientePage() {
  return (
    <Suspense
      fallback={
        <RegistroClienteFallback />
      }
    >
      <RegistroClienteContenido />
    </Suspense>
  );
}