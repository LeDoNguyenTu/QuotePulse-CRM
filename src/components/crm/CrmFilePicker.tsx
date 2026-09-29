import { useId } from 'react';

type CrmFilePickerProps = {
  accept: string;
  actionLabel: string;
  description: string;
  fileName?: string | null;
  title: string;
  onSelect: (file: File) => void;
};

export function CrmFilePicker({ accept, actionLabel, description, fileName, title, onSelect }: CrmFilePickerProps) {
  const inputId = useId();

  return (
    <div className="crm-file-picker">
      <div className="crm-file-picker-copy">
        <span className="crm-file-picker-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M7 3.75h6.2L17.25 7.8v12.45H7V3.75Z" />
            <path d="M13 3.75V8h4.25M9.5 12h5M9.5 15h5" />
          </svg>
        </span>
        <span>
          <strong>{fileName || title}</strong>
          <small>{fileName ? 'Ready to process' : description}</small>
        </span>
      </div>
      <input
        id={inputId}
        className="crm-file-picker-input"
        type="file"
        accept={accept}
        onChange={(event) => {
          const selected = event.target.files?.[0];
          if (selected) onSelect(selected);
        }}
      />
      <label className="crm-file-picker-action" htmlFor={inputId}>{fileName ? 'Choose another' : actionLabel}</label>
    </div>
  );
}
