import { renderToStaticMarkup } from 'react-dom/server';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { TemplateEditor } from './TemplateEditor';

vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
vi.mock('../hooks/useTemplates', () => ({ uploadEmailTemplateAssets: vi.fn() }));
vi.mock('../hooks/useUnsavedChanges', () => ({ useUnsavedChanges: vi.fn() }));

describe('TemplateEditor rich email controls', () => {
  it('offers HTML/table import, companion images, sanitized preview, and text fallback', () => {
    const html = renderToStaticMarkup(<TemplateEditor
      open
      initial={{
        id: 'template-1', name: 'Offer', subject: 'Hello', body: 'Plain fallback',
        body_format: 'html', body_html: '<table><tr><td>Hello</td></tr></table>', asset_manifest: [],
      }}
      onClose={vi.fn()}
      onSave={vi.fn()}
    />);
    expect(html).toContain('HTML / table layout');
    expect(html).toContain('Import .msg, .htm, or .html');
    expect(html).toContain('.msg');
    expect(html).toContain('Companion image ZIP or images');
    expect(html).toContain('HTML email preview');
    expect(html).toContain('Plain fallback');
  });

  it('warns before closing an edited template and keeps the editor open when declined', () => {
    const onClose = vi.fn();
    const confirmDiscard = vi.fn().mockReturnValue(false);
    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(<TemplateEditor
        open
        initial={{ name: 'Offer', subject: 'Hello', body: 'Body' }}
        onClose={onClose}
        onSave={vi.fn()}
        confirmDiscard={confirmDiscard}
      />);
    });
    const name = renderer!.root.findAllByType('input').find((input) => input.props.value === 'Offer')!;
    act(() => name.props.onChange({ target: { value: 'Changed offer' } }));
    const cancel = renderer!.root.findAllByType('button').find((button) => button.children.join('') === 'Cancel')!;

    act(() => cancel.props.onClick());

    expect(confirmDiscard).toHaveBeenCalledWith('Discard your unsaved template changes?');
    expect(onClose).not.toHaveBeenCalled();
  });
});
