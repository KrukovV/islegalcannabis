type PaidAccessContext = {
  searchParams?: { paid?: string };
  cookieHeader?: string | null;
};

export const FEATURES = {
  paidExtras: process.env.FEATURES_PAID === "1"
};

export function hasPaidAccess(ctx: PaidAccessContext = {}): boolean {
  const cookie = ctx.cookieHeader ?? "";
  const cookieHasPaid = cookie
    .split(";")
    .some((part) => part.trim() === "ilc_paid=1");
  const paidParam = ctx.searchParams?.paid;

  if (paidParam === "0") return false;
  if (paidParam === "1") return true;

  if (process.env.NODE_ENV === "production") {
    return cookieHasPaid;
  }

  return cookieHasPaid;
}
