import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { supabase } from "./lib/supabase";
import { AuthPage } from "./pages/AuthPage";
import { HostPage } from "./pages/HostPage";
import { PlayPage } from "./pages/PlayPage";

function AppRoutes() {
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState("player@drift.local");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (cancelled) return;
        if (data.session?.access_token) {
          setToken(data.session.access_token);
          setEmail(data.session.user.email ?? email);
        }
      })
      .catch(() => {
        /* invalid/missing Supabase config — fall through to auth screen */
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.access_token) {
        setToken(session.access_token);
        setEmail(session.user.email ?? email);
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [email]);

  if (!ready) {
    return (
      <div className="page">
        <p className="muted">Loading DRIFT…</p>
      </div>
    );
  }

  if (!token) {
    return (
      <AuthPage
        onAuthed={(t, em) => {
          setToken(t);
          setEmail(em);
        }}
      />
    );
  }

  return (
    <Routes>
      <Route path="/play" element={<PlayPage accessToken={token} email={email} />} />
      <Route path="/host" element={<HostPage accessToken={token} email={email} />} />
      <Route path="/" element={<Navigate to="/host" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
