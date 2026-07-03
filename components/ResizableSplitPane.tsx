"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export default function ResizableSplitPane({
  left,
  right,
  defaultLeftPercent = 50,
  minLeftPercent = 25,
  maxLeftPercent = 75,
}: {
  left: React.ReactNode;
  right: React.ReactNode;
  defaultLeftPercent?: number;
  minLeftPercent?: number;
  maxLeftPercent?: number;
}) {
  const [leftPercent, setLeftPercent] = useState(defaultLeftPercent);
  const draggingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const onMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!draggingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setLeftPercent(Math.min(maxLeftPercent, Math.max(minLeftPercent, pct)));
    },
    [minLeftPercent, maxLeftPercent]
  );

  const onMouseUp = useCallback(() => {
    draggingRef.current = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  const startDrag = () => {
    draggingRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  return (
    <div ref={containerRef} className="flex min-h-0 min-w-0 flex-1">
      <div
        className="flex min-h-0 min-w-0 flex-col border-r border-border"
        style={{ width: `${leftPercent}%` }}
      >
        {left}
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Redimensionar paneles"
        onMouseDown={startDrag}
        className="group relative z-10 w-1.5 shrink-0 cursor-col-resize bg-border-strong hover:bg-accent"
      >
        <div className="absolute inset-y-0 -left-1 -right-1" />
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{right}</div>
    </div>
  );
}
