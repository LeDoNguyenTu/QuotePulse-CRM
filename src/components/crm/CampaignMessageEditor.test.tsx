// @vitest-environment jsdom

import { act, create } from 'react-test-renderer';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { CampaignContent } from '../../lib/emailCampaignPreview';
import { CampaignMessageEditor } from './CampaignMessageEditor';

const templates = [
  { id: 'a', name: 'Intro', subject: 'Hello {{contact_name}}', body: 'Text A', body_html: '<p>A</p>', body_format: 'html' },
  { id: 'b', name: 'Follow up', subject: 'Again', body: 'Text B', body_html: null, body_format: 'plain' },
] as const;

describe('CampaignMessageEditor', () => {
  it('initializes a local draft and preserves edits when template replacement is cancelled', () => {
    const onChange = vi.fn();
    const confirmReplace = vi.fn(() => false);
    let renderer: ReturnType<typeof create>;
    act(() => { renderer = create(<CampaignMessageEditor templates={templates} templateId="a" draft={{ subject: 'Edited', bodyText: 'Local edit', bodyHtml: '<p>A</p>' }} dirty recipient={{ contact_name: 'Avery', company_name: 'Northstar', industry: 'Technology' }} onTemplateChange={vi.fn()} onChange={onChange} confirmReplace={confirmReplace} />); });
    const select = renderer!.root.findByType('select');
    act(() => { select.props.onChange({ target: { value: 'b' } }); });
    expect(confirmReplace).toHaveBeenCalledOnce();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows the exact personalized draft in a sandboxed preview and unresolved-token errors', () => {
    let renderer: ReturnType<typeof create>;
    act(() => { renderer = create(<CampaignMessageEditor templates={templates} templateId="a" draft={{ subject: 'Hello {{contact_name}}', bodyText: '{{unknown}}', bodyHtml: '<p>{{company_name}}</p>' }} dirty={false} recipient={{ contact_name: 'Avery', company_name: 'Northstar', industry: 'Technology' }} onTemplateChange={vi.fn()} onChange={vi.fn()} />); });
    expect(renderer!.root.findByType('iframe').props).toMatchObject({ sandbox: '', srcDoc: '<p>Northstar</p>' });
    const text = JSON.stringify(renderer!.toJSON());
    expect(text).toContain('Hello Avery');
    expect(renderer!.root.findByProps({ role: 'alert' }).children.join('')).toBe('Unresolved personalization: unknown');
  });

  it('warns when backup text is personalized but the formatted email is not', () => {
    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(<CampaignMessageEditor
        templates={templates}
        templateId="a"
        draft={{ subject: 'Offer', bodyText: 'Dear {{contact_name}}', bodyHtml: '<p>Dear</p>' }}
        dirty={false}
        recipient={{ contact_name: 'Avery', company_name: 'Northstar', industry: 'Technology' }}
        onTemplateChange={vi.fn()}
        onChange={vi.fn()}
      />);
    });

    const rendered = JSON.stringify(renderer!.toJSON());
    expect(rendered).toContain('Personalize your email');
    expect(rendered).toContain('formatted email is missing: ');
    expect(renderer!.root.findByProps({ role: 'alert' }).findByType('strong').children).toEqual(['Recipient name']);
  });

  it('updates campaign HTML when the user edits the non-technical backup text', () => {
    const onChange = vi.fn();
    const Harness = () => {
      const [draft, setDraft] = useState<CampaignContent>({ subject: 'Offer', bodyText: 'Dear\nYour renewal is ready.', bodyHtml: '<p>Dear</p><p>Your renewal is ready.</p>' });
      return <CampaignMessageEditor
        templates={templates}
        templateId="a"
        draft={draft}
        dirty={false}
        recipient={{ contact_name: 'Avery', company_name: 'Northstar', industry: 'Technology' }}
        onTemplateChange={vi.fn()}
        onChange={(next) => { onChange(next); setDraft(next); }}
      />;
    };
    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(<Harness />);
    });
    const backupText = renderer!.root.findAllByType('textarea').find((textarea) => textarea.props.value === 'Dear\nYour renewal is ready.')!;

    act(() => backupText.props.onChange({ target: { value: 'Dear {{contact_name}}\nYour renewal is ready.' } }));
    const editedBackupText = renderer!.root.findAllByType('textarea').find((textarea) => textarea.props.value === 'Dear {{contact_name}}\nYour renewal is ready.')!;
    act(() => editedBackupText.props.onChange({ target: { value: 'Dear {{contact_name}}\nYour renewal is now ready.' } }));

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      bodyText: 'Dear {{contact_name}}\nYour renewal is now ready.',
      bodyHtml: expect.stringContaining('Dear {{contact_name}}'),
    }));
    expect(onChange.mock.calls[onChange.mock.calls.length - 1]?.[0].bodyHtml).toContain('renewal is now ready');
    expect(renderer!.root.findByType('iframe').props.srcDoc).toContain('Dear Avery');
  });
});
