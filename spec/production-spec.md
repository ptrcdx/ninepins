# Pumperella Kegelspiel – Gesamtspezifikation

Status: Produktionsspezifikation 1.0  
Zielplattform: GitHub Pages  
Anwendungszeitzone: `Europe/Berlin`

## 1. Ziel und Scope

Pumperella ist eine statische Webanwendung, in der jeder Spieler über einen persönlichen, signierten Link genau drei vorab zugewiesene Termine erspielt. Die Termine werden im lokalen Admin-Werkzeug aus einem frei wählbaren, inklusiven Datumsbereich zufällig und ohne Zurücklegen erzeugt. Ein Kalenderdatum darf über alle Ziehungen des maßgeblichen Archivs hinweg nur genau einem Spieler zugewiesen werden.

Die öffentliche Spieleranwendung läuft ohne Backend und ohne Datenbank auf GitHub Pages. Die 3D-Kegelbahn ist die produktive Oberfläche für die Freigabe der drei bereits signierten Termine. Die physische Wurf-Simulation entscheidet nur, ob der nächste Termin sichtbar wird; sie verändert niemals die administrativ erzeugte Ziehung.

## 2. Systemgrenzen und Architektur

- `docs/`: öffentliche GitHub-Pages-Spieleranwendung.
- `admin/`: lokales Admin-Werkzeug zur Schlüsselerzeugung, Ziehung, Archivierung und Linkerzeugung.
- `src/domain/`: testbare Ziehungs- und Kalenderlogik.
- `src/security/`: testbares Signatur- und Tokenprotokoll.
- `tests/`: automatisierte Tests.
- `spec/`: verbindliche Produktionsspezifikation.

Es gibt keinen Serverzustand. Globale Eindeutigkeit der vergebenen Termine wird durch ein einziges maßgebliches Admin-Archiv hergestellt. Wer auf einem anderen Gerät weiterzieht, muss vorher das aktuelle Archiv importieren. Zwei voneinander unabhängige Archive können technisch nicht gegenseitig verhindern, dass dasselbe Datum erneut vergeben wird.

## 3. Administrativer Ablauf

### 3.1 Signaturschlüssel

1. Der Admin erzeugt einmalig ein ECDSA-P-256-Schlüsselpaar oder importiert ein bestehendes privates Schlüssel-Bundle.
2. Der private Schlüssel wird niemals in das Repository oder nach GitHub Pages übernommen.
3. Der öffentliche Schlüssel wird als `docs/verification-key.json` veröffentlicht.
4. Der private Schlüssel und das Ziehungsarchiv sind separat zu sichern.

### 3.2 Ziehung

Der Admin gibt eine eindeutige Spielerliste, ein Startdatum, ein Enddatum und die öffentliche URL der Spieler-App ein.

Der Datumsbereich ist inklusiv. Pro Spieler werden genau drei Termine zufällig ohne Zurücklegen gezogen. Bereits im maßgeblichen Archiv vergebene Termine sind ausgeschlossen. Damit sind alle zugewiesenen Datumswerte innerhalb und über mehrere Ziehungssätze hinweg eindeutig.

Wenn nach Abzug bereits verwendeter Daten weniger freie Tage als `Anzahl Spieler × 3` vorhanden sind, wird die Ziehung vollständig abgelehnt; es darf keine Teilziehung entstehen.

### 3.3 Archiv

Jede Ziehung wird mit Batch-ID, Zeitstempel, Datumsbereich und Spielerzuordnungen im lokalen Archiv gespeichert. Das Archiv kann als JSON exportiert/importiert und zusätzlich als CSV exportiert werden. Ein importiertes Archiv muss vollständig validiert werden, bevor seine Datumswerte zukünftige Ziehungen beeinflussen.

## 4. Persönlicher Spielerlink und Sicherheit

Jeder Spielerlink enthält im URL-Fragment einen kompakten signierten Token. Der Payload enthält Protokollversion, Draw-UUID und genau drei Kalenderdaten.

Die Signatur verwendet ECDSA P-256 mit SHA-256. Die Spieler-App lädt ausschließlich den öffentlichen Verifikationsschlüssel und akzeptiert den Token nur bei gültiger Signatur.

Das URL-Fragment wird bei normalen HTTP-Anfragen nicht an GitHub Pages übertragen. Der Token ist jedoch keine Verschlüsselung: Wer den Link besitzt, kann den Payload prinzipiell dekodieren. Die Signatur schützt Authentizität und Integrität, nicht Vertraulichkeit.

Ohne persönlichen Token, bei ungültiger Signatur oder fehlendem öffentlichen Schlüssel darf die spielbare 3D-Bahn nicht freigegeben werden.

## 5. Spielerablauf

1. Persönlichen Link öffnen.
2. Token und öffentlicher Schlüssel werden geprüft.
3. Erst nach erfolgreicher Prüfung wird die 3D-Laufzeit geladen und die Kugel spielbar.
4. Die Kugel ist vor jedem Versuch sichtbar und klar als interaktives Objekt markiert.
5. Spieler zieht die Kugel nach unten und optional seitlich und lässt los.
6. Trifft der Ball mindestens einen Kegel, wird genau der nächste der drei signierten Termine sichtbar.
7. Fällt der Ball in eine Gosse oder trifft keinen Kegel, wird kein Termin verbraucht; der Versuch wird wiederholt.
8. Nach einem erfolgreichen Wurf bleiben die gefallenen Kegel sichtbar liegen.
9. Erst die explizite Aktion „Nächster Wurf“ startet das Stellwerk und stellt die Kegel neu auf.
10. Nach dem dritten erfolgreichen Wurf endet die Ziehung. Alle drei Termine bleiben dauerhaft in der Oberfläche sichtbar.

Der bereits erspielte Fortschritt wird pro `drawId` lokal im Browser gespeichert. Ein Seiten-Reload oder erneutes Öffnen desselben persönlichen Links stellt bereits sichtbare Termine wieder her und setzt bei 1/3 oder 2/3 mit dem nächsten Termin fort; bei 3/3 bleibt das Spiel abgeschlossen. Da es bewusst keinen Serverzustand gibt, ist diese Fortschrittspersistenz geräte- und browserlokal.

## 6. Anforderungen an die 3D-Oberfläche

### 6.1 Bahn und Darstellung

- Vollbilddarstellung mit responsiver Kamera für Hoch- und Querformat.
- Neun Kegel in klarer `1–2–3–2–1`-Raute.
- Realistisch proportionierte Kugel und Kegel mit gemeinsamem Weltmaßstab.
- Holzbahn mit jeweils einer echten, tiefer liegenden Gosse links und rechts.
- Keine Bumper, Fanghilfen oder hochgeklappten Seitenbegrenzungen zwischen Bahn und Gosse.
- Ein Ball in der Gosse kann keine Kegel mehr treffen.
- Hinter den Kegeln liegt ein dunkler Fang-/Grubenbereich; der Ball wird dort absorbiert und darf nicht auf die Bahn zurückspringen.
- Kegelkontur und rote Halsringe entsprechen dem freigegebenen V27-Prototyp.

### 6.2 Bedienung

- Die Kugel liegt im Bereitschaftszustand sichtbar vorne auf der Bahn.
- Ein pulsierender Marker und die Anweisung erklären die Geste.
- Nach unten ziehen steuert die Kraft.
- Seitliches Ziehen steuert die Richtung; die Abschussrichtung ist die Gegenrichtung der Zugbewegung.
- Während des Zielens werden Richtung, Kraft und eine visuelle Ziellinie angezeigt.
- Kurzes Antippen ohne ausreichenden Zug löst keinen Wurf aus.
- Pointer-Cancel, Resize oder verlorener Pointer-Capture dürfen niemals einen Wurf auslösen.
- Als Tastatur-Alternative lösen Enter oder Leertaste einen reproduzierbaren geraden Wurf aus.

### 6.3 Treffer- und Fehlwurfregeln

Ein erfolgreicher Spielwurf liegt genau dann vor, wenn mindestens ein Kegel vom Ball getroffen wurde und der Ball nicht vorher als Gossenwurf klassifiziert wurde.

Bei Gosse oder keinem Kegeltreffer:

- kein Datum freigeben,
- keinen erfolgreichen Wurf zählen,
- keinen Pinsetter-Zyklus erzwingen,
- denselben Versuch wiederholen lassen.

Bei Treffer:

- genau einen Termin freigeben,
- Termin dauerhaft in der Liste „Deine Termine“ anzeigen,
- Kegel bis zur expliziten Aktion „Nächster Wurf“ liegen lassen,
- anschließend Stellwerk animieren und Kugel neu bereitstellen.

Nach dem dritten Treffer gibt es keinen weiteren Wurf und keinen vierten Termin.

## 7. Physik- und Performance-Anforderungen

Die produktive Fassung übernimmt die validierte V27-Physik:

- Cannon-es mit fester Simulationsrate von 60 Hz,
- maximal zwei Catch-up-Schritte je Renderframe,
- vereinfachte Compound-Collider für Kegel bei hochauflösender gemeinsamer Render-Geometrie,
- COM-zentrierte Trägheitsbehandlung,
- definierter Mindestvortrieb vor und nach dem Kegeldeck,
- keine zusätzlichen Impulse durch Collision-Callbacks,
- kein künstliches Aufrichten oder Zurücksetzen von Kegeln außerhalb des Stellwerks,
- Ballrendering und Ballcollider verwenden denselben Radius,
- begrenzte Mobile-Pixel-Ratio und Shadow-Map-Größe.

Die Laufzeitabhängigkeiten sind versionsfest:

- Three.js `0.180.0`,
- cannon-es `0.20.0`.

Fällt das CDN oder WebGL aus, muss die Anwendung einen sichtbaren Fehlerzustand anzeigen und darf keinen falschen „Bereit“-Status zeigen.

## 8. Dauerhafte Terminanzeige und UI-Zustände

Die HUD-Oberfläche zeigt Marke, Status, drei Termin-Slots, Bedienhinweis, Kraftanzeige, Ergebnis-Overlay und den kontextabhängigen Button für Wiederholung oder nächsten Wurf.

Termin-Slots starten mit „Noch verdeckt“ und werden ausschließlich nach erfolgreichen Würfen in der Reihenfolge des verifizierten Tokens aufgedeckt.

Mindestens folgende Zustände sind explizit abzubilden:

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
- Token-/Schlüssel-/Grafikfehler.

## 9. Accessibility und Geräteverhalten

- Pointer Events unterstützen Maus, Touch und Pen.
- Touch-Scrolling darf auf der Spielfläche die Wurfgeste nicht stören.
- Ergebnisänderungen werden über eine Live-Region angekündigt.
- „Nächster Wurf“ ist per Tastatur fokussierbar und besitzt sichtbaren Fokus.
- Die WebGL-Spielfläche ist fokussierbar und besitzt eine ARIA-Beschriftung für die Tastatur-Alternative.
- `prefers-reduced-motion` reduziert UI-Animationen, ohne die Physiksimulation semantisch zu verändern.
- Safe-Area-Insets werden berücksichtigt.

## 10. Fehler- und Konsistenzregeln

- Ein Datum darf nur aus einem erfolgreich verifizierten Token stammen; es gibt keinen Demo-Fallback.
- Ein Fehler bei der Datumsfreigabe wird nicht automatisch durch einen zweiten Ziehversuch kaschiert.
- Ein ungültiger Link startet keine spielbare Session.
- Ein Fehlwurf verändert die Anzahl verbleibender Termine nicht.
- Die drei signierten Termine werden nie neu ausgelost oder von der Physik bestimmt.
- Die Spieler-App hat keinen Schreibzugriff auf Admin-Archiv oder Signaturschlüssel.

## 11. Qualitätssicherung und CI

Bei Push und Pull Request gegen `main` führt GitHub Actions die Vitest-Suite mit Node.js 22 aus. Automatisiert getestet werden mindestens:

- inklusive Datumsbereiche und DST-Grenzen in `Europe/Berlin`,
- globale Eindeutigkeit und Ziehen ohne Zurücklegen,
- Kapazitätsfehler bei zu kleinem Bereich,
- Token-Encoding/-Decoding und Signaturprüfung,
- Manipulationsschutz,
- Interoperabilität von Admin-Token und Player-Verifikation,
- genau drei sequentielle Terminfreigaben ohne vierten Termin.

Die WebGL-Physik benötigt zusätzlich einen manuellen Browser-Smoke-Test auf mindestens einem aktuellen Chromium-Browser und einem mobilen Browser, insbesondere für Pointer-Gesten, Gossenverhalten, Pinsetter und Responsive Camera.

## 12. Deployment

Produktionsziel ist GitHub Pages aus `/docs` des Default-Branches.

Vor dem öffentlichen Go-Live sind zwingend:

1. finales Signaturschlüsselpaar erzeugen bzw. vorhandenes laden,
2. privaten Schlüssel offline sichern,
3. öffentlichen Schlüssel in `docs/verification-key.json` eintragen,
4. maßgebliches Ziehungsarchiv sichern,
5. CI erfolgreich ausführen,
6. Spieler-App-URL im Admin-Werkzeug auf die reale Pages-URL setzen,
7. Testspieler-Link erzeugen und Treffer-/Fehlwurfpfade im Zielbrowser prüfen.

## 13. Abnahmekriterien

Die Implementierung ist fachlich abgenommen, wenn:

- zwei Spieler niemals denselben Termin aus demselben maßgeblichen Archiv erhalten,
- jeder Spieler genau drei signierte Termine besitzt,
- Start- und Enddatum frei administrierbar und inklusive sind,
- alle drei Termine nur durch drei erfolgreiche Kegeltreffer sichtbar werden,
- beliebig viele Fehlwürfe möglich sind, ohne einen Termin zu verbrauchen,
- die Kugel vor jedem Versuch sichtbar und intuitiv ziehbar ist,
- beide Gossen ohne Bumper funktionieren und keinen Kegeltreffer zulassen,
- nach Treffer das Stellwerk erst durch „Nächster Wurf“ aktiviert wird,
- nach dem dritten Termin keine weitere Ziehung möglich ist,
- ungültige oder manipulierte Links nicht spielbar sind,
- der private Signaturschlüssel nicht im öffentlichen Repository enthalten ist,
- CI grün ist und der manuelle WebGL-Smoke-Test bestanden wurde.
