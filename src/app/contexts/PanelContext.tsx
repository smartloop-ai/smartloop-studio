import { createContext, useContext, useMemo, useState, ReactNode } from 'react';

// Which of the two side panels are expanded right now. The chat view reads this
// to decide how much room it can spend on itself: with both rails collapsed an
// empty conversation centres its composer in the window, but once a panel is
// open the window is already carrying something else and the centred layout
// reads as a third column of empty space. Owned here rather than passed down
// because the two flags are set in different places — the left one in
// AppLayout, the right one inside RightSidebar — and read in a third.
export interface PanelState {
  leftOpen: boolean;
  rightOpen: boolean;
  // Either panel expanded. What consumers almost always want.
  anyPanelOpen: boolean;
  // Reported by RightSidebar, which owns its own open section.
  setRightOpen: (open: boolean) => void;
}

const DEFAULT_STATE: PanelState = {
  leftOpen: false,
  rightOpen: false,
  anyPanelOpen: false,
  setRightOpen: () => {},
};

const PanelContext = createContext<PanelState>(DEFAULT_STATE);

export function PanelProvider({ leftOpen, children }: { leftOpen: boolean; children: ReactNode }) {
  const [rightOpen, setRightOpen] = useState(false);

  const value = useMemo<PanelState>(() => ({
    leftOpen,
    rightOpen,
    anyPanelOpen: leftOpen || rightOpen,
    setRightOpen,
  }), [leftOpen, rightOpen]);

  return (
    <PanelContext.Provider value={value}>
      {children}
    </PanelContext.Provider>
  );
}

export function usePanels(): PanelState {
  return useContext(PanelContext);
}
