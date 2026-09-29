# Pumperella Kegelspiel – Gesamtspezifikation

Status: Produktionsspezifikation 1.1  
Zielplattform: GitHub Pages  
Anwendungszeitzone: `Europe/Berlin`

## 1. Ziel und Scope

Pumperella ist eine statische Webanwendung, in der jede spielende Person über einen persönlichen, signierten Link genau drei vorab zugewiesene Termine erspielt. Die Termine werden im lokalen Admin-Werkzeug aus einem frei wählbaren, inklusiven Datumsbereich zufällig und ohne Zurücklegen erzeugt. Ein Kalenderdatum darf über alle Ziehungen des maßgeblichen Archivs hinweg nur genau einer Person zugewiesen werden.

Die öffentliche Spieleranwendung läuft ohne Backend und ohne Datenbank auf GitHub Pages. Die 3D-Kegelbahn ist die produktive Oberfläche für die Freigabe der bereits administrativ erzeugten Ziehung. Die Physiksimulation entscheidet nur, ob der nächste Termin sichtbar wird; sie verändert niemals Name, Ziehungs-ID oder Termine.

## 2. Systemgrenzen und Architektur

- `docs/`: öffentliche GitHub-Pages-Spieleranwendung.
- `admin/`: lokales Admin-Werkzeug zur Schlüsselerzeugung, Ziehung, Archivierung und Linkerzeugung.
- `src/domain/`: testbare Ziehungs- und Kalenderlogik.
- `src/security/`: testbares Signatur- und Tokenprotokoll.
- `tests/`: automatisierte Regressionstests.
- `spec/`: verbindliche Produktionsspezifikation.

Es gibt keinen Serverzustand. Globale Eindeutigkeit der vergebenen Termine wird durch ein einziges maßgebliches Admin-Archiv hergestellt. Wer auf einem anderen Gerät weiterzieht, muss vorher das aktuelle Archiv importieren. Zwei voneinander unabhängige Archive können technisch nicht gegenseitig verhindern, dass dasselbe Datum erneut vergeben wird.

## 3. Administrativer Ablauf

### 3.1 Signaturschlüssel

1. Der Admin erzeugt einmalig ein ECDSA-P-256-Schlüsselpaar oder importiert ein vorhandenes privates Schlüssel-Bundle.
2. Der private Schlüssel wird niemals in das Repository oder nach GitHub Pages übernommen.
3. Der öffentliche Schlüssel wird als `docs/verification-key.json` veröffentlicht.
4. Privater Schlüssel und Ziehungsarchiv sind getrennt und sicher zu sichern.

### 3.2 Ziehung

Der Admin gibt eine eindeutige Spielerliste, ein Startdatum, ein Enddatum und die öffentliche URL der Spieler-App ein.

Der Datumsbereich ist inklusiv. Pro Person werden genau drei Termine zufällig ohne Zurücklegen gezogen. Bereits im maßgeblichen Archiv vergebene Termine sind ausgeschlossen. Wenn nach Abzug bereits verwendeter Daten weniger freie Tage als `Anzahl Spieler × 3` vorhanden sind, wird die Ziehung vollständig abgelehnt; eine Teilziehung darf nicht entstehen.

Für jede Person erzeugt das Admin-Werkzeug einen signierten Token der Protokollversion 2. Der Token enthält den normalisierten Spielernamen, die Draw-UUID und genau drei Termine. Der Name wird nicht zusätzlich als URL-Query-Parameter übertragen.

### 3.3 Archiv

Jede Ziehung wird mit Batch-ID, Zeitstempel, Datumsbereich und Spielerzuordnungen im lokalen Archiv gespeichert. Das Archiv kann als JSON exportiert/importiert und zusätzlich als CSV exportiert werden. Importierte Archive werden vollständig validiert, bevor ihre Datumswerte zukünftige Ziehungen beeinflussen.

Legacy-Links mit veralteten Identitäts-Query-Parametern werden bei Darstellung und Persistierung bereinigt. Der signierte Fragment-Token bleibt dabei unverändert.

## 4. Persönlicher Spielerlink und Sicherheit

Jeder Spielerlink enthält im URL-Fragment einen kompakten signierten Token.

### 4.1 Token-Version 2

Der signierte Payload enthält:

- Protokollversion,
- Draw-UUID,
- genau drei Kalenderdaten,
- UTF-8-kodierten, normalisierten Spielernamen.

Die Signatur verwendet ECDSA P-256 mit SHA-256. Name, Ziehungs-ID und Termine werden gemeinsam signiert. Eine Manipulation eines dieser Werte macht die Signatur ungültig.

### 4.2 Kompatibilität

Token der Version 1 ohne Spielernamen bleiben lesbar. Bei einem solchen Legacy-Link kann die Oberfläche den Namen aus einem lokal vorhandenen Admin-Archiv anhand der `drawId` ergänzen; andernfalls wird ausdrücklich „Name nicht verfügbar“ angezeigt. Ein unsignierter Query-Parameter ist niemals eine vertrauenswürdige Namensquelle.

### 4.3 Browser-Verifikation

Die Spieler-App lädt ausschließlich den öffentlichen Verifikationsschlüssel. Native Web Crypto wird bevorzugt. Wenn ein Browser `SubtleCrypto` nicht oder nur unvollständig bereitstellt, wird die Signatur mit einer versionsfesten, reinen JavaScript-P-256-Implementierung verifiziert. Scheitern sowohl native als auch sichere Fallback-Verifikation, darf das Spiel nicht starten.

Das URL-Fragment wird bei normalen HTTP-Anfragen nicht an GitHub Pages übertragen. Der Token ist keine Verschlüsselung: Wer den Link besitzt, kann den Payload prinzipiell dekodieren. Die Signatur schützt Authentizität und Integrität, nicht Vertraulichkeit.

Ohne persönlichen Token, bei ungültiger Signatur oder fehlendem öffentlichen Schlüssel darf die spielbare 3D-Bahn nicht freigegeben werden.

## 5. Spielerablauf

1. Persönlichen Link öffnen.
2. Token und öffentlicher Schlüssel werden geprüft.
3. Erst nach erfolgreicher Prüfung wird die 3D-Laufzeit geladen und die Kugel spielbar.
4. Der verifizierte Spielername erscheint in der Karte „Deine Termine“.
5. Die Kugel ist vor jedem Versuch sichtbar und klar als interaktives Objekt markiert.
6. Die Kugel wird nach unten und optional seitlich gezogen und anschließend losgelassen.
7. Trifft die Kugel mindestens einen Kegel, wird genau der nächste der drei signierten Termine sichtbar.
8. Fällt die Kugel in eine Gosse oder trifft keinen Kegel, wird kein Termin verbraucht; der Versuch wird wiederholt.
9. Nach einem erfolgreichen Wurf bleiben die gefallenen Kegel sichtbar liegen.
10. Erst „Nächster Wurf“ startet das Stellwerk und stellt die Kegel neu auf.
11. Nach dem dritten erfolgreichen Wurf endet ausschließlich die Datumsziehung. Alle drei Termine bleiben sichtbar; anschließend kann beliebig weitergespielt werden, ohne weitere Termine zu ziehen.

Der erspielte Fortschritt wird pro `drawId` lokal im Browser gespeichert. Ein Reload stellt bereits sichtbare Termine wieder her. Bei 3/3 startet die Anwendung im freien Spielmodus. Die Fortschrittspersistenz ist geräte- und browserlokal.

## 6. Anforderungen an die 3D-Oberfläche

### 6.1 Bahn und Darstellung

- Vollbilddarstellung mit responsiver Kamera für Hoch- und Querformat.
- Neun Kegel in klarer `1–2–3–2–1`-Raute.
- Realistisch proportionierte Kugel und Kegel mit gemeinsamem Weltmaßstab.
- Holzbahn mit einer echten, tiefer liegenden Gosse links und rechts.
- Keine Bumper oder Fanghilfen zwischen Bahn und Gosse.
- Ein Ball in der Gosse kann keine Kegel mehr treffen.
- Hinter den Kegeln liegt ein dunkler Fang-/Grubenbereich; der Ball darf nicht auf die Bahn zurückspringen.
- Kegelkontur und rote Halsringe entsprechen dem freigegebenen V27-Prototyp.
- Dunkler Raum, magenta Akzentlicht, reflektierende Seitenflächen und Crown-Sign orientieren sich am freigegebenen Neon-Mockup.
- Die Szenerie verwendet keine browserkritischen Post-Processing-Effekte und läuft stabil in aktuellen Versionen von Safari unter iOS sowie Chrome und Edge unter Android.

### 6.2 Pumperella-Branding

- Das offizielle Vereinslogo erscheint in der Brand-Card links oben.
- Das Logo beziehungsweise ein lesbares Pumperella-Wortzeichen sitzt vollständig innerhalb der vorhandenen Frontblende des beweglichen Kegelwiederaufstellers; zusätzliche überstehende Kästen sind unzulässig.
- Die Kugel verwendet die tatsächliche Krone aus dem offiziellen Logo, nicht ein abweichendes generisches Kronensymbol.
- Der Spielername wird innerhalb der Karte „Deine Termine“ angezeigt, nicht in einem zusätzlichen oberen Panel.
- Die Terminliste behält ihre funktionale Reihenfolge und hebt aufgedeckte Termine hervor.
- Der Status rechts oben bleibt kompakt und eindeutig lesbar.
- Branding darf Kugel, Kegel, Zielanzeige, Ergebnisanzeige oder Bedienhinweise nicht verdecken.

### 6.3 Bedienung

- Die startbereite Kugel liegt sichtbar vorne auf der Bahn.
- Die untere Hinweisbox ist kompakt und tief genug positioniert, damit die Kugel vollständig sichtbar und direkt per Maus, Touch oder Pen erreichbar bleibt.
- Ein pulsierender Marker erklärt die Ziehgeste.
- Nach unten ziehen steuert die Kraft.
- Seitliches Ziehen steuert die Richtung; die Abschussrichtung ist die Gegenrichtung der Zugbewegung.
- Während des Zielens werden Richtung, Kraft und Ziellinie angezeigt.
- Kurzes Antippen ohne ausreichenden Zug löst keinen Wurf aus.
- Pointer-Cancel, Resize oder verlorener Pointer-Capture dürfen niemals einen Wurf auslösen.
- Enter oder Leertaste lösen als Tastaturalternative einen reproduzierbaren geraden Wurf aus.

### 6.4 Treffer- und Fehlwurfregeln

Ein erfolgreicher Spielwurf liegt genau dann vor, wenn mindestens ein Kegel von der Kugel getroffen wurde und die Kugel nicht vorher als Gossenwurf klassifiziert wurde.

Bei Gosse oder keinem Kegeltreffer:

- kein Datum freigeben,
- keinen erfolgreichen Wurf zählen,
- keinen Pinsetter-Zyklus erzwingen,
- denselben Versuch wiederholen lassen.

Bei Treffer:

- genau einen Termin freigeben,
- Termin dauerhaft in „Deine Termine“ anzeigen,
- Kegel bis „Nächster Wurf“ liegen lassen,
- anschließend Stellwerk animieren und Kugel neu bereitstellen.

Nach dem dritten erfolgreichen Treffer gibt es keinen vierten Termin. Weitere Würfe verändern weder die drei Termine noch den gespeicherten Ziehungsfortschritt.

## 7. Physik- und Performance-Anforderungen

Die produktive Fassung übernimmt die validierte V27-Physik:

- Cannon-es mit fester Simulationsrate von 60 Hz,
- maximal zwei Catch-up-Schritte je Renderframe,
- vereinfachte Compound-Collider für Kegel bei hochauflösender gemeinsamer Render-Geometrie,
- COM-zentrierte Trägheitsbehandlung,
- definierter Mindestvortrieb vor und nach dem Kegeldeck,
- keine zusätzlichen Impulse durch Collision-Callbacks,
- kein künstliches Aufrichten oder Zurücksetzen von Kegeln außerhalb des Stellwerks,
- identischer Radius für Ballrendering und Ballcollider,
- begrenzte Mobile-Pixel-Ratio und Shadow-Map-Größe.

Versionsfeste Laufzeitabhängigkeiten:

- Three.js `0.180.0`,
- cannon-es `0.20.0`,
- `@noble/curves` `2.3.0` ausschließlich als ECDSA-P-256-Verifikationsfallback.

Fällt das CDN oder WebGL aus, muss die Anwendung einen sichtbaren Fehlerzustand anzeigen und darf keinen falschen „Bereit“-Status zeigen.

## 8. Dauerhafte Terminanzeige und UI-Zustände

Die HUD-Oberfläche zeigt Marke, verifizierten Spielernamen, Status, drei Termin-Slots, Bedienhinweis, Kraftanzeige, Ergebnis-Overlay und den kontextabhängigen Button für Wiederholung oder nächsten Wurf.

Termin-Slots starten mit „Noch verdeckt“ und werden ausschließlich nach erfolgreichen Würfen in der Reihenfolge des verifizierten Tokens aufgedeckt.

Mindestens folgende Zustände sind abzubilden:

- Link wird geprüft,
- 3D-Bahn wird geladen,
- bereit,
- zielen,
- Kugel rollt,
- Gosse,
- kein Kegel getroffen,
- Datum gezogen,
- Stellwerk,
- alle drei Termine gezogen,
- freies Spiel,
- Token-/Schlüssel-/Grafikfehler.

## 9. Accessibility und Geräteverhalten

- Pointer Events unterstützen Maus, Touch und Pen.
- Touch-Scrolling darf die Wurfgeste nicht stören.
- Ergebnisänderungen werden über eine Live-Region angekündigt.
- „Nächster Wurf“ ist per Tastatur fokussierbar und besitzt sichtbaren Fokus.
- Die WebGL-Spielfläche ist fokussierbar und besitzt eine ARIA-Beschriftung für die Tastaturalternative.
- `prefers-reduced-motion` reduziert UI-Animationen, ohne die Physiksimulation semantisch zu verändern.
- Safe-Area-Insets werden berücksichtigt.

## 10. Fehler- und Konsistenzregeln

- Name, Draw-UUID und Termine stammen ausschließlich aus einem erfolgreich verifizierten Token; Legacy-Namensauflösung aus dem lokalen Archiv ist nur eine Anzeigehilfe für Token-Version 1.
- Unsigned Query-Parameter dürfen niemals Name, Ziehungs-ID, Termine oder Fortschritt bestimmen.
- Ein Datum darf nur aus dem verifizierten Token stammen; es gibt keinen Demo-Fallback.
- Ein Fehler bei der Datumsfreigabe wird nicht automatisch durch einen zweiten Ziehversuch kaschiert.
- Ein ungültiger Link startet keine spielbare Session.
- Ein Fehlwurf verändert die Anzahl verbleibender Termine nicht.
- Die drei signierten Termine werden nie neu ausgelost oder von der Physik bestimmt.
- Die Spieler-App besitzt keinen Schreibzugriff auf Signaturschlüssel oder Admin-Archiv.

## 11. Qualitätssicherung und CI

Bei Push und Pull Request gegen `main` führt GitHub Actions die Vitest-Suite mit Node.js 22 aus. Automatisiert getestet werden mindestens:

- inklusive Datumsbereiche und DST-Grenzen in `Europe/Berlin`,
- globale Eindeutigkeit und Ziehen ohne Zurücklegen,
- Kapazitätsfehler bei zu kleinem Bereich,
- Token-Version-2-Encoding/-Decoding einschließlich Spielername,
- Rückwärtskompatibilität zu Token-Version 1,
- Signaturprüfung und Manipulationsschutz für Name, Draw-ID und Termine,
- native Web-Crypto-Verifikation sowie der sichere Fallback-Pfad,
- Interoperabilität von Admin-Token und Player-Verifikation,
- Fortschrittswiederherstellung und genau drei Terminfreigaben ohne vierten Termin,
- Entfernung veralteter Identitäts-Query-Parameter.

Die WebGL-Physik benötigt zusätzlich einen manuellen Browser-Smoke-Test auf einem aktuellen Chromium-Browser sowie Safari auf iOS oder einem vergleichbaren mobilen Browser.

## 12. Deployment

Produktionsziel ist GitHub Pages aus `/docs` des Default-Branches.

Vor dem öffentlichen Go-Live sind zwingend:

1. finales Signaturschlüsselpaar erzeugen oder vorhandenes laden,
2. privaten Schlüssel offline sichern,
3. öffentlichen Schlüssel in `docs/verification-key.json` eintragen,
4. maßgebliches Ziehungsarchiv sichern,
5. CI erfolgreich ausführen,
6. Spieler-App-URL im Admin-Werkzeug auf die reale Pages-URL setzen,
7. einen neuen Token-Version-2-Testlink erzeugen,
8. native und Fallback-Verifikation sowie Treffer-/Fehlwurfpfade im Zielbrowser prüfen.

## 13. Abnahmekriterien

Die Implementierung ist fachlich abgenommen, wenn:

- zwei Personen niemals denselben Termin aus demselben maßgeblichen Archiv erhalten,
- jeder neue persönliche Link Name, Draw-ID und genau drei Termine gemeinsam signiert enthält,
- neue Links keine Spieleridentität im URL-Query transportieren,
- alte Token-Version-1-Links weiterhin verifiziert werden können,
- ein Browser ohne nutzbares `SubtleCrypto` nicht mit einem JavaScript-Fehler abbricht, sondern sicher verifiziert oder einen verständlichen Fehlerzustand zeigt,
- Start- und Enddatum frei administrierbar und inklusive sind,
- drei Termine nur durch drei erfolgreiche Treffer sichtbar werden,
- Fehlwürfe keinen Termin verbrauchen,
- die Kugel vor jedem Versuch sichtbar und intuitiv ziehbar ist,
- beide Gossen ohne Bumper funktionieren,
- nach Treffer das Stellwerk erst durch „Nächster Wurf“ aktiviert wird,
- nach dem dritten Termin keine weitere Ziehung möglich ist, aber beliebig weitergekegelt werden kann,
- ungültige oder manipulierte Links nicht spielbar sind,
- der private Signaturschlüssel nicht im öffentlichen Repository enthalten ist,
- CI grün ist und der manuelle Browser-Smoke-Test bestanden wurde.
