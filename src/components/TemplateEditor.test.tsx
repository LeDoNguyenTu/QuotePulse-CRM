// @vitest-environment jsdom

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

  it('fits fixed-width imported email tables inside the preview pane', () => {
    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(<TemplateEditor
        open
        initial={{
          name: 'Offer',
          subject: 'Hello',
          body: 'Plain',
          body_format: 'html',
          body_html: '<table width="787"><tbody><tr><td>HTML</td></tr></tbody></table>',
        }}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />);
    });

    const preview = renderer!.root.findByType('iframe');
    expect(preview.props.srcDoc).toContain('data-quotepulse-preview-fit');
    expect(preview.props.srcDoc).toMatch(/max-width:\s*100%\s*!important/);
    expect(preview.props.srcDoc).toMatch(/overflow-x:\s*hidden\s*!important/);
  });

  it('explains personalization in plain language, copies each field, and warns when HTML is missing it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    let renderer: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<TemplateEditor
        open
        initial={{
          name: 'R system',
          subject: 'Offer for {{contact_name}}',
          body: 'Dear {{contact_name}}',
          body_format: 'html',
          body_html: '<p>Dear</p>',
        }}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />);
    });

    const rendered = JSON.stringify(renderer!.toJSON());
    expect(rendered).toContain('Personalize your email');
    expect(rendered).toContain('Recipient name');
    expect(rendered).toContain('Company name');
    expect(rendered).toContain('Industry');
    expect(rendered).toContain('formatted email is missing: ');
    expect(renderer!.root.findByProps({ role: 'alert' }).findByType('strong').children).toEqual(['Recipient name']);

    const copyRecipient = renderer!.root.findByProps({ 'aria-label': 'Copy Recipient name field' });
    await act(async () => copyRecipient.props.onClick());
    expect(writeText).toHaveBeenCalledWith('{{contact_name}}');
    expect(JSON.stringify(renderer!.toJSON())).toContain('Copied');
    vi.unstubAllGlobals();
  });

  it('synchronizes backup text edits into formatted HTML and saves the synchronized message', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    let renderer: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<TemplateEditor
        open
        initial={{
          id: 'template-1', name: 'Offer', subject: 'Renewal', body: 'Dear\nYour renewal is ready.',
          body_format: 'html', body_html: '<table><tbody><tr><td><p>Dear</p><p>Your renewal is ready.</p><img src="https://cdn.example/banner.png"></td></tr></tbody></table>',
        }}
        onClose={vi.fn()}
        onSave={onSave}
      />);
    });
    const backupText = renderer!.root.findAllByType('textarea').find((textarea) => textarea.props.value === 'Dear\nYour renewal is ready.')!;

    act(() => backupText.props.onChange({ target: { value: 'Dear {{contact_name}}\nYour renewal is ready.' } }));
    const editedBackupText = renderer!.root.findAllByType('textarea').find((textarea) => textarea.props.value === 'Dear {{contact_name}}\nYour renewal is ready.')!;
    act(() => editedBackupText.props.onChange({ target: { value: 'Dear {{contact_name}}\nYour renewal is now ready.' } }));

    expect(renderer!.root.findByType('iframe').props.srcDoc).toContain('Dear Jordan Lee');
    expect(renderer!.root.findByType('iframe').props.srcDoc).toContain('renewal is now ready');
    expect(renderer!.root.findByType('iframe').props.srcDoc).toContain('https://cdn.example/banner.png');
    expect(useUnsavedChangesMock).toHaveBeenLastCalledWith(expect.objectContaining({ dirty: true }));

    const save = renderer!.root.findAllByType('button').find((button) => button.children.join('') === 'Save')!;
    await act(async () => save.props.onClick());
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      body: 'Dear {{contact_name}}\nYour renewal is now ready.',
      body_html: expect.stringContaining('Dear {{contact_name}}'),
    }));
    expect(onSave.mock.calls[0][0].body_html).toContain('renewal is now ready');
  });
});
