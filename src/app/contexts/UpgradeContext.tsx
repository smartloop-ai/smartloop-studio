import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import type { IapProduct, UpgradeStatus } from '@/electron';
import UpgradeDialog from '@/app/components/upgrade-dialog';

/**
 * Upgrade to Pro — one flow in every build, opened from the sidebar menu and
 * from a model the plan gates. Main decides how payment happens (`method`):
 * StoreKit in the Mac App Store build, which App Review requires (3.1.1), and
 * Stripe Checkout in the DMG / Windows / Linux builds. The dialog only changes
 * its fine print and the restore button between the two.
 */
interface UpgradeContextValue {
  available: boolean;
  method: UpgradeStatus['method'];
  product: IapProduct | null;
  openUpgrade: () => void;
}

const UpgradeContext = createContext<UpgradeContextValue>({
  available: false,
  method: null,
  product: null,
  openUpgrade: () => {},
});

export function UpgradeProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<UpgradeStatus>({ available: false, method: null, product: null });
  const [open, setOpen] = useState(false);

  // One read at mount: how this build pays, and the App Store price if it's
  // the store build.
  useEffect(() => {
    window.electronAPI?.upgrade?.status().then((s) => {
      if (s) setStatus(s);
    }).catch(() => {});
  }, []);

  const openUpgrade = useCallback(() => {
    if (status.available) setOpen(true);
  }, [status.available]);

  return (
    <UpgradeContext.Provider value={{ available: status.available, method: status.method, product: status.product, openUpgrade }}>
      {children}
      {status.available && (
        <UpgradeDialog open={open} onClose={() => setOpen(false)} method={status.method} product={status.product} />
      )}
    </UpgradeContext.Provider>
  );
}

export const useUpgrade = () => useContext(UpgradeContext);
