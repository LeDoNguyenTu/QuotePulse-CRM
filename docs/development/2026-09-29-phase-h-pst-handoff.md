# Phase H PST extractor handoff

## Scope

- PST parsing runs locally in a dedicated browser Web Worker using sliced `File` reads.
- Raw PST bytes, message bodies, and attachments are never uploaded or stored.
- Only subject, normalized sender/recipient addresses, date, folder path, attachment presence, and source node ID can be saved.
- Supabase stores this bounded searchable metadata and links matching addresses to workspace CRM contacts.
- Files above 400 MiB fail explicitly. Extraction is bounded to 25,000 messages or 64 MiB of metadata, and metadata writes use batches of at most 500.
- The file identity is a streaming SHA-256 of every PST byte, independent of file name and modified time.
- Processing batches remain hidden until final count verification. Failed new saves delete partial rows, interrupted processing retries rebuild deterministically, and a completed identical-content fingerprint is reused without teardown.

## Parser validation

- The modern MIT-licensed parser initially rejected property keys `0x0f47` through `0x0f4a` with type `0x1014` in the supplied PST.
- A narrow `patch-package` compatibility patch skips only those exact unsupported key/type/error combinations; all other property failures still throw.
- Supplied `Mymailboxbackup_20260917.pst` (42,427,392 bytes): 7 folders, 29 messages, 0 extraction errors after the patch.
- Upstream non-sensitive fixtures: Unicode PST (4 folders / 1 message), ANSI 97-2002 PST (6 / 1), and Enron PST (10 / 71), all with zero traversal errors.
- The supplied mailbox contains renewal/RFQ threads and confirms that subject, date, SMTP participants, and folder association are available without reading or retaining bodies.

## Storage boundary

Supabase is used only for compact, workspace-scoped searchable metadata. R2 is reserved for future large derived artifacts; the raw PST is not copied to either service. This avoids consuming Supabase free-tier storage with mailbox blobs.
