import { useState } from "react";
import { getOrCreateDemoToken, loadDemoSession } from "../lib/demoSession";
import { demoAuthBypass, supabase } from "../lib/supabase";

type Props = {
  onAuthed: (token: string, email: string) => void;
};

export function AuthPage({ onAuthed }: Props) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const sendMagicLink = async () => {
    setLoading(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin + window.location.pathname,
      },
    });
    setLoading(false);
    if (err) setError(err.message);
    else setSent(true);
  };

  const demoLogin = () => {
    const token = getOrCreateDemoToken();
    const cached = loadDemoSession();
    onAuthed(token, cached?.email ?? "demo@drift.local");
  };

  return (
    <div className="page">
      <h1>DRIFT</h1>
      <p className="muted">Sign in to draw. Broken telephone, refereed by AI.</p>

      <div className="card" style={{ marginTop: "1.5rem" }}>
        {sent ? (
          <p>Check your email for the magic link, then return here.</p>
        ) : (
          <>
            <label className="label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
            <button
              type="button"
              className="btn"
              style={{ marginTop: "1rem", width: "100%" }}
              disabled={loading || !email}
              onClick={() => void sendMagicLink()}
            >
              {loading ? "Sending…" : "Send magic link"}
            </button>
          </>
        )}
        {error && <p style={{ color: "crimson" }}>{error}</p>}
      </div>

      {demoAuthBypass && (
        <button
          type="button"
          className="btn btn-secondary"
          style={{ marginTop: "1rem", width: "100%" }}
          onClick={demoLogin}
        >
          Demo login (no email)
        </button>
      )}
    </div>
  );
}
