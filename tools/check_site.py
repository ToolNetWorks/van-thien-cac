#!/usr/bin/env python3
"""Read-only structural & asset-integrity checks for Vân Thiên Các."""
from pathlib import Path
import json
import re
import sys

ROOT = Path(__file__).resolve().parent.parent
failures = []

required = [
    'index.html',
    'favicon.ico',
    'src/js/app.js',
    'src/styles/main.css',
    'components/header/header.html',
    'components/header/header.css',
    'components/footer/footer.html',
    'components/footer/footer.css',
    'components/crane/crane-stage.html',
    'data/movies.json',
    'assets/icons/favicon.svg',
    'assets/icons/icon-sprite.svg',
    'assets/scenes/tien-gioi-real.webp',
    'assets/scenes/tien-gioi-real-loop.webp',
    'assets/scenes/cloud-veil-mist.webp',
    'assets/scenes/cloud-veil-gold.webp',
    'assets/creatures/dragon/footer-dragon.webp',
    'server/__init__.py',
    'server/cultivation.py',
    'server/db.py',
    'server/auth.py',
    'server/api.py',
    'tools/admin.py',
]
for name in required:
    if not (ROOT / name).is_file():
        failures.append(f'Missing: {name}')

if (ROOT / 'data/movies.json').exists():
    data = json.loads((ROOT / 'data/movies.json').read_text(encoding='utf-8'))
    ids = set()
    for m in data:
        slug = m.get('id', '')
        if not re.fullmatch('[a-z0-9-]+', slug):
            failures.append(f'Invalid slug: {slug}')
        if slug in ids:
            failures.append(f'Duplicate slug: {slug}')
        ids.add(slug)
        if not (ROOT / 'assets' / m.get('poster', '')).is_file():
            failures.append(f'Missing poster: {slug} ({m.get("poster")})')
        if m.get('poster_vertical') and not (ROOT / 'assets' / m.get('poster_vertical', '')).is_file():
            failures.append(f'Missing poster_vertical: {slug}')
        if m.get('cover_horizontal') and not (ROOT / 'assets' / m.get('cover_horizontal', '')).is_file():
            failures.append(f'Missing cover_horizontal: {slug}')
        if m.get('availableEpisodes', 0) > m.get('episodes', 0):
            failures.append(f'Invalid episode count: {slug}')
    print(f'Validated {len(data)} sample movies, {len(ids)} unique slugs')

# Structural guardrails for persistent crane & layout
index_content = (ROOT / 'index.html').read_text(encoding='utf-8')
app_content = (ROOT / 'src/js/app.js').read_text(encoding='utf-8')
stage_content = (ROOT / 'components/crane/crane-stage.html').read_text(encoding='utf-8')
css_content = (ROOT / 'src/styles/main.css').read_text(encoding='utf-8')

if 'class="sky-crane"' not in index_content:
    failures.append('Missing persistent crane iframe')
if '<video' in index_content:
    failures.append('Backdrop <video> found in index.html (breaks iOS WKWebView inline playback)')
if 'class="hero-crane"' in app_content:
    failures.append('Old stationary hero-crane found in SPA')
if '@keyframes sky-crossing' not in stage_content:
    failures.append('Missing full-screen crane flight animation')
if 'position:fixed' not in css_content.split('.sky-crane{', 1)[-1][:100]:
    failures.append('Crane layer is not fixed')

if (ROOT / 'assets/creatures/crane/crane.svg').is_file() and (ROOT / 'assets/creatures/crane/crane.css').is_file():
    print('Crane assets installed: original SVG + CSS available')
else:
    failures.append('Missing crane assets in assets/creatures/crane/')

# Verify CSS braces across all active stylesheets
for css_path in ['src/styles/main.css', 'components/header/header.css', 'components/footer/footer.css']:
    text = (ROOT / css_path).read_text(encoding='utf-8')
    if text.count('{') != text.count('}'):
        failures.append(f'Unbalanced CSS braces in {css_path}')

if failures:
    print('\n'.join(f'ERROR: {item}' for item in failures))
    sys.exit(1)
print('Site structural checks: PASS')
