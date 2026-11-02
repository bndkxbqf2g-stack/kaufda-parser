#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_CONFIG, loadConfig, mergeConfig, runParser, validateConfig } from './index.mjs';

function args(argv) {
  const result = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith('--')) {
      result._.push(item);
      continue;
    }
    const [key, inline] = item.slice(2).split('=', 2);
    result[key] = inline ?? (argv[index + 1]?.startsWith('--') ? true : argv[++index]);
  }
  return result;
}

function help() {
  console.log(`kaufda-parser ${'0.1.0'}

Befehle:
  init      Beispielkonfiguration und GitHub-Action anlegen
  validate  Konfiguration prüfen
  parse     KaufDA-Seiten öffnen, Angebote laden und JSON schreiben

Beispiele:
  node src/cli.mjs init --city Zellingen --zip 97225
  node src/cli.mjs validate --config kaufda-parser.config.json
  node src/cli.mjs parse --config kaufda-parser.config.json --output generated/offers.json
  node src/cli.mjs parse --market Aldi-Sued --headed
`);
}

function exampleConfig(options) {
  return mergeConfig({
    location: { city: options.city ?? 'Zellingen', zip: options.zip ?? '97225' },
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
    # Montag und Donnerstag, 05:15 UTC. Die Tage können angepasst werden.
    - cron: '15 5 * * 1,4'
  push:
    paths:
      - 'kaufda-parser.config.json'
      - 'src/**'
      - '.github/workflows/kaufda-offers.yml'

permissions:
  contents: write

jobs:
  update-offers:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm install --no-audit --no-fund
      - run: npx playwright install --with-deps chromium
      - run: node src/cli.mjs parse --config kaufda-parser.config.json --output generated/offers.json
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
  const options = args(process.argv.slice(2));
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
  if (command !== 'parse') return help();
  if (!check.valid) throw new Error(check.errors.join('; '));

  const outputPath = path.resolve(options.output ?? path.join(config.output.directory, config.output.file));
  const document = await runParser(config, {
    outputPath,
    marketKey: options.market ?? null,
    headed: Boolean(options.headed)
  });
  console.log(JSON.stringify(document.summary, null, 2));
  console.log(`Ausgabe: ${outputPath}`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

