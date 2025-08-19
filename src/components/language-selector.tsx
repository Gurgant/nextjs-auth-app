"use client";

import { useState, useRef, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { isValidLocale, type Locale } from "@/config/i18n";

export function LanguageSelector({ locale }: { locale: Locale }) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("Common");
  const tLanguages = useTranslations("Languages");
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Enterprise-grade language configuration with translations
  const languages = {
    en: {
      code: "EN",
      name: tLanguages("en.name"),
      nativeName: tLanguages("en.nativeName"),
      region: tLanguages("en.region"),
    },
    es: {
      code: "ES",
      name: tLanguages("es.name"),
      nativeName: tLanguages("es.nativeName"),
      region: tLanguages("es.region"),
    },
    fr: {
      code: "FR",
      name: tLanguages("fr.name"),
      nativeName: tLanguages("fr.nativeName"),
      region: tLanguages("fr.region"),
    },
    it: {
      code: "IT",
      name: tLanguages("it.name"),
      nativeName: tLanguages("it.nativeName"),
      region: tLanguages("it.region"),
    },
    de: {
      code: "DE",
      name: tLanguages("de.name"),
      nativeName: tLanguages("de.nativeName"),
      region: tLanguages("de.region"),
    },
  };

  const handleLanguageChange = (newLocale: string) => {
    // Validate the new locale before using it
    if (!isValidLocale(newLocale)) {
      console.error('[Security] Invalid locale selected:', newLocale);
      return;
    }
    
    // Extract the path after the locale
    const segments = pathname.split("/");
    const pathAfterLocale = segments.slice(2).join("/");
    
    // Construct the new path with validated locale
    const newPath = `/${newLocale}${pathAfterLocale ? `/${pathAfterLocale}` : ''}`;
    router.push(newPath as any);
    setIsOpen(false);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close dropdown on Escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, []);

  const currentLanguage = languages[locale as keyof typeof languages];

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 bg-white/80 backdrop-blur-sm border border-gray-200/50 rounded-xl px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 cursor-pointer hover:bg-white"
        aria-label={`Current language: ${currentLanguage?.nativeName}. Click to change language.`}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        {/* Language Icon */}
        <div className="flex items-center justify-center w-5 h-5 bg-gradient-to-r from-blue-500 to-purple-600 rounded text-white text-xs font-bold">
          {currentLanguage?.code}
        </div>

        {/* Language Name */}
        <span className="hidden sm:inline">{currentLanguage?.nativeName}</span>

        {/* Chevron Icon */}
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-white/95 backdrop-blur-md border border-gray-200/50 rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="py-2">
            <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100">
              {t("selectLanguage")}
            </div>

            {Object.entries(languages).map(([code, lang]) => {
              const isActive = code === locale;

              return (
                <button
                  key={code}
                  onClick={() => handleLanguageChange(code)}
                  className={`w-full flex items-center space-x-3 px-4 py-3 text-left hover:bg-blue-50 transition-colors duration-150 ${
                    isActive ? "bg-blue-50 border-r-2 border-blue-500" : ""
                  }`}
                  role="option"
                  aria-selected={isActive}
                >
                  {/* Language Code Badge */}
                  <div
                    className={`flex items-center justify-center w-8 h-8 rounded-lg text-xs font-bold text-white ${
                      isActive
                        ? "bg-gradient-to-r from-blue-500 to-purple-600"
                        : "bg-gradient-to-r from-gray-400 to-gray-500"
                    }`}
                  >
                    {lang.code}
                  </div>

                  {/* Language Details */}
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span
                        className={`font-medium ${isActive ? "text-blue-900" : "text-gray-900"}`}
                      >
                        {lang.nativeName}
                      </span>
                      {isActive && (
                        <svg
                          className="w-4 h-4 text-blue-500"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      )}
                    </div>
                    <span className="text-xs text-gray-500">
                      {lang.name} • {lang.region}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 bg-gray-50/50 border-t border-gray-100">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>{t("languageSettings")}</span>
              <div className="flex items-center space-x-1">
                <svg
                  className="w-3 h-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span>
                  {t("languagesCount", {
                    count: Object.keys(languages).length,
                  })}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
