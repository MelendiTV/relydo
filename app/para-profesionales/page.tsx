"use client";

import { useRouter } from "next/navigation";
import { useLanguage } from "@/app/components/LanguageProvider";

const LOGO_SRC = "/icon/relydo-logo.png";

function BrandLogo() {
  return (
    <img
      src={LOGO_SRC}
      alt="RELYDO"
      className="h-12 w-auto object-contain sm:h-14"
    />
  );
}

export default function ProfesionalesHome() {
  const router = useRouter();
  const { language } = useLanguage();

  const es = language === "es";

  const T = es
    ? {
        home: "Inicio",
        servicesNav: "Servicios",
        howNav: "Cómo funciona",
        trustNav: "Confianza",

        customers: "Para clientes",
        signIn: "Iniciar sesión",
        join: "Unirme a RELYDO",

        badge: "RELYDO PARA PROFESIONALES",

        title1: "Más oportunidades.",
        title2: "Más control. Más crecimiento.",

        subtitle:
          "Encuentra trabajos, envía presupuestos, administra tus servicios y construye una reputación profesional dentro de RELYDO.",

        primary: "Empezar como profesional",
        secondary: "Ya tengo cuenta",

        whyEyebrow: "CÓMO FUNCIONA",
        why: "Una plataforma creada para trabajar",
        whyD:
          "Oportunidades, comunicación, pagos y reputación en un solo flujo profesional.",

        w1: "Encuentra oportunidades",
        w1d:
          "Accede a solicitudes compatibles con tu oficio y ubicación.",

        w2: "Envía presupuestos",
        w2d:
          "Presenta tu propuesta con precio, llegada estimada y mensaje.",

        w3: "Administra tus trabajos",
        w3d:
          "Actualiza etapas, comunica avances y registra evidencias.",

        w4: "Construye reputación",
        w4d:
          "Historial, trabajos completados y reseñas fortalecen tu perfil.",

        trustEyebrow: "CONFIANZA RELYDO",

        trustTitle:
          "Herramientas para trabajar con más estructura",

        trustDescription:
          "RELYDO mantiene cada parte importante del servicio conectada, desde la oportunidad inicial hasta el pago final.",

        t1: "Verificación profesional",
        t1d:
          "Tu perfil y documentación forman parte del proceso de verificación de RELYDO.",

        t2: "Presupuestos claros",
        t2d:
          "Envía precio, tiempo estimado, llegada y detalles directamente desde la plataforma.",

        t3: "Pagos conectados",
        t3d:
          "Mantén el pago relacionado con el trabajo y su historial.",

        t4: "Historial y reputación",
        t4d:
          "Tus trabajos completados y reseñas ayudan a fortalecer tu perfil profesional.",

        structureEyebrow: "FLUJO PROFESIONAL",

        structure:
          "Trabaja con una estructura más profesional",

        structureD:
          "Mantén cada trabajo organizado desde la oportunidad inicial hasta el pago final.",

        ctaEyebrow: "CRECE CON RELYDO",

        cta:
          "Tu próximo cliente puede estar en RELYDO.",

        ctaD:
          "Crea tu perfil, completa la verificación y empieza a recibir oportunidades.",

        footerDescription:
          "Una plataforma creada para ayudar a profesionales a encontrar oportunidades, administrar trabajos y construir reputación.",

        footerPlatform: "Plataforma",
        footerProfessionals: "Profesionales",
        footerLegal: "Legal",

        footerHome: "Inicio",
        footerServices: "Servicios",
        footerHow: "Cómo funciona",
        footerTrust: "Confianza",

        professionalPortal: "Portal profesional",
        professionalLogin: "Iniciar sesión profesional",
        professionalSignup: "Unirme como profesional",

        terms: "Términos",
        privacy: "Privacidad",

        rights: "Todos los derechos reservados.",
      }
    : {
        home: "Home",
        servicesNav: "Services",
        howNav: "How it works",
        trustNav: "Trust",

        customers: "For Customers",
        signIn: "Sign in",
        join: "Join RELYDO",

        badge: "RELYDO FOR PROFESSIONALS",

        title1: "More opportunities.",
        title2: "More control. More growth.",

        subtitle:
          "Find jobs, send quotes, manage your services and build a professional reputation inside RELYDO.",

        primary: "Get started as a professional",
        secondary: "I already have an account",

        whyEyebrow: "HOW IT WORKS",
        why: "A platform built for getting work done",
        whyD:
          "Opportunities, communication, payments and reputation in one professional workflow.",

        w1: "Find opportunities",
        w1d:
          "Access requests that match your trade and service area.",

        w2: "Send quotes",
        w2d:
          "Submit your proposal with price, estimated arrival and message.",

        w3: "Manage your jobs",
        w3d:
          "Update stages, communicate progress and record evidence.",

        w4: "Build your reputation",
        w4d:
          "History, completed jobs and reviews strengthen your profile.",

        trustEyebrow: "RELYDO TRUST",

        trustTitle:
          "Tools to work with more structure",

        trustDescription:
          "RELYDO keeps every important part of the service connected, from the first opportunity through final payment.",

        t1: "Professional verification",
        t1d:
          "Your profile and documentation are part of RELYDO's verification process.",

        t2: "Clear quotes",
        t2d:
          "Send price, estimated time, arrival and job details directly through the platform.",

        t3: "Connected payments",
        t3d:
          "Keep payment connected to the job and its history.",

        t4: "History and reputation",
        t4d:
          "Completed jobs and reviews help strengthen your professional profile.",

        structureEyebrow: "PROFESSIONAL WORKFLOW",

        structure:
          "Work with a more professional structure",

        structureD:
          "Keep every job organized from the initial opportunity through final payment.",

        ctaEyebrow: "GROW WITH RELYDO",

        cta:
          "Your next customer could be on RELYDO.",

        ctaD:
          "Create your profile, complete verification and start receiving opportunities.",

        footerDescription:
          "A platform built to help professionals find opportunities, manage jobs and build reputation.",

        footerPlatform: "Platform",
        footerProfessionals: "Professionals",
        footerLegal: "Legal",

        footerHome: "Home",
        footerServices: "Services",
        footerHow: "How it works",
        footerTrust: "Trust",

        professionalPortal: "Professional portal",
        professionalLogin: "Professional sign in",
        professionalSignup: "Join as a professional",

        terms: "Terms",
        privacy: "Privacy",

        rights: "All rights reserved.",
      };

  const ads = es
    ? [
        "/ads/ads-2.jpeg",
        "/ads/imagen20.png",
      ]
    : [
        "/ads/ads-17.png",
        "/ads/imagen.png",
      ];

  const howItWorksImage = es
    ? "/ads/pro-how-it-works-es.png"
    : "/ads/pro-how-it-works-en.png";

  const items = [
    {
      title: T.w1,
      description: T.w1d,
      number: "01",
    },
    {
      title: T.w2,
      description: T.w2d,
      number: "02",
    },
    {
      title: T.w3,
      description: T.w3d,
      number: "03",
    },
    {
      title: T.w4,
      description: T.w4d,
      number: "04",
    },
  ];

  const trustItems = [
    {
      icon: "✓",
      title: T.t1,
      description: T.t1d,
    },
    {
      icon: "$",
      title: T.t2,
      description: T.t2d,
    },
    {
      icon: "🔒",
      title: T.t3,
      description: T.t3d,
    },
    {
      icon: "★",
      title: T.t4,
      description: T.t4d,
    },
  ];

  function scrollToSection(id: string) {
    document.getElementById(id)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-white text-slate-950">
      {/* HEADER */}

      <header className="sticky top-0 z-50 border-b border-slate-800 bg-[#020817]/95 text-white shadow-lg backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => router.push("/")}
            aria-label="RELYDO Home"
            className="shrink-0"
          >
            <BrandLogo />
          </button>

          <nav className="hidden items-center gap-7 lg:flex">
            <button
              type="button"
              onClick={() => router.push("/")}
              className="text-sm font-bold text-slate-300 transition hover:text-white"
            >
              {T.home}
            </button>

            <button
              type="button"
              onClick={() => router.push("/servicios")}
              className="text-sm font-bold text-slate-300 transition hover:text-white"
            >
              {T.servicesNav}
            </button>

            <button
              type="button"
              onClick={() =>
                scrollToSection("como-funciona-profesional")
              }
              className="text-sm font-bold text-slate-300 transition hover:text-white"
            >
              {T.howNav}
            </button>

            <button
              type="button"
              onClick={() =>
                scrollToSection("confianza-profesional")
              }
              className="text-sm font-bold text-slate-300 transition hover:text-white"
            >
              {T.trustNav}
            </button>
          </nav>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => router.push("/clientes")}
              className="hidden rounded-xl px-4 py-2 text-sm font-black text-slate-300 transition hover:bg-white/10 hover:text-white sm:block"
            >
              {T.customers}
            </button>

            <button
              type="button"
              onClick={() =>
                router.push("/login-profesional")
              }
              className="rounded-xl border border-white/20 px-3 py-2 text-xs font-black text-white transition hover:bg-white/10 sm:px-5 sm:text-sm"
            >
              {T.signIn}
            </button>

            <button
              type="button"
              onClick={() =>
                router.push("/registro-profesional")
              }
              className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-black text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-500 sm:px-5 sm:py-3 sm:text-sm"
            >
              {T.join}
            </button>
          </div>
        </div>
      </header>

      {/* HERO */}

      <section className="relative overflow-hidden bg-[#020817]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(37,99,235,0.42),transparent_30%),radial-gradient(circle_at_85%_20%,rgba(56,189,248,0.12),transparent_24%),linear-gradient(135deg,#020817_0%,#061a42_55%,#020817_100%)]" />

        <div className="relative mx-auto grid max-w-[1440px] gap-10 px-5 py-16 lg:grid-cols-[0.88fr_1.12fr] lg:items-center lg:px-8 lg:py-28">
          <div>
            <p className="text-xs font-black tracking-[0.22em] text-blue-300">
              {T.badge}
            </p>

            <h1 className="mt-5 text-5xl font-black leading-[0.94] tracking-[-0.055em] text-white sm:text-6xl lg:text-7xl">
              {T.title1}

              <span className="mt-2 block bg-gradient-to-r from-blue-300 via-blue-500 to-cyan-300 bg-clip-text text-transparent">
                {T.title2}
              </span>
            </h1>

            <p className="mt-7 max-w-xl text-lg leading-8 text-slate-300 sm:text-xl">
              {T.subtitle}
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() =>
                  router.push("/registro-profesional")
                }
                className="rounded-2xl bg-blue-600 px-7 py-4 font-black text-white shadow-2xl shadow-blue-600/30 transition hover:-translate-y-0.5 hover:bg-blue-500"
              >
                {T.primary}
              </button>

              <button
                type="button"
                onClick={() =>
                  router.push("/login-profesional")
                }
                className="rounded-2xl border border-white/20 bg-white/10 px-7 py-4 font-black text-white transition hover:bg-white/15"
              >
                {T.secondary}
              </button>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-8 rounded-[3rem] bg-blue-500/10 blur-3xl" />

            <div className="relative overflow-hidden rounded-[2rem] border border-white/15 bg-white/5 p-2 shadow-[0_30px_100px_rgba(0,0,0,0.45)]">
              <img
                src={ads[0]}
                alt="RELYDO professional platform"
                className="block h-auto w-full rounded-[1.55rem] object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}

      <section
        id="como-funciona-profesional"
        className="scroll-mt-20 bg-[#f6f8fc] px-5 py-12 lg:px-8 lg:py-16"
      >
        <div className="mx-auto max-w-[1440px]">
          <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white p-2 shadow-[0_25px_70px_rgba(15,23,42,0.12)]">
            <img
              src={howItWorksImage}
              alt={
                es
                  ? "Cómo funciona RELYDO para profesionales"
                  : "How RELYDO works for professionals"
              }
              className="block h-auto w-full rounded-[1.55rem] object-contain"
              loading="lazy"
            />
          </div>
        </div>
      </section>

      {/* TRUST */}

      <section
        id="confianza-profesional"
        className="scroll-mt-20 bg-white px-5 py-16 lg:px-8 lg:py-24"
      >
        <div className="mx-auto grid max-w-[1440px] gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:items-center">
          <div>
            <p className="text-sm font-black tracking-[0.2em] text-blue-600">
              {T.trustEyebrow}
            </p>

            <h2 className="mt-3 text-4xl font-black tracking-[-0.04em] md:text-5xl">
              {T.trustTitle}
            </h2>

            <p className="mt-5 max-w-xl text-lg leading-8 text-slate-600">
              {T.trustDescription}
            </p>

            <button
              type="button"
              onClick={() =>
                router.push("/registro-profesional")
              }
              className="mt-8 rounded-2xl bg-blue-600 px-7 py-4 font-black text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700"
            >
              {T.join}
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {trustItems.map((item) => (
              <div
                key={item.title}
                className="rounded-[1.5rem] border border-slate-200 bg-[#f8fafc] p-6 transition hover:border-blue-200 hover:bg-white hover:shadow-lg"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-xl font-black text-white shadow-lg shadow-blue-600/20">
                  {item.icon}
                </div>

                <h3 className="mt-5 text-xl font-black">
                  {item.title}
                </h3>

                <p className="mt-3 leading-7 text-slate-600">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PROFESSIONAL WORKFLOW */}

      <section className="bg-[#f6f8fc] px-5 py-16 lg:px-8 lg:py-24">
        <div className="mx-auto grid max-w-[1440px] gap-8 lg:grid-cols-[0.82fr_1.18fr] lg:items-center">
          <div>
            <p className="text-sm font-black tracking-[0.2em] text-blue-600">
              {T.structureEyebrow}
            </p>

            <h2 className="mt-3 text-4xl font-black tracking-[-0.04em] md:text-5xl">
              {T.structure}
            </h2>

            <p className="mt-5 max-w-xl text-lg leading-8 text-slate-600">
              {T.structureD}
            </p>

            <button
              type="button"
              onClick={() =>
                router.push("/registro-profesional")
              }
              className="mt-8 rounded-2xl bg-blue-600 px-7 py-4 font-black text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700"
            >
              {T.join}
            </button>
          </div>

          <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-[#07152f] p-2 shadow-[0_25px_70px_rgba(15,23,42,0.15)]">
            <img
              src={ads[1]}
              alt="RELYDO professional workflow"
              className="block h-auto w-full rounded-[1.55rem] object-cover"
              loading="lazy"
            />
          </div>
        </div>
      </section>

      {/* FINAL CTA */}

      <section className="bg-[#020817] px-5 py-16 text-white lg:px-8 lg:py-24">
        <div className="mx-auto max-w-[1440px] rounded-[2.5rem] border border-white/10 bg-[#07152f] p-8 text-center shadow-2xl md:p-12">
          <p className="text-sm font-black tracking-[0.2em] text-blue-300">
            {T.ctaEyebrow}
          </p>

          <h2 className="mx-auto mt-3 max-w-3xl text-4xl font-black tracking-[-0.04em] md:text-5xl">
            {T.cta}
          </h2>

          <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-slate-300">
            {T.ctaD}
          </p>

          <button
            type="button"
            onClick={() =>
              router.push("/registro-profesional")
            }
            className="mt-8 rounded-2xl bg-white px-7 py-4 font-black text-blue-700 transition hover:bg-blue-50"
          >
            {T.primary}
          </button>
        </div>
      </section>

      {/* FOOTER */}

      <footer className="border-t border-slate-800 bg-[#020817] px-5 py-12 text-white lg:px-8">
        <div className="mx-auto grid max-w-[1440px] gap-10 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <button
              type="button"
              onClick={() => router.push("/")}
              aria-label="RELYDO Home"
            >
              <BrandLogo />
            </button>

            <p className="mt-5 max-w-xs leading-7 text-slate-400">
              {T.footerDescription}
            </p>
          </div>

          <div>
            <h3 className="font-black text-white">
              {T.footerPlatform}
            </h3>

            <div className="mt-4 flex flex-col items-start gap-3 text-slate-400">
              <button
                type="button"
                onClick={() => router.push("/")}
                className="transition hover:text-blue-400"
              >
                {T.footerHome}
              </button>

              <button
                type="button"
                onClick={() => router.push("/servicios")}
                className="transition hover:text-blue-400"
              >
                {T.footerServices}
              </button>

              <button
                type="button"
                onClick={() =>
                  scrollToSection("como-funciona-profesional")
                }
                className="transition hover:text-blue-400"
              >
                {T.footerHow}
              </button>

              <button
                type="button"
                onClick={() =>
                  scrollToSection("confianza-profesional")
                }
                className="transition hover:text-blue-400"
              >
                {T.footerTrust}
              </button>
            </div>
          </div>

          <div>
            <h3 className="font-black text-white">
              {T.footerProfessionals}
            </h3>

            <div className="mt-4 flex flex-col items-start gap-3 text-slate-400">
              <button
                type="button"
                onClick={() =>
                  router.push("/para-profesionales")
                }
                className="transition hover:text-blue-400"
              >
                {T.professionalPortal}
              </button>

              <button
                type="button"
                onClick={() =>
                  router.push("/login-profesional")
                }
                className="transition hover:text-blue-400"
              >
                {T.professionalLogin}
              </button>

              <button
                type="button"
                onClick={() =>
                  router.push("/registro-profesional")
                }
                className="transition hover:text-blue-400"
              >
                {T.professionalSignup}
              </button>
            </div>
          </div>

          <div>
            <h3 className="font-black text-white">
              {T.footerLegal}
            </h3>

            <div className="mt-4 flex flex-col items-start gap-3 text-slate-400">
              <span>{T.terms}</span>
              <span>{T.privacy}</span>
            </div>
          </div>
        </div>

        <div className="mx-auto mt-10 max-w-[1440px] border-t border-slate-800 pt-6 text-center text-sm text-slate-500">
          © {new Date().getFullYear()} RELYDO. {T.rights}
        </div>
      </footer>
    </main>
  );
}