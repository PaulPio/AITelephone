import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type PointerEvent } from "react";

export type DrawingCanvasHandle = {
  exportPng: () => Promise<Blob>;
  clear: () => void;
};

type DrawingCanvasProps = {
  disabled?: boolean;
};

export const DrawingCanvas = forwardRef<DrawingCanvasHandle, DrawingCanvasProps>(function DrawingCanvas(
  { disabled = false },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const undoStack = useRef<ImageData[]>([]);
  const isDrawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | undefined>(undefined);
  const [canUndo, setCanUndo] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) {
      return;
    }

    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.floor(rect.width * ratio);
    canvas.height = Math.floor(rect.height * ratio);
    context.scale(ratio, ratio);
    context.fillStyle = "#fbf3df";
    context.fillRect(0, 0, rect.width, rect.height);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 6;
    context.strokeStyle = "#171217";
  }, []);

  useImperativeHandle(ref, () => ({
    exportPng,
    clear
  }));

  function saveUndo() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) {
      return;
    }
    undoStack.current.push(context.getImageData(0, 0, canvas.width, canvas.height));
    undoStack.current = undoStack.current.slice(-12);
    setCanUndo(true);
  }

  function pointFor(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }

  function startDrawing(event: PointerEvent<HTMLCanvasElement>) {
    if (disabled) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    saveUndo();
    isDrawing.current = true;
    lastPoint.current = pointFor(event);
  }

  function draw(event: PointerEvent<HTMLCanvasElement>) {
    if (!isDrawing.current || disabled) {
      return;
    }
    const context = canvasRef.current?.getContext("2d");
    const from = lastPoint.current;
    const to = pointFor(event);
    if (!context || !from) {
      return;
    }
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
    lastPoint.current = to;
  }

  function stopDrawing() {
    isDrawing.current = false;
    lastPoint.current = undefined;
  }

  function undo() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    const snapshot = undoStack.current.pop();
    if (!canvas || !context || !snapshot) {
      return;
    }
    context.putImageData(snapshot, 0, 0);
    setCanUndo(undoStack.current.length > 0);
  }

  function clear() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) {
      return;
    }
    saveUndo();
    const rect = canvas.getBoundingClientRect();
    context.fillStyle = "#fbf3df";
    context.fillRect(0, 0, rect.width, rect.height);
  }

  async function exportPng(): Promise<Blob> {
    const source = canvasRef.current!;
    const target = document.createElement("canvas");
    const max = 512;
    const scale = Math.min(max / source.width, max / source.height);
    target.width = Math.round(source.width * scale);
    target.height = Math.round(source.height * scale);
    const context = target.getContext("2d")!;
    context.drawImage(source, 0, 0, target.width, target.height);
    return new Promise((resolve, reject) => {
      target.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not export drawing"))), "image/png");
    });
  }

  return (
    <div className="drawing-panel">
      <canvas
        ref={canvasRef}
        className="drawing-canvas"
        onPointerDown={startDrawing}
        onPointerMove={draw}
        onPointerUp={stopDrawing}
        onPointerCancel={stopDrawing}
      />
      <div className="canvas-tools">
        <button type="button" onClick={undo} disabled={!canUndo || disabled}>
          Undo
        </button>
        <button type="button" onClick={clear} disabled={disabled}>
          Clear
        </button>
      </div>
    </div>
  );
});
