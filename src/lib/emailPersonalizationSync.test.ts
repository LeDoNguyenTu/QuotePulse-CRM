// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { synchronizePlainTextToHtml } from './emailPersonalization';

describe('synchronizePlainTextToHtml', () => {
  it('adds a recipient placeholder from backup text without removing the imported layout or image', () => {
    const result = synchronizePlainTextToHtml(
      'Dear\nYour renewal is ready.',
      'Dear {{contact_name}}\nYour renewal is ready.',
      '<table><tbody><tr><td><p>Dear</p><p>Your renewal is ready.</p><img src="https://cdn.example/banner.png"></td></tr></tbody></table>',
    );

    expect(result.synchronized).toBe(true);
    expect(result.html).toContain('<p>Dear {{contact_name}}</p>');
    expect(result.html).toContain('Your renewal is ready.');
    expect(result.html).toContain('<table>');
    expect(result.html).toContain('https://cdn.example/banner.png');
  });

  it('reflects ordinary wording edits while preserving inline formatting around unchanged text', () => {
    const result = synchronizePlainTextToHtml(
      'R Systems is pleased to offer your organisation an exclusive trial.',
      'R Systems is delighted to offer your organisation an exclusive trial.',
      '<p><strong>R Systems</strong> is pleased to offer your organisation an <em>exclusive trial</em>.</p>',
    );

    expect(result.synchronized).toBe(true);
    expect(result.html).toContain('<strong>R Systems</strong> is delighted to offer');
    expect(result.html).toContain('<em>exclusive trial</em>');
  });

  it('does not guess when the backup text cannot be located in the formatted email', () => {
    const result = synchronizePlainTextToHtml(
      'Completely unrelated backup copy',
      'Edited unrelated backup copy',
      '<p>Formatted message with different content</p>',
    );

    expect(result).toEqual({
      html: '<p>Formatted message with different content</p>',
      synchronized: false,
    });
  });

  it('never removes images when one pasted edit spans text on both sides of an image', () => {
    const result = synchronizePlainTextToHtml(
      'Opening old copy\nClosing old copy',
      'Opening new copy\nClosing new copy',
      '<div><p>Opening old copy</p><img src="https://cdn.example/offer.png"><p>Closing old copy</p></div>',
    );

    expect(result.synchronized).toBe(true);
    expect(result.html).toContain('Opening new copy');
    expect(result.html).toContain('Closing new copy');
    expect(result.html).toContain('<img src="https://cdn.example/offer.png">');
  });
});
