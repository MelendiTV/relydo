export type AdminRole =
  | "super_admin"
  | "claims_manager"
  | "finance_manager"
  | "provider_manager"
  | "support_agent"
  | "operations_manager";

export type AdminPermission =
  | "admin_home"
  | "claims"
  | "orders"
  | "finance"
  | "financial_settings"
  | "users"
  | "providers"
  | "alerts"
  | "activity";

export const ADMIN_ROLES: AdminRole[] = [
  "super_admin",
  "claims_manager",
  "finance_manager",
  "provider_manager",
  "support_agent",
  "operations_manager",
];

const ROLE_PERMISSIONS: Record<
  AdminRole,
  AdminPermission[]
> = {
  super_admin: [
    "admin_home",
    "claims",
    "orders",
    "finance",
    "financial_settings",
    "users",
    "providers",
    "alerts",
    "activity",
  ],

  claims_manager: [
    "admin_home",
    "claims",
  ],

  finance_manager: [
    "admin_home",
    "finance",
    "financial_settings",
  ],

  provider_manager: [
    "admin_home",
    "providers",
  ],

  support_agent: [
    "admin_home",
    "users",
    "orders",
  ],

  operations_manager: [
    "admin_home",
    "orders",
    "providers",
    "alerts",
    "activity",
  ],
};

export function isAdminRole(
  value: unknown
): value is AdminRole {
  return (
    typeof value === "string" &&
    ADMIN_ROLES.includes(
      value as AdminRole
    )
  );
}

export function hasAdminPermission(
  role: AdminRole,
  permission: AdminPermission
) {
  return ROLE_PERMISSIONS[
    role
  ].includes(permission);
}

/*
  IMPORTANTE:
  Todos los empleados administrativos entran primero
  al Home Admin.

  El Home muestra únicamente las áreas autorizadas
  para su admin_role.

  Esto evita ciclos de redirección entre /admin
  y una sección interna.
*/
export function defaultAdminRoute(
  _role: AdminRole
) {
  return "/admin";
}

export function permissionForAdminPath(
  pathname: string
): AdminPermission | null {
  if (
    pathname === "/admin" ||
    pathname === "/admin/"
  ) {
    return "admin_home";
  }

  if (
    pathname.startsWith(
      "/admin/reclamos"
    )
  ) {
    return "claims";
  }

  if (
    pathname.startsWith(
      "/admin/ordenes"
    )
  ) {
    return "orders";
  }

  if (
    pathname.startsWith(
      "/admin/configuracion-financiera"
    )
  ) {
    return "financial_settings";
  }

  if (
    pathname.startsWith(
      "/admin/finanzas"
    )
  ) {
    return "finance";
  }

  if (
    pathname.startsWith(
      "/admin/usuarios"
    )
  ) {
    return "users";
  }

  if (
    pathname.startsWith(
      "/admin/operaciones"
    )
  ) {
    return "providers";
  }

  if (
    pathname.startsWith(
      "/admin/alertas"
    )
  ) {
    return "alerts";
  }

  if (
    pathname.startsWith(
      "/admin/actividad"
    )
  ) {
    return "activity";
  }

  return null;
}

export function adminRoleLabel(
  role: AdminRole,
  language: "es" | "en"
) {
  const labels: Record<
    AdminRole,
    {
      es: string;
      en: string;
    }
  > = {
    super_admin: {
      es: "Superadministrador",
      en: "Super Admin",
    },

    claims_manager: {
      es: "Responsable de reclamos",
      en: "Claims Manager",
    },

    finance_manager: {
      es: "Responsable de finanzas",
      en: "Finance Manager",
    },

    provider_manager: {
      es: "Responsable de profesionales",
      en: "Provider Manager",
    },

    support_agent: {
      es: "Agente de soporte",
      en: "Support Agent",
    },

    operations_manager: {
      es: "Responsable de operaciones",
      en: "Operations Manager",
    },
  };

  return labels[role][language];
}