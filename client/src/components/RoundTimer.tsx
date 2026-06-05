import { useEffect, useState } from "react";

type RoundTimerProps = {
  deadline?: string;
  onExpire?: () => void;
};

export function RoundTimer({ deadline, onExpire }: RoundTimerProps) {
  const [remaining, setRemaining] = useState(() => msRemaining(deadline));

  useEffect(() => {
    setRemaining(msRemaining(deadline));
    if (!deadline) {
      return;
    }
    const timer = window.setInterval(() => {
      const next = msRemaining(deadline);
      setRemaining(next);
      if (next <= 0) {
        window.clearInterval(timer);
        onExpire?.();
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [deadline, onExpire]);

  const seconds = Math.max(0, Math.ceil(remaining / 1000));
  return <div className={seconds <= 5 ? "timer timer-danger" : "timer"}>{seconds}s</div>;
}

function msRemaining(deadline?: string): number {
  return deadline ? new Date(deadline).getTime() - Date.now() : 0;
}
