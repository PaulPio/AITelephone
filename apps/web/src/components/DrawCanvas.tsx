import { useCallback, useEffect, useRef } from "react";

type Point = { x: number; y: number };

type Props = {
  onExport: (blob: Blob) => void;
  exportTrigger: number;
};

export function DrawCanvas({ onExport, exportTrigger }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Point[][]>([]);
  const currentStroke = useRef<Point[]>([]);
  const drawing = useRef(false);
  const rafRef = useRef<number>(0);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#fffef8";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#4a4a4a";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const all = [...strokesRef.current, currentStroke.current];
    for (const stroke of all) {
      if (stroke.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(stroke[0]!.x, stroke[0]!.y);
      for (let i = 1; i < stroke.length; i++) {
        ctx.lineTo(stroke[i]!.x, stroke[i]!.y);
      }
      ctx.stroke();
    }
  }, []);

  const scheduleRedraw = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(redraw);
  }, [redraw]);

  const getPoint = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawing.current = true;
    currentStroke.current = [getPoint(e)];
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    scheduleRedraw();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    currentStroke.current.push(getPoint(e));
    scheduleRedraw();
  };

  const onPointerUp = () => {
    if (!drawing.current) return;
    drawing.current = false;
    if (currentStroke.current.length > 0) {
      strokesRef.current.push([...currentStroke.current]);
    }
    currentStroke.current = [];
    scheduleRedraw();
  };

  const clear = () => {
    strokesRef.current = [];
    currentStroke.current = [];
    scheduleRedraw();
  };

  const undo = () => {
    strokesRef.current.pop();
    scheduleRedraw();
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const size = Math.min(512, window.innerWidth - 48);
    canvas.width = size;
    canvas.height = size;
    redraw();
  }, [redraw]);

  useEffect(() => {
    if (exportTrigger === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob(
      (blob) => {
        if (blob) onExport(blob);
      },
      "image/png",
      0.92
    );
  }, [exportTrigger, onExport]);

  return (
    <div>
      <canvas
        ref={canvasRef}
        style={{
          width: "100%",
          aspectRatio: "1",
          touchAction: "none",
          border: "3px solid var(--ink)",
          background: "#fffef8",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      />
      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
        <button type="button" className="btn btn-secondary" onClick={undo}>
          Undo
        </button>
        <button type="button" className="btn btn-secondary" onClick={clear}>
          Clear
        </button>
      </div>
    </div>
  );
}
