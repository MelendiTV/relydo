"use client";

import { splitLegalLinks } from "@/lib/legal-links";
import { useSyncExternalStore } from "react";
import { useLanguage } from "./LanguageProvider";
import sections from "@/lib/legal-terms.json";
import privacySections from "@/lib/legal-privacy.json";
import metadata from "@/lib/legal-metadata.json";
import type { AppLanguage } from "@/lib/language";

const subscribe = () => () => {};
const getRequestedLanguage = () => {
  const value = new URLSearchParams(window.location.search).get("lang");
  return value === "en" || value === "es" ? value : null;
};
export function useLegalLanguage(requestedLanguage?: AppLanguage) {
  const { language } = useLanguage();
  const requested = useSyncExternalStore(subscribe, getRequestedLanguage, () => null);
  return requestedLanguage ?? requested ?? language;
}

export default function LegalTerms({ language }: { language?: AppLanguage } = {}) {
  return <LegalSections sections={sections} language={language} />;
}

export function LegalPrivacy({ language }: { language?: AppLanguage } = {}) {
  return <LegalSections sections={privacySections} language={language} />;
}

function LegalSections({ sections, language: requestedLanguage }: {
  language?: AppLanguage;
  sections: { number: number; title: { en: string; es: string }; en: string; es: string }[];
}) {
  const language = useLegalLanguage(requestedLanguage);
  return <div className="mt-8 space-y-6 text-sm leading-7 text-slate-700" lang={language}>
    <p>{language === "es" ? "Versión" : "Version"} {metadata.version} · {language === "es" ? "Fecha de vigencia" : "Effective date"}: {metadata.effectiveDate}</p>
    {sections.map(section => <section key={section.number} id={`section-${section.number}`}>
      <h2 className="font-black text-slate-950">{section.number}. {renderLegalText(section.title[language])}</h2>
      <p className="whitespace-pre-line">{renderLegalText(section[language])}</p>
    </section>)}
  </div>;
}

function renderLegalText(text: string) {
  return splitLegalLinks(text).map((part, index) => part.href
    ? <a key={index} href={part.href} className="text-[#2563EB] focus-visible:outline-2 focus-visible:outline-offset-2">{part.text}</a>
    : part.text);
}