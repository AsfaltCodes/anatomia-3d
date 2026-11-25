# Anatomia 3D — documentație

## 1. Scopul proiectului

**Anatomia 3D** este un joc educativ în browser pentru învățarea anatomiei umane. Ideea vine de la Seterra, jocul de geografie în care primești numele unei țări și trebuie să dai click pe ea pe hartă. Aici „harta” este un corp uman 3D pe care îl poți roti și mări.

Jocul acoperă trei sisteme:

- **Oase** — 35 de structuri (de la femur la osul lacrimal);
- **Mușchi** — 56 de structuri;
- **Sistemul nervos** — 28 de structuri ale sistemului nervos central (lobii creierului, cerebelul, trunchiul cerebral, măduva spinării, nervul optic etc.).

Interfața și toate denumirile sunt disponibile în **română** și **engleză**, cu un buton de comutare în colțul din dreapta sus.

## 2. Cum se rulează

Site-ul este format doar din fișiere statice (HTML, CSS, JavaScript și modele 3D). Nu are nevoie de server special sau de bază de date, dar **nu poate fi deschis direct prin dublu-click** pe `index.html`. Browserele blochează încărcarea modelelor 3D din fișiere locale din motive de securitate, așa că avem nevoie de un mic server local.

### Varianta 1 — cu Python (de obicei e deja instalat)

```bash
cd atestat-c
python3 -m http.server 8000
```

Apoi deschide în browser: <http://localhost:8000>

### Varianta 2 — cu Node.js

```bash
cd atestat-c
npx serve .
```

Apoi deschide adresa afișată în terminal (de obicei <http://localhost:3000>).

Jocul funcționează **complet offline**: biblioteca three.js și fonturile sunt incluse în proiect, în folderul `vendor/`.

### Mai târziu: GitHub Pages

Pentru că folosește doar căi relative, site-ul poate fi publicat pe GitHub Pages fără nicio modificare: urci folderul într-un repository și activezi Pages din setări.

## 3. Cum se joacă

### Ecranul de start
Pe ecranul de start se rotește un schelet 3D desenat în stil **dither** (din puncte alb-negru, ca o imagine tipărită). Apasă **Începe**.

### Meniul
Alegi trei lucruri:

1. **Sistemul**: oase, mușchi sau sistemul nervos.
2. **Modul de joc**:
   - **Găsește structura** — apare un nume (de exemplu „Femurul”) și dai click pe structura respectivă pe corp;
   - **Numește structura** — o structură este evidențiată cu roșu și trebuie să-i spui numele, fie alegând din 4 variante, fie scriindu-l;
   - **Explorează** — fără scor: treci cu mouse-ul peste corp ca să vezi numele și dai click pentru o scurtă descriere.
3. **Nivelul de detaliu**:
   - **Principale** — doar structurile importante (nivelul 1);
   - **Toate** — toate structurile sistemului;
   - **Progresiv** — începi cu cele principale, iar dacă obții cel puțin 80% se adaugă și restul.

### Punctajul
La fel ca în Seterra, ai **3 încercări** pentru fiecare structură:

| Răspuns corect la… | Puncte |
|---|---|
| prima încercare | 100 |
| a doua încercare | 66 |
| a treia încercare | 33 |
| deloc (sau „Sari peste”) | 0 |

Scorul final este media acestor puncte, în procente. **Timpul** este afișat separat și nu schimbă scorul. Cel mai bun rezultat se salvează în browser: un rezultat e „record nou” dacă are procentul mai mare sau, la procent egal, timpul mai mic.

După a treia greșeală, structura corectă clipește cu roșu, iar camera „zboară” spre ea ca să vezi unde era.

### Controale
- **Trage** cu mouse-ul pentru a roti corpul, **scroll** pentru zoom;
- un click doar contează dacă nu ai mișcat mouse-ul (ca să nu ghicești din greșeală când rotești);
- un click în gol nu consumă o încercare;
- panoul **Straturi** ascunde sau arată pielea, mușchii, oasele și sistemul nervos. Dacă ascunzi stratul din care face parte întrebarea, jocul îl reafișează automat;
- **Vedere din față** readuce camera în poziția inițială.

### Răspunsuri scrise
Când scrii numele, jocul este „îngăduitor”:
- nu contează diacriticele (`muschiul` = `mușchiul`) și nici literele mari;
- poți scrie numele în română sau în engleză;
- poți omite cuvinte generale ca „Mușchiul” sau „Osul” (`biceps brahial` e acceptat);
- la nume cu paranteză, de exemplu „Scapula (omoplatul)”, merge oricare dintre variante.

## 4. Structura codului

```
index.html            pagina principală
css/style.css         stilul: culori, fonturi, așezare în pagină
js/
  main.js             ecranele jocului și legătura dintre ele
  quiz.js             regulile jocului (punctaj, încercări, niveluri)
  scene.js            scena 3D (încărcare modele, rotire, click, evidențiere)
  dither.js           efectul dither de pe ecranul de start
  results.js          ecranul cu rezultatul
  i18n.js             traducerea RO/EN și verificarea răspunsurilor scrise
  storage.js          salvarea în browser (localStorage)
data/
  structures.json     lista structurilor anatomice
  strings.json        toate textele interfeței, în română și engleză
assets/models/        modelele 3D (bones, muscles, nerves, skin .glb)
vendor/               three.js și fonturile, incluse local
tools/                scripturi folosite doar la construirea proiectului
tests/                testele automate
```

### `index.html`
Conține doar „scheletul” paginii: bara de sus (logo + butoanele RO/EN), zona `#app` în care se desenează ecranele și subsolul cu sursa modelelor. Un **import map** spune browserului unde găsește biblioteca three.js (`vendor/three/`).

### `css/style.css`
Toate culorile sunt definite o singură dată, ca variabile: `--paper` (fundalul, culoarea hârtiei), `--ink` (cerneala, negru), `--accent` (roșul folosit doar pentru evidențiere, greșeli și răspunsul corect). Fonturile sunt **Instrument Serif** pentru titluri și **Inter** pentru text. La final, o regulă `@media` rearanjează elementele pe ecrane mici (telefon).

### `js/main.js`
Este „dirijorul” jocului. Fiecare ecran este un obiect cu două funcții, `enter()` (desenează ecranul) și `leave()` (curăță în urmă), iar funcția `show(ecran)` trece de la unul la altul:

- `titleScreen()` — ecranul de start cu scheletul dither;
- `menuScreen()` — meniul cu alegerile, care ține minte ultima selecție;
- `gameScreen(config)` — jocul propriu-zis, în toate cele trei moduri;
- `resultsScreen(...)` — rezultatul.

Când schimbi limba, fiecare ecran are o funcție `relabel()` care rescrie textele fără să piardă progresul jocului.

### `js/quiz.js`
Conține **doar regulile**, fără nimic grafic, ca să poată fi testate separat:

- `createQuiz({ structures, system, mode, detail })` creează un joc nou: alege structurile potrivite și le amestecă;
- `quiz.answer(id)` primește răspunsul și întoarce `correct`, `wrong`, `reveal` (a treia greșeală) sau `ignored` (click în gol);
- `quiz.skip()` sare peste întrebare (0 puncte);
- `quiz.score()` calculează procentul;
- `quiz.choices(4)` alege 4 variante pentru modul „Numește structura”, din același nivel;
- `isBetter(a, b)` decide dacă un rezultat e record nou.

Amestecarea folosește algoritmul **Fisher–Yates**: parcurge lista de la coadă la cap și schimbă fiecare element cu unul ales la întâmplare dintre cele dinaintea lui.

### `js/scene.js`
Se ocupă de tot ce e 3D, folosind biblioteca **three.js**:

- `loadSystem(system)` încarcă un model `.glb`, o singură dată;
- `createScene(canvas, structures)` creează scena, lumina, camera și controalele de rotire (`OrbitControls`);
- `setLayer(system, vizibil)` ascunde sau arată un strat;
- `onPick(...)` și `onHover(...)` anunță pe ce structură ai dat click sau ai trecut cu mouse-ul;
- `highlight(id, stare)` colorează o structură (`target` = clipește roșu, `wrong` = roșu, `correct` = gri închis);
- `flyTo(id)` mută lin camera spre o structură;
- `frameSystem(system)` încadrează tot sistemul în ecran.

### `js/dither.js`
Creează efectul de pe ecranul de start (explicat la secțiunea 5).

### `js/results.js`
Afișează scorul cu o animație de numărare (de la 0 la scorul final), timpul, eticheta „Record nou” și, la 100%, o mică „explozie” de pătrățele roșii. Tot aici se salvează recordul.

### `js/i18n.js`
- `t(cheie)` întoarce textul în limba curentă din `strings.json`;
- `setLang('ro' | 'en')` schimbă limba și anunță restul aplicației;
- `nameOf(structură)` și `descOf(structură)` întorc numele și descrierea în limba curentă;
- `normalize(text)` scoate diacriticele, spațiile duble și literele mari;
- `matches(răspuns, structură)` verifică un răspuns scris.

### `js/storage.js`
Două funcții mici, `load` și `save`, care citesc și scriu în `localStorage`. Sunt protejate cu `try/catch`: dacă browserul blochează salvarea (de exemplu în modul privat), jocul merge mai departe, doar că nu ține minte recordurile.

### `data/structures.json`
Fiecare structură arată așa:

```json
{
  "id": "femur",
  "system": "bones",
  "tier": 1,
  "src": ["femur"],
  "name": { "ro": "Femurul", "en": "Femur" },
  "desc": { "ro": "Osul coapsei, cel mai lung…", "en": "The thigh bone…" }
}
```

- `tier` este nivelul (1 = principal, 2 = detaliu);
- `src` sunt numele în engleză din baza de date BodyParts3D din care se construiește modelul acelei structuri.

## 5. Cum funcționează partea 3D

### Scena
O scenă three.js are trei elemente de bază: **scena** (obiectele), **camera** (de unde privim) și **renderer-ul** (cel care desenează imaginea de 60 de ori pe secundă). Corpul este luminat de o lumină „cer–pământ” (`HemisphereLight`) și de două lumini direcționale, ca într-un studio foto. Toate structurile folosesc același material mat, în tonuri de hârtie, pentru un stil consecvent.

### Cum știe jocul pe ce ai dat click: raycasting
Când dai click, poziția mouse-ului este transformată în coordonate de la −1 la 1. Din cameră se „trage” o rază (un **ray**) prin acel punct, iar three.js calculează ce obiecte 3D intersectează raza. Primul obiect lovit este structura pe care ai dat click. Fiecare structură este un obiect separat al cărui nume este chiar `id`-ul ei, deci jocul știe imediat ce ai ales.

### Conturul la hover
Structura de sub mouse primește un contur negru subțire cu ajutorul unui `OutlinePass`. Acesta desenează scena a doua oară, doar cu obiectul ales, și îi detectează marginile.

### Zborul camerei
`flyTo` calculează cutia care încadrează structura (`Box3`) și o poziție a camerei de la care se vede bine. Apoi, timp de 0,8 secunde, mută camera treptat cu o curbă de încetinire (*ease-out*): se mișcă repede la început și frânează lin la final.

### Efectul dither de pe prima pagină
Scheletul este desenat mai întâi normal, în tonuri de gri, iar apoi fiecare pixel trece printr-un **shader** (un mic program care rulează pe placa video) care îl transformă în alb sau negru. Pentru a decide, folosește o **matrice Bayer** de 8×8: un tabel cu praguri diferite, care se repetă pe tot ecranul. Primele 4×4 valori arată așa (împărțite la 16):

```
 0  8  2 10
12  4 14  6
 3 11  1  9
15  7 13  5
```

Un pixel devine **hârtie** dacă luminozitatea lui e mai mare decât pragul din căsuța corespunzătoare și **cerneală** dacă e mai mică. O zonă gri deschis are puțini pixeli negri, iar una gri închis are mulți. Așa se obțin nuanțe folosind doar două culori, la fel ca la imprimantele și ecranele vechi. Ca efectul să se vadă clar, pixelii sunt grupați în pătrățele de 2×2.

## 6. Datele anatomice

Modelele 3D provin din **BodyParts3D**, o bază de date publică japoneză cu modele ale corpului uman construite din scanări reale. Fiecare os sau mușchi este acolo un fișier `.obj` separat.

Scriptul `tools/build-models.mjs` (rulat o singură dată, cu `npm run build:models`):

1. citește lista de structuri din `data/structures.json`;
2. caută fișierele `.obj` corespunzătoare numelor din `src` (de exemplu, „deltoid” e format din 3 părți);
3. unește bucățile fiecărei structuri într-un singur obiect (stânga și dreapta la un loc);
4. întoarce corpul în poziția corectă (BodyParts3D folosește milimetri și axa Z în sus; three.js folosește metri și axa Y în sus);
5. **simplifică** modelele (păstrează aproximativ 20–25% din triunghiuri) și le **comprimă**, ca să se încarce repede: toate modelele au împreună sub 4 MB;
6. scrie fișierele `assets/models/*.glb`.

Scriptul `tools/check-data.mjs` (`npm run check:data`) verifică că fiecare structură are nume și descriere în ambele limbi și un model 3D.

**Limite ale datelor:** BodyParts3D nu conține nervii periferici (sciatic, median etc.) și nici câțiva mușchi (marele dorsal, dreptul abdominal, maseterul, mușchii feței). De aceea sistemul nervos se limitează la sistemul nervos central.

**Verificarea conținutului:** denumirile și descrierile în română au fost scrise pentru acest proiect și trebuie verificate de profesorul de biologie înainte de prezentare.

## 7. Testare

Regulile jocului au teste automate (în folderul `tests/`), care se rulează cu:

```bash
npm test
```

Testele verifică, de exemplu, că punctajul e 100/66/33/0, că un click în gol nu consumă o încercare, că modul progresiv adaugă structurile noi doar de la 80% în sus și că răspunsurile scrise fără diacritice sunt acceptate. În plus:

- `npm run check:data` verifică datele anatomice;
- `npm run check:strings` verifică că toate textele există în ambele limbi.

## 8. Surse și licențe

- **BodyParts3D**, © The Database Center for Life Science licensed under CC Attribution 4.0 International — <https://dbarchive.biosciencedbc.jp/en/bodyparts3d/>
- **three.js** — licență MIT — <https://threejs.org>
- **Instrument Serif** și **Inter** — fonturi cu licență SIL Open Font License (fișierele de licență sunt în `vendor/fonts/`)

## 9. Dezvoltări viitoare

- alte sisteme: inima și vasele de sânge, organele interne (există deja în BodyParts3D);
- publicarea pe GitHub Pages;
- o temă întunecată;
- un mod „contra-cronometru”;
- nervii periferici, dintr-o altă sursă de modele.
