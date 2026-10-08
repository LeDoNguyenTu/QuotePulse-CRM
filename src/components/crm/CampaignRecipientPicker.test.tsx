import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { CampaignRecipientPicker } from './CampaignRecipientPicker';

const avery = { contact_id: '1', company_id: 'c1', contact_name: 'Avery', email_normalized: 'avery@example.com', company_name: 'Northstar', industry: 'Technology' };
const ben = { contact_id: '2', company_id: 'c2', contact_name: 'Ben', email_normalized: 'ben@example.com', company_name: 'Orbit', industry: 'Finance' };

describe('CampaignRecipientPicker', () => {
  it('keeps matching and selected recipients in separate controllable panels', async () => {
    const onAdd = vi.fn();
    const onRemove = vi.fn();
    const onClear = vi.fn();
    const onChooseAll = vi.fn().mockResolvedValue(undefined);
    let renderer: ReturnType<typeof create>;
    act(() => { renderer = create(<CampaignRecipientPicker matching={[avery]} selected={[avery, ben]} matchingCount={1} isFetching={false} isChoosingAll={false} onAdd={onAdd} onRemove={onRemove} onClear={onClear} onChooseAll={onChooseAll} />); });
    const text = JSON.stringify(renderer!.toJSON());
    expect(text).toContain('Matching contacts');
    expect(text).toContain('Selected recipients');
    expect(renderer!.root.findAllByType('p').some((node) => node.children.join('') === '2 selected')).toBe(true);
    const buttons = renderer!.root.findAllByType('button');
    await act(async () => { await buttons.find((button) => button.props.children === 'Choose all matching')!.props.onClick(); });
    act(() => { buttons.find((button) => button.props.children === 'Clear all')!.props.onClick(); });
    act(() => { buttons.find((button) => button.props['aria-label'] === 'Remove Ben')!.props.onClick(); });
    expect(onChooseAll).toHaveBeenCalledOnce();
    expect(onClear).toHaveBeenCalledOnce();
    expect(onRemove).toHaveBeenCalledWith('2');
  });
});
