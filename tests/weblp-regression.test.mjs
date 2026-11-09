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

function loadQuestionnaireParser() {
  const block = pdfEngineBlock();
  const start = block.indexOf('        // --- QUESTIONNAIRE TEXT PARSER ---');
  const end = block.indexOf('        // --- END QUESTIONNAIRE TEXT PARSER ---');
  assert.ok(start >= 0 && end > start, 'Missing questionnaire text parser block');
  return new Function(`${block.slice(start, end)}\nreturn parseQuestionnaireText;`)();
}

// Rozložení textu osobního dotazníku ve formátu z 11/2026 (souřadnice dle PDF.js, smyšlené údaje).
function flatQuestionnaireItems({ name = 'Jan Novák', birth = '1.2.1990 / Brno', street = 'Dlouhá 12', city = 'Praha', zip = '110 00' } = {}) {
  return [
    [46, 810, 'Osobní dotazník'], [471, 817, '9.11.2026 13:01:49'],
    [46, 793, 'PŘÍJMENÍ Jméno'], [173, 793, name], [301, 793, 'Titul/věd. hodnost'],
    [46, 777, 'Rodné Příjmení/Jméno'], [301, 777, 'Číslo OP'], [428, 777, '123456789'],
    [46, 746, 'Datum / Místo /Stát'], [46, 737, 'narození'], [173, 746, birth],
    [301, 746, 'Státní příslušnost'], [428, 746, 'Česká Republika'],
    [46, 645, 'Cizinec: 1.zaměstnání v ČR:'], [173, 645, 'Ne'], [186, 645, '(vyplní pouze cizinec)'],
    [46, 629, 'Adresa trvalého bydliště'], [173, 629, 'Ulice/č.'], [301, 629, 'Město'], [428, 629, 'PSČ'],
    [173, 614, street], [301, 614, city], [428, 614, zip],
    [46, 598, 'Adresa pro doručování'], [173, 598, 'Ulice/č.'], [301, 598, 'Město'], [428, 598, 'PSČ'],
    [173, 583, 'Jiná 1'], [301, 583, 'Plzeň'], [428, 583, '301 00'],
  ].filter(([, , str]) => str).map(([x, y, str]) => ({ str, x, y }));
}

test('PDF reading keeps AcroForm fields and falls back to text for flat questionnaires', () => {
  const block = pdfEngineBlock();
  for (const field of ['jmeno', 'narozeni', 'trvale-bydliste-ulice', 'trvale-bydliste-mesto', 'trvale-bydliste-psc']) {
    assert.match(block, new RegExp(`getField\\('${field}'\\)`), `Missing AcroForm field: ${field}`);
  }
  assert.match(block, /parseQuestionnaireText\(await readPdfTextItems\(arrayBuffer\)\)/, 'Missing text fallback');
  assert.match(html, /pdf\.js\/3\.11\.174\/pdf\.min\.js/, 'Missing pinned PDF.js library');
});

test('flat questionnaire text is parsed into personal data', () => {
  const parse = loadQuestionnaireParser();
  assert.deepEqual(parse(flatQuestionnaireItems()), {
    jmeno: 'Jan Novák',
    narozeni: '1.2.1990 / Brno',
    adresaUlice: 'Dlouhá 12',
    mesto: 'Praha',
    psc: '110 00',
  });
});

test('empty permanent address does not borrow the delivery-address header', () => {
  const parse = loadQuestionnaireParser();
  const items = flatQuestionnaireItems({ street: '', city: '', zip: '' });
  const result = parse(items);
  assert.equal(result.adresaUlice, '');
  assert.equal(result.mesto, '');
  assert.equal(result.psc, '');
  assert.equal(result.jmeno, 'Jan Novák');
});

test('unrelated PDF text yields no personal data', () => {
  const parse = loadQuestionnaireParser();
  const result = parse([{ str: 'Faktura', x: 46, y: 800 }]);
  assert.ok(!Object.values(result).some(Boolean));
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

test('splash uses executive ignition concept while preserving timing', () => {
  assert.match(html, /id="splash"/, 'Splash overlay should stay present');
  assert.match(html, /Lékařská prohlídka/, 'Splash should use the requested headline');
  assert.match(html, /class="splash-ignition"/, 'Missing executive ignition composition layer');
  assert.match(html, /class="splash-mark"/, 'Missing central LP logo mark');
  assert.match(html, /<svg[^>]*class="splash-mark-svg"/, 'Logo mark should be inline SVG, not an external asset');
  assert.match(html, /<text[^>]*>LP<\/text>/, 'Logo mark should render the LP initials');
  assert.match(html, /class="splash-orbit"/, 'Missing neon launch ring');
  assert.match(html, /class="splash-pulse"/, 'Missing medical pulse motif');
  assert.match(html, /class="splash-progress"/, 'Missing short progress line');
  assert.match(html, /setTimeout\(\(\) => \{[\s\S]*?splash\.classList\.add\('hide'\);[\s\S]*?\},\s*1200\);/, 'Splash active timing should remain 1200ms');
  assert.match(html, /setTimeout\(\(\) => splash\.remove\(\),\s*400\);/, 'Splash fade-out removal should remain 400ms');
});

test('decorative flying dogs stay outside the form contract', () => {
  const dogAsset = new URL('../assets/flying-dog.png', import.meta.url);
  assert.ok(existsSync(dogAsset), 'Missing decorative dog asset');
  assert.match(html, /class="dog-fleet" aria-hidden="true"/, 'Missing non-semantic dog animation layer');
  assert.match(html, /pointer-events:\s*none/, 'Dog animation layer should never block form controls');
  assert.match(html, /@keyframes dogDrift/, 'Dogs should have a drifting animation');
  assert.match(html, /@keyframes dogSpin/, 'Dogs should have a spinning animation');
  assert.equal((html.match(/class="flying-dog/g) || []).length, 12, 'Expected twelve flying dogs');
  assert.match(html, /--size:\s*clamp\(92px,\s*8\.4vw,\s*152px\)/, 'Dogs should be doubled in size');
  assert.match(html, /assets\/flying-dog\.png/, 'Dog layer should use the checked-in asset');
});
