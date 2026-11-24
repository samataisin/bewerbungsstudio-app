// Automatisch erzeugt aus bewerbung/src/rules.json (bewerbung/src/prepare_web.py). Nicht von Hand ändern.
globalThis.STUDIO_RULES = {
 "_hinweis": "Prüfer-Regeln für Laptop (validator.py) und iPhone (web/core.js). Muster müssen in Python und JavaScript gleich funktionieren: keine Inline-Flags wie (?m), stattdessen 'flags'. {0} = gefundene Stelle.",
 "floskeln": [
  {
   "pattern": "—",
   "flags": "i",
   "message": "Langer Gedankenstrich (—). Lieber Punkt oder Komma."
  },
  {
   "pattern": "\\s–\\s",
   "flags": "i",
   "message": "Gedankenstrich als Pause ( – ). Lieber Punkt oder Komma."
  },
  {
   "pattern": "nicht nur\\b[^.]*\\bsondern auch",
   "flags": "i",
   "message": "„nicht nur …, sondern auch …“ klingt nach KI."
  },
  {
   "pattern": "\\b(Mehrwert|ganzheitlich\\w*|nahtlos\\w*|facettenreich\\w*|vielfältig\\w*|innovativ\\w*|bahnbrechend\\w*|maßgeblich\\w*|Synergie\\w*)\\b",
   "flags": "i",
   "message": "Floskel-Wort: „{0}“."
  },
  {
   "pattern": "nicht zuletzt|spielt\\b.{0,40}?\\beine (entscheidende|wichtige|zentrale) Rolle|von (entscheidender|großer) Bedeutung|unterstreicht|ein Zeugnis für|In der heutigen \\w+ Welt|Es ist wichtig zu beachten|Zusammenfassend lässt sich|Es lässt sich festhalten|Tauchen wir ein|Fazit:",
   "flags": "i",
   "message": "Aufgeblähte Formulierung: „{0}“."
  },
  {
   "pattern": "^(Darüber hinaus|Zudem|Des Weiteren|Ferner)\\b",
   "flags": "m",
   "message": "Absatz beginnt mit „{0}“. Einfach direkt anfangen."
  },
  {
   "pattern": "\\b(leidenschaftlich\\w*|hochmotiviert\\w*|hoch motiviert\\w*|teamfähig, belastbar|Teamplayer|mit großem Interesse habe ich|hiermit bewerbe ich mich|meine Stärken liegen|wäre ich eine Bereicherung|perfekte[rn]? Kandidat\\w*|Herzblut)\\b",
   "flags": "i",
   "message": "Bewerbungs-Floskel: „{0}“. Lieber ein konkretes Beispiel."
  }
 ],
 "unbelegt": [
  {
   "pattern": "\\bAusbildung (zum|zur|als)\\b|\\babgeschlossene[nr]? Ausbildung",
   "flags": "i",
   "message": "„{0}“ behauptet eine abgeschlossene Ausbildung. Das steht nicht im Lebenslauf."
  },
  {
   "pattern": "\\b(Bachelor|Master|Diplom)\\b|\\babgeschlossene[sn]? Studium|\\bStudium abgeschlossen",
   "flags": "i",
   "message": "„{0}“ behauptet einen Studienabschluss. Das steht nicht im Lebenslauf."
  },
  {
   "pattern": "\\bimmatrikuliert|\\beingeschrieben\\b|\\bstudiere (ich )?(bereits|derzeit|aktuell)",
   "flags": "i",
   "message": "„{0}“ behauptet eine Einschreibung an einer Hochschule. Das steht nicht im Lebenslauf."
  },
  {
   "pattern": "\\b\\d+\\s*(\\+\\s*)?Jahre?n?\\s+(Berufs)?[Ee]rfahrung",
   "flags": "i",
   "message": "„{0}“ behauptet eine Zahl an Jahren Berufserfahrung. Das steht nicht im Lebenslauf."
  },
  {
   "pattern": "Führungserfahrung|Teamleit\\w*|Personalverantwortung|Schichtleit\\w*",
   "flags": "i",
   "message": "„{0}“ behauptet Führungserfahrung. Das steht nicht im Lebenslauf."
  },
  {
   "pattern": "\\b(SAP|Python|Java(Script)?|C\\+\\+|C#|SQL|Power ?BI|CAD|AutoCAD|SolidWorks)\\b",
   "flags": "i",
   "message": "„{0}“ behauptet Kenntnisse in dieser Software. Das steht nicht im Lebenslauf."
  },
  {
   "pattern": "Englisch\\w*\\s+(\\w+\\s+)?(fließend|verhandlungssicher|sehr gut|C1|C2)",
   "flags": "i",
   "message": "„{0}“ behauptet sehr gutes Englisch (im Lebenslauf: B1). Das steht nicht im Lebenslauf."
  },
  {
   "pattern": "Französisch\\w*\\s+(\\w+\\s+)?(fließend|gut|B1|B2|C1)",
   "flags": "i",
   "message": "„{0}“ behauptet gutes Französisch (im Lebenslauf: A2). Das steht nicht im Lebenslauf."
  },
  {
   "pattern": "(sehr gute|hervorragende|ausgezeichnete)\\s+(Noten|Mathematik\\w*|Mathe\\w*|Leistungen)",
   "flags": "i",
   "message": "„{0}“ behauptet sehr gute Noten. Das steht nicht im Lebenslauf."
  },
  {
   "pattern": "Führerschein(klasse)?\\s+(Klasse\\s+)?(?!B\\b)[A-Z]{1,2}\\d?\\b",
   "flags": "i",
   "message": "„{0}“ behauptet einen anderen Führerschein als Klasse B. Das steht nicht im Lebenslauf."
  },
  {
   "pattern": "\\{[a-z_]+\\}",
   "flags": "",
   "message": "Ein Platzhalter wie {0} wurde nicht ersetzt."
  }
 ],
 "anrede_fehler": [
  {
   "pattern": "Sehr geehrter Frau",
   "message": "„Sehr geehrter Frau“ ist falsch. Richtig: „Sehr geehrte Frau …“."
  },
  {
   "pattern": "Sehr geehrte Herr\\b",
   "message": "„Sehr geehrte Herr“ ist falsch. Richtig: „Sehr geehrter Herr …“."
  },
  {
   "pattern": "Sehr geehrter Herrn",
   "message": "In der Anrede steht „Herr“, nicht „Herrn“."
  }
 ],
 "mail": "^[\\w.+-]+@[\\w-]+(\\.[\\w-]+)*\\.[A-Za-z]{2,}$",
 "short_job": "werkstudent|aushilfe|minijob|nebenjob|teilzeit",
 "dual": "\\bdual",
 "max_words": 330
};
