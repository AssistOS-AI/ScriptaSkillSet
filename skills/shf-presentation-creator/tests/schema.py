#!/usr/bin/env python3
"""Optional JSON Schema checks. Needs Python jsonschema for testing, not playback."""
from pathlib import Path
import json, zipfile
from jsonschema import Draft202012Validator
ROOT=Path(__file__).resolve().parents[1];results=[]
schemas={n:json.loads((ROOT/f'assets/schema/{n}.schema.json').read_text()) for n in ['shf','shf-direction']}
for s in schemas.values():Draft202012Validator.check_schema(s)
for p in sorted((ROOT/'examples').glob('*.direction.json'))+sorted(ROOT.glob('*.ready.direction.json')):
 errors=[e.message for e in Draft202012Validator(schemas['shf-direction']).iter_errors(json.loads(p.read_text()))]
 results.append({'file':str(p.relative_to(ROOT)),'pass':not errors,'errors':errors[:8]})
for p in sorted((ROOT/'examples/rendered').glob('*.shf')):
 with zipfile.ZipFile(p) as z:f=json.loads(z.read('film.json'))
 errors=[e.message for e in Draft202012Validator(schemas['shf']).iter_errors(f)]
 results.append({'file':str(p.relative_to(ROOT)),'pass':not errors,'errors':errors[:8]})
report={'checks':len(results),'passed':sum(r['pass'] for r in results),'results':results}
(ROOT/'evaluation/schema-results.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
if report['passed']!=report['checks']:raise SystemExit(1)
