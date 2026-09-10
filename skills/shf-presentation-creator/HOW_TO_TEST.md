# Probă într-un proiect separat

## 1. Verifică pachetul fără instalare

Deschide `SHF_Cinema_Demo.html` și `SHF_Asset_Catalog.html` într-un browser. Pornește filmul; încearcă mute fără pauză, volumul, subtitrările, butonul pentru text și scenele. Compară Color, Light și Dark. Muzica se activează din iconița cu nota muzicală; nu există un sistem de notițe pentru spectator.

HTML-ul trebuie deschis ca pagină web cu JavaScript, nu ca previzualizare statică de document. În mediul nostru, accesul direct `file://` al browserului automat a fost blocat administrativ; conținutul HTML integral a fost testat offline într-o pagină de browser. Nu s-a testat pe un telefon fizic.

## 2. Rulează testele de bază

```sh
node --test tests/core.test.mjs
node tests/portability.mjs
```

Nu instalează nimic și nu apelează servicii. Al doilea test copiază skillul într-un director temporar separat, reconstruiește exemplele și instalează playerul într-un proiect independent. Curăță directorul temporar la final.

Opțional, pentru testarea browserului și schemelor, sunt necesare Playwright + Chromium și, respectiv, Python jsonschema, numai în mediul de test:

```sh
python tests/browser.py
python tests/schema.py
```

## 3. Cere coding agentului o adaptare reală

Instalează întregul director ca skill sau indică-i calea explicită. Un prompt de probă:

> Folosește skillul shf-presentation-creator din această cale. Citește documentul atașat integral sau declară clar ce nu poți extrage. Creează în proiectul curent un film SHF în română de 5–7 minute. Alege planul de regie potrivit și cele mai interesante idei susținute de document; nu fabrica noutate sau rezultate. Folosește biblioteca de asseturi pentru continuitate și obiecte particulare doar când sunt necesare. Descoperă skillurile reale de voce din mediul tău, compară trei audiții și generează replicile separat. Include instrucțiuni de ritm, pronunție și emoție. Măsoară audio, recalculează timeline-ul și verifică subtitrările și animația. Muzica să fie opțională și subtilă. Copiază playerul numai dacă proiectul nu are o versiune compatibilă. Livrează .shf, HTML autonom, scenariul editabil și raportul cu ce ai verificat efectiv.

Pentru o primă probă rapidă, folosește un text de 1–3 pagini și acceptă un film mai scurt; nu îi cere agentului să inventeze material pentru a umple minutele.

## 4. Ce să verifici în rezultat

Scenariul trebuie să răspundă la întrebarea deschisă la început, nu doar să fie animat. Compară afirmațiile cu sursa și verifică limitele. Ascultă replicile și îmbinările lor. Pe telefon, obiectele trebuie să rămână recognoscibile și subtitrările lizibile. Verifică dacă personajul rămâne același între scene. În lipsa unui skill de voce adecvat, rezultatul corect este un draft silențios cu sarcini de voce restante, nu o afirmație falsă că narațiunea profesională a fost generată.

Raportul de test din pachet validează mecanismele implementate și exemplele incluse. Nu garantează calitatea oricărui scenariu produs ulterior de un alt agent sau de un alt model de voce.
