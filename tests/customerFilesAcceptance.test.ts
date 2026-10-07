// @vitest-environment jsdom

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { prepareImportedEmailHtml } from '../src/lib/emailTemplateHtml';
import { parseOutlookMsg } from '../src/lib/outlookMsg';
import { parseUploadedWorkbook } from '../src/lib/uploadedFileWorkbook';
import { buildCustomerStatusReviewIndex } from '../src/lib/crm/customerStatusImport';
import {
  buildCrmHeaderMatches,
  normalizeCrmImportRows,
  suggestCrmImportMapping,
  unconfirmedSemanticHeaders,
  validateCrmImportMapping,
} from '../src/lib/crm/importPreview';

const customerFilesDirectory = process.env.CUSTOMER_FILES_DIR;
const expectedFiles = [
  'Current AMP customers.xlsx',
  'Customer Contacts.xlsx',
  'Free 30-Day Trial of Microsoft 365 Copilot for Business.htm.html',
  'Free 30-Day Trial of Microsoft 365 Copilot for Business.msg',
  'Free 30-Day Trial of Microsoft 365 Copilot for Business_files.zip',
  'June2026_Focused Michelle.xlsx',
  'NAV BC list (3)_w macros.xlsm',
  'Support customers.xlsx',
  'Telemarketing_Pipeline_Fengfan.xlsx',
] as const;

const workbookFiles = expectedFiles.filter((file) => /\.xls[mx]$/i.test(file));

function bytes(file: string): Uint8Array {
  return new Uint8Array(readFileSync(join(customerFilesDirectory!, file)));
}

function fileSha256(file: string): string {
  return createHash('sha256').update(bytes(file)).digest('hex');
}

describe.skipIf(!customerFilesDirectory)('customer file acceptance', () => {
  it('finds the complete approved customer-file set without copying its contents', () => {
    const actual = readdirSync(customerFilesDirectory!, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .sort();

    expect(actual).toEqual([...expectedFiles].sort());
    console.info('customer-file hashes', Object.fromEntries(actual.map((file) => [file, fileSha256(file)])));
  });

  it.each(workbookFiles)('parses %s with the production workbook parser', async (filename) => {
    const content = bytes(filename);
    const file = new File([content], filename, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const workbook = await parseUploadedWorkbook(file);
    const customerStatusReview = buildCustomerStatusReviewIndex(filename, workbook);

    expect(workbook.sheets.length).toBeGreaterThan(0);
    const summaries = [];
    for (const sheet of workbook.sheets) {
      expect(sheet.headers.length).toBeGreaterThan(0);
      expect(sheet.headers.every((header) => header.trim().length > 0)).toBe(true);
      expect(sheet.rows.length).toBeGreaterThan(0);
      const context = { filename, sheetName: sheet.name };
      const mapping = suggestCrmImportMapping(sheet.headers, context);
      expect(validateCrmImportMapping(mapping, sheet.headers).error).toBeNull();
      const preview = normalizeCrmImportRows(
        sheet.rows,
        mapping,
        { companies: [], contacts: [] },
        { ...context, customerStatusReview },
      );
      const ready = preview.filter((row) => row.valid);
      expect(ready.length).toBeGreaterThan(0);
      expect(
        ready.filter((row) => row.company.name.trim().length > 500)
          .map((row) => ({ row: row.rowNumber, length: row.company.name.trim().length })),
        'ready CRM company names must satisfy the database length constraint',
      ).toEqual([]);
      const statusCounts = ready.reduce<Record<string, number>>((counts, row) => {
        const status = row.company.customer_status ?? '(none)';
        counts[status] = (counts[status] ?? 0) + 1;
        return counts;
      }, {});
      if (filename === 'Current AMP customers.xlsx') {
        expect(ready.every((row) => row.company.customer_status === 'Maintenance Customer')).toBe(true);
      }
      if (filename === 'Support customers.xlsx' && sheet.name === 'Active customers') {
        expect(ready.filter((row) => !row.company.customer_status_review_required)
          .every((row) => row.company.customer_status === 'Maintenance Customer'), JSON.stringify(statusCounts)).toBe(true);
      }
      if (filename === 'Support customers.xlsx' && sheet.name === 'Inactive Customers') {
        expect(ready.filter((row) => !row.company.customer_status_review_required)
          .every((row) => row.company.customer_status === 'Former Customer'), JSON.stringify(statusCounts)).toBe(true);
      }
      const issueCounts = preview.flatMap((row) => row.issues).reduce<Record<string, number>>((counts, issue) => {
        counts[issue] = (counts[issue] ?? 0) + 1;
        return counts;
      }, {});
      summaries.push({
        name: sheet.name,
        headers: sheet.headers,
        rows: sheet.rows.length,
        ready: ready.length,
        attention: preview.length - ready.length,
        exactDuplicates: preview.filter((row) => row.duplicateOfRow).length,
        statusReview: preview.filter((row) => row.company.customer_status_review_required).length,
        statusCounts,
        confirmations: unconfirmedSemanticHeaders(buildCrmHeaderMatches(sheet.headers, context), new Set()).length,
        issueCounts,
      });
    }
    console.info('customer-workbook summary', JSON.stringify({
      filename,
      sheets: summaries,
    }));
  });

  it('preserves the supplied email tables and resolves every companion image', () => {
    const htmlFilename = 'Free 30-Day Trial of Microsoft 365 Copilot for Business.htm.html';
    const zipFilename = 'Free 30-Day Trial of Microsoft 365 Copilot for Business_files.zip';
    const source = new TextDecoder().decode(bytes(htmlFilename));
    const archive = unzipSync(bytes(zipFilename));
    const imageNames = Object.keys(archive)
      .filter((name) => /\.(png|jpe?g|gif|webp)$/i.test(name))
      .map((name) => basename(name.replace(/\\/g, '/')));
    const assetUrls = Object.fromEntries(imageNames.map((name) => [name, `https://acceptance.invalid/${encodeURIComponent(name)}`]));
    const prepared = prepareImportedEmailHtml(source, assetUrls);

    expect(source.match(/<table\b/gi)?.length).toBe(12);
    expect(prepared.html.match(/<table\b/gi)?.length).toBe(12);
    expect(prepared.imageReferences).toHaveLength(7);
    expect(imageNames).toHaveLength(7);
    expect(prepared.unresolvedImages).toEqual([]);
    expect(prepared.text.length).toBeGreaterThan(0);
    expect(prepared.html).not.toMatch(/<\s*(script|iframe|object|embed|form)\b|\son[a-z0-9_-]+\s*=|javascript\s*:/i);
  });

  it('imports the supplied Outlook MSG directly without storing the raw message', async () => {
    const filename = 'Free 30-Day Trial of Microsoft 365 Copilot for Business.msg';
    const runtime = globalThis as typeof globalThis & { Buffer?: unknown };
    const nodeBuffer = runtime.Buffer;
    Reflect.deleteProperty(runtime, 'Buffer');
    let imported;
    try {
      imported = await parseOutlookMsg(new File([bytes(filename)], filename, {
        type: 'application/vnd.ms-outlook',
      }));
    } finally {
      runtime.Buffer = nodeBuffer;
    }
    const assetUrls = Object.fromEntries(imported.images.map((image) => [
      image.name,
      `https://acceptance.invalid/${encodeURIComponent(image.name)}`,
    ]));
    const prepared = prepareImportedEmailHtml(imported.html, assetUrls);
    console.info('customer-msg summary', {
      htmlLength: imported.html.length,
      textLength: imported.text.length,
      tableCount: imported.html.match(/<table\b/gi)?.length ?? 0,
      imageCount: imported.images.length,
      imageReferences: prepared.imageReferences.length,
      unresolvedImages: prepared.unresolvedImages.length,
    });

    expect(imported.subject).toContain('Free 30-Day Trial');
    expect(imported.html.match(/<table\b/gi)?.length).toBe(12);
    expect(imported.images).toHaveLength(7);
    expect(prepared.unresolvedImages).toEqual([]);
    expect(prepared.text.length).toBeGreaterThan(0);
  });
});
