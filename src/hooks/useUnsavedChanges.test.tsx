// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createMemoryRouter, Link, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUnsavedChanges } from './useUnsavedChanges';

function Draft({ dirty }: { dirty: boolean }) {
  useUnsavedChanges({ dirty, message: 'Discard this draft?' });
  return <Link to="/next">Next page</Link>;
}

describe('useUnsavedChanges', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  function renderDraft(dirty: boolean) {
    const router = createMemoryRouter([
      { path: '/', element: <Draft dirty={dirty} /> },
      { path: '/next', element: <p>Destination</p> },
    ], { initialEntries: ['/'] });
    act(() => root.render(<RouterProvider router={router} />));
    return router;
  }

  it('keeps a dirty draft in place when navigation is declined', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const router = renderDraft(true);

    await act(async () => container.querySelector('a')!.click());

    expect(confirm).toHaveBeenCalledWith('Discard this draft?');
    expect(router.state.location.pathname).toBe('/');
  });

  it('allows navigation after discard is confirmed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const router = renderDraft(true);

    await act(async () => container.querySelector('a')!.click());

    expect(router.state.location.pathname).toBe('/next');
  });

  it('does not prompt for a clean draft and protects reload for a dirty one', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const cleanRouter = renderDraft(false);
    await act(async () => container.querySelector('a')!.click());
    expect(cleanRouter.state.location.pathname).toBe('/next');
    expect(confirm).not.toHaveBeenCalled();

    act(() => {
      root.unmount();
      root = createRoot(container);
    });
    renderDraft(true);
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});
