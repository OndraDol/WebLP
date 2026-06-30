import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

function pdfEngineBlock() {
  const start = html.indexOf('        // --- PDF LOGIC ---');
  const end = html.indexOf('        // --- GENERATOR ---');
  assert.ok(start >= 0, 'Missing PDF logic boundary');
  assert.ok(end > start, 'Missing generator boundary after PDF logic');
  return html.slice(start, end);
}

function generatorBlock() {
  const start = html.indexOf('        // --- GENERATOR ---');
  const end = html.indexOf('    </script>', start);
  assert.ok(start >= 0, 'Missing generator boundary');
  assert.ok(end > start, 'Missing script end after generator');
  return html.slice(start, end);
}

test('PDF extraction engine stays untouched', () => {
  const hash = createHash('sha256').update(pdfEngineBlock()).digest('hex');
  assert.equal(hash, 'e37a72b1dd158e68745aed67629eeaf3c5059ca25ea895da71c96a33497ee6a4');
});

test('DOCX generator stays untouched', () => {
  const hash = createHash('sha256').update(generatorBlock()).digest('hex');
  assert.equal(hash, '7f3b0174528b17d65679deab2c7397338d940974750dc91b2147e6df5436517f');
});

test('redesigned UI uses coversheet-style structure while preserving form contracts', () => {
  for (const id of [
    'dropZone',
    'fileInput',
    'jmeno',
    'narozeni',
    'adresa',
    'psc',
    'pobocka',
    'pozice',
    'konzultant',
    'uvazek',
    'kategorie_prace',
    'delkasmeny',
    'rezim',
    'cinnosti',
    'templateInput',
  ]) {
    assert.match(html, new RegExp(`id="${id}"`), `Missing preserved form id: ${id}`);
  }

  assert.match(html, /class="app-header"/, 'Missing coversheet-style header');
  assert.doesNotMatch(html, /HR lékařský posudek/, 'Header eyebrow should be removed');
  assert.match(html, /class="form-section"/, 'Missing grouped form sections');
  assert.doesNotMatch(html, /class="section-index"/, 'Section numbering should not be visible in headings');
  assert.match(html, /class="[^"]*\bsticky-actions\b/, 'Generate action should be sticky');
  assert.match(html, /id="generateBtn"/, 'Generate button should have a stable id for testing');
});

test('consultant is removed from visible UI while keeping generator contract', () => {
  assert.doesNotMatch(html, /<label\s+for="konzultant"/, 'Consultant should not be a visible form field');
  assert.match(html, /<select\s+id="konzultant"[^>]*\bhidden\b/, 'Generator contract should keep hidden #konzultant select');
});

test('factor rows start compact and can be expanded on demand', () => {
  assert.match(html, /const INITIAL_FACTOR_ROWS = 2;/, 'Factors should start with two visible rows');
  assert.match(html, /const MAX_FACTOR_ROWS = 8;/, 'Factors should keep the original eight-row maximum');
  assert.match(html, /id="addFactorBtn"/, 'Missing add-factor button');
  assert.match(html, /addFactorRow\(\)/, 'Add-factor button should call the factor-row helper');
});

test('decorative flying dogs stay outside the form contract', () => {
  const dogAsset = new URL('../assets/flying-dog.png', import.meta.url);
  assert.ok(existsSync(dogAsset), 'Missing decorative dog asset');
  assert.match(html, /class="dog-fleet" aria-hidden="true"/, 'Missing non-semantic dog animation layer');
  assert.match(html, /pointer-events:\s*none/, 'Dog animation layer should never block form controls');
  assert.match(html, /@keyframes dogDrift/, 'Dogs should have a drifting animation');
  assert.match(html, /@keyframes dogSpin/, 'Dogs should have a spinning animation');
  assert.equal((html.match(/class="flying-dog/g) || []).length, 6, 'Expected six flying dogs');
  assert.match(html, /assets\/flying-dog\.png/, 'Dog layer should use the checked-in asset');
});
