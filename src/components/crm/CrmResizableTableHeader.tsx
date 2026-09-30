import { useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';

interface CrmResizableTableHeaderProps {
  label: string;
  width: number;
  children?: ReactNode;
  onResize: (width: number, commit: boolean) => void;
}

const MIN_WIDTH = 96;
const MAX_WIDTH = 640;

function bounded(width: number): number {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(width)));
}

export function CrmResizableTableHeader({ label, width, children, onResize }: CrmResizableTableHeaderProps) {
  const drag = useRef<{ x: number; width: number } | null>(null);

  function nextWidth(clientX: number): number {
    return bounded((drag.current?.width ?? width) + clientX - (drag.current?.x ?? clientX));
  }

  function startResize(event: PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    drag.current = { x: event.clientX, width };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function resize(event: PointerEvent<HTMLButtonElement>) {
    if (!drag.current) return;
    onResize(nextWidth(event.clientX), false);
  }

  function finishResize(event: PointerEvent<HTMLButtonElement>) {
    if (!drag.current) return;
    onResize(nextWidth(event.clientX), true);
    drag.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function resizeWithKeyboard(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    onResize(bounded(width + (event.key === 'ArrowRight' ? 16 : -16)), true);
  }

  return (
    <th className="crm-resizable-heading" style={{ width, minWidth: width, maxWidth: width }}>
      <span>{children ?? label}</span>
      <button
        type="button"
        className="crm-column-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label={`Resize ${label} column`}
        onPointerDown={startResize}
        onPointerMove={resize}
        onPointerUp={finishResize}
        onPointerCancel={finishResize}
        onKeyDown={resizeWithKeyboard}
      />
    </th>
  );
}
