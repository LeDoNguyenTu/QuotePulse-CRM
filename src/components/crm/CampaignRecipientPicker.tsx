import type { CampaignRecipient } from '../../lib/crm/campaignRecipients';

interface Props {
  matching: CampaignRecipient[];
  selected: CampaignRecipient[];
  matchingCount: number;
  isFetching: boolean;
  isChoosingAll: boolean;
  onAdd: (recipient: CampaignRecipient) => void;
  onRemove: (contactId: string) => void;
  onClear: () => void;
  onChooseAll: () => Promise<void>;
}

function RecipientName({ recipient }: { recipient: CampaignRecipient }) {
  return <span><strong>{recipient.contact_name || recipient.email_normalized}</strong><small>{recipient.email_normalized} · {recipient.company_name ?? 'No company'}</small></span>;
}

export function CampaignRecipientPicker(props: Props) {
  const selectedIds = new Set(props.selected.map((item) => item.contact_id));
  return <div className="crm-recipient-picker">
    <section>
      <div className="crm-panel-heading"><div><h4>Matching contacts</h4><p>{props.matchingCount.toLocaleString()} match the current filters</p></div>
        <button className="btn-secondary" type="button" disabled={props.isChoosingAll || props.matchingCount === 0} onClick={() => void props.onChooseAll()}>{props.isChoosingAll ? 'Selecting…' : 'Choose all matching'}</button>
      </div>
      {props.isFetching && <p className="crm-panel-note" role="status">Updating audience…</p>}
      <div className="crm-recipient-list">
        {props.matching.length ? props.matching.map((recipient) => <label key={recipient.contact_id} className="crm-recipient-row">
          <input className="crm-checkbox" type="checkbox" checked={selectedIds.has(recipient.contact_id)} onChange={(event) => event.target.checked ? props.onAdd(recipient) : props.onRemove(recipient.contact_id)} />
          <RecipientName recipient={recipient} />
        </label>) : <p className="crm-panel-empty">No contacts match this audience.</p>}
      </div>
    </section>
    <section>
      <div className="crm-panel-heading"><div><h4>Selected recipients</h4><p>{props.selected.length.toLocaleString()} selected</p></div>
        <button className="btn-secondary" type="button" disabled={!props.selected.length} onClick={props.onClear}>Clear all</button>
      </div>
      <div className="crm-recipient-list">
        {props.selected.length ? props.selected.map((recipient) => <div key={recipient.contact_id} className="crm-recipient-row">
          <RecipientName recipient={recipient} />
          <button type="button" className="crm-recipient-remove" aria-label={`Remove ${recipient.contact_name || recipient.email_normalized}`} onClick={() => props.onRemove(recipient.contact_id)}>Remove</button>
        </div>) : <p className="crm-panel-empty">Choose contacts from any search or industry. Your selection stays while filters change.</p>}
      </div>
    </section>
  </div>;
}
