import { useCallback, useState } from "react";
import { toast } from "sonner";
import { startLogin } from "@/const";
import { copy, useLocale } from "@/lib/locale";
import { isPaddleAvailable, openCheckout } from "@/lib/paddle";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

/** Remembers what the visitor wanted to buy across the sign-in redirect. */
const PENDING_KEY = "reel-listing-pending-checkout";

export type CheckoutTarget = { planId: string } | { packId: string };

export function readPendingCheckout(): CheckoutTarget | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(PENDING_KEY);
    const parsed = JSON.parse(raw);
    if (parsed && (typeof parsed.planId === "string" || typeof parsed.packId === "string")) return parsed;
  } catch {
    // Private browsing, or a value another tab mangled. Losing the intent just means the
    // visitor picks their plan again -- never worth throwing over.
  }
  return null;
}

/**
 * Opens Paddle's overlay for a plan or pack.
 *
 * A signed-out visitor is sent to sign in first, with their choice stashed so they land
 * back on checkout instead of losing it. The server call does the real work: it makes sure
 * a Paddle customer exists and records its id *before* the overlay opens, so the webhook
 * can find the account even if customData does not survive the round trip.
 */
export function useCheckout() {
  const { user } = useAuth();
  const { locale } = useLocale();
  const t = copy[locale].billing;
  const [pendingId, setPendingId] = useState<string | null>(null);
  const startCheckout = trpc.billing.startCheckout.useMutation();

  const checkout = useCallback(
    async (target: CheckoutTarget) => {
      const id = "planId" in target ? target.planId : target.packId;

      if (!user) {
        try {
          sessionStorage.setItem(PENDING_KEY, JSON.stringify(target));
        } catch {
          // Non-fatal: they will just re-pick after signing in.
        }
        startLogin();
        return;
      }

      if (!isPaddleAvailable()) {
        toast.error(t.checkoutFailed);
        return;
      }

      setPendingId(id);
      try {
        const session = await startCheckout.mutateAsync(target);
        await openCheckout({
          priceId: session.priceId,
          customerId: session.customerId,
          customData: session.customData,
          email: user.email,
          locale,
        });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t.checkoutFailed);
      } finally {
        setPendingId(null);
      }
    },
    [locale, startCheckout, t.checkoutFailed, user],
  );

  return { checkout, pendingId, isPending: pendingId !== null };
}
