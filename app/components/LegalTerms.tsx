"use client";

import { useSyncExternalStore } from "react";
import { useLanguage } from "./LanguageProvider";
import sections from "@/lib/legal-terms.json";
import privacySections from "@/lib/legal-privacy.json";
import metadata from "@/lib/legal-metadata.json";

const subscribe = () => () => {};
const getRequestedLanguage = () => {
  const value = new URLSearchParams(window.location.search).get("lang");
  return value === "en" || value === "es" ? value : null;
};
export function useLegalLanguage() {
  const { language } = useLanguage();
  const requested = useSyncExternalStore(subscribe, getRequestedLanguage, () => null);
  return requested ?? language;
}

export default function LegalTerms() {
  return <LegalSections sections={sections} />;
}

export function LegalPrivacy() {
  return <LegalSections sections={privacySections} />;
}

function LegalSections({ sections }: {
  sections: { number: number; title: { en: string; es: string }; en: string; es: string }[];
}) {
  const language = useLegalLanguage();
  return <div className="mt-8 space-y-6 text-sm leading-7 text-slate-700" lang={language}>
    <p>{language === "es" ? "Versión" : "Version"} {metadata.version} · {language === "es" ? "Fecha de vigencia" : "Effective date"}: {metadata.effectiveDate}</p>
    {sections.map(section => <section key={section.number} id={`section-${section.number}`}>
      <h2 className="font-black text-slate-950">{section.number}. {section.title[language]}</h2>
      <p className="whitespace-pre-line">{section[language]}</p>
    </section>)}
  </div>;
}
