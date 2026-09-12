'use client';

import { useEffect, useRef, useState } from 'react';
import { RotateCcw, X, ZoomIn, ZoomOut } from 'lucide-react';

interface PhotoViewerProps { photo: { name: string; url: string }; onClose: () => void }

export function PhotoViewer({ photo, onClose }: PhotoViewerProps) {
  const [scale, setScale] = useState(1); const [offset, setOffset] = useState({ x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>()); const pinchDistance = useRef<number | null>(null);
  useEffect(() => { const previous = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = previous; }; }, []);
  const updateScale = (value: number) => { const next = Math.min(5, Math.max(1, value)); setScale(next); if (next === 1) setOffset({ x: 0, y: 0 }); };
  const pointerDown = (event: React.PointerEvent<HTMLDivElement>) => { event.currentTarget.setPointerCapture(event.pointerId); pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY }); };
  const pointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const previous = pointers.current.get(event.pointerId); if (!previous) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY }); const values = [...pointers.current.values()];
    if (values.length >= 2) { const distance = Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y); if (pinchDistance.current) updateScale(scale * distance / pinchDistance.current); pinchDistance.current = distance; }
    else if (scale > 1) setOffset((current) => ({ x: current.x + event.clientX - previous.x, y: current.y + event.clientY - previous.y }));
  };
  const pointerEnd = (event: React.PointerEvent<HTMLDivElement>) => { pointers.current.delete(event.pointerId); if (pointers.current.size < 2) pinchDistance.current = null; };
  return <div className="fixed inset-0 z-[70] flex touch-none select-none items-center justify-center overflow-hidden bg-black/90 p-4" role="dialog" aria-modal="true" aria-label="施工照片预览"
    onClick={(event) => event.target === event.currentTarget && onClose()} onWheel={(event) => { event.preventDefault(); updateScale(scale + (event.deltaY < 0 ? 0.25 : -0.25)); }}
    onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd}>
    <button type="button" onClick={(event) => { event.stopPropagation(); onClose(); }} onPointerDown={(event) => event.stopPropagation()} className="absolute right-4 top-[calc(env(safe-area-inset-top,0px)+1rem)] flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white" aria-label="关闭照片预览"><X className="h-6 w-6" /></button>
    <div className="absolute bottom-[calc(env(safe-area-inset-bottom,0px)+1.25rem)] left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/60 p-1.5 text-white" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
      <button type="button" onClick={() => updateScale(scale - 0.5)} disabled={scale <= 1} className="flex h-9 w-9 items-center justify-center rounded-full disabled:opacity-30" aria-label="缩小照片"><ZoomOut className="h-5 w-5" /></button><span className="w-12 text-center text-xs">{Math.round(scale * 100)}%</span>
      <button type="button" onClick={() => updateScale(scale + 0.5)} disabled={scale >= 5} className="flex h-9 w-9 items-center justify-center rounded-full disabled:opacity-30" aria-label="放大照片"><ZoomIn className="h-5 w-5" /></button>
      <button type="button" onClick={() => updateScale(1)} className="flex h-9 w-9 items-center justify-center rounded-full" aria-label="恢复照片大小"><RotateCcw className="h-4 w-4" /></button>
    </div>
    {/* eslint-disable-next-line @next/next/no-img-element */}<img src={photo.url} alt={photo.name || '施工照片'} onClick={(event) => event.stopPropagation()} onDoubleClick={(event) => { event.stopPropagation(); updateScale(scale > 1 ? 1 : 2); }} draggable={false} className="max-h-[82dvh] max-w-full rounded-lg object-contain transition-transform duration-100" style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }} />
  </div>;
}
