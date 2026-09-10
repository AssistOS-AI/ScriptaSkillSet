# Pornire în orice proiect

Copiază întregul director `theatrical-audio` într-un loc accesibil agentului. Nu sunt necesare un workspace SHF, alt skill sau fișiere de configurare. Este necesar Node.js 22+.

Rulează din proiectul în care vrei rezultatele. În exemple, `SKILL_ROOT` este calea absolută către copia skillului, definită de tine în shell. Poți folosi direct calea absolută, fără variabilă.

## Verificare fără chei sau instalări

`node "$SKILL_ROOT/bin/audio.mjs" validate "$SKILL_ROOT/examples/minimal.score.json"`

`node "$SKILL_ROOT/bin/audio.mjs" plan "$SKILL_ROOT/examples/the-last-light.score.json" --engine gemini`

Validarea și planificarea nu generează voce și nu fac cereri de sinteză.

## Generarea unei replici

Alege furnizorul și configurează cheia în mediul procesului. De exemplu, pentru Gemini se folosește `GEMINI_API_KEY`. Alternativ, creează un fișier local cu variabilele TTS și adaugă `--credentials-file CALE` la comandă. Nu trimite cheia în conversație.

`node "$SKILL_ROOT/bin/audio.mjs" say "Mai avem timp." --engine gemini --voice Kore --max-requests 1 --out output/replica.wav`

Verifică accesul, costul și limba vocii pentru contul ales. Registrul de oferte inclus este datat; nu verifică soldul și nu garantează sinteză gratuită. Rezultatul include WAV și fișierele scenei. Ascultă replica pentru pronunție și interpretare.

## Configurări opționale

- `--settings CALE` selectează setări publice JSON. Implicit se citește `audio.config.json` din directorul curent, dacă există.
- `setup gemini` salvează doar preferința în proiectul curent, fără cerere API. Nu este necesar dacă folosești `--engine`.
- `--workspace-root CALE` permite încărcarea variabilelor TTS din `CALE/.apikeys`. Nu se caută directoare părinte.
- `--out` și `--cache` aleg alte destinații. Implicit se folosesc `output/` și `.theatrical-audio/cache/speech/` în proiectul curent.

Modelele locale Qwen/Kokoro necesită Python, pachete și modele pregătite explicit. Nu se descarcă la randare și nu sunt necesare pentru furnizorii cloud. Vezi [dependențele](dependencies.md) și [configurarea](docs/CONFIGURATION.md).
