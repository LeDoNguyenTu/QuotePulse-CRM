import { renderToStaticMarkup } from 'react-dom/server';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { TemplateEditor } from './TemplateEditor';

const useUnsavedChangesMock = vi.hoisted(() => vi.fn());

vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
vi.mock('../hooks/useTemplates', () => ({ uploadEmailTemplateAssets: vi.fn() }));
vi.mock('../hooks/useUnsavedChanges', () => ({ useUnsavedChanges: useUnsavedChangesMock }));

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
    expect(useUnsavedChangesMock).toHaveBeenLastCalledWith(expect.objectContaining({ dirty: true }));
    const cancel = renderer!.root.findAllByType('button').find((button) => button.children.join('') === 'Cancel')!;

    act(() => cancel.props.onClick());

    expect(confirmDiscard).toHaveBeenCalledWith('Discard your unsaved template changes?');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('clears the dirty baseline after a successful save', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    let renderer: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<TemplateEditor open initial={{ name: 'Offer', subject: 'Hello', body: 'Body' }} onClose={vi.fn()} onSave={onSave} />);
    });
    const name = renderer!.root.findAllByType('input').find((input) => input.props.value === 'Offer')!;
    act(() => name.props.onChange({ target: { value: 'Updated offer' } }));
    expect(useUnsavedChangesMock).toHaveBeenLastCalledWith(expect.objectContaining({ dirty: true }));
    const save = renderer!.root.findAllByType('button').find((button) => button.children.join('') === 'Save')!;

    await act(async () => save.props.onClick());

    expect(onSave).toHaveBeenCalledOnce();
    expect(useUnsavedChangesMock).toHaveBeenLastCalledWith(expect.objectContaining({ dirty: false }));
  });

  it('normalizes saved Outlook headers and keeps HTML edits synchronized with the preview', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const importedHtml = `<html><body>
      <p><b>Sent:</b> ���� 1 October, 2026 4:35 PM</p>
      <p><b>Subject:</b> ���� � Free 30-Day Trial</p>
      <p>&nbsp;</p><table><tbody><tr><td>Original offer</td></tr></tbody></table>
    </body></html>`;
    let renderer: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<TemplateEditor
        open
        initial={{ id: 'template-1', name: 'Offer', subject: '���� � Free 30-Day Trial', body: 'Original offer', body_format: 'html', body_html: importedHtml, asset_manifest: [] }}
        onClose={vi.fn()}
        onSave={onSave}
      />);
    });

    const subject = renderer!.root.findAllByType('input').find((input) => input.props.value?.includes('Free 30-Day Trial'))!;
    expect(subject.props.value).toBe('Free 30-Day Trial');
    const preview = renderer!.root.findByType('iframe');
    expect(preview.props.sandbox).toBe('');
    expect(preview.props.srcDoc).not.toMatch(/Sent:|Subject:|�/);

    const htmlEditor = renderer!.root.findAllByType('textarea').find((textarea) => textarea.props.value?.includes('<table'))!;
    act(() => htmlEditor.props.onChange({ target: { value: '<table><tbody><tr><td>Updated offer</td></tr></tbody></table>' } }));
    expect(renderer!.root.findByType('iframe').props.srcDoc).toContain('Updated offer');
    expect(renderer!.root.findByType('iframe').props.srcDoc).not.toContain('Original offer');

    const save = renderer!.root.findAllByType('button').find((button) => button.children.join('') === 'Save')!;
    await act(async () => save.props.onClick());
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      subject: 'Free 30-Day Trial',
      body_html: '<table><tbody><tr><td>Updated offer</td></tr></tbody></table>',
    }));
  });

  it('uses the wide template layout and labels the plain-text field as fallback', () => {
    const html = renderToStaticMarkup(<TemplateEditor
      open
      initial={{ name: 'Offer', subject: 'Hello', body: 'Plain', body_format: 'html', body_html: '<p>HTML</p>' }}
      onClose={vi.fn()}
      onSave={vi.fn()}
    />);
    expect(html).toContain('template-editor-layout');
    expect(html).toContain('Plain-text fallback');
    expect(html).toContain('HTML source');
  });
});
