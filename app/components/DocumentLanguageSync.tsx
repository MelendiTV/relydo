"use client";

import { useEffect } from "react";
import { useLanguage } from "@/app/components/LanguageProvider";

export default function DocumentLanguageSync() {
  const { language } = useLanguage();

  useEffect(() => {
    document.documentElement.lang = language === "es" ? "es" : "en";
  }, [language]);

  return null;
}
