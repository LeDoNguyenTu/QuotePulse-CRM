// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Modal } from './Modal';

describe('Modal backdrop interactions', () => {
  let container: HTMLDivElement;
  let root: Root;
  let onClose = vi.fn<() => void>();

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    onClose = vi.fn<() => void>();
    act(() => root.render(<Modal open title="Edit template" onClose={onClose}>
      <input aria-label="Template text" defaultValue="Some text to select" />
    </Modal>));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('keeps the editor open when selecting text ends outside the panel', () => {
    const backdrop = container.firstElementChild as HTMLElement;
    const input = container.querySelector('input')!;

    act(() => {
      input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      backdrop.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it('still closes after a deliberate click on the backdrop', () => {
    const backdrop = container.firstElementChild as HTMLElement;

    act(() => {
      backdrop.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      backdrop.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('keeps the editor open when a backdrop press ends inside the panel', () => {
    const backdrop = container.firstElementChild as HTMLElement;
    const input = container.querySelector('input')!;

    act(() => {
      backdrop.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      input.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onClose).not.toHaveBeenCalled();
  });
});
