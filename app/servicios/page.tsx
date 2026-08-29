"use client";

import { Suspense } from "react";
import {
  useRouter,
  useSearchParams,
} from "next/navigation";
import { useLanguage } from "@/app/components/LanguageProvider";

type Servicio = {
  nombre: string;
  trade: string;
  icono: string;
  descripcion: string;
  palabrasClave: string[];
};

function normalizarTexto(texto: string) {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function ServiciosContenido() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { language } = useLanguage();

  const buscar =
    searchParams.get("buscar") || "";

  const text =
    language === "es"
      ? {
          titulo: "Nuestros servicios",
          descripcion:
            "Encuentra profesionales para el servicio que necesitas.",
          verProfesionales:
            "Ver profesionales",
          noEncuentras:
            "¿No encuentras el servicio que necesitas?",
          noEncuentrasDescripcion:
            "Describe el trabajo y encuentra un profesional adecuado para ayudarte.",
          solicitarTrabajo:
            "Solicitar un trabajo",
          resultadoPara:
            "Resultado para",
          sinResultados:
            "No encontramos un servicio que coincida con tu búsqueda.",
          verTodos:
            "Ver todos los servicios",
        }
      : {
          titulo: "Our services",
          descripcion:
            "Find professionals for the service you need.",
          verProfesionales:
            "View professionals",
          noEncuentras:
            "Can’t find the service you need?",
          noEncuentrasDescripcion:
            "Describe the job and find the right professional to help you.",
          solicitarTrabajo:
            "Request a job",
          resultadoPara:
            "Result for",
          sinResultados:
            "We couldn't find a service matching your search.",
          verTodos:
            "View all services",
        };

  const servicios: Servicio[] =
    language === "es"
      ? [
          { nombre: "Plomería", trade: "plumbing", icono: "🔧", descripcion: "Fugas, tuberías, grifería, drenajes y reparaciones.", palabrasClave: ["plomeria", "plomero", "plumbing", "tuberias", "fugas", "griferia", "drenajes"] },
          { nombre: "Electricidad", trade: "electrical", icono: "⚡", descripcion: "Instalaciones, reparaciones, cableado y problemas eléctricos.", palabrasClave: ["electricidad", "electricista", "electrical", "electrician", "cableado", "enchufe", "breaker"] },
          { nombre: "Pintura", trade: "painting", icono: "🎨", descripcion: "Pintura interior, exterior y retoques.", palabrasClave: ["pintura", "pintor", "painting", "painter", "paredes"] },
          { nombre: "Jardinería", trade: "landscaping", icono: "🌿", descripcion: "Mantenimiento, limpieza y cuidado de jardines y exteriores.", palabrasClave: ["jardineria", "jardinero", "landscaping", "garden", "yard", "cesped"] },
          { nombre: "Limpieza", trade: "cleaning", icono: "🧹", descripcion: "Limpieza residencial, comercial y otros servicios de limpieza.", palabrasClave: ["limpieza", "cleaning", "cleaner", "casa", "oficina"] },
          { nombre: "Aire acondicionado / HVAC", trade: "hvac", icono: "❄️", descripcion: "Aire acondicionado, calefacción, diagnóstico y mantenimiento HVAC.", palabrasClave: ["aire acondicionado", "hvac", "ac", "calefaccion", "heating", "cooling"] },
          { nombre: "Renta de aires acondicionados", trade: "ac_rental", icono: "❄️", descripcion: "Renta de aires acondicionados portátiles y equipos de climatización.", palabrasClave: ["renta de aires acondicionados", "alquiler de aire acondicionado", "renta de ac", "ac rental", "air conditioner rental", "portable ac", "aire portatil"] },
          { nombre: "Carpintería", trade: "carpentry", icono: "🪚", descripcion: "Reparaciones, instalaciones y trabajos de carpintería.", palabrasClave: ["carpinteria", "carpintero", "carpentry", "carpenter", "madera"] },
          { nombre: "Mudanzas", trade: "moving", icono: "📦", descripcion: "Mudanzas, carga, descarga y traslado.", palabrasClave: ["mudanza", "mudanzas", "moving", "movers", "traslado", "carga"] },
          { nombre: "Reparación de electrodomésticos", trade: "appliance_repair", icono: "🔌", descripcion: "Diagnóstico y reparación de electrodomésticos del hogar.", palabrasClave: ["electrodomesticos", "appliance", "appliance repair", "lavadora", "secadora", "refrigerador"] },
          { nombre: "Handyman", trade: "handyman", icono: "🛠️", descripcion: "Reparaciones generales, instalaciones y pequeños proyectos.", palabrasClave: ["handyman", "reparaciones", "mantenimiento", "arreglos"] },
          { nombre: "Cerrajería", trade: "locksmith", icono: "🔐", descripcion: "Cerraduras, llaves, aperturas e instalación de seguridad.", palabrasClave: ["cerrajeria", "cerrajero", "locksmith", "cerradura", "llaves"] },
          { nombre: "Techado", trade: "roofing", icono: "🏠", descripcion: "Reparación, mantenimiento e instalación de techos.", palabrasClave: ["techado", "techo", "roofing", "roofer", "roof"] },
          { nombre: "Pisos", trade: "flooring", icono: "🪵", descripcion: "Instalación y reparación de pisos y revestimientos.", palabrasClave: ["pisos", "piso", "flooring", "floor", "laminado", "vinilo"] },
          { nombre: "Azulejos y losas", trade: "tile", icono: "🔲", descripcion: "Instalación y reparación de azulejos, losas y superficies.", palabrasClave: ["azulejos", "losas", "tile", "tiles", "ceramica"] },
          { nombre: "Drywall", trade: "drywall", icono: "🧱", descripcion: "Instalación, reparación y acabado de drywall.", palabrasClave: ["drywall", "panel yeso", "sheetrock", "pared"] },
          { nombre: "Concreto y albañilería", trade: "masonry", icono: "🧱", descripcion: "Concreto, bloques, ladrillos y trabajos de albañilería.", palabrasClave: ["concreto", "albanileria", "masonry", "concrete", "brick"] },
          { nombre: "Puertas y ventanas", trade: "doors_windows", icono: "🚪", descripcion: "Instalación y reparación de puertas y ventanas.", palabrasClave: ["puertas", "ventanas", "doors", "windows", "door", "window"] },
          { nombre: "Garajes", trade: "garage_doors", icono: "🚗", descripcion: "Instalación y reparación de puertas y sistemas de garaje.", palabrasClave: ["garaje", "garage", "garage door", "puerta garaje"] },
          { nombre: "Cercas", trade: "fencing", icono: "🪚", descripcion: "Instalación, reparación y mantenimiento de cercas.", palabrasClave: ["cercas", "cerca", "fencing", "fence"] },
          { nombre: "Piscinas y spas", trade: "pool_spa", icono: "🏊", descripcion: "Limpieza, mantenimiento y reparación de piscinas y spas.", palabrasClave: ["piscina", "spa", "pool", "pool service", "jacuzzi"] },
          { nombre: "Control de plagas", trade: "pest_control", icono: "🐜", descripcion: "Tratamiento y control de insectos y otras plagas.", palabrasClave: ["plagas", "fumigacion", "pest control", "insectos", "pests"] },
          { nombre: "Lavado a presión", trade: "pressure_washing", icono: "💦", descripcion: "Limpieza exterior con lavado a presión.", palabrasClave: ["lavado presion", "pressure washing", "power washing", "exterior"] },
          { nombre: "Limpieza de alfombras", trade: "carpet_cleaning", icono: "🧼", descripcion: "Limpieza profunda de alfombras, tapetes y superficies textiles.", palabrasClave: ["alfombras", "carpet cleaning", "carpet", "tapetes"] },
          { nombre: "Retiro de basura", trade: "junk_removal", icono: "🗑️", descripcion: "Retiro de muebles, escombros, basura y artículos no deseados.", palabrasClave: ["basura", "escombros", "junk removal", "junk", "retiro"] },
          { nombre: "Montaje de muebles", trade: "furniture_assembly", icono: "🪑", descripcion: "Armado e instalación de muebles y accesorios.", palabrasClave: ["muebles", "montaje", "furniture assembly", "assembly", "armado"] },
          { nombre: "TV y hogar inteligente", trade: "smart_home", icono: "📺", descripcion: "Montaje de TV e instalación de dispositivos de hogar inteligente.", palabrasClave: ["tv", "smart home", "hogar inteligente", "montaje tv", "camaras"] },
        ]
      : [
          { nombre: "Plumbing", trade: "plumbing", icono: "🔧", descripcion: "Leaks, pipes, faucets, drains, and repairs.", palabrasClave: ["plumbing", "plumber", "pipes", "leaks", "faucet", "drain"] },
          { nombre: "Electrical", trade: "electrical", icono: "⚡", descripcion: "Installations, repairs, wiring, and electrical issues.", palabrasClave: ["electrical", "electrician", "wiring", "outlet", "breaker"] },
          { nombre: "Painting", trade: "painting", icono: "🎨", descripcion: "Interior painting, exterior painting, and touch-ups.", palabrasClave: ["painting", "painter", "paint", "walls"] },
          { nombre: "Landscaping", trade: "landscaping", icono: "🌿", descripcion: "Outdoor maintenance, cleanup, and landscaping care.", palabrasClave: ["landscaping", "landscaper", "garden", "yard", "lawn"] },
          { nombre: "Cleaning", trade: "cleaning", icono: "🧹", descripcion: "Residential, commercial, and other cleaning services.", palabrasClave: ["cleaning", "cleaner", "house cleaning", "office cleaning"] },
          { nombre: "Air conditioning / HVAC", trade: "hvac", icono: "❄️", descripcion: "Air conditioning, heating, diagnostics, and HVAC maintenance.", palabrasClave: ["hvac", "air conditioning", "ac", "heating", "cooling"] },
          { nombre: "Air conditioner rental", trade: "ac_rental", icono: "❄️", descripcion: "Rental of portable air conditioners and temporary cooling equipment.", palabrasClave: ["air conditioner rental", "ac rental", "portable ac rental", "temporary cooling", "renta de aires acondicionados", "alquiler de aire acondicionado"] },
          { nombre: "Carpentry", trade: "carpentry", icono: "🪚", descripcion: "Repairs, installations, and carpentry work.", palabrasClave: ["carpentry", "carpenter", "wood"] },
          { nombre: "Moving", trade: "moving", icono: "📦", descripcion: "Moving, loading, unloading, and transportation help.", palabrasClave: ["moving", "mover", "movers", "loading"] },
          { nombre: "Appliance repair", trade: "appliance_repair", icono: "🔌", descripcion: "Home appliance diagnostics and repair.", palabrasClave: ["appliance repair", "appliance", "washer", "dryer", "refrigerator"] },
          { nombre: "Handyman", trade: "handyman", icono: "🛠️", descripcion: "General repairs, installations, and small projects.", palabrasClave: ["handyman", "repairs", "maintenance"] },
          { nombre: "Locksmith", trade: "locksmith", icono: "🔐", descripcion: "Locks, keys, lockouts, and security hardware installation.", palabrasClave: ["locksmith", "locks", "keys", "lockout"] },
          { nombre: "Roofing", trade: "roofing", icono: "🏠", descripcion: "Roof repair, maintenance, and installation.", palabrasClave: ["roofing", "roofer", "roof"] },
          { nombre: "Flooring", trade: "flooring", icono: "🪵", descripcion: "Floor installation, repair, and replacement.", palabrasClave: ["flooring", "floor", "laminate", "vinyl"] },
          { nombre: "Tile", trade: "tile", icono: "🔲", descripcion: "Tile installation, repair, and surface work.", palabrasClave: ["tile", "tiles", "ceramic"] },
          { nombre: "Drywall", trade: "drywall", icono: "🧱", descripcion: "Drywall installation, repair, and finishing.", palabrasClave: ["drywall", "sheetrock", "wall"] },
          { nombre: "Concrete & masonry", trade: "masonry", icono: "🧱", descripcion: "Concrete, brick, block, and masonry work.", palabrasClave: ["masonry", "concrete", "brick", "block"] },
          { nombre: "Doors & windows", trade: "doors_windows", icono: "🚪", descripcion: "Door and window installation and repair.", palabrasClave: ["doors", "windows", "door", "window"] },
          { nombre: "Garage doors", trade: "garage_doors", icono: "🚗", descripcion: "Garage door and opener installation and repair.", palabrasClave: ["garage", "garage door", "garage opener"] },
          { nombre: "Fencing", trade: "fencing", icono: "🪚", descripcion: "Fence installation, repair, and maintenance.", palabrasClave: ["fencing", "fence"] },
          { nombre: "Pools & spas", trade: "pool_spa", icono: "🏊", descripcion: "Pool and spa cleaning, maintenance, and repair.", palabrasClave: ["pool", "spa", "pool service", "hot tub"] },
          { nombre: "Pest control", trade: "pest_control", icono: "🐜", descripcion: "Treatment and control of insects and other pests.", palabrasClave: ["pest control", "pests", "insects", "exterminator"] },
          { nombre: "Pressure washing", trade: "pressure_washing", icono: "💦", descripcion: "Exterior cleaning with pressure and power washing.", palabrasClave: ["pressure washing", "power washing", "exterior cleaning"] },
          { nombre: "Carpet cleaning", trade: "carpet_cleaning", icono: "🧼", descripcion: "Deep cleaning for carpets, rugs, and fabric surfaces.", palabrasClave: ["carpet cleaning", "carpet", "rugs"] },
          { nombre: "Junk removal", trade: "junk_removal", icono: "🗑️", descripcion: "Removal of furniture, debris, junk, and unwanted items.", palabrasClave: ["junk removal", "junk", "debris", "hauling"] },
          { nombre: "Furniture assembly", trade: "furniture_assembly", icono: "🪑", descripcion: "Furniture and fixture assembly and installation.", palabrasClave: ["furniture assembly", "assembly", "furniture"] },
          { nombre: "TV & smart home", trade: "smart_home", icono: "📺", descripcion: "TV mounting and smart-home device installation.", palabrasClave: ["tv mounting", "smart home", "tv", "cameras"] },
        ];

  const busquedaNormalizada =
    normalizarTexto(buscar);

  const serviciosFiltrados =
    !busquedaNormalizada
      ? servicios
      : servicios.filter((servicio) => {
          const nombreNormalizado =
            normalizarTexto(servicio.nombre);

          const tradeNormalizado =
            normalizarTexto(servicio.trade);

          if (
            nombreNormalizado.includes(
              busquedaNormalizada
            ) ||
            busquedaNormalizada.includes(
              nombreNormalizado
            ) ||
            tradeNormalizado.includes(
              busquedaNormalizada
            )
          ) {
            return true;
          }

          return servicio.palabrasClave.some(
            (palabra) => {
              const palabraNormalizada =
                normalizarTexto(palabra);

              return (
                palabraNormalizada ===
                  busquedaNormalizada ||
                palabraNormalizada.includes(
                  busquedaNormalizada
                ) ||
                busquedaNormalizada.includes(
                  palabraNormalizada
                )
              );
            }
          );
        });

  function verProfesionales(trade: string) {
    router.push(
      `/profesionales?trade=${encodeURIComponent(
        trade
      )}`
    );
  }

  function verTodos() {
    router.push("/servicios");
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-12">
      <div className="mx-auto max-w-7xl">

        {/* BOTÓN REGRESAR */}

        <button
          type="button"
          onClick={() => router.back()}
          className="mb-6 inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-extrabold text-slate-800 shadow-sm transition hover:border-blue-300 hover:text-blue-700 hover:shadow-md"
          aria-label={language === "es" ? "Regresar" : "Go back"}
        >
          <span aria-hidden="true" className="text-xl leading-none">←</span>
          {language === "es" ? "Regresar" : "Back"}
        </button>

        {/* HEADER */}

        <div className="text-center">
          <div className="text-3xl font-black text-blue-700">
            RELYDO
          </div>

          <h1 className="mt-3 text-4xl font-extrabold text-slate-900 md:text-5xl">
            {text.titulo}
          </h1>

          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">
            {text.descripcion}
          </p>

          {buscar && (
            <div className="mt-5">
              <p className="text-sm font-semibold text-slate-600">
                {text.resultadoPara}:{" "}
                <span className="font-extrabold text-blue-700">
                  “{buscar}”
                </span>
              </p>
            </div>
          )}
        </div>

        {/* SERVICIOS */}

        {serviciosFiltrados.length > 0 ? (
          <div
            className={`mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 ${
              serviciosFiltrados.length === 1
                ? "mx-auto max-w-md"
                : "lg:grid-cols-4"
            }`}
          >
            {serviciosFiltrados.map(
              (servicio) => (
                <button
                  key={servicio.trade}
                  type="button"
                  onClick={() =>
                    verProfesionales(
                      servicio.trade
                    )
                  }
                  className="group rounded-3xl border border-slate-200 bg-white p-6 text-left shadow-md transition hover:-translate-y-1 hover:border-blue-300 hover:shadow-xl"
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-3xl">
                    {servicio.icono}
                  </div>

                  <h2 className="mt-5 text-xl font-extrabold text-slate-900 group-hover:text-blue-700">
                    {servicio.nombre}
                  </h2>

                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {servicio.descripcion}
                  </p>

                  <div className="mt-5 font-bold text-blue-700">
                    {text.verProfesionales} →
                  </div>
                </button>
              )
            )}
          </div>
        ) : (
          <div className="mx-auto mt-10 max-w-2xl rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-md">
            <div className="text-4xl">
              🔎
            </div>

            <h2 className="mt-4 text-xl font-extrabold text-slate-900">
              {text.sinResultados}
            </h2>

            <button
              type="button"
              onClick={verTodos}
              className="mt-6 rounded-xl bg-blue-700 px-6 py-3 font-extrabold text-white transition hover:bg-blue-800"
            >
              {text.verTodos}
            </button>
          </div>
        )}

        {/* CTA */}

        <div className="mt-12 rounded-3xl bg-blue-700 p-8 text-center text-white md:p-10">
          <h2 className="text-2xl font-extrabold md:text-3xl">
            {text.noEncuentras}
          </h2>

          <p className="mx-auto mt-3 max-w-2xl text-blue-100">
            {text.noEncuentrasDescripcion}
          </p>

          <button
            type="button"
            onClick={() =>
              router.push("/solicitar-trabajo")
            }
            className="mt-6 rounded-xl bg-white px-7 py-3.5 font-extrabold text-blue-700 transition hover:bg-blue-50"
          >
            {text.solicitarTrabajo}
          </button>
        </div>

      </div>
    </main>
  );
}

export default function Servicios() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-100 px-4 py-12">
          <div className="mx-auto max-w-7xl text-center">
            <div className="text-3xl font-black text-blue-700">
              RELYDO
            </div>
          </div>
        </main>
      }
    >
      <ServiciosContenido />
    </Suspense>
  );
}