"use client";

import { createContext, ReactNode, useContext, useMemo, useState } from "react";
import { Locale } from "@/lib/types";

interface I18nContextValue {
  locale: Locale;
  setLocale: (nextLocale: Locale) => void;
  t: Dictionary;
}

type Dictionary = Record<string, string>;

const dictionaries = {
  en: {
    appName: "Brasaland Talent Desk",
    appSubtitle: "Internal hiring operations for Brasaland Digital",
    dashboardTitle: "Candidate pipeline",
    dashboardSubtitle:
      "Track applicants across stages, document interviews, and keep records accurate.",
    noOrdersMessage:
      "Want to place an order? Call your favorite location or visit us directly. Online ordering coming soon!",
    addCandidate: "Register candidate",
    listSectionTitle: "All candidates",
    status: "Status",
    stage: "Stage",
    position: "Position",
    name: "Name",
    email: "Email",
    actions: "Actions",
    viewDetails: "Open detail",
    editData: "Correct data",
    searchPlaceholder: "Search by name or email",
    clearFilters: "Clear filters",
    loading: "Loading...",
    errorTitle: "Something went wrong",
    emptyCandidates: "No candidates found with the current filters.",
    backToList: "Back to pipeline",
    detailTitle: "Candidate detail",
    candidateInformation: "Candidate information",
    updateStatusStage: "Update status and stage",
    saveChanges: "Save changes",
    saving: "Saving...",
    notesTitle: "Internal notes",
    notesHint: "Use notes after each call or interview. Notes are only visible in this detail view.",
    addNoteLabel: "Add note",
    addNotePlaceholder: "Write a summary of the call or interview",
    addNoteAction: "Add note",
    deleting: "Deleting...",
    deleteAction: "Delete",
    noteAdded: "Note added.",
    noteDeleted: "Note deleted.",
    formCreateTitle: "Register new candidate",
    formEditTitle: "Correct candidate data",
    formHelp:
      "Use this form for applications received by external channels and data corrections.",
    fullName: "Full name",
    phone: "Phone",
    linkedinUrl: "LinkedIn URL",
    cvUrl: "CV URL",
    experienceYears: "Years of experience",
    submitCreate: "Create candidate",
    submitEdit: "Save corrected data",
    submitting: "Submitting...",
    required: "Required",
    optional: "Optional",
    cancel: "Cancel",
    saveSuccess: "Changes saved successfully.",
    createSuccess: "Candidate registered successfully.",
    fieldRequired: "This field is required",
    fullNameError: "Enter full name with at least first and last name",
    emailError: "Enter a valid email address",
    phoneError: "Phone must include country code (example: +57 300 123 4567)",
    yearsError: "Experience years must be zero or greater",
    urlError: "Enter a valid URL",
    languageToggle: "Language",
    notesEmpty: "No notes yet for this candidate.",
    updatedAt: "Last update",
    appliedAt: "Applied at",
    notesCount: "Notes",
    unknownError: "Unexpected error. Please try again.",
    openRecord: "Open",
  },
  es: {
    appName: "Brasaland Talent Desk",
    appSubtitle: "Operacion interna de reclutamiento para Brasaland Digital",
    dashboardTitle: "Pipeline de candidatos",
    dashboardSubtitle:
      "Sigue postulaciones por etapa, documenta entrevistas y mantiene datos correctos.",
    noOrdersMessage:
      "Want to place an order? Call your favorite location or visit us directly. Online ordering coming soon!",
    addCandidate: "Registrar candidato",
    listSectionTitle: "Todos los candidatos",
    status: "Estado",
    stage: "Etapa",
    position: "Posicion",
    name: "Nombre",
    email: "Correo",
    actions: "Acciones",
    viewDetails: "Abrir detalle",
    editData: "Corregir datos",
    searchPlaceholder: "Buscar por nombre o correo",
    clearFilters: "Limpiar filtros",
    loading: "Cargando...",
    errorTitle: "Ocurrio un error",
    emptyCandidates: "No hay candidatos con los filtros actuales.",
    backToList: "Volver al pipeline",
    detailTitle: "Detalle del candidato",
    candidateInformation: "Informacion del candidato",
    updateStatusStage: "Actualizar estado y etapa",
    saveChanges: "Guardar cambios",
    saving: "Guardando...",
    notesTitle: "Notas internas",
    notesHint:
      "Usa notas despues de cada llamada o entrevista. Las notas solo son visibles en este detalle.",
    addNoteLabel: "Agregar nota",
    addNotePlaceholder: "Escribe un resumen de la llamada o entrevista",
    addNoteAction: "Agregar nota",
    deleting: "Eliminando...",
    deleteAction: "Eliminar",
    noteAdded: "Nota agregada.",
    noteDeleted: "Nota eliminada.",
    formCreateTitle: "Registrar nuevo candidato",
    formEditTitle: "Corregir datos del candidato",
    formHelp:
      "Usa este formulario para postulaciones de otros canales y para corregir informacion.",
    fullName: "Nombre completo",
    phone: "Telefono",
    linkedinUrl: "URL de LinkedIn",
    cvUrl: "URL de CV",
    experienceYears: "Anos de experiencia",
    submitCreate: "Crear candidato",
    submitEdit: "Guardar correcciones",
    submitting: "Enviando...",
    required: "Obligatorio",
    optional: "Opcional",
    cancel: "Cancelar",
    saveSuccess: "Cambios guardados correctamente.",
    createSuccess: "Candidato registrado correctamente.",
    fieldRequired: "Este campo es obligatorio",
    fullNameError: "Ingresa nombre y apellido",
    emailError: "Ingresa un correo valido",
    phoneError: "El telefono debe incluir codigo de pais (ejemplo: +57 300 123 4567)",
    yearsError: "Los anos de experiencia deben ser cero o mayores",
    urlError: "Ingresa una URL valida",
    languageToggle: "Idioma",
    notesEmpty: "Aun no hay notas para este candidato.",
    updatedAt: "Ultima actualizacion",
    appliedAt: "Fecha de postulacion",
    notesCount: "Notas",
    unknownError: "Error inesperado. Intenta de nuevo.",
    openRecord: "Abrir",
  },
} as const;

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    if (typeof window === "undefined") {
      return "es";
    }
    const stored = window.localStorage.getItem("brasaland-locale");
    if (stored === "es" || stored === "en") {
      return stored;
    }
    return "es";
  });

  const setLocale = (nextLocale: Locale) => {
    setLocaleState(nextLocale);
    window.localStorage.setItem("brasaland-locale", nextLocale);
  };

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      t: dictionaries[locale],
    }),
    [locale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used inside I18nProvider");
  }
  return context;
}
