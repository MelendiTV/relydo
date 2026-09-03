"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { supabase } from "@/app/lib/supabaseBrowser";

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

export function LanguageProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [language, setLanguage] =
    useState<AppLanguage>("en");

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    let active = true;

    async function loadLanguage() {
      const browserLanguage = getBrowserLanguage();

      if (active) {
        setLanguage(browserLanguage);
      }

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          return;
        }

        const { error: updateError } = await supabase
          .from("profiles")
          .update({
            preferred_language: browserLanguage,
          })
          .eq("id", user.id);

        if (updateError) {
          console.warn(
            "Could not save detected browser language:",
            updateError.message
          );
        }
      } catch (error) {
        console.warn(
          "Could not save detected browser language:",
          error
        );
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
        .update({
          preferred_language: nextLanguage,
        })
        .eq("id", user.id);

      if (updateError) {
        throw updateError;
      }
    } catch (error) {
      console.warn(
        "Could not update preferred language:",
        error
      );
      throw error;
    }
  }

  return (
    <LanguageContext.Provider
      value={{
        language,
        setLanguage: updateLanguage,
      }}
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
