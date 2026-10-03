import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  alignedTextX,
  normalizeTextAlignment
} from '../src/utils/documentFormatting.js';

test('contract PDF alignment helper preserves left center and right positioning', () => {
  const margin = 50;
  const pageWidth = 612;
  const textWidth = 100;

  assert.equal(alignedTextX({ alignment: 'left', margin, pageWidth, textWidth }), 50);
  assert.equal(alignedTextX({ alignment: 'center', margin, pageWidth, textWidth }), 256);
  assert.equal(alignedTextX({ alignment: 'right', margin, pageWidth, textWidth }), 462);
  assert.equal(normalizeTextAlignment('CENTER'), 'center');
  assert.equal(normalizeTextAlignment('justify'), 'left');
});

test('contract editor exposes legal-document structure and table controls', () => {
  const source = fs.readFileSync(new URL('../src/components/common/RichTextEditor.jsx', import.meta.url), 'utf8');

  assert.match(source, /<option value="paragraph">Normal<\/option>/);
  assert.match(source, /<option value="h1">Heading 1<\/option>/);
  assert.match(source, /title="Undo"/);
  assert.match(source, /title="Redo"/);
  assert.match(source, /title="Add Row After"/);
  assert.match(source, /title="Delete Row"/);
  assert.match(source, /title="Add Column After"/);
  assert.match(source, /title="Delete Column"/);
  assert.match(source, /title="Toggle Header Row"/);
  assert.match(source, /\.ProseMirror h1/);
});

test('agreement PDF generation reads editor alignment and applies aligned x positions', () => {
  const source = fs.readFileSync(new URL('../src/services/DocumentService.js', import.meta.url), 'utf8');

  assert.match(source, /alignment: readBlockTextAlignment\(node\)/);
  assert.match(source, /alignedTextX\(\{[\s\S]*alignment,[\s\S]*pageWidth: width/);
  assert.match(source, /drawRichTextBlock\(item\.runs,[\s\S]*alignment: item\.alignment/);
  assert.match(source, /addWrappedText\(item\.text, fontSize, true, item\.alignment\)/);
});


test('contract template preview reuses the rich text renderer instead of a separate HTML preview layer', () => {
  const source = fs.readFileSync(new URL('../src/pages/AgreementTemplateForm.jsx', import.meta.url), 'utf8');

  assert.match(source, /<RichTextEditor\s+[\s\S]*initialContent=\{previewContent\}[\s\S]*readonly=\{true\}/);
  assert.equal(source.includes('dangerouslySetInnerHTML={{ __html: previewContent }}'), false);
  assert.equal(source.includes('className="preview-content'), false);
});


test('agreement PDF parser and renderer preserve inline rich-text runs and hard breaks', () => {
  const source = fs.readFileSync(new URL('../src/services/DocumentService.js', import.meta.url), 'utf8');

  assert.match(source, /const extractInlineRuns = \(element/);
  assert.match(source, /tagName === 'br'/);
  assert.match(source, /underline: marks\.underline/);
  assert.match(source, /runs\.map\(\(run\) => run\.text\)\.join\(''\)/);
  assert.match(source, /const drawRichTextBlock = \(runs/);
  assert.match(source, /helveticaBoldOblique/);
  assert.match(source, /token\.underline/);
  assert.match(source, /drawRichTextBlock\(item\.runs/);
});
