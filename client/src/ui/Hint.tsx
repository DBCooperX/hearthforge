// Floating tooltips. A Float is placed beside the element it explains and kept on screen;
// a Hint is the short text kind, for anything that used to rely on the browser's own title tooltip.
import { cloneElement, useLayoutEffect, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type Side = 'right' | 'top' | 'bottom';

interface FloatProps {
  /** The element being explained. */
  anchor: DOMRect;
  /** Preferred side. The other side is used when there is no room. */
  side?: Side;
  className?: string;
  /** Lets the pointer enter the tooltip, for one that is pinned open and scrolls. */
  interactive?: boolean;
  children: ReactNode;
}

const GAP = 10;
const MARGIN = 8;

/** A box placed beside `anchor`, measured after it renders so it never leaves the window. */
export function Float({ anchor, side = 'right', className, interactive, children }: FloatProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<CSSProperties>({ left: -9999, top: -9999, visibility: 'hidden' });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth, h = el.offsetHeight;
    const vw = window.innerWidth, vh = window.innerHeight;
    let left: number, top: number;
    if (side === 'right') {
      left = anchor.right + GAP;
      if (left + w > vw - MARGIN) left = anchor.left - GAP - w;
      top = anchor.top - 4;
    } else {
      left = anchor.left + anchor.width / 2 - w / 2;
      top = side === 'top' ? anchor.top - GAP - h : anchor.bottom + GAP;
      if (top < MARGIN) top = anchor.bottom + GAP;
      else if (top + h > vh - MARGIN) top = anchor.top - GAP - h;
    }
    setPos({ left: Math.max(MARGIN, Math.min(left, vw - w - MARGIN)), top: Math.max(MARGIN, Math.min(top, vh - h - MARGIN)) });
  }, [anchor.left, anchor.top, anchor.width, anchor.height, side, children]);
  return createPortal(
    <div ref={ref} className={['float', className, interactive && 'interactive'].filter(Boolean).join(' ')} role="tooltip" style={pos}>{children}</div>,
    document.body,
  );
}

interface HintProps {
  /** What the tooltip says. Nothing is shown while this is empty. */
  text: ReactNode;
  /** A bold first line. */
  title?: ReactNode;
  side?: Side;
  /** The element to explain: a single element that accepts mouse and focus handlers. */
  children: ReactElement<Record<string, unknown>>;
}

/** Explains its child on hover and on keyboard focus. */
export function Hint({ text, title, side = 'top', children }: HintProps) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const show = (e: { currentTarget: Element }) => setAnchor(e.currentTarget.getBoundingClientRect());
  const hide = () => setAnchor(null);
  const child = children as ReactElement<Record<string, (e: never) => void>>;
  const wrap = (name: string, fn: (e: { currentTarget: Element }) => void) => (e: { currentTarget: Element }) => { fn(e); child.props[name]?.(e as never); };
  return (
    <>
      {cloneElement(child, { onMouseEnter: wrap('onMouseEnter', show), onMouseLeave: wrap('onMouseLeave', hide), onFocus: wrap('onFocus', show), onBlur: wrap('onBlur', hide), onMouseDown: wrap('onMouseDown', hide) } as never)}
      {anchor && (text || title) && (
        <Float anchor={anchor} side={side} className="hint-tip">
          {title && <b>{title}</b>}
          {text && <span>{text}</span>}
        </Float>
      )}
    </>
  );
}

/** A small "i" that explains the thing beside it on hover, keyboard focus or tap, so the page itself can stay short. */
export function Info({ text, title, side }: { text: ReactNode; title?: ReactNode; side?: Side }) {
  return (
    <Hint text={text} title={title} side={side}>
      <span className="info-dot" tabIndex={0} role="note" aria-label={typeof text === 'string' ? text : undefined}>i</span>
    </Hint>
  );
}

