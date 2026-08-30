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

    async function detectAndPersistLanguage() {
      const detectedLanguage =
        getBrowserLanguage();

      if (active) {
        setLanguage(detectedLanguage);
      }

      try {
        const {
          data: {
            user,
          },
          error:
            userError,
        } =
          await supabase.auth.getUser();

        if (
          userError ||
          !user
        ) {
          return;
        }

        const {
          error:
            updateError,
        } =
          await supabase
            .from("profiles")
            .update({
              preferred_language:
                detectedLanguage,
            })
            .eq(
              "id",
              user.id
            );

        if (updateError) {
          console.warn(
            "Could not save preferred language:",
            updateError.message
          );
        }
      } catch (error) {
        console.warn(
          "Could not persist preferred language:",
          error
        );
      }
    }

    detectAndPersistLanguage();

    return () => {
      active = false;
    };
  }, []);

  return (
    <LanguageContext.Provider value={{ language }}>
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
