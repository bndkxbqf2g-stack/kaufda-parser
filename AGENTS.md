# Repository instructions

- Read `README.md` for the parser contract and `HANDOFF.md` for implementation history before changing behavior.
- Parse only visibly supported KaufDA offer evidence. Keep uncertain values explicit; do not infer missing prices, packs, discounts, or conditions without evidence.
- Add a focused regression test for each parser behavior change. Prefer targeted changes; do not refactor files only because they are large.
- Keep prospect comparison evidence separate from parser code. Never add private chat, session, account, or user data to this public repository.
- A passing test suite does not prove prospect coverage. Verify affected cards against the source prospect and record unresolved cases as open.

Useful checks:

```sh
npm test
node src/cli.mjs validate --config kaufda-parser.config.json
git diff --check
```
