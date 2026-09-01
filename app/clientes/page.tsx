"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useLanguage } from "@/app/components/LanguageProvider";

const LOGO_SRC = "/icon/relydo-logo.png";

function BrandLogo() {
  return (
    <div className="flex items-center gap-3">
      <img
        src={LOGO_SRC}
        alt="RELYDO"
        className="h-10 w-auto object-contain sm:h-11"
        onError={(event) => {
          event.currentTarget.style.display = "none";

          const fallback =
            event.currentTarget.nextElementSibling as HTMLElement | null;

          if (fallback) {
            fallback.style.display = "inline";
          }
        }}
      />

      <span
        style={{ display: "none" }}
        className="text-2xl font-black tracking-[0.06em] text-slate-950"
      >
        RELY<span className="text-blue-600">DO</span>
      </span>
    </div>
  );
}

export default function ClientesHome() {
  const router = useRouter();
  const { language } = useLanguage();

  const [busqueda, setBusqueda] = useState("");

  const es = language === "es";

  const text = es
    ? {
        pros: "Para profesionales",
        signIn: "Iniciar sesión",
        signUp: "Crear cuenta",

        homeNav: "Inicio",
        servicesNav: "Servicios",
        howNav: "Cómo funciona",
        trustNav: "Confianza",

        badge: "RELYDO PARA CLIENTES",

        title1: "Encuentra profesionales",
        title2: "de confianza, sin complicaciones.",

        subtitle:
          "Publica lo que necesitas, recibe presupuestos y mantén el trabajo, el pago y la comunicación organizados en un solo lugar.",

        request: "Solicitar un trabajo",
        requests: "Mis solicitudes",

        placeholder: "¿Qué servicio necesitas?",
        search: "Buscar",

        servicesEyebrow: "SERVICIOS",
        servicesTitle: "¿Qué necesitas resolver hoy?",
        servicesSubtitle:
          "Explora algunas de las categorías más solicitadas y encuentra ayuda para tu próximo proyecto.",

        plumbing: "Plomería",
        electrical: "Electricidad",
        hvac: "HVAC",
        cleaning: "Limpieza",
        painting: "Pintura",
        carpentry: "Carpintería",
        moving: "Mudanzas",
        more: "Más servicios",

        howEyebrow: "SIMPLE Y CLARO",
        howTitle: "Contratar ayuda no debería ser complicado",

        p1: "Crea tu solicitud",
        p1d:
          "Describe el trabajo, agrega fotos, ubicación y preferencias.",

        p2: "Compara presupuestos",
        p2d:
          "Revisa propuestas y elige al profesional que mejor encaje.",

        p3: "Sigue el trabajo",
        p3d:
          "Mantente al tanto desde que va en camino hasta que termina.",

        p4: "Paga con más confianza",
        p4d:
          "Mantén pagos, evidencias y reclamos vinculados al trabajo.",

        trustEyebrow: "CONFIANZA RELYDO",
        trustTitle:
          "Más claridad antes, durante y después del trabajo",
        trustSubtitle:
          "RELYDO mantiene las partes importantes del servicio conectadas en un solo flujo.",

        verified: "Profesionales verificados",
        verifiedD:
          "Los profesionales pasan por un proceso de verificación antes de acceder al marketplace.",

        compare: "Compara antes de elegir",
        compareD:
          "Revisa diferentes propuestas, precios y detalles antes de tomar una decisión.",

        protected: "Pagos protegidos",
        protectedD:
          "Los pagos permanecen vinculados al trabajo y a su historial dentro de RELYDO.",

        support: "Soporte cuando lo necesitas",
        supportD:
          "Evidencias, comunicación y reclamos permanecen asociados al servicio.",

        timelineEyebrow: "TU TRABAJO EN RELYDO",
        timelineTitle:
          "De la solicitud al trabajo terminado",
        timelineSubtitle:
          "Sigue el progreso sin perder de vista lo que está pasando.",

        t1: "Solicitud creada",
        t2: "Presupuestos recibidos",
        t3: "Profesional elegido",
        t4: "En camino",
        t5: "Trabajando",
        t6: "Completado",

        appEyebrow: "TODO EN UN SOLO LUGAR",
        appTitle:
          "Tu servicio, organizado de principio a fin",
        appSubtitle:
          "Solicitudes, presupuestos, mensajes, estados del trabajo y pagos conectados en una sola experiencia.",

        ctaEyebrow: "EMPIEZA CON RELYDO",
        cta:
          "Lo que necesites resolver, empieza aquí.",
        ctaSub:
          "Publica tu solicitud, compara profesionales y elige con más confianza.",

        footerDescription:
          "Conectando clientes con profesionales locales de confianza.",

        footerCustomers: "Clientes",
        footerProfessionals: "Profesionales",
        footerPlatform: "Plataforma",
        footerLegal: "Legal",

        customerHome: "Portal de clientes",
        customerLogin: "Iniciar sesión",
        customerSignup: "Crear cuenta",

        professionalHome: "Portal profesional",
        professionalLogin:
          "Iniciar sesión profesional",
        professionalSignup:
          "Unirme como profesional",

        services: "Servicios",
        professionals: "Profesionales",

        terms: "Términos",
        privacy: "Privacidad",

        rights:
          "Todos los derechos reservados.",
      }
    : {
        pros: "For Professionals",
        signIn: "Sign in",
        signUp: "Create account",

        homeNav: "Home",
        servicesNav: "Services",
        howNav: "How it works",
        trustNav: "Trust",

        badge: "RELYDO FOR CUSTOMERS",

        title1: "Find professionals",
        title2:
          "you can trust, without the hassle.",

        subtitle:
          "Post what you need, receive quotes and keep the job, payment and communication organized in one place.",

        request: "Request a job",
        requests: "My requests",

        placeholder:
          "What service do you need?",
        search: "Search",

        servicesEyebrow: "SERVICES",
        servicesTitle:
          "What do you need help with today?",
        servicesSubtitle:
          "Explore some of the most requested categories and find help for your next project.",

        plumbing: "Plumbing",
        electrical: "Electrical",
        hvac: "HVAC",
        cleaning: "Cleaning",
        painting: "Painting",
        carpentry: "Carpentry",
        moving: "Moving",
        more: "More services",

        howEyebrow: "SIMPLE AND CLEAR",
        howTitle:
          "Hiring help shouldn't be complicated",

        p1: "Create your request",
        p1d:
          "Describe the job, add photos, location and preferences.",

        p2: "Compare quotes",
        p2d:
          "Review proposals and choose the professional who fits best.",

        p3: "Track the job",
        p3d:
          "Stay informed from on-the-way through completion.",

        p4: "Pay with more confidence",
        p4d:
          "Keep payments, evidence and claims connected to the job.",

        trustEyebrow: "RELYDO TRUST",
        trustTitle:
          "More clarity before, during and after the job",
        trustSubtitle:
          "RELYDO keeps the important parts of the service connected in one workflow.",

        verified: "Verified professionals",
        verifiedD:
          "Professionals go through a verification process before accessing the marketplace.",

        compare: "Compare before choosing",
        compareD:
          "Review different proposals, prices and details before making a decision.",

        protected: "Protected payments",
        protectedD:
          "Payments remain connected to the job and its history inside RELYDO.",

        support: "Support when you need it",
        supportD:
          "Evidence, communication and claims remain connected to the service.",

        timelineEyebrow: "YOUR JOB IN RELYDO",
        timelineTitle:
          "From request to completed job",
        timelineSubtitle:
          "Follow progress without losing sight of what is happening.",

        t1: "Request created",
        t2: "Quotes received",
        t3: "Professional selected",
        t4: "On the way",
        t5: "Working",
        t6: "Completed",

        appEyebrow:
          "EVERYTHING IN ONE PLACE",
        appTitle:
          "Your service, organized from start to finish",
        appSubtitle:
          "Requests, quotes, messages, job stages and payments connected in one experience.",

        ctaEyebrow: "START WITH RELYDO",
        cta:
          "Whatever needs to get done, start here.",
        ctaSub:
          "Post your request, compare professionals and choose with more confidence.",

        footerDescription:
          "Connecting customers with trusted local professionals.",

        footerCustomers: "Customers",
        footerProfessionals:
          "Professionals",
        footerPlatform: "Platform",
        footerLegal: "Legal",

        customerHome: "Customer portal",
        customerLogin: "Customer sign in",
        customerSignup: "Create account",

        professionalHome:
          "Professional portal",
        professionalLogin:
          "Professional sign in",
        professionalSignup:
          "Join as a professional",

        services: "Services",
        professionals: "Professionals",

        terms: "Terms",
        privacy: "Privacy",

        rights: "All rights reserved.",
      };

  const adsEspanol = [
    "/ads/4b37dfc4-7eb9-4b5f-8bb5-40eb6a974310.png",
    "/ads/4daa86f7-42c8-43f5-b5bd-4c6342dfb0dd.png",
    "/ads/9018c8ec-b41a-4d2c-882a-cac2bd5c0fbe.png",
    "/ads/24409dde-116e-49cc-a962-70f4ca6595df.png",
  ];

  const adsIngles = [
    "/ads/ads-10.png",
    "/ads/ads-11.png",
    "/ads/ads-15.png",
    "/ads/ads-16.png",
  ];

  const ads = es
    ? adsEspanol
    : adsIngles;

  function buscarServicio() {
    const texto =
      busqueda.trim();

    if (!texto) {
      router.push(
        "/servicios"
      );

      return;
    }

    router.push(
      `/servicios?buscar=${encodeURIComponent(
        texto
      )}`
    );
  }

  function irAServicio(
    nombre: string
  ) {
    router.push(
      `/servicios?buscar=${encodeURIComponent(
        nombre
      )}`
    );
  }

  function irAProfesionales(
    trade: string
  ) {
    router.push(
      `/profesionales?trade=${encodeURIComponent(
        trade
      )}`
    );
  }

  const servicios = [
    {
      icon: "🚰",
      label: text.plumbing,
      trade: "plumbing",
    },
    {
      icon: "⚡",
      label: text.electrical,
      trade: "electrical",
    },
    {
      icon: "❄️",
      label: text.hvac,
      trade: "hvac",
    },
    {
      icon: "🧹",
      label: text.cleaning,
      trade: "cleaning",
    },
    {
      icon: "🎨",
      label: text.painting,
      trade: "painting",
    },
    {
      icon: "🪚",
      label: text.carpentry,
      trade: "carpentry",
    },
    {
      icon: "🚚",
      label: text.moving,
      trade: "moving",
    },
    {
      icon: "•••",
      label: text.more,
      trade: null,
    },
  ];

  const pasos = [
    {
      number: "01",
      title: text.p1,
      description: text.p1d,
    },
    {
      number: "02",
      title: text.p2,
      description: text.p2d,
    },
    {
      number: "03",
      title: text.p3,
      description: text.p3d,
    },
    {
      number: "04",
      title: text.p4,
      description: text.p4d,
    },
  ];

  const confianza = [
    {
      icon: "✓",
      title: text.verified,
      description:
        text.verifiedD,
    },
    {
      icon: "$",
      title: text.compare,
      description:
        text.compareD,
    },
    {
      icon: "🔒",
      title: text.protected,
      description:
        text.protectedD,
    },
    {
      icon: "◎",
      title: text.support,
      description:
        text.supportD,
    },
  ];

  const timeline = [
    text.t1,
    text.t2,
    text.t3,
    text.t4,
    text.t5,
    text.t6,
  ];

  return (
    <main className="min-h-screen overflow-x-hidden bg-white text-slate-950">

      {/* HEADER */}

      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#07152F]/95 shadow-lg backdrop-blur-xl">

        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">

          <button
            type="button"
            onClick={() =>
              router.push("/")
            }
            aria-label="RELYDO Home"
            className="shrink-0"
          >
            <BrandLogo />
          </button>

          <nav className="hidden items-center gap-7 lg:flex">

            <button
              type="button"
              onClick={() => router.push("/")}
              className="text-sm font-bold text-slate-200 transition hover:text-white"
            >
              {text.homeNav}
            </button>

            <button
              type="button"
              onClick={() =>
                document
                  .getElementById(
                    "servicios-cliente"
                  )
                  ?.scrollIntoView({
                    behavior:
                      "smooth",
                  })
              }
              className="text-sm font-bold text-slate-200 transition hover:text-white"
            >
              {
                text.servicesNav
              }
            </button>

            <button
              type="button"
              onClick={() =>
                document
                  .getElementById(
                    "como-funciona"
                  )
                  ?.scrollIntoView({
                    behavior:
                      "smooth",
                  })
              }
              className="text-sm font-bold text-slate-200 transition hover:text-white"
            >
              {text.howNav}
            </button>

            <button
              type="button"
              onClick={() =>
                document
                  .getElementById(
                    "confianza"
                  )
                  ?.scrollIntoView({
                    behavior:
                      "smooth",
                  })
              }
              className="text-sm font-bold text-slate-200 transition hover:text-white"
            >
              {text.trustNav}
            </button>

          </nav>

          <div className="flex items-center gap-2">

            <button
              type="button"
              onClick={() =>
                router.push(
                  "/para-profesionales"
                )
              }
              className="hidden rounded-xl px-4 py-2 text-sm font-black text-slate-200 transition hover:bg-white/10 hover:text-white sm:block"
            >
              {text.pros}
            </button>

            <button
              type="button"
              onClick={() =>
                router.push(
                  "/login-cliente"
                )
              }
              className="rounded-xl border border-white/25 bg-white px-3 py-2 text-xs font-black text-slate-900 transition hover:bg-blue-50 sm:px-5 sm:text-sm"
            >
              {text.signIn}
            </button>

            <button
              type="button"
              onClick={() =>
                router.push(
                  "/registro-cliente"
                )
              }
              className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-black text-white shadow-md shadow-blue-600/20 transition hover:bg-blue-700 sm:px-5 sm:py-3 sm:text-sm"
            >
              {text.signUp}
            </button>

          </div>

        </div>

      </header>

      {/* HERO */}

      <section className="relative overflow-hidden bg-[#03112d]">

        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(37,99,235,0.36),transparent_28%),radial-gradient(circle_at_85%_15%,rgba(59,130,246,0.18),transparent_22%),linear-gradient(135deg,#020817_0%,#061a42_55%,#03112d_100%)]" />

        <div className="relative mx-auto grid max-w-[1440px] gap-10 px-5 py-16 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:px-8 lg:py-24">

          <div>

            <p className="text-xs font-black tracking-[0.2em] text-blue-300">
              {text.badge}
            </p>

            <h1 className="mt-4 text-5xl font-black leading-[0.97] tracking-[-0.05em] text-white sm:text-6xl lg:text-7xl">

              {text.title1}

              <span className="mt-2 block bg-gradient-to-r from-blue-300 via-blue-500 to-cyan-300 bg-clip-text text-transparent">
                {text.title2}
              </span>

            </h1>

            <p className="mt-6 max-w-xl text-lg leading-8 text-slate-300">
              {text.subtitle}
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">

              <button
                type="button"
                onClick={() =>
                  router.push(
                    "/solicitar-trabajo"
                  )
                }
                className="rounded-2xl bg-blue-600 px-7 py-4 font-black text-white shadow-xl shadow-blue-600/20 transition hover:-translate-y-0.5 hover:bg-blue-500"
              >
                {text.request}
              </button>

              <button
                type="button"
                onClick={() =>
                  router.push(
                    "/mis-solicitudes"
                  )
                }
                className="rounded-2xl border border-white/20 bg-white/10 px-7 py-4 font-black text-white backdrop-blur transition hover:bg-white/15"
              >
                {text.requests}
              </button>

            </div>

            <div className="mt-8 rounded-2xl border border-white/10 bg-white/10 p-2 shadow-2xl backdrop-blur">

              <div className="flex flex-col gap-2 sm:flex-row">

                <input
                  type="text"
                  value={
                    busqueda
                  }
                  onChange={(e) =>
                    setBusqueda(
                      e.target
                        .value
                    )
                  }
                  onKeyDown={(e) => {
                    if (
                      e.key ===
                      "Enter"
                    ) {
                      buscarServicio();
                    }
                  }}
                  placeholder={
                    text.placeholder
                  }
                  className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white px-5 py-4 text-slate-950 outline-none placeholder:text-slate-400"
                />

                <button
                  type="button"
                  onClick={
                    buscarServicio
                  }
                  className="rounded-xl bg-blue-600 px-7 py-4 font-black text-white transition hover:bg-blue-500"
                >
                  {text.search}
                </button>

              </div>

            </div>

          </div>

          <div className="relative">

            <div className="absolute -inset-8 rounded-[3rem] bg-blue-500/15 blur-3xl" />

            <div className="relative overflow-hidden rounded-[2rem] border border-white/15 bg-white/5 p-2 shadow-[0_30px_100px_rgba(0,0,0,0.45)] backdrop-blur">

              <img
                src={ads[1]}
                alt="RELYDO for customers"
                className="block h-auto w-full rounded-[1.55rem] object-cover"
              />

            </div>

          </div>

        </div>

      </section>

      {/* SERVICES */}

      <section
        id="servicios-cliente"
        className="bg-white px-5 py-16 lg:px-8 lg:py-24"
      >

        <div className="mx-auto max-w-[1440px]">

          <div className="mx-auto max-w-3xl text-center">

            <p className="text-sm font-black tracking-[0.2em] text-blue-600">
              {
                text.servicesEyebrow
              }
            </p>

            <h2 className="mt-3 text-4xl font-black tracking-[-0.04em] md:text-5xl">
              {
                text.servicesTitle
              }
            </h2>

            <p className="mt-5 text-lg leading-8 text-slate-600">
              {
                text.servicesSubtitle
              }
            </p>

          </div>

          <div className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-8">

            {servicios.map(
              (
                servicio,
                index
              ) => (

                <button
                  key={`${servicio.label}-${index}`}
                  type="button"
                  onClick={() => {
                    if (
                      index ===
                      servicios.length -
                        1
                    ) {
                      router.push(
                        "/servicios"
                      );

                      return;
                    }

                    if (servicio.trade) {
                      irAProfesionales(
                        servicio.trade
                      );
                    }
                  }}
                  className="group rounded-[1.4rem] border border-slate-200 bg-[#f8fafc] p-5 text-center transition hover:-translate-y-1 hover:border-blue-300 hover:bg-white hover:shadow-xl"
                >

                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-2xl transition group-hover:bg-blue-600 group-hover:text-white">
                    {
                      servicio.icon
                    }
                  </div>

                  <div className="mt-4 text-sm font-black text-slate-800">
                    {
                      servicio.label
                    }
                  </div>

                </button>

              )
            )}

          </div>

        </div>

      </section>

      {/* HOW IT WORKS */}

      <section
        id="como-funciona"
        className="bg-[#f6f8fc] px-5 py-16 lg:px-8 lg:py-24"
      >

        <div className="mx-auto max-w-[1440px]">

          <div className="mx-auto max-w-3xl text-center">

            <p className="text-sm font-black tracking-[0.2em] text-blue-600">
              {
                text.howEyebrow
              }
            </p>

            <h2 className="mt-3 text-4xl font-black tracking-[-0.04em] md:text-5xl">
              {text.howTitle}
            </h2>

          </div>

          <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-4">

            {pasos.map(
              (paso) => (

                <div
                  key={
                    paso.number
                  }
                  className="rounded-[1.5rem] border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
                >

                  <div className="text-4xl font-black text-blue-200">
                    {
                      paso.number
                    }
                  </div>

                  <h3 className="mt-4 text-xl font-black">
                    {
                      paso.title
                    }
                  </h3>

                  <p className="mt-3 leading-7 text-slate-600">
                    {
                      paso.description
                    }
                  </p>

                </div>

              )
            )}

          </div>

        </div>

      </section>

      {/* TRUST */}

      <section
        id="confianza"
        className="bg-white px-5 py-16 lg:px-8 lg:py-24"
      >

        <div className="mx-auto grid max-w-[1440px] gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:items-center">

          <div>

            <p className="text-sm font-black tracking-[0.2em] text-blue-600">
              {
                text.trustEyebrow
              }
            </p>

            <h2 className="mt-3 text-4xl font-black tracking-[-0.04em] md:text-5xl">
              {
                text.trustTitle
              }
            </h2>

            <p className="mt-5 max-w-xl text-lg leading-8 text-slate-600">
              {
                text.trustSubtitle
              }
            </p>

          </div>

          <div className="grid gap-4 sm:grid-cols-2">

            {confianza.map(
              (item) => (

                <div
                  key={
                    item.title
                  }
                  className="rounded-[1.5rem] border border-slate-200 bg-[#f8fafc] p-6"
                >

                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-xl font-black text-white shadow-lg shadow-blue-600/20">
                    {
                      item.icon
                    }
                  </div>

                  <h3 className="mt-5 text-xl font-black">
                    {
                      item.title
                    }
                  </h3>

                  <p className="mt-3 leading-7 text-slate-600">
                    {
                      item.description
                    }
                  </p>

                </div>

              )
            )}

          </div>

        </div>

      </section>

      {/* JOB TIMELINE */}

      <section className="overflow-hidden bg-[#020817] px-5 py-16 text-white lg:px-8 lg:py-24">

        <div className="mx-auto max-w-[1440px]">

          <div className="mx-auto max-w-3xl text-center">

            <p className="text-sm font-black tracking-[0.2em] text-blue-300">
              {
                text.timelineEyebrow
              }
            </p>

            <h2 className="mt-3 text-4xl font-black tracking-[-0.04em] md:text-5xl">
              {
                text.timelineTitle
              }
            </h2>

            <p className="mt-5 text-lg leading-8 text-slate-300">
              {
                text.timelineSubtitle
              }
            </p>

          </div>

          <div className="relative mt-12">

            <div className="absolute left-8 right-8 top-8 hidden h-px bg-blue-400/30 lg:block" />

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">

              {timeline.map(
                (
                  item,
                  index
                ) => (

                  <div
                    key={item}
                    className="relative rounded-[1.4rem] border border-white/10 bg-white/5 p-5 backdrop-blur"
                  >

                    <div className="relative z-10 flex h-16 w-16 items-center justify-center rounded-full border border-blue-300/30 bg-blue-600 text-lg font-black text-white shadow-[0_0_30px_rgba(37,99,235,0.35)]">
                      {String(
                        index +
                          1
                      ).padStart(
                        2,
                        "0"
                      )}
                    </div>

                    <div className="mt-5 font-black text-white">
                      {item}
                    </div>

                  </div>

                )
              )}

            </div>

          </div>

        </div>

      </section>

      {/* PREMIUM IMAGE */}

      <section className="bg-[#f6f8fc] px-5 py-16 lg:px-8 lg:py-24">

        <div className="mx-auto grid max-w-[1440px] gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">

          <div>

            <p className="text-sm font-black tracking-[0.2em] text-blue-600">
              {
                text.appEyebrow
              }
            </p>

            <h2 className="mt-3 text-4xl font-black tracking-[-0.04em] md:text-5xl">
              {text.appTitle}
            </h2>

            <p className="mt-5 max-w-xl text-lg leading-8 text-slate-600">
              {
                text.appSubtitle
              }
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">

              <button
                type="button"
                onClick={() =>
                  router.push(
                    "/solicitar-trabajo"
                  )
                }
                className="rounded-2xl bg-blue-600 px-7 py-4 font-black text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700"
              >
                {text.request}
              </button>

              <button
                type="button"
                onClick={() =>
                  router.push(
                    "/mis-solicitudes"
                  )
                }
                className="rounded-2xl border border-slate-300 bg-white px-7 py-4 font-black text-slate-800 transition hover:border-blue-500 hover:text-blue-700"
              >
                {text.requests}
              </button>

            </div>

          </div>

          <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white p-2 shadow-[0_25px_70px_rgba(15,23,42,0.14)]">

            <img
              src={ads[2]}
              alt="RELYDO customer experience"
              className="w-full rounded-[1.6rem] object-cover"
              loading="lazy"
            />

          </div>

        </div>

      </section>

      {/* FINAL CTA */}

      <section className="bg-white px-5 py-16 lg:px-8 lg:py-24">

        <div className="mx-auto grid max-w-[1440px] overflow-hidden rounded-[2.5rem] bg-[#07152f] text-white shadow-2xl lg:grid-cols-[0.9fr_1.1fr]">

          <div className="flex flex-col justify-center p-8 md:p-12">

            <p className="text-sm font-black tracking-[0.2em] text-blue-300">
              {
                text.ctaEyebrow
              }
            </p>

            <h2 className="mt-3 text-4xl font-black tracking-[-0.04em] md:text-5xl">
              {text.cta}
            </h2>

            <p className="mt-5 text-lg leading-8 text-slate-300">
              {text.ctaSub}
            </p>

            <button
              type="button"
              onClick={() =>
                router.push(
                  "/solicitar-trabajo"
                )
              }
              className="mt-8 w-fit rounded-2xl bg-white px-7 py-4 font-black text-blue-700 transition hover:bg-blue-50"
            >
              {text.request}
            </button>

          </div>

          <div className="min-h-[340px] p-3">

            <img
              src={ads[3]}
              alt="RELYDO customer app"
              className="h-full w-full rounded-[1.8rem] object-cover"
              loading="lazy"
            />

          </div>

        </div>

      </section>

      {/* FOOTER */}

      <footer className="border-t border-white/10 bg-[#07152F] px-5 py-12 text-white lg:px-8">

        <div className="mx-auto grid max-w-[1440px] gap-10 md:grid-cols-2 lg:grid-cols-5">

          <div>

            <button
              type="button"
              onClick={() =>
                router.push("/")
              }
              aria-label="RELYDO Home"
            >
              <BrandLogo />
            </button>

            <p className="mt-5 max-w-xs leading-7 text-slate-300">
              {
                text.footerDescription
              }
            </p>

          </div>

          <div>

            <h3 className="font-black text-white">
              {
                text.footerCustomers
              }
            </h3>

            <div className="mt-4 flex flex-col items-start gap-3 text-slate-300">

              <button
                type="button"
                onClick={() =>
                  router.push(
                    "/clientes"
                  )
                }
                className="transition hover:text-white"
              >
                {
                  text.customerHome
                }
              </button>

              <button
                type="button"
                onClick={() =>
                  router.push(
                    "/login-cliente"
                  )
                }
                className="transition hover:text-white"
              >
                {
                  text.customerLogin
                }
              </button>

              <button
                type="button"
                onClick={() =>
                  router.push(
                    "/registro-cliente"
                  )
                }
                className="transition hover:text-white"
              >
                {
                  text.customerSignup
                }
              </button>

            </div>

          </div>

          <div>

            <h3 className="font-black text-white">
              {
                text.footerProfessionals
              }
            </h3>

            <div className="mt-4 flex flex-col items-start gap-3 text-slate-300">

              <button
                type="button"
                onClick={() =>
                  router.push(
                    "/para-profesionales"
                  )
                }
                className="transition hover:text-white"
              >
                {
                  text.professionalHome
                }
              </button>

              <button
                type="button"
                onClick={() =>
                  router.push(
                    "/login-profesional"
                  )
                }
                className="transition hover:text-white"
              >
                {
                  text.professionalLogin
                }
              </button>

              <button
                type="button"
                onClick={() =>
                  router.push(
                    "/registro-profesional"
                  )
                }
                className="transition hover:text-white"
              >
                {
                  text.professionalSignup
                }
              </button>

            </div>

          </div>

          <div>

            <h3 className="font-black text-white">
              {
                text.footerPlatform
              }
            </h3>

            <div className="mt-4 flex flex-col items-start gap-3 text-slate-300">

              <button
                type="button"
                onClick={() =>
                  router.push(
                    "/servicios"
                  )
                }
                className="transition hover:text-white"
              >
                {text.services}
              </button>

              <button
                type="button"
                onClick={() =>
                  router.push(
                    "/profesionales"
                  )
                }
                className="transition hover:text-white"
              >
                {
                  text.professionals
                }
              </button>

            </div>

          </div>

          <div>

            <h3 className="font-black text-white">
              {
                text.footerLegal
              }
            </h3>

            <div className="mt-4 flex flex-col items-start gap-3 text-slate-300">

              <button
                type="button"
                onClick={() => router.push("/terms")}
                className="transition hover:text-white"
              >
                {text.terms}
              </button>

              <button
                type="button"
                onClick={() => router.push("/privacy")}
                className="transition hover:text-white"
              >
                {text.privacy}
              </button>

            </div>

          </div>

        </div>

        <div className="mx-auto mt-10 max-w-[1440px] border-t border-white/10 pt-6 text-center text-sm text-slate-400">
          ©{" "}
          {new Date().getFullYear()}{" "}
          RELYDO. {text.rights}
        </div>

      </footer>

    </main>
  );
}