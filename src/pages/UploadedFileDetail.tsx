import { Link, useParams } from "react-router-dom";
import { useState } from "react";
import { useUploadedFile } from "../hooks/useUploadedFiles";
import { ErrorState, Spinner } from "../components/ui";
import { functions } from "../lib/functions";
import { useSettings } from "../hooks/useSettings";
import { hubspotRecordUrl } from "../lib/hubspotLinks";
import { HistoryBackLink } from "../components/HistoryBackLink";

export function UploadedFileDetail() {
  const { id } = useParams();
  const file = useUploadedFile(id);
  const settings = useSettings();
  const [policy, setPolicy] = useState({
    companies: "update_and_create",
    contacts: "update_and_create",
    deals: "skip",
  });
  const [merging, setMerging] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);
  if (file.isLoading) return <Spinner label="Loading uploaded file…" />;
  if (file.error) return <ErrorState error={file.error} />;
  if (!file.data || !id) return <ErrorState error="Uploaded file not found." />;
  const fileId = id;
  const { file: meta, rows } = file.data;
  async function merge() {
    if (
      !window.confirm(
        "Merge this file with the selected update/create choices? This can update CRM records and will protect the source file from deletion.",
      )
    )
      return;
    setMerging(true);
    setMergeError(null);
    try {
      const result = await functions.mergeUploadedFile(fileId, policy);
      if (!result.ok)
        throw new Error(result.errors[0] ?? "No CRM rows could be merged.");
      await file.refetch();
    } catch (e) {
      setMergeError(e instanceof Error ? e.message : String(e));
    } finally {
      setMerging(false);
    }
  }
  return (
    <div className="space-y-4">
      <HistoryBackLink fallback="/uploaded-files">
        ← Back to previous view
      </HistoryBackLink>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{meta.file_name}</h1>
          <p className="text-sm text-slate-500">
            {meta.sheet_name} · {rows.length.toLocaleString()} rows
          </p>
        </div>
        <button
          className="btn-secondary"
          disabled={file.rematch.isPending}
          onClick={() => void file.rematch.mutate()}
        >
          {file.rematch.isPending ? "Matching…" : "Refresh CRM matches"}
        </button>
      </div>
      <div className="card grid gap-3 p-4 sm:grid-cols-3">
        {(["companies", "contacts", "deals"] as const).map((key) => (
          <label key={key} className="text-sm capitalize">
            {key}
            <select
              className="input mt-1"
              value={policy[key]}
              onChange={(e) =>
                setPolicy((value) => ({ ...value, [key]: e.target.value }))
              }
            >
              <option value="skip">Do not merge</option>
              <option value="update_matched">Update matches only</option>
              <option value="create_unmatched">Create unmatched only</option>
              <option value="update_and_create">Update + create</option>
            </select>
          </label>
        ))}
        <div className="sm:col-span-3">
          <button
            className="btn-primary"
            disabled={merging}
            onClick={() => void merge()}
          >
            {merging ? "Merging…" : "Merge into CRM"}
          </button>
          {mergeError && (
            <p className="mt-2 text-sm text-red-600">{mergeError}</p>
          )}
        </div>
      </div>
      <div className="card overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="border-b bg-slate-50">
            <tr>
              {meta.headers.map((header) => (
                <th key={header} className="whitespace-nowrap p-3 text-left">
                  {header}
                </th>
              ))}
              <th className="p-3 text-left">CRM match</th>
              <th className="p-3 text-left">Reason</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const external =
                row.match_target_type === "company"
                  ? hubspotRecordUrl(
                      settings.data?.hubspot_portal_id,
                      settings.data?.hubspot_ui_domain,
                      "company",
                      row.match_hubspot_object_id,
                    )
                  : null;
              return (
                <tr key={row.id} className="border-b">
                  {meta.headers.map((header) => (
                    <td
                      key={header}
                      className="max-w-56 truncate p-3"
                      title={String(row.values[header] ?? "")}
                    >
                      {String(row.values[header] ?? "—")}
                    </td>
                  ))}
                  <td className="p-3">
                    {external ? (
                      <a
                        className="text-brand-600 underline"
                        href={external}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open in HubSpot
                      </a>
                    ) : row.match_target_type === "company" &&
                      row.match_target_id ? (
                      <Link
                        className="text-brand-600 underline"
                        to={`/company/${row.match_target_id}`}
                      >
                        Matched company
                      </Link>
                    ) : (
                      row.match_status
                    )}
                  </td>
                  <td className="p-3">{row.match_reason ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
