import type { ReactNode } from "react";
import { PageActions } from "./PageActions";

type Props = {
  children: ReactNode;
  onHome: () => void;
  onNewGame?: () => void;
  newGameDisabled?: boolean;
};

export function GamePageShell({
  children,
  onHome,
  onNewGame,
  newGameDisabled,
}: Props) {
  return (
    <div className="page">
      <button type="button" className="home-link" onClick={onHome}>
        ← Back to home
      </button>
      {children}
      <PageActions
        onHome={onHome}
        onNewGame={onNewGame}
        newGameDisabled={newGameDisabled}
      />
    </div>
  );
}
