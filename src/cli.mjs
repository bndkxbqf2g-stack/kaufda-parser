#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { parseCliArgs } from './cli-args.mjs';
import { loadConfig, mergeConfig, mergeMarketDocuments, runParser, validateConfig, validateFullOutputDocument, validateOutputDocument } from './index.mjs';

function help() {
  console.log(`kaufda-parser ${'0.2.0'}

Befehle:
  init      Beispielkonfiguration und GitHub-Action anlegen
  validate  Konfiguration prüfen
  parse     KaufDA-Seiten öffnen, Angebote laden und JSON schreiben
  merge     Einzelmarktergebnisse zu einem Gesamtfeed zusammenführen
  verify    Angebotsdatei auf sichere Veröffentlichung prüfen

Beispiele:
  node src/cli.mjs init --city Zellingen --zip 97225
  node src/cli.mjs validate --config kaufda-parser.config.json
  node src/cli.mjs parse --config kaufda-parser.config.json --output generated/offers.json
  node src/cli.mjs parse --config kaufda-parser.config.json --market Lidl-Zellingen --output generated/parts/Lidl-Zellingen.json
  node src/cli.mjs parse --config kaufda-parser.config.json --market Kaufland-Wuerzburg --debug-prospect --output generated/parts/Kaufland-Wuerzburg.json
  node src/cli.mjs parse --config kaufda-parser.config.json --market Kaufland-Wuerzburg --debug-prospect --debug-spread 41 --output generated/parts/Kaufland-Wuerzburg.json
  node src/cli.mjs merge --config kaufda-parser.config.json --input-dir generated/parts --output generated/offers.next.json
  node src/cli.mjs verify --input generated/offers.json
  node src/cli.mjs parse --market Aldi-Sued --headed
`);
}

function exampleConfig(options) {
  return mergeConfig({
    location: { city: options.city ?? 'Zellingen', zip: options.zip ?? '97225' },
    offerCategory: 'Lebensmittel und Getränke',
    offerCategoryMode: 'include-all',
    imageOcr: { enabled: true, required: true, blockPlanning: false },
    markets: [{
      key: 'Aldi-Sued',
      store: 'ALDI SÜD',
      url: 'https://www.kaufda.de/search?query=ALDI+SÜD&city=Zellingen&zip=97225',
      productGroups: ['food']
    }]
  });
}

const actionWorkflow = `name: KaufDA-Angebote aktualisieren

on:
  workflow_dispatch:
  schedule:
    # Täglich 05:15 UTC.
    - cron: '15 5 * * *'

concurrency:
  group: kaufda-offers
  cancel-in-progress: false

permissions:
  contents: write

jobs:
  update-offers:
    runs-on: ubuntu-latest
    timeout-minutes: 60
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4
      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4
        with:
          node-version: 20
      - run: npm ci --no-audit --no-fund
      - run: npm test
      - run: node src/cli.mjs validate --config kaufda-parser.config.json
      - run: npx --no-install playwright install chromium
      - run: node src/cli.mjs parse --config kaufda-parser.config.json --output generated/offers.next.json
      - run: node src/cli.mjs verify --config kaufda-parser.config.json --input generated/offers.next.json
      - run: mv generated/offers.next.json generated/offers.json
      - run: git diff --check
      - name: Änderungen veröffentlichen
        run: |
          git config user.name 'github-actions[bot]'
          git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
          git add generated/offers.json
          git diff --cached --quiet || git commit -m 'chore: KaufDA-Angebote aktualisieren'
          git push
`;

async function init(options) {
  const configPath = options.config ?? 'kaufda-parser.config.json';
  try {
    await fs.access(configPath);
    if (!options.force) throw new Error(`${configPath} existiert bereits. Für Überschreiben --force verwenden.`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await fs.writeFile(configPath, `${JSON.stringify(exampleConfig(options), null, 2)}\n`, 'utf8');
  await fs.mkdir('.github/workflows', { recursive: true });
  await fs.writeFile('.github/workflows/kaufda-offers.yml', actionWorkflow, 'utf8');
  console.log(`Angelegt: ${configPath}`);
  console.log('Angelegt: .github/workflows/kaufda-offers.yml');
  console.log('Jetzt die KaufDA-Filial-URLs in der Konfiguration ersetzen und den Workflow starten.');
}

async function main() {
  const options = parseCliArgs(process.argv.slice(2));
  const command = options._[0];
  if (!command || command === 'help' || options.help) return help();

  if (command === 'init') return init(options);
  const configPath = options.config ?? 'kaufda-parser.config.json';
  const config = await loadConfig(configPath);
  const check = validateConfig(config);
  if (command === 'validate') {
    if (!check.valid) {
      console.error(check.errors.join('\n'));
      process.exitCode = 1;
      return;
    }
    console.log(`Konfiguration gültig: ${config.markets.length} Markt/ Märkte.`);
    return;
  }
  if (command === 'verify') {
    if (!check.valid) throw new Error(check.errors.join('; '));
    const inputPath = options.input ?? path.join(config.output.directory, config.output.file);
    const document = JSON.parse(await fs.readFile(inputPath, 'utf8'));
    const schema = JSON.parse(await fs.readFile(new URL('../schemas/vorratskompass-offers-v1.schema.json', import.meta.url), 'utf8'));
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    addFormats(ajv);
    const validateSchema = ajv.compile(schema);
    if (!validateSchema(document)) {
      for (const error of validateSchema.errors) {
        console.error(`Schema ${error.instancePath || '/'}: ${error.message}`);
      }
      process.exitCode = 1;
      return;
    }
    const result = options['allow-empty']
      ? validateOutputDocument(document, { allowEmptyOffers: true })
      : validateFullOutputDocument(document, config);
    result.warnings.forEach((warning) => console.warn(`Warnung: ${warning}`));
    if (!result.valid) {
      console.error(result.errors.join('\n'));
      process.exitCode = 1;
      return;
    }
    const label = document.summary.offerScope === 'selected-category' ? 'Kategorieangebote' : 'Lebensmittelangebote';
    const scope = options['allow-empty'] ? 'Marktdatei geprüft' : 'Gesamtfeed geprüft';
    console.log(`${scope}: ${document.summary.foodOfferCount} ${label}.`);
    return;
  }
  if (command === 'merge') {
    if (!check.valid) throw new Error(check.errors.join('; '));
    const inputDirectory = path.resolve(options['input-dir'] ?? path.join(config.output.directory, 'parts'));
    const inputFiles = (await fs.readdir(inputDirectory)).filter((name) => name.endsWith('.json')).sort();
    const documents = await Promise.all(inputFiles.map(async (name) => JSON.parse(await fs.readFile(path.join(inputDirectory, name), 'utf8'))));
    const document = mergeMarketDocuments(config, documents);
    const outputPath = path.resolve(options.output ?? path.join(config.output.directory, config.output.file));
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify(document.summary, null, 2));
    console.log(`Ausgabe: ${outputPath}`);
    return;
  }
  if (command !== 'parse') return help();
  if (!check.valid) throw new Error(check.errors.join('; '));

  const outputPath = path.resolve(options.output ?? path.join(config.output.directory, config.output.file));
  const document = await runParser(config, {
    outputPath,
    marketKey: options.market ?? null,
    headed: Boolean(options.headed),
    debugProspect: Boolean(options['debug-prospect']),
    debugSpread: options['debug-spread'] == null ? null : options['debug-spread'] === true ? Number.NaN : Number(options['debug-spread'])
  });
  console.log(JSON.stringify(document.summary, null, 2));
  console.log(`Ausgabe: ${outputPath}`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});


