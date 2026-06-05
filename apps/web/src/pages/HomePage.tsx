import { useNavigate } from "react-router-dom";
import { saveDemoSession } from "../lib/demoSession";

export function HomePage() {
  const navigate = useNavigate();

  const goHost = () => {
    saveDemoSession({ path: "/host" });
    navigate("/host");
  };

  const goPlay = () => {
    saveDemoSession({ path: "/play" });
    navigate("/play");
  };

  return (
    <div className="page">
      <h1>DRIFT</h1>
      <p className="muted">Broken telephone meets Pictionary — draw, pass it on, watch it drift.</p>
      <div className="card" style={{ marginTop: "1.5rem" }}>
        <button type="button" className="btn" style={{ width: "100%" }} onClick={goHost}>
          Host a game
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ marginTop: "0.75rem", width: "100%" }}
          onClick={goPlay}
        >
          Join as player
        </button>
      </div>
    </div>
  );
}
