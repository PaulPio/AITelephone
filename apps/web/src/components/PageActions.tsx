type Props = {
  onHome: () => void;
  onNewGame?: () => void;
  newGameLabel?: string;
  newGameDisabled?: boolean;
  homeLabel?: string;
};

export function PageActions({
  onHome,
  onNewGame,
  newGameLabel = "Start new game",
  newGameDisabled = false,
  homeLabel = "Back to home",
}: Props) {
  return (
    <div className="page-actions">
      {onNewGame && (
        <button
          type="button"
          className="btn"
          style={{ flex: 1 }}
          disabled={newGameDisabled}
          onClick={() => void onNewGame()}
        >
          {newGameLabel}
        </button>
      )}
      <button
        type="button"
        className="btn btn-secondary"
        style={{ flex: 1 }}
        onClick={onHome}
      >
        {homeLabel}
      </button>
    </div>
  );
}
