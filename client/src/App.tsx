import { HostPage } from "./pages/HostPage";
import { PlayPage } from "./pages/PlayPage";

export function App() {
  const path = window.location.pathname;

  if (path.startsWith("/host")) {
    return <HostPage />;
  }

  return <PlayPage />;
}
