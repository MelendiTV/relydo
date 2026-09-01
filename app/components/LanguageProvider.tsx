"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import {
  createClient,
} from "@supabase/supabase-js";

import {
  getBrowserLanguage,
  type AppLanguage,
} from "@/lib/language";

type LanguageContextType = {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => Promise<void>;
};

const LanguageContext =
  createContext<LanguageContextType | null>(null);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

export function LanguageProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [language, setLanguage] =
    useState<AppLanguage>("en");

  useEffect(() => {
    let active = true;

    async function loadLanguage() {
      const browserLanguage = getBrowserLanguage();

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          if (active) setLanguage(browserLanguage);
          return;
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("preferred_language")
          .eq("id", user.id)
          .maybeSingle();

        const savedLanguage = profile?.preferred_language;

        if (savedLanguage === "es" || savedLanguage === "en") {
          if (active) setLanguage(savedLanguage);
          return;
        }

        if (active) setLanguage(browserLanguage);

        const { error: updateError } = await supabase
          .from("profiles")
          .update({ preferred_language: browserLanguage })
          .eq("id", user.id);

        if (updateError) {
          console.warn(
            "Could not save preferred language:",
            updateError.message
          );
        }
      } catch (error) {
        if (active) setLanguage(browserLanguage);
        console.warn("Could not load preferred language:", error);
      }
    }

    loadLanguage();

    return () => {
      active = false;
    };
  }, []);

  async function updateLanguage(nextLanguage: AppLanguage) {
    setLanguage(nextLanguage);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ preferred_language: nextLanguage })
        .eq("id", user.id);

      if (updateError) {
        throw updateError;
      }
    } catch (error) {
      console.warn("Could not update preferred language:", error);
      throw error;
    }
  }

  return (
    <LanguageContext.Provider
      value={{ language, setLanguage: updateLanguage }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context =
    useContext(LanguageContext);

  if (!context) {
    throw new Error(
      "useLanguage must be used inside LanguageProvider"
    );
  }

  return context;
}
