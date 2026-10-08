import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
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
});
