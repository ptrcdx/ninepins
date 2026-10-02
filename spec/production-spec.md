# Pumperella Kegelspiel – Gesamtspezifikation

Status: Produktionsspezifikation 1.2  
Zielplattform: GitHub Pages  
Anwendungszeitzone: `Europe/Berlin`

## 1. Ziel und Scope

Pumperella ist eine statische Webanwendung, in der jede spielende Person über einen persönlichen, signierten Link genau zwei vorab zugewiesene Termine erspielt. Die Termine werden im lokalen Admin-Werkzeug aus einem frei wählbaren, inklusiven Datumsbereich zufällig und ohne Zurücklegen erzeugt. Ein Kalenderdatum darf innerhalb des maßgeblichen Archivs nur genau einer Person zugewiesen werden.

Die öffentliche Spieleranwendung läuft ohne Backend und ohne Datenbank auf GitHub Pages. Die 3D-Kegelbahn entscheidet ausschließlich, wann ein bereits signierter Termin sichtbar wird. Sie verändert weder Spielername noch Ziehungs-ID oder Termine.

## 2. Systemgrenzen und Architektur

- `docs/`: öffentliche GitHub-Pages-Spieleranwendung.
- `admin/`: lokales Admin-Werkzeug zur Schlüsselerzeugung, Ziehung, Archivierung und Linkerzeugung.
- `src/domain/`: testbare Ziehungs- und Kalenderlogik.
- `src/security/`: testbares Signatur- und Tokenprotokoll.
- `tests/`: automatisierte Regressionstests.

Es gibt keinen Serverzustand. Globale Eindeutigkeit wird durch ein maßgebliches Admin-Archiv hergestellt. Wer auf einem anderen Gerät weiterzieht, muss vorher das aktuelle Archiv importieren.

## 3. Administrativer Ablauf

### 3.1 Signaturschlüssel

1. Der Admin erzeugt ein ECDSA-P-256-Schlüsselpaar oder importiert ein vorhandenes privates Schlüssel-Bundle.
2. Der private Schlüssel wird niemals in das Repository oder nach GitHub Pages übernommen.
3. Der öffentliche Schlüssel wird als `docs/verification-key.json` veröffentlicht.
4. Privater Schlüssel und Ziehungsarchiv werden getrennt gesichert.

### 3.2 Ziehung

Der Admin gibt eine eindeutige Spielerliste, ein Startdatum, ein Enddatum und die öffentliche URL der Spieler-App ein.

Der Datumsbereich ist inklusiv. Pro Person werden genau zwei Termine zufällig ohne Zurücklegen gezogen. Bereits im aktuellen maßgeblichen Archiv vergebene Termine sind ausgeschlossen. Wenn weniger freie Tage als `Anzahl Spieler × 2` vorhanden sind, wird die Ziehung vollständig abgelehnt. Die Fehlermeldung nennt Gesamttage, im Archiv gesperrte Tage, freie Tage und den tatsächlichen Bedarf.

Für den Regressionfall `01.12.2026` bis `24.12.2026` stehen bei leerem aktuellen Archiv 24 Tage zur Verfügung. Vier Personen benötigen acht eindeutige Termine und müssen erfolgreich gezogen werden können.

Für jede Person erzeugt das Admin-Werkzeug einen signierten Token der Protokollversion 3. Der Token enthält den normalisierten Spielernamen, die Draw-UUID und genau zwei Termine. Der Name wird nicht zusätzlich als URL-Query-Parameter übertragen.

### 3.3 Archive und Migration

Neue Zwei-Termine-Ziehungen verwenden Archivschema und lokalen Speicherschlüssel Version 2. Ein vorhandenes Drei-Termine-Archiv der Version 1 wird erkannt, aber nicht automatisch als Ausschlussmenge verwendet. Dadurch blockieren frühere Testziehungen nicht unbemerkt den neuen Zwei-Termine-Pool.

Der Admin kann das alte Archiv bewusst übernehmen. Dann bleiben sämtliche alten Termine gesperrt und die Eindeutigkeit wird über beide Generationen erhalten. Das aktuelle Archiv kann nach ausdrücklicher Warnung zurückgesetzt werden; bereits erzeugte Links bleiben kryptografisch gültig, ihre Termine sind danach jedoch nicht mehr als vergeben bekannt.

Archive können als JSON importiert/exportiert und zusätzlich als CSV exportiert werden. Importierte Archive werden vollständig validiert, einschließlich der globalen Datumseindeutigkeit.

## 4. Persönlicher Spielerlink und Sicherheit

Jeder Spielerlink enthält im URL-Fragment einen kompakten signierten Token.

### 4.1 Token-Version 3

Der signierte Payload enthält:

- Protokollversion,
- Draw-UUID,
- genau zwei Kalenderdaten,
- UTF-8-kodierten, normalisierten Spielernamen.

Die Signatur verwendet ECDSA P-256 mit SHA-256. Name, Ziehungs-ID und Termine werden gemeinsam signiert. Eine Manipulation eines dieser Werte macht die Signatur ungültig.

### 4.2 Kompatibilität

Token-Version 1 ohne Spielernamen und Token-Version 2 mit Namen enthalten jeweils drei Termine und bleiben lesbar. Die Spieler-Sitzung akzeptiert deshalb zwei aktuelle oder drei historische Termine. Bei einem Version-1-Link kann die Oberfläche den Namen aus einem lokal vorhandenen Admin-Archiv anhand der `drawId` ergänzen; andernfalls wird „Name nicht verfügbar“ angezeigt. Ein unsignierter Query-Parameter ist niemals eine vertrauenswürdige Namensquelle.

### 4.3 Browser-Verifikation

Die Spieler-App lädt ausschließlich den öffentlichen Verifikationsschlüssel. Die Signaturprüfung erfolgt über die standardsbasierte Web Crypto API. Ist `SubtleCrypto` nicht verfügbar oder unvollständig, darf das Spiel nicht starten; es wird keine externe Kryptografie-Bibliothek nachgeladen.

Der Token ist keine Verschlüsselung. Die Signatur schützt Authentizität und Integrität, nicht Vertraulichkeit.

## 5. Spielerablauf

1. Persönlichen Link öffnen.
2. Token und öffentlicher Schlüssel werden geprüft.
3. Erst nach erfolgreicher Prüfung wird die 3D-Laufzeit geladen.
4. Der verifizierte Spielername erscheint gemeinsam mit den Termin-Slots in der Karte „Deine Termine“.
5. Die Kugel wird nach unten und optional seitlich gezogen und losgelassen.
6. Trifft die Kugel mindestens einen Kegel, wird genau der nächste signierte Termin sichtbar.
7. Bei Gosse oder keinem Kegeltreffer wird kein Termin verbraucht.
8. Erst „Nächster Wurf“ startet das Stellwerk.
9. Nach dem zweiten erfolgreichen Wurf endet die Datumsziehung. Beide Termine bleiben sichtbar; anschließend ist freies Spiel möglich.

Beim ersten gültigen Spielaufruf erscheint ein kurzer Willkommensdialog mit Spielerklärung und der Frage, ob Fortschritt auf diesem Gerät gespeichert werden soll. Die Entscheidung „Speichern“ oder „Nicht speichern“ wird als technische Präferenz in `localStorage` gemerkt, sodass der Dialog bei späteren Aufrufen nicht erneut erscheint. Nur bei „Speichern“ wird der Fortschritt pro `drawId` dauerhaft gespeichert. Die Einstellung kann später über ein dezentes, fest positioniertes `⋮`-Menü geändert werden. Das Deaktivieren stoppt weitere Persistenz, löscht bestehende Fortschrittsdaten aber nicht automatisch; dafür gibt es eine separate bestätigte Löschaktion. Historische Dreier-Links wechseln entsprechend bei 3/3 in den freien Spielmodus.

## 6. 3D-Oberfläche und Branding

- Vollbilddarstellung mit responsiver Kamera.
- Smartphone-Nutzung ist auf Hochformat begrenzt: Bei Querformat mit phone-typisch niedriger Viewport-Höhe und primärer Touch-Eingabe überdeckt ein modaler Hinweis das Spiel vollständig. Nach Rückkehr ins Hochformat wird automatisch weitergespielt. Desktop und Tablets werden dadurch nicht eingeschränkt.
- Neun Kegel in klarer `1–2–3–2–1`-Raute.
- Echte, tiefer liegende Gossen ohne Bumper.
- Ein Gossenball kann keine Kegel treffen.
- Das offizielle Logo beziehungsweise Wortzeichen sitzt innerhalb der Frontblende des Kegelwiederaufstellers.
- Die Kugel verwendet die Krone aus dem offiziellen Logo.
- Die Ballkrone liegt auf der zur Startkamera gerichteten Oberflächennormalen, sodass sie initial frontal und nicht nach unten gedreht wirkt.
- Branding darf Kugel, Kegel, Zielanzeige, Ergebnisanzeige oder Bedienhinweise nicht verdecken.

## 7. Mobile HUD

Im Smartphone-Hochformat werden Branding, die beiden Terminwerte, Spielername und Status in einem einzigen flachen Panel dargestellt. Das Branding bildet eine schmale Kopfzeile; darunter stehen die beiden Terminwerte links, „Aktuell spielt“ mittig und der Status rechts nebeneinander. Zwischen der Überschrift „Deine Termine“ und den Datums-Chips bleibt ein kleiner visueller Abstand. Die beiden Terminwerte stehen nebeneinander; ein dritter Slot ist für aktuelle Links nicht sichtbar.

Die mobile Ergebnisanzeige wiederholt ein gerade aufgedecktes Datum nicht redundant über dem bereits aktualisierten Terminpanel. Fehlwurf- und Gossenhinweise bleiben sichtbar. Status- und Terminpanel dürfen die Kugel, das Stellwerk oder wesentliche Zielinformationen nicht überlagern. Safe-Area-Insets werden berücksichtigt.

## 8. Treffer- und Fehlwurfregeln

Ein erfolgreicher Spielwurf liegt genau dann vor, wenn mindestens ein Kegel von der Kugel getroffen wurde und die Kugel nicht vorher als Gossenwurf klassifiziert wurde.

Bei Gosse oder keinem Treffer:

- kein Datum freigeben,
- keinen erfolgreichen Wurf zählen,
- keinen Pinsetter-Zyklus erzwingen,
- denselben Versuch wiederholen lassen.

Bei Treffer:

- genau einen Termin freigeben,
- Termin dauerhaft anzeigen,
- Kegel bis „Nächster Wurf“ liegen lassen,
- anschließend Stellwerk animieren und Kugel neu bereitstellen.

Nach dem zweiten erfolgreichen Treffer gibt es für aktuelle Links keinen dritten Termin. Weitere Würfe verändern weder Termine noch Fortschritt.

## 9. Physik und Performance

Die produktive Fassung verwendet Cannon-es mit fester Simulationsrate von 60 Hz, maximal zwei Catch-up-Schritten, vereinfachten Compound-Collidern, COM-zentrierter Trägheitsbehandlung und identischen Radien für Ballrendering und Ballcollider.

Versionsfeste Laufzeitabhängigkeiten:

- Three.js `0.180.0`, lokal unter `docs/vendor/three/`,
- cannon-es `0.20.0`, lokal unter `docs/vendor/cannon-es/`.

Die Spieler-App lädt keine Runtime-JavaScript-Bibliotheken von Drittanbieter-CDNs.

## 10. Qualitätssicherung

Automatisiert getestet werden mindestens:

- inklusive Datumsbereiche und DST-Grenzen in `Europe/Berlin`,
- vier Personen mit acht eindeutigen Terminen im Bereich 1.–24. Dezember 2026,
- globale Eindeutigkeit und Ziehen ohne Zurücklegen,
- Token-Version 3 mit Spielername und zwei Terminen,
- Rückwärtskompatibilität zu Token-Version 1 und 2 mit drei Terminen,
- Signaturprüfung und Manipulationsschutz,
- native Web-Crypto-Verifikation und definiertes Abbruchverhalten bei fehlendem Web Crypto,
- keine dauerhafte Fortschrittsspeicherung ohne Opt-in, einmalige Speicherung der Ja/Nein-Präferenz, Wiederherstellung nach Opt-in, spätere Änderung über das `⋮`-Menü, separate explizite Löschung und genau zwei Terminfreigaben ohne dritten Termin.

Die WebGL-Oberfläche benötigt zusätzlich einen manuellen Browser-Smoke-Test auf aktuellem Chromium sowie Safari auf iOS oder einem vergleichbaren mobilen Browser.

## 11. Abnahmekriterien

Die Umsetzung ist fachlich abgenommen, wenn:

- der Zeitraum 01.12.2026–24.12.2026 für vier Personen bei leerem aktuellen Archiv acht eindeutige Termine liefert,
- jeder neue Link Name, Draw-ID und genau zwei Termine gemeinsam signiert enthält,
- alte Version-1- und Version-2-Links weiterhin verifiziert werden,
- Fehlwürfe keinen Termin verbrauchen,
- nach dem zweiten Termin keine weitere Ziehung möglich ist,
- die Krone auf der startbereiten Kugel frontal zur Kamera ausgerichtet wirkt,
- die mobile Oberfläche Branding, zwei Termine, Spielername und Status in einem deutlich flacheren Panel ohne Überlagerung zusammenfasst und zwischen Terminüberschrift und Datums-Chips einen kleinen Abstand beibehält,
- ungültige oder manipulierte Links nicht spielbar sind,
- der private Schlüssel nicht im öffentlichen Repository enthalten ist,
- dauerhafte Fortschrittsspeicherung nur nach ausdrücklichem Opt-in erfolgt, die Ja/Nein-Präferenz den Erstdialog bei Folgeaufrufen unterdrückt, Deaktivieren vorhandene Fortschrittsdaten nicht automatisch löscht und eine separate Löschaktion verfügbar ist,
- das `⋮`-Menü auf Desktop, Tablet und Mobile ohne Layoutverschiebung erreichbar ist,
- Smartphones im Querformat das Spiel nicht bedienen lassen und stattdessen einen Hochformat-Hinweis zeigen, während Desktop und Tablets davon unbeeinflusst bleiben,
- CI grün ist und der manuelle Browser-Smoke-Test bestanden wurde.
