export function normalizeReferralCode(value: string | null): string {
  return (value ?? "").trim().toUpperCase();
}

export function customerReferralLink(code: string, origin = "https://relydo.co"): string {
  const url = new URL(origin);
  const staging = url.hostname === "relydo-staging.vercel.app" || url.hostname === "localhost" || url.hostname === "127.0.0.1";
  return `${staging ? url.origin : "https://relydo.co"}/registro-cliente?ref=${encodeURIComponent(normalizeReferralCode(code))}`;
}

export function customerReferralMessage(es: boolean): string {
  return es
    ? "Te invito a RELYDO. Regístrate con mi enlace y ambos recibimos $15 en crédito cuando completes tu primer trabajo válido y se libere el pago al profesional."
    : "Join me on RELYDO. Sign up with my link and we both receive $15 in credit when you complete your first qualifying job and payment is released to the professional.";
}

export type CustomerReferralSummary = {
  code: string;
  availableCents: number;
  referred: boolean;
  awarded: boolean;
  registered: number;
  pending: number;
  rewarded: number;
};
