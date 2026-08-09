# HubSpot Import ETA and Live Status Design

## Goal

Replace the misleading lifetime-average ETA with a recent-step estimate and make it visually obvious whether the browser is actively waiting for the current HubSpot sync slice.

## ETA behavior

The import session will record the imported-deal total and completion time of each server slice. ETA will use only the most recent positive change in `deals_imported`, divided by the time since the preceding completed slice. Paused time and time before a resumed run will not affect the estimate.

ETA is shown only when all of the following are true:

- the normal deal phase is active;
- the remaining-deal count is known and greater than zero;
- a recent completed slice increased the imported-deal total; and
- the resulting rate is positive.

When the importer is scanning for gaps but the imported total does not change, the UI will omit the ETA instead of displaying an inflated value. Historical-property repair keeps its existing phase-specific message.

## Live status behavior

While the import status is `running`, the progress panel will display an animated circular spinner and a concise status message based on the last completed server response:

- under 60 seconds: `Working - last server response Xs ago`;
- 60 seconds or longer: `This step is taking longer than usual - still waiting for the server`.

The status clock updates locally once per second. It does not start additional API calls. The spinner is decorative, while the text is exposed through an accessible live status region.

When Stop is requested, the existing `Stopping after this step...` button state remains authoritative. The status indicator continues to show that the current server slice is finishing; no new slice starts after it returns.

## State and compatibility

`LiveImport` gains optional recent-step timing/rate fields. They remain optional so import state saved by an earlier frontend release can still be restored safely. Starting or resuming an import initializes a fresh active timing window while preserving cumulative counts and the resumable step cursor.

## Testing

Pure timing helpers will be tested first for:

- recent positive progress producing an ETA;
- zero progress hiding the ETA;
- paused time being excluded after resume;
- normal and slow live-status labels at the 60-second boundary; and
- compatibility with legacy saved import state.

The full Vitest suite, TypeScript check, ESLint, and production build must pass. The final diff must contain no secrets or unrelated files.
