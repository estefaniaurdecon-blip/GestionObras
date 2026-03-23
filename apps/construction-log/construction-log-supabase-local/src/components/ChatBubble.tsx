import { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { MessageSquare } from 'lucide-react';
import { useMessages } from '@/hooks/useMessages';

// ─── Constants ────────────────────────────────────────────────────────────────
const BUBBLE_SIZE = 56;
const HALF = BUBBLE_SIZE / 2;
const DOCKED_HIDE = 18;          // px hidden behind screen edge when docked
const DOCKED_INSET = HALF - DOCKED_HIDE; // center offset from edge (8 px inside)
const DRAG_THRESHOLD = 6;
const SNAP_MS = 380;
const MIN_Y = 64;
const STORAGE_KEY = 'chat-bubble-v1';

type Side = 'left' | 'right';
interface Pos  { x: number; y: number; side: Side; docked: boolean }
interface Saved { y: number; side: Side }

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }
function dockedX(side: Side) { return side === 'left' ? DOCKED_INSET : window.innerWidth - DOCKED_INSET; }

function initPos(): Pos {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const { y, side } = JSON.parse(raw) as Saved;
      return { x: dockedX(side), y: clamp(y, MIN_Y, window.innerHeight - HALF - 16), side, docked: true };
    }
  } catch { /* ignore */ }
  return { x: dockedX('right'), y: window.innerHeight * 0.65, side: 'right', docked: true };
}

// ─── Component ────────────────────────────────────────────────────────────────
export const ChatBubble = () => {
  const { unreadCount } = useMessages();

  const [pos,        setPos]       = useState<Pos>(initPos);
  const [isDragging, setDragging]  = useState(false);
  const [isChatOpen, setChatOpen]  = useState(false);

  // Refs that are always current inside native event handlers
  const divRef       = useRef<HTMLDivElement>(null);
  const posRef       = useRef(pos);
  const chatOpenRef  = useRef(isChatOpen);
  const draggingRef  = useRef(false);
  const snapRef      = useRef(false);

  const drag = useRef({ ox: 0, oy: 0, startX: 0, startY: 0, moved: false, active: false });

  useEffect(() => { posRef.current = pos; },       [pos]);
  useEffect(() => { chatOpenRef.current = isChatOpen; }, [isChatOpen]);

  // ── Track chat state from ChatCenter ──────────────────────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const open = (e as CustomEvent<{ open: boolean }>).detail.open;
      setChatOpen(open);
      chatOpenRef.current = open;
    };
    document.addEventListener('chat-center-state', handler);
    return () => document.removeEventListener('chat-center-state', handler);
  }, []);

  // ── Persist position ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!pos.docked) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ y: pos.y, side: pos.side } satisfies Saved)); }
    catch { /* ignore */ }
  }, [pos]);

  // ── Re-snap on resize ──────────────────────────────────────────────────────
  useEffect(() => {
    const onResize = () =>
      setPos(p => ({ ...p, x: dockedX(p.side), y: clamp(p.y, MIN_Y, window.innerHeight - HALF - 16), docked: true }));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // ── Native pointer events — bypass vaul's pointer-events:none on app root ─
  useEffect(() => {
    const el = divRef.current;
    if (!el) return;

    const onDown = (e: PointerEvent) => {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      const p = posRef.current;
      drag.current = { ox: e.clientX - p.x, oy: e.clientY - p.y, startX: e.clientX, startY: e.clientY, moved: false, active: true };
    };

    const onMove = (e: PointerEvent) => {
      const d = drag.current;
      if (!d.active) return;
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      if (!d.moved && Math.sqrt(dx * dx + dy * dy) < DRAG_THRESHOLD) return;
      d.moved = true;
      if (!draggingRef.current) { draggingRef.current = true; setDragging(true); }
      const nx = clamp(e.clientX - d.ox, HALF, window.innerWidth - HALF);
      const ny = clamp(e.clientY - d.oy, MIN_Y, window.innerHeight - HALF - 16);
      setPos(p => ({ ...p, x: nx, y: ny, docked: false }));
    };

    const onUp = () => {
      const d = drag.current;
      d.active = false;

      if (!d.moved) {
        // Tap → toggle chat
        document.dispatchEvent(new Event(chatOpenRef.current ? 'close-chat-center' : 'open-chat-center'));
        draggingRef.current = false;
        setDragging(false);
        return;
      }

      d.moved = false;
      draggingRef.current = false;
      setDragging(false);

      if (!snapRef.current) {
        snapRef.current = true;
        setPos(p => {
          const side: Side = p.x < window.innerWidth / 2 ? 'left' : 'right';
          return { ...p, x: dockedX(side), y: clamp(p.y, MIN_Y, window.innerHeight - HALF - 16), side, docked: true };
        });
        setTimeout(() => { snapRef.current = false; }, SNAP_MS);
      }
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup',   onUp);
    el.addEventListener('pointercancel', onUp);

    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup',   onUp);
      el.removeEventListener('pointercancel', onUp);
    };
  }, []); // stable — reads via refs

  // ── Derived visuals ────────────────────────────────────────────────────────
  const leftCss = pos.x - HALF;
  const topCss  = pos.y - HALF;

  const transition = isDragging
    ? 'none'
    : `left ${SNAP_MS}ms cubic-bezier(0.34,1.56,0.64,1), top 220ms ease`;

  const shadow = isDragging
    ? '0 14px 44px rgba(37,99,235,.7), 0 4px 14px rgba(0,0,0,.35)'
    : pos.docked && pos.side === 'right'
    ? '-4px 6px 22px rgba(37,99,235,.55), -1px 1px 8px rgba(0,0,0,.2)'
    : pos.docked && pos.side === 'left'
    ? '4px 6px 22px rgba(37,99,235,.55), 1px 1px 8px rgba(0,0,0,.2)'
    : '0 8px 28px rgba(37,99,235,.55), 0 2px 10px rgba(0,0,0,.25)';

  const innerGlow = pos.docked
    ? pos.side === 'right' ? 'inset -3px 0 10px rgba(255,255,255,.18)' : 'inset 3px 0 10px rgba(255,255,255,.18)'
    : 'none';

  const iconShift = pos.docked ? (pos.side === 'right' ? -5 : 5) : 0;
  const badgeOnLeft = pos.docked && pos.side === 'right';

  // ── Render via portal — direct child of document.body ─────────────────────
  return createPortal(
    <>
      <style>{`
        @keyframes cb-pulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(59,130,246,.55); }
          50%      { box-shadow: 0 0 0 10px rgba(59,130,246,0); }
        }
        .cb-pulse { animation: cb-pulse 2s ease-in-out infinite; }
      `}</style>

      <div
        ref={divRef}
        role="button"
        aria-label="Abrir mensajería"
        title="Mensajería"
        style={{
          position: 'fixed',
          left: leftCss,
          top: topCss,
          width: BUBBLE_SIZE,
          height: BUBBLE_SIZE,
          zIndex: 99999,
          cursor: isDragging ? 'grabbing' : 'pointer',
          touchAction: 'none',
          userSelect: 'none',
          pointerEvents: 'auto',   // override any parent pointer-events:none
          transition,
          willChange: 'left, top',
        }}
      >
        {/* Circle */}
        <div
          className={unreadCount > 0 && !isDragging && pos.docked ? 'cb-pulse' : ''}
          style={{
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 45%, #3b82f6 100%)',
            boxShadow: `${shadow}, ${innerGlow}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transform: isDragging ? 'scale(1.12)' : 'scale(1)',
            transition: 'transform 0.15s ease, box-shadow 0.25s ease',
          }}
        >
          <MessageSquare
            style={{
              width: 22, height: 22,
              color: 'white',
              transform: `translateX(${iconShift}px)`,
              transition: 'transform 0.3s ease',
              flexShrink: 0,
            }}
          />
        </div>

        {/* Badge */}
        {unreadCount > 0 && (
          <span
            aria-label={`${unreadCount} mensajes sin leer`}
            style={{
              position: 'absolute',
              top: -3,
              ...(badgeOnLeft ? { left: 4, right: 'auto' } : { right: -3, left: 'auto' }),
              minWidth: 18,
              height: 18,
              borderRadius: 9,
              background: '#ef4444',
              color: '#fff',
              fontSize: 10,
              fontWeight: 700,
              lineHeight: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 4px',
              border: '2px solid white',
              pointerEvents: 'none',
              zIndex: 1,
            }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </div>
    </>,
    document.body,
  );
};
