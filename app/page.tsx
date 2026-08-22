"use client";

import { useRouter } from "next/navigation";
import { useLanguage } from "@/app/components/LanguageProvider";

const LOGO_SRC = "/icon/relydo-logo.png";

function BrandLogo() {
  return (
    <div className="flex items-center gap-3">
      <img
        src={LOGO_SRC}
        alt="RELYDO"
        className="h-12 w-auto object-contain sm:h-14"
        onError={(event) => {
          event.currentTarget.style.display = "none";
          const fallback = event.currentTarget.nextElementSibling as HTMLElement | null;
          if (fallback) fallback.style.display = "inline";
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


export default function Home() {
  const router = useRouter();
  const { language } = useLanguage();
  const es = language === "es";

  const T = es
    ? {
        home: "Inicio",
        how: "Cómo funciona",
        trust: "Confianza",
        customers: "Para clientes",
        pros: "Para profesionales",
        badge: "UNA PLATAFORMA. DOS EXPERIENCIAS.",
        title1: "Todo empieza",
        title2: "con RELYDO.",
        subtitle:
          "Una plataforma para conectar clientes y profesionales con un flujo claro, pagos protegidos y herramientas para llevar cada trabajo de principio a fin.",
        choose: "Elige cómo quieres usar RELYDO",
        chooseSub:
          "Cada lado tiene una experiencia diseñada para sus propias necesidades.",
        customerEyebrow: "PARA CLIENTES",
        customerTitle: "Encuentra ayuda confiable.",
        customerDesc:
          "Solicita un trabajo, compara presupuestos, sigue el servicio y mantén todo organizado en RELYDO.",
        customerButton: "Entrar al portal de clientes",
        proEyebrow: "PARA PROFESIONALES",
        proTitle: "Haz crecer tu negocio.",
        proDesc:
          "Descubre oportunidades, envía presupuestos, administra trabajos y construye tu reputación profesional.",
        proButton: "Entrar al portal profesional",
        trustTitle: "Confianza en cada paso",
        trustSub:
          "Trabajo, pago, comunicación y evidencia conectados en un mismo flujo.",
        verified: "Profesionales verificados",
        verifiedD: "Proceso de verificación antes de habilitar el acceso profesional.",
        quotes: "Presupuestos claros",
        quotesD: "El cliente puede comparar propuestas antes de contratar.",
        payments: "Pagos protegidos",
        paymentsD: "El pago permanece asociado al trabajo dentro de la plataforma.",
        tracking: "Seguimiento del trabajo",
        trackingD: "Estados, comunicación y evidencias en un mismo lugar.",
        flow: "Así funciona RELYDO",
        flowSub: "Un flujo simple desde la necesidad hasta el trabajo terminado.",
        s1: "Publica o encuentra una oportunidad",
        s1d: "Clientes crean solicitudes y profesionales acceden a oportunidades relevantes.",
        s2: "Conecta con la mejor opción",
        s2d: "Presupuestos, detalles y comunicación permanecen organizados.",
        s3: "Sigue el trabajo",
        s3d: "Desde que va en camino hasta que termina, el progreso permanece visible.",
        s4: "Cierra con confianza",
        s4d: "Pago, evidencia y soporte quedan asociados al trabajo.",
        final: "Dos lados. Una sola plataforma.",
        finalD:
          "RELYDO está diseñado para que clientes y profesionales trabajen con más claridad, control y confianza.",
        finalC: "Soy cliente",
        finalP: "Soy profesional",
        footerC: "Clientes",
        footerP: "Profesionales",
        footerPlatform: "Plataforma",
        footerLegal: "Legal",
        cPortal: "Portal de clientes",
        cLogin: "Iniciar sesión",
        cSignup: "Crear cuenta",
        pPortal: "Portal profesional",
        pLogin: "Iniciar sesión profesional",
        pSignup: "Unirme como profesional",
        services: "Servicios",
        professionals: "Profesionales",
        terms: "Términos",
        privacy: "Privacidad",
        rights: "Todos los derechos reservados.",
      }
    : {
        home: "Home",
        how: "How it works",
        trust: "Trust",
        customers: "For Customers",
        pros: "For Professionals",
        badge: "ONE PLATFORM. TWO EXPERIENCES.",
        title1: "Everything starts",
        title2: "with RELYDO.",
        subtitle:
          "A platform that connects customers and professionals through a clear workflow, protected payments and tools that keep every job organized from start to finish.",
        choose: "Choose how you want to use RELYDO",
        chooseSub:
          "Each side has an experience designed around its own needs.",
        customerEyebrow: "FOR CUSTOMERS",
        customerTitle: "Find help you can trust.",
        customerDesc:
          "Request a job, compare quotes, track progress and keep everything organized inside RELYDO.",
        customerButton: "Enter customer portal",
        proEyebrow: "FOR PROFESSIONALS",
        proTitle: "Grow your business.",
        proDesc:
          "Discover opportunities, send quotes, manage jobs and build your professional reputation.",
        proButton: "Enter professional portal",
        trustTitle: "Trust at every step",
        trustSub:
          "Job, payment, communication and evidence connected in one workflow.",
        verified: "Verified professionals",
        verifiedD: "A verification process before professional access is enabled.",
        quotes: "Clear quotes",
        quotesD: "Customers can compare proposals before hiring.",
        payments: "Protected payments",
        paymentsD: "Payment stays connected to the job inside the platform.",
        tracking: "Job tracking",
        trackingD: "Job stages, communication and evidence stay together.",
        flow: "How RELYDO works",
        flowSub: "A simple flow from need to completed job.",
        s1: "Post or discover an opportunity",
        s1d: "Customers create requests and professionals access relevant opportunities.",
        s2: "Connect with the right fit",
        s2d: "Quotes, details and communication remain organized.",
        s3: "Track the job",
        s3d: "From on-the-way through completion, progress remains visible.",
        s4: "Finish with confidence",
        s4d: "Payment, evidence and support remain connected to the job.",
        final: "Two sides. One platform.",
        finalD:
          "RELYDO is designed so customers and professionals can work with more clarity, control and confidence.",
        finalC: "I'm a customer",
        finalP: "I'm a professional",
        footerC: "Customers",
        footerP: "Professionals",
        footerPlatform: "Platform",
        footerLegal: "Legal",
        cPortal: "Customer portal",
        cLogin: "Customer sign in",
        cSignup: "Create account",
        pPortal: "Professional portal",
        pLogin: "Professional sign in",
        pSignup: "Join as a professional",
        services: "Services",
        professionals: "Professionals",
        terms: "Terms",
        privacy: "Privacy",
        rights: "All rights reserved.",
      };

  const anunciosEspanol = [
    "/ads/4b37dfc4-7eb9-4b5f-8bb5-40eb6a974310.png",
    "/ads/4daa86f7-42c8-43f5-b5bd-4c6342dfb0dd.png",
    "/ads/58d502c8-3a92-443d-bb21-d335f41c282b.png",
    "/ads/8864c5e6-3489-4ca5-8772-87de324ccfc2.png",
    "/ads/9018c8ec-b41a-4d2c-882a-cac2bd5c0fbe.png",
    "/ads/24409dde-116e-49cc-a962-70f4ca6595df.png",
    "/ads/274974a4-c1f1-49e8-9ff6-cbd13ad4b9f7.png",
    "/ads/ads-2.jpeg",
    "/ads/ads-5.jpeg",
  ];

  const anunciosIngles = [
    "/ads/ads-10.png",
    "/ads/ads-11.png",
    "/ads/ads-12.png",
    "/ads/ads-14.png",
    "/ads/ads-15.png",
    "/ads/ads-16.png",
    "/ads/ads-17.png",
    "/ads/ads-18.png",
    "/ads/ads-18.png",
  ];

  const ads = es ? anunciosEspanol : anunciosIngles;

  const trust = [
    [T.verified, T.verifiedD, "01"],
    [T.quotes, T.quotesD, "02"],
    [T.payments, T.paymentsD, "03"],
    [T.tracking, T.trackingD, "04"],
  ];

  const flow = [
    [T.s1, T.s1d, "01"],
    [T.s2, T.s2d, "02"],
    [T.s3, T.s3d, "03"],
    [T.s4, T.s4d, "04"],
  ];

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#EEF3FA] text-slate-950">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#07152F]/95 shadow-lg backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <button onClick={() => router.push("/")} aria-label="RELYDO Home">
            <BrandLogo />
          </button>

          <nav className="hidden items-center gap-8 lg:flex">
            <button onClick={() => router.push("/")} className="text-sm font-bold text-slate-200 transition hover:text-white">
              {T.home}
            </button>
            <button
              onClick={() => document.getElementById("como-funciona")?.scrollIntoView({ behavior: "smooth" })}
              className="text-sm font-bold text-slate-200 transition hover:text-white"
            >
              {T.how}
            </button>
            <button
              onClick={() => document.getElementById("confianza")?.scrollIntoView({ behavior: "smooth" })}
              className="text-sm font-bold text-slate-200 transition hover:text-white"
            >
              {T.trust}
            </button>
          </nav>

          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push("/clientes")}
              className="rounded-xl border border-white/25 bg-white px-3 py-2 text-xs font-black text-slate-900 transition hover:bg-blue-50 sm:px-5 sm:text-sm"
            >
              {T.customers}
            </button>
            <button
              onClick={() => router.push("/para-profesionales")}
              className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-black text-white shadow-md shadow-blue-600/20 transition hover:bg-blue-700 sm:px-5 sm:py-3 sm:text-sm"
            >
              {T.pros}
            </button>
          </div>
        </div>
      </header>

      <section className="relative isolate overflow-hidden bg-[#020817]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(37,99,235,0.35),transparent_30%),radial-gradient(circle_at_85%_10%,rgba(56,189,248,0.16),transparent_25%),linear-gradient(135deg,#020817_0%,#061a42_55%,#020817_100%)]" />
        <div className="relative mx-auto max-w-[1440px] px-5 py-16 text-center sm:py-20 lg:px-8 lg:pb-16 lg:pt-24">
          <div className="mx-auto max-w-4xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-400/25 bg-blue-500/10 px-4 py-2 text-xs font-black tracking-[0.16em] text-blue-200">
              <span className="h-2 w-2 rounded-full bg-blue-400 shadow-[0_0_18px_rgba(96,165,250,0.9)]" />
              {T.badge}
            </div>

            <h1 className="mt-7 text-5xl font-black leading-[0.96] tracking-[-0.05em] text-white sm:text-6xl lg:text-7xl">
              {T.title1}
              <span className="mt-2 block bg-gradient-to-r from-blue-300 via-blue-500 to-cyan-300 bg-clip-text text-transparent">
                {T.title2}
              </span>
            </h1>

            <p className="mx-auto mt-7 max-w-3xl text-lg leading-8 text-slate-300 sm:text-xl">
              {T.subtitle}
            </p>

            <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
              <button
                onClick={() => router.push("/clientes")}
                className="rounded-2xl bg-white px-7 py-4 font-black text-blue-700 shadow-2xl transition hover:-translate-y-0.5 hover:bg-blue-50"
              >
                {T.customers}
              </button>
              <button
                onClick={() => router.push("/para-profesionales")}
                className="rounded-2xl border border-white/20 bg-white/10 px-7 py-4 font-black text-white backdrop-blur transition hover:bg-white/15"
              >
                {T.pros}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[#EEF3FA] px-5 py-16 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-[1440px]">
          <div className="grid gap-6 xl:grid-cols-2">
            <article className="group overflow-hidden rounded-[2rem] border border-slate-300/80 bg-white shadow-[0_22px_75px_rgba(15,23,42,0.16)] transition hover:-translate-y-1">
              <div className="relative overflow-hidden bg-slate-100">
                <img
                  src={es ? "/ads/ads-5.jpeg" : "/ads/ads-18.png"}
                  alt="RELYDO customers"
                  className="block h-auto w-full object-contain transition duration-500 group-hover:scale-[1.01]"
                  loading="lazy"
                />
              </div>
              <div className="p-6 sm:p-8">
                <p className="text-lg leading-8 text-slate-600">{T.customerDesc}</p>
                <button
                  onClick={() => router.push("/clientes")}
                  className="mt-7 w-full rounded-2xl bg-blue-600 px-6 py-4 font-black text-white shadow-lg shadow-blue-600/15 transition hover:bg-blue-700"
                >
                  {T.customerButton} →
                </button>
              </div>
            </article>

            <article className="group overflow-hidden rounded-[2rem] border border-slate-800 bg-[#07152f] text-white shadow-[0_20px_70px_rgba(2,8,23,0.25)] transition hover:-translate-y-1">
              <div className="relative overflow-hidden bg-slate-900">
                <img
                  src={es ? "/ads/ads-2.jpeg" : "/ads/ads-17.png"}
                  alt="RELYDO professionals"
                  className="block h-auto w-full object-contain transition duration-500 group-hover:scale-[1.01]"
                  loading="lazy"
                />
              </div>
              <div className="p-6 sm:p-8">
                <p className="text-lg leading-8 text-slate-300">{T.proDesc}</p>
                <button
                  onClick={() => router.push("/para-profesionales")}
                  className="mt-7 w-full rounded-2xl bg-white px-6 py-4 font-black text-blue-700 transition hover:bg-blue-50"
                >
                  {T.proButton} →
                </button>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section id="confianza" className="bg-white px-5 py-16 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-[1440px]">
          <div className="grid gap-10 lg:grid-cols-[0.75fr_1.25fr] lg:items-end">
            <div>
              <p className="text-sm font-black tracking-[0.2em] text-blue-600">RELYDO TRUST</p>
              <h2 className="mt-3 text-4xl font-black tracking-[-0.04em] md:text-5xl">{T.trustTitle}</h2>
              <p className="mt-5 text-lg leading-8 text-slate-600">{T.trustSub}</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {trust.map(([title, desc, number]) => (
                <div key={number} className="rounded-[1.4rem] border border-slate-200 bg-slate-50 p-6">
                  <div className="text-sm font-black text-blue-600">{number}</div>
                  <h3 className="mt-3 text-xl font-black">{title}</h3>
                  <p className="mt-2 leading-7 text-slate-600">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="como-funciona" className="relative overflow-hidden bg-gradient-to-br from-blue-700 via-blue-800 to-[#02102d] px-5 py-16 text-white lg:px-8 lg:py-24">
        <div className="absolute -right-24 top-0 h-80 w-80 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="relative mx-auto max-w-[1440px]">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-black tracking-[0.2em] text-blue-200">RELYDO FLOW</p>
            <h2 className="mt-3 text-4xl font-black tracking-[-0.04em] md:text-5xl">{T.flow}</h2>
            <p className="mt-5 text-lg leading-8 text-blue-100">{T.flowSub}</p>
          </div>

          <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {flow.map(([title, desc, number]) => (
              <div key={number} className="rounded-[1.5rem] border border-white/15 bg-white/10 p-6 backdrop-blur">
                <div className="text-4xl font-black text-blue-300">{number}</div>
                <h3 className="mt-5 text-xl font-black">{title}</h3>
                <p className="mt-3 leading-7 text-blue-100/90">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#f6f8fc] px-5 py-16 lg:px-8 lg:py-24">
        <div className="mx-auto grid max-w-[1440px] overflow-hidden rounded-[2.5rem] bg-white shadow-[0_25px_80px_rgba(15,23,42,0.12)] lg:grid-cols-[0.9fr_1.1fr]">
          <div className="flex flex-col justify-center p-8 md:p-12">
            <p className="text-sm font-black tracking-[0.2em] text-blue-600">RELYDO</p>
            <h2 className="mt-3 text-4xl font-black tracking-[-0.04em] md:text-5xl">{T.final}</h2>
            <p className="mt-5 max-w-xl text-lg leading-8 text-slate-600">{T.finalD}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button onClick={() => router.push("/clientes")} className="rounded-2xl bg-blue-600 px-7 py-4 font-black text-white hover:bg-blue-700">
                {T.finalC}
              </button>
              <button onClick={() => router.push("/para-profesionales")} className="rounded-2xl border border-slate-300 bg-white px-7 py-4 font-black text-slate-800 hover:border-blue-500 hover:text-blue-700">
                {T.finalP}
              </button>
            </div>
          </div>
          <div className="min-h-[360px] bg-[#07152f] p-3">
            <img src={ads[8]} alt="RELYDO" className="h-full w-full rounded-[1.8rem] object-cover object-center" loading="lazy" />
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-300/70 bg-[#EEF3FA] px-5 py-12 lg:px-8">
        <div className="mx-auto grid max-w-[1440px] gap-10 md:grid-cols-2 lg:grid-cols-5">
          <div>
            <button onClick={() => router.push("/")} aria-label="RELYDO Home">
              <BrandLogo />
            </button>
          </div>

          <div>
            <h3 className="font-black">{T.footerC}</h3>
            <div className="mt-4 flex flex-col items-start gap-3 text-slate-600">
              <button onClick={() => router.push("/clientes")}>{T.cPortal}</button>
              <button onClick={() => router.push("/login-cliente")}>{T.cLogin}</button>
              <button onClick={() => router.push("/registro-cliente")}>{T.cSignup}</button>
            </div>
          </div>

          <div>
            <h3 className="font-black">{T.footerP}</h3>
            <div className="mt-4 flex flex-col items-start gap-3 text-slate-600">
              <button onClick={() => router.push("/para-profesionales")}>{T.pPortal}</button>
              <button onClick={() => router.push("/login-profesional")}>{T.pLogin}</button>
              <button onClick={() => router.push("/registro-profesional")}>{T.pSignup}</button>
            </div>
          </div>

          <div>
            <h3 className="font-black">{T.footerPlatform}</h3>
            <div className="mt-4 flex flex-col items-start gap-3 text-slate-600">
              <button onClick={() => router.push("/servicios")}>{T.services}</button>
              <button onClick={() => router.push("/profesionales")}>{T.professionals}</button>
            </div>
          </div>

          <div>
            <h3 className="font-black">{T.footerLegal}</h3>
            <div className="mt-4 flex flex-col items-start gap-3 text-slate-600">
              <span>{T.terms}</span>
              <span>{T.privacy}</span>
            </div>
          </div>
        </div>

        <div className="mx-auto mt-10 max-w-[1440px] border-t border-slate-200 pt-6 text-center text-sm text-slate-500">
          © {new Date().getFullYear()} RELYDO. {T.rights}
        </div>
      </footer>
    </main>
  );
}