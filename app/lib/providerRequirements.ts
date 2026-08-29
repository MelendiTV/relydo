export type RequirementLevel =
  | "required"
  | "conditional"
  | "not_required"
  | "manual_review";

export type ProviderRequirementInput = {
  trade: string | null | undefined;
  state: string | null | undefined;
  declaredLicenseRequired?: boolean | null;
  declaredInsured?: boolean | null;
  declaredBonded?: boolean | null;
};

export type ProviderRequirementResult = {
  jurisdiction: string;
  license: RequirementLevel;
  insurance: RequirementLevel;
  bond: RequirementLevel;
  effectiveLicenseRequired: boolean;
  effectiveInsuranceRequired: boolean;
  effectiveBondRequired: boolean;
  manualReview: boolean;
  notesEs: string[];
  notesEn: string[];
};

/*
  RELYDO — motor inicial de requisitos profesionales.

  IMPORTANTE:
  - Esta matriz NO sustituye asesoría legal ni una consulta oficial.
  - La primera jurisdicción automatizada es Nevada.
  - Nevada tiene una exención limitada para ciertos trabajos de reparación/
    mantenimiento de menos de $1,000, pero NO cubre plomería, electricidad,
    refrigeración, calefacción ni aire acondicionado, entre otras excepciones.
  - Cada licencia de contratista de Nevada requiere un license bond/cash deposit.
  - "insured" en RELYDO no se interpreta automáticamente como Workers'
    Compensation.
*/

const normalize = (
  value: string | null | undefined
) => String(value || "").trim().toLowerCase();

export function getProviderRequirements(
  input: ProviderRequirementInput
): ProviderRequirementResult {
  const trade = normalize(input.trade);
  const state = normalize(input.state);

  const declaredLicense =
    input.declaredLicenseRequired === true;

  const declaredInsurance =
    input.declaredInsured === true;

  const declaredBond =
    input.declaredBonded === true;

  /*
    ESTADOS QUE TODAVÍA NO TIENEN MATRIZ
  */

  if (
    state !== "nv" &&
    state !== "nevada"
  ) {
    return {
      jurisdiction:
        state
          ? state.toUpperCase()
          : "UNKNOWN",

      license: "manual_review",

      insurance:
        declaredInsurance
          ? "required"
          : "manual_review",

      bond:
        declaredBond
          ? "required"
          : "manual_review",

      effectiveLicenseRequired:
        declaredLicense,

      effectiveInsuranceRequired:
        declaredInsurance,

      effectiveBondRequired:
        declaredBond,

      manualReview: true,

      notesEs: [
        "RELYDO todavía no tiene una matriz legal automática para este estado.",
        "Se mantienen las declaraciones del profesional y el expediente requiere revisión administrativa.",
      ],

      notesEn: [
        "RELYDO does not yet have an automated legal requirements matrix for this state.",
        "The professional's declarations are preserved and the file requires administrative review.",
      ],
    };
  }

  /*
    NEVADA — LICENCIA OBLIGATORIA
  */

  const alwaysLicensedNevada =
    new Set<string>([
      "plumbing",
      "electrical",
      "hvac",
    ]);

  /*
    NEVADA — LICENCIA CONDICIONAL
  */

  const conditionalContractorNevada =
    new Set<string>([
      "carpentry",
      "painting",
      "landscaping",
    ]);

  /*
    RENTA DE AIRE ACONDICIONADO
  */

  if (trade === "ac_rental") {
    return {
      jurisdiction: "NV",

      license: "conditional",

      insurance:
        declaredInsurance
          ? "required"
          : "not_required",

      bond:
        declaredBond
          ? "required"
          : "conditional",

      effectiveLicenseRequired:
        declaredLicense,

      effectiveInsuranceRequired:
        declaredInsurance,

      effectiveBondRequired:
        declaredLicense ||
        declaredBond,

      manualReview: true,

      notesEs: [
        "La renta pura de equipos no se trata automáticamente como trabajo HVAC.",
        "Si incluye instalación, reparación, refrigeración, calefacción o aire acondicionado, debe revisarse como HVAC.",
        "Si opera bajo licencia de contratista de Nevada, RELYDO exige verificar también el bond de esa licencia.",
      ],

      notesEn: [
        "Equipment rental alone is not automatically treated as HVAC contracting work.",
        "If it includes installation, repair, refrigeration, heating, or air-conditioning work, it must be reviewed as HVAC.",
        "If operating under a Nevada contractor license, RELYDO also requires verification of that license bond.",
      ],
    };
  }

  /*
    PLOMERÍA / ELECTRICIDAD / HVAC
  */

  if (
    alwaysLicensedNevada.has(trade)
  ) {
    return {
      jurisdiction: "NV",

      license: "required",

      insurance:
        declaredInsurance
          ? "required"
          : "conditional",

      bond: "required",

      effectiveLicenseRequired: true,

      effectiveInsuranceRequired:
        declaredInsurance,

      effectiveBondRequired: true,

      manualReview: false,

      notesEs: [
        "Esta categoría no puede usar la exención de reparación o mantenimiento menor de Nevada por el tipo de trabajo.",
        "RELYDO exige licencia de contratista válida para esta categoría.",
        "Una licencia de contratista activa de Nevada requiere un license bond o depósito en efectivo aprobado por el Board.",
        "El seguro declarado por el profesional se verifica si fue declarado.",
      ],

      notesEn: [
        "This category cannot use Nevada's minor repair or maintenance exemption because of the type of work.",
        "RELYDO requires a valid contractor license for this category.",
        "An active Nevada contractor license requires a license bond or Board-approved cash deposit.",
        "Insurance declared by the professional is verified when declared.",
      ],
    };
  }

  /*
    CARPINTERÍA / PINTURA / LANDSCAPING
  */

  if (
    conditionalContractorNevada.has(
      trade
    )
  ) {
    return {
      jurisdiction: "NV",

      license: "conditional",

      insurance:
        declaredInsurance
          ? "required"
          : "not_required",

      bond:
        declaredLicense
          ? "required"
          : "conditional",

      effectiveLicenseRequired:
        declaredLicense,

      effectiveInsuranceRequired:
        declaredInsurance,

      effectiveBondRequired:
        declaredLicense ||
        declaredBond,

      manualReview:
        !declaredLicense,

      notesEs: [
        "Nevada regula esta actividad como clasificación de contratista, pero ciertos trabajos menores pueden estar exentos si cumplen todas las condiciones legales.",
        "Si el profesional declara una licencia de contratista, RELYDO exige verificarla y verificar su bond.",
        "Un profesional sin licencia en esta categoría debe quedar limitado a trabajos legalmente exentos.",
      ],

      notesEn: [
        "Nevada regulates this activity as a contractor classification, but some minor work may be exempt when every legal condition is met.",
        "If the professional declares a contractor license, RELYDO requires verification of both the license and its bond.",
        "An unlicensed professional in this category must be limited to legally exempt work.",
      ],
    };
  }

  /*
    LIMPIEZA / MUDANZAS
  */

  if (
    trade === "cleaning" ||
    trade === "moving"
  ) {
    return {
      jurisdiction: "NV",

      license: "not_required",

      insurance:
        declaredInsurance
          ? "required"
          : "not_required",

      bond:
        declaredBond
          ? "required"
          : "not_required",

      effectiveLicenseRequired:
        false,

      effectiveInsuranceRequired:
        declaredInsurance,

      effectiveBondRequired:
        declaredBond,

      manualReview: false,

      notesEs: [
        "RELYDO no impone automáticamente una licencia de contratista de Nevada para esta categoría.",
        "Otros permisos, registros o licencias comerciales que puedan aplicar se revisan por separado.",
      ],

      notesEn: [
        "RELYDO does not automatically impose a Nevada contractor license for this category.",
        "Other permits, registrations, or business licenses that may apply are reviewed separately.",
      ],
    };
  }

  /*
    OTROS / CATEGORÍAS NUEVAS
  */

  return {
    jurisdiction: "NV",

    license: "manual_review",

    insurance:
      declaredInsurance
        ? "required"
        : "manual_review",

    bond:
      declaredBond
        ? "required"
        : "manual_review",

    effectiveLicenseRequired:
      declaredLicense,

    effectiveInsuranceRequired:
      declaredInsurance,

    effectiveBondRequired:
      declaredBond,

    manualReview: true,

    notesEs: [
      "Esta categoría necesita revisión manual antes de determinar sus requisitos.",
    ],

    notesEn: [
      "This category requires manual review before its requirements can be determined.",
    ],
  };
}

export function requirementLabel(
  level: RequirementLevel,
  language: "es" | "en" = "es"
) {
  const labels = {
    required: {
      es: "Requerido",
      en: "Required",
    },

    conditional: {
      es: "Condicional",
      en: "Conditional",
    },

    not_required: {
      es: "No requerido",
      en: "Not required",
    },

    manual_review: {
      es: "Revisión manual",
      en: "Manual review",
    },
  } as const;

  return labels[level][language];
}
