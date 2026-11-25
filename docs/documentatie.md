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

### Pagina principală
Pagina principală arată direct toate quizurile, sub formă de carduri, grupate pe sisteme (oase, mușchi, sistemul nervos). Fiecare sistem are un card pentru tot sistemul și câte un card pentru fiecare regiune a corpului (de exemplu „Oasele capului” sau „Mușchii membrului inferior”). Imaginea de pe card este regiunea respectivă, desenată în stil **dither** (din puncte roz pe alb); când treci cu mouse-ul peste card, ea se rotește.

Pe card scrie și câte structuri are quizul și, dacă l-ai jucat deja, cel mai bun scor.

### Bara de sus
- **Oase / Mușchi / Sistemul nervos** — meniuri care listează quizurile fiecărui sistem;
- **Căutare** — scrii un nume de quiz sau de structură (de exemplu „femur”) și primești linkuri directe spre quizul potrivit;
- **RO / EN** — schimbă limba.

Pe telefon, toate acestea se găsesc în meniul ☰.

### Pagina de joc
Modelul 3D ocupă tot ecranul, între două bare subțiri:

- **sus** — întrebarea („Găsește Femurul”), progresul (4/29), încercările rămase, timpul și scorul;
- **jos** — modul de joc, nivelul, butonul **Straturi**, **Resetează vederea** și **Sari peste**.

Structurile din regiunea quizului sunt colorate normal; restul sistemului se vede estompat, ca să știi unde te afli pe corp, dar nu se poate selecta.

**Modurile de joc:**
- **Găsește** — apare un nume și dai click pe structura respectivă;
- **Numește** — o structură este evidențiată cu roz și îi spui numele, alegând din 4 variante sau scriindu-l;
- **Explorează** — fără scor: atingi o structură și vezi numele și o scurtă descriere.

**Nivelurile** (apar doar la quizurile unde au sens):
- **Principale** — doar structurile importante;
- **Toate** — toate structurile din quiz;
- **Progresiv** — începi cu cele principale, iar dacă obții cel puțin 80% se adaugă și restul.

La final apare o fereastră cu scorul, timpul și butoanele **Joacă din nou** și **Alege alt quiz**.

### Punctajul
Ai **3 încercări** pentru fiecare structură:

| Răspuns corect la… | Puncte |
|---|---|
| prima încercare | 100 |
| a doua încercare | 66 |
| a treia încercare | 33 |
| deloc (sau „Sari peste”) | 0 |

Scorul final este media acestor puncte, în procente. **Timpul** este afișat separat și nu schimbă scorul. Cel mai bun rezultat se salvează în browser: un rezultat e „record nou” dacă are procentul mai mare sau, la procent egal, timpul mai mic.

După a treia greșeală, structura corectă clipește cu roz, iar camera „zboară” spre ea ca să vezi unde era.

### Controale
- **Trage** cu mouse-ul pentru a roti corpul, **scroll** pentru zoom;
- pe telefon: **un deget** rotește, **două degete** fac zoom și mută modelul;
- un click doar contează dacă nu ai mișcat mouse-ul (ca să nu ghicești din greșeală când rotești);
- un click în gol nu consumă o încercare;
- panoul **Straturi** ascunde sau arată pielea, mușchii, oasele și sistemul nervos. Dacă ascunzi stratul din care face parte întrebarea, jocul îl reafișează automat;
- **Resetează vederea** readuce camera în poziția inițială.

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
  main.js             bara de sus, pagina principală, pagina de joc și navigarea
  quiz.js             regulile jocului (punctaj, încercări, niveluri)
  scene.js            scena 3D (încărcare modele, rotire, click, evidențiere)
  dither.js           imaginile dither de pe carduri
  results.js          fereastra cu rezultatul
  i18n.js             traducerea RO/EN și verificarea răspunsurilor scrise
  storage.js          salvarea în browser (localStorage)
data/
  structures.json     lista structurilor anatomice
  quizzes.json        lista quizurilor (sistem + regiune)
  strings.json        toate textele interfeței, în română și engleză
assets/models/        modelele 3D (bones, muscles, nerves, skin .glb)
vendor/               three.js și fonturile, incluse local
tools/                scripturi folosite doar la construirea proiectului
tests/                testele automate
```

### `index.html`
Conține doar „scheletul” paginii: bara de sus (logo, meniuri, căutare, RO/EN, butonul ☰ pentru telefon) și zona `#app` în care se desenează paginile. Un **import map** spune browserului unde găsește biblioteca three.js (`vendor/three/`).

### `css/style.css`
Toate culorile sunt definite o singură dată, ca variabile: `--bg` (alb), `--ink` (textul), `--muted` (text secundar), `--line` (contururi) și `--pink`, singura culoare de accent, folosită pentru butoane, structura căutată, progres și imaginile de pe carduri. Tot site-ul folosește un singur font, **Inter**.

Pagina de joc este un grid pe toată înălțimea ecranului (`100dvh`): bara de întrebare, modelul și bara de unelte. Regulile `@media` de la final ascund meniurile în ☰ sub 860px lățime și transformă butoanele în iconițe sub 560px.

### `js/main.js`
Este „dirijorul” site-ului. Adresa paginii decide ce se afișează (**routing** cu `#`):

- `#/` — pagina principală (`homePage()`);
- `#/quiz/bones-head` — pagina de joc pentru quizul cu id-ul `bones-head` (`playPage(quiz)`).

Așa, fiecare card e un link adevărat, iar butonul **Înapoi** al browserului funcționează. Fiecare pagină este un obiect cu `enter()` (desenează pagina), `leave()` (oprește cronometrul, animațiile și scena 3D) și `relabel()` (rescrie textele când schimbi limba, fără să piardă progresul).

Tot aici sunt `renderNav()` (meniurile din bara de sus) și `searchResults(text)` (căutarea în quizuri și structuri).

### `js/quiz.js`
Conține **doar regulile**, fără nimic grafic, ca să poată fi testate separat:

- `createQuiz({ structures, system, region, mode, detail })` creează un joc nou: alege structurile sistemului (și ale regiunii, dacă e dată) și le amestecă;
- `quiz.answer(id)` primește răspunsul și întoarce `correct`, `wrong`, `reveal` (a treia greșeală) sau `ignored` (click în gol);
- `quiz.skip()` sare peste întrebare (0 puncte);
- `quiz.score()` calculează procentul;
- `quiz.choices(4)` alege 4 variante pentru modul „Numește structura”, din același nivel;
- `availableDetails(structuri)` spune ce niveluri are sens să oferim (de exemplu, un quiz în care toate structurile sunt principale are doar nivelul „Toate”);
- `isBetter(a, b)` decide dacă un rezultat e record nou.

Amestecarea folosește algoritmul **Fisher–Yates**: parcurge lista de la coadă la cap și schimbă fiecare element cu unul ales la întâmplare dintre cele dinaintea lui.

### `js/scene.js`
Se ocupă de tot ce e 3D, folosind biblioteca **three.js**:

- `loadSystem(system)` încarcă un model `.glb`, o singură dată;
- `createScene(canvas, structures)` creează scena, lumina, camera și controalele de rotire (`OrbitControls`);
- `setLayer(system, vizibil)` ascunde sau arată un strat;
- `onPick(...)` și `onHover(...)` anunță pe ce structură ai dat click sau ai trecut cu mouse-ul;
- `setFocus(sistem, id-uri)` face selectabile doar structurile quizului și estompează restul sistemului;
- `highlight(id, stare)` colorează o structură (`target` = clipește roz, `correct` = roz, `wrong` = gri închis);
- `flyTo(id)` mută lin camera spre o structură;
- `frameFocus()` încadrează regiunea quizului în ecran;
- `pause()` / `resume()` opresc și pornesc desenarea când ieși sau intri pe pagina de joc.

### `js/dither.js`
Desenează imaginile de pe carduri (explicat la secțiunea 5). Folosește **un singur** context WebGL pentru toate cardurile: desenează fiecare regiune pe o pânză ascunsă și o copiază apoi în cardul ei. Doar cardul de sub mouse este redesenat continuu, ca să se rotească.

### `js/results.js`
Afișează, într-o fereastră peste model (`<dialog>`), scorul cu o animație de numărare, timpul, eticheta „Record nou” și, la 100%, o mică „explozie” de pătrățele roz. Tot aici se salvează recordul.

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
  "region": "lower-limb",
  "tier": 1,
  "src": ["femur"],
  "name": { "ro": "Femurul", "en": "Femur" },
  "desc": { "ro": "Osul coapsei, cel mai lung…", "en": "The thigh bone…" }
}
```

- `region` este regiunea corpului, adică quizul regional în care apare structura;
- `tier` este nivelul (1 = principal, 2 = detaliu);
- `src` sunt numele în engleză din baza de date BodyParts3D din care se construiește modelul acelei structuri.

## 5. Cum funcționează partea 3D

### Scena
O scenă three.js are trei elemente de bază: **scena** (obiectele), **camera** (de unde privim) și **renderer-ul** (cel care desenează imaginea de 60 de ori pe secundă). Corpul este luminat de o lumină „cer–pământ” (`HemisphereLight`) și de două lumini direcționale, ca într-un studio foto. Toate structurile folosesc același material mat, în tonuri neutre deschise, pentru un stil consecvent.

### Cum știe jocul pe ce ai dat click: raycasting
Când dai click, poziția mouse-ului este transformată în coordonate de la −1 la 1. Din cameră se „trage” o rază (un **ray**) prin acel punct, iar three.js calculează ce obiecte 3D intersectează raza. Primul obiect lovit este structura pe care ai dat click. Fiecare structură este un obiect separat al cărui nume este chiar `id`-ul ei, deci jocul știe imediat ce ai ales.

### Conturul la hover
Structura de sub mouse primește un contur negru subțire cu ajutorul unui `OutlinePass`. Acesta desenează scena a doua oară, doar cu obiectul ales, și îi detectează marginile.

### Zborul camerei
`flyTo` calculează cutia care încadrează structura (`Box3`) și o poziție a camerei de la care se vede bine. Apoi, timp de 0,8 secunde, mută camera treptat cu o curbă de încetinire (*ease-out*): se mișcă repede la început și frânează lin la final.

### Efectul dither de pe carduri
Fiecare regiune este desenată mai întâi normal, în tonuri de gri, iar apoi fiecare pixel trece printr-un **shader** (un mic program care rulează pe placa video) care îl transformă în alb sau roz. Pentru a decide, folosește o **matrice Bayer** de 8×8: un tabel cu praguri diferite, care se repetă pe tot ecranul. Primele 4×4 valori arată așa (împărțite la 16):

```
 0  8  2 10
12  4 14  6
 3 11  1  9
15  7 13  5
```

Un pixel devine **alb** dacă luminozitatea lui e mai mare decât pragul din căsuța corespunzătoare și **roz** dacă e mai mică. O zonă gri deschis are puțini pixeli roz, iar una gri închis are mulți. Așa se obțin nuanțe folosind doar două culori, la fel ca la imprimantele și ecranele vechi. Ca efectul să se vadă clar, pixelii sunt grupați în pătrățele de 2×2.

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
- **Inter** — font cu licență SIL Open Font License (fișierul de licență este în `vendor/fonts/`)

## 9. Dezvoltări viitoare

- alte sisteme: inima și vasele de sânge, organele interne (există deja în BodyParts3D);
- publicarea pe GitHub Pages;
- o temă întunecată;
- un mod „contra-cronometru”;
- nervii periferici, dintr-o altă sursă de modele.
