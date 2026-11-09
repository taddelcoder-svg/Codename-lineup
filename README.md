# Codename: Lineup

2D-Agenten-Survivor im Comic-Stil aus der Swimming-Lions-Spielesammlung.
Acht Agenten aus Crazy Lineup, jeweils mit eigener Waffe, Eigenschaft und Ulti.
Überlebe sechs Minuten, schalte den Oberschurken aus und schalte die nächste Mission frei.

- Steuerung: WASD / Pfeiltasten oder Finger ziehen, Ulti mit Leertaste oder ULTI-Knopf
- Alles steckt in `index.html`, ohne Build und ohne Abhängigkeiten
- Koop: bis zu 4 Agenten per Raum-Code. Der Server (`server.js`, WebSocket unter `/ws`) reicht nur Daten weiter, der Host rechnet das Spiel, Gäste steuern ihren Agenten selbst
- Hosting: Render Web Service mit `node server.js` (siehe `render.yaml`)
- Rangliste: meldet sich über `melder.js` unter dem Namen „Codename Lineup“

Schrift: Bricolage Grotesque (SIL OFL 1.1, siehe `fonts/OFL-Bricolage.txt`).
