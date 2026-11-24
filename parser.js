// Liest eine eingefügte Stellenanzeige aus: Richtung, Stelle, Firma, Ansprechpartner,
// Adresse, Bewerbungs-Mail, Beginn. Reines JavaScript ohne Abhängigkeiten, damit es
// später unverändert in der Web-App (Phase 2) laufen kann.
//
// Node-Aufruf (von build.py benutzt):  echo {"text": "...", "options": {...}} | node parser.js

"use strict";

const BAD_MAIL = /^(datenschutz|impressum|no-?reply|noreply|privacy|dsb|webmaster|presse)@/i;
const GOOD_MAIL = ["bewerbung", "bewerbungen", "karriere", "jobs", "job", "ausbildung", "personal", "hr", "recruiting", "info", "kontakt"];
const LEGAL_FORM = /\b(GmbH|AG|KG|SE|UG|OHG|GbR|KGaA|e\.\s?V\.|e\.\s?K\.|mbH|Gruppe|Group|Holding|Stadtwerke|Werke)\b/;
const STREET = /(str\.|straße|strasse|weg|platz|allee|ufer|ring|gasse|damm|chaussee|markt|berg|hof)\b.*\d|\d+\s*[a-z]?$/i;
const LABEL_LINE = /^(ansprechpartner(in)?|ansprechperson|kontakt(person)?|ihr(e)? ansprechpartner(in)?|bewerbung an|bewerbungen an|z\.\s?hd\.?)\s*:?/i;
const TITLE = "(?:(?:Prof\\.|Dr\\.(?:\\s?(?:med|rer\\.\\s?nat|phil|jur|ing)\\.)?|Dipl\\.-[A-Za-zäöü]+\\.?)\\s+)*";
const NAME = "[A-ZÄÖÜ][a-zäöüß]+(?:-[A-ZÄÖÜ][a-zäöüß]+)?";
const PERSON_RE = new RegExp("\\b(Herrn?|Frau)\\s+(" + TITLE + ")(" + NAME + "(?:\\s+" + NAME + ")?(?:\\s+(?:von|van|zu|de|von der)\\s+" + NAME + ")?)");
const BARE_PERSON_RE = new RegExp("^(" + TITLE + ")(" + NAME + "\\s+(?:(?:von|van|zu|de)\\s+)?" + NAME + ")$");

// Kleine Liste häufiger Vornamen, nur für Fälle ohne "Herr"/"Frau".
const FEMALE = ["anna", "julia", "laura", "lisa", "sarah", "sara", "katharina", "maria", "christina", "sandra", "nicole", "stefanie", "melanie", "jessica", "jennifer", "claudia", "sabine", "petra", "andrea", "susanne", "monika", "birgit", "nina", "lena", "lea", "hannah", "anja", "kathrin", "katrin", "tanja", "silke", "heike", "martina", "daniela", "simone", "carina", "vanessa", "jana", "johanna", "elena", "olga", "natalia", "marie", "sophie", "franziska", "verena", "miriam", "eva", "ines", "ulrike", "kerstin", "bettina", "yvonne", "nadine", "janina", "alina", "svenja", "annika"];
const MALE = ["thomas", "michael", "andreas", "stefan", "stephan", "christian", "markus", "marcus", "daniel", "alexander", "martin", "peter", "frank", "jan", "tobias", "sebastian", "florian", "matthias", "jens", "uwe", "jürgen", "juergen", "klaus", "wolfgang", "dirk", "sven", "oliver", "patrick", "david", "lukas", "jonas", "felix", "max", "paul", "tim", "philipp", "benjamin", "kai", "holger", "ralf", "torsten", "thorsten", "bernd", "dieter", "manfred", "hans", "karl", "carsten", "marco", "dennis", "kevin", "niklas", "simon", "fabian", "dominik", "johannes", "moritz", "robert", "sergej", "dmitri", "andrej"];

const ZERO_WIDTH = /[​-‏‪-‮⁦-⁩﻿]/g;

function clean(raw) {
  return String(raw || "").replace(ZERO_WIDTH, "").replace(/ /g, " ").replace(/\r\n?/g, "\n");
}

function genderOfFirstName(first) {
  const f = (first || "").toLowerCase();
  if (FEMALE.includes(f)) return "Frau";
  if (MALE.includes(f)) return "Herr";
  return null;
}

function splitPerson(titles, name) {
  const parts = name.trim().split(/\s+/);
  const particles = ["von", "van", "zu", "de", "der"];
  let lastStart = parts.length - 1;
  while (lastStart > 0 && particles.includes(parts[lastStart - 1].toLowerCase())) lastStart--;
  return {
    title: titles.replace(/\s+/g, " ").trim(),
    first: parts.length > 1 ? parts.slice(0, lastStart).join(" ") : "",
    last: parts.slice(lastStart).join(" "),
  };
}

function findContact(lines, text) {
  // 1. Zeile mit Label ("Ansprechpartnerin: Frau Julia Brandt") oder Zeile direkt darunter
  for (let i = 0; i < lines.length; i++) {
    if (!LABEL_LINE.test(lines[i])) continue;
    const candidates = [lines[i].replace(LABEL_LINE, "").trim(), lines[i + 1] || ""];
    for (const c of candidates) {
      const m = c.match(PERSON_RE);
      if (m) return Object.assign(splitPerson(m[2], m[3]), { gender: /frau/i.test(m[1]) ? "Frau" : "Herr" });
      const b = c.trim().match(BARE_PERSON_RE);
      if (b && !LEGAL_FORM.test(c)) {
        const p = splitPerson(b[1], b[2]);
        return Object.assign(p, { gender: genderOfFirstName(p.first.split(" ")[0]) });
      }
    }
  }
  // 2. Irgendwo "Herr/Herrn/Frau [Titel] Vorname Nachname"
  const m = text.match(PERSON_RE);
  if (m) return Object.assign(splitPerson(m[2], m[3]), { gender: /frau/i.test(m[1]) ? "Frau" : "Herr" });
  return null;
}

function findMail(text, own) {
  const ownMails = (own.mails || []).map((m) => m.toLowerCase());
  const all = (text.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}/gi) || []).map((m) => m.replace(/\.$/, ""));
  const unique = [...new Set(all.map((m) => m.toLowerCase()))]
    .filter((m) => !BAD_MAIL.test(m) && !ownMails.includes(m));
  const rank = (m) => { const i = GOOD_MAIL.findIndex((p) => m.startsWith(p + "@")); return i === -1 ? 99 : i; };
  unique.sort((a, b) => rank(a) - rank(b));
  return unique[0] || "";
}

function findAddress(lines, own) {
  // Von unten nach oben: die Firmenadresse steht meist am Ende, Telefonnummern und die eigene Adresse ignorieren.
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].match(/^(?:D-)?(\d{5})\s+([A-ZÄÖÜ][\wäöüß.\-/ ]+?)\s*$/);
    if (!m || /tel|fon|fax/i.test(lines[i])) continue;
    const prev = i > 0 ? lines[i - 1] : "";
    const street = prev && STREET.test(prev) && !/tel|fon|fax|@/i.test(prev) ? prev : "";
    if (own.street && street && street.toLowerCase() === own.street.toLowerCase()) continue;
    return { street, city: m[1] + " " + m[2].trim(), index: i, oneLine: false };
  }
  // Adresse in einer Zeile: "Hafenstraße 12, 56068 Koblenz"
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].match(/^(.+?\d+\s*[a-z]?)\s*,\s*(\d{5})\s+([A-ZÄÖÜ][\wäöüß.\- ]+)$/);
    if (m && !(own.street && m[1].toLowerCase() === own.street.toLowerCase())) {
      return { street: m[1].trim(), city: m[2] + " " + m[3].trim(), index: i, oneLine: true };
    }
  }
  return { street: "", city: "", index: -1 };
}

function findFirm(lines, addr, contact) {
  const label = lines.find((l) => /^(arbeitgeber|firma|unternehmen|company)\s*:/i.test(l));
  if (label) return label.split(":").slice(1).join(":").trim();
  const isPersonLine = (l) => PERSON_RE.test(l) || LABEL_LINE.test(l) || (contact && l.includes(contact.last) && !LEGAL_FORM.test(l));
  const skip = (l) => /@|^(tel|fon|fax|www\.|https?:)|^(arbeitsort|standort|einsatzort|kontakt|adresse)\s*:?$/i.test(l) || isPersonLine(l);
  // Zeilen direkt über der Adresse
  if (addr.index > 0) {
    const start = addr.index - (addr.street && !addr.oneLine ? 2 : 1);
    for (let i = start; i >= Math.max(0, start - 3); i--) {
      const l = lines[i];
      if (skip(l)) continue;
      if (LEGAL_FORM.test(l) || i === start) return l.replace(/^(arbeitsort|standort)\s*:\s*/i, "").trim();
      break;
    }
  }
  const legal = lines.find((l) => LEGAL_FORM.test(l) && !/@/.test(l) && l.length < 80 && !/[.!?]$/.test(l));
  return legal ? legal.trim() : "";
}

function findRole(lines) {
  const first = (lines[0] || "")
    .replace(/^(stellenanzeige|stellenangebot|wir suchen( dich| sie)?|job)\s*:?\s*/i, "")
    .replace(/\s*\([^)]*\b[mwfd]\s*\/\s*[mwfd]\b[^)]*\)\s*/gi, " ")
    .replace(/\s*\*in\b/g, "")
    .replace(/\s+[–-]\s+.*$/, "")
    .trim();
  return first.length > 120 ? "" : first;
}

function findStart(text) {
  const m = text.match(/(?:start|beginn|studienbeginn|ausbildungsbeginn|eintritt|ab|zum)\s*:?\s*(?:dem\s+)?(\d{1,2}\.\s?\d{1,2}\.\s?\d{4}|(?:wintersemester|sommersemester|WS|SoSe)\s+\d{4}(?:\/\d{2,4})?|(?:januar|februar|märz|april|mai|juni|juli|august|september|oktober|november|dezember)\s+\d{4})/i);
  if (m) return m[1].replace(/(\d)\.\s+(\d)/g, "$1.$2");
  if (/ab sofort/i.test(text)) return "ab sofort";
  return "";
}

function findDirection(lines, text, directions) {
  const title = lines.slice(0, 2).join(" ").toLowerCase();
  const head = lines.slice(0, 8).join(" ").toLowerCase();
  const all = text.toLowerCase();
  // Titel zählt vor Kopfzeilen und vor dem Rest, damit "Über uns"-Texte die Stelle nicht überstimmen.
  for (const scope of [title, head, all]) {
    for (const d of directions) {
      if (d.keywords.some((k) => scope.includes(k.toLowerCase()))) return d.key;
    }
  }
  return null;
}

function normalizeFirmName(name) {
  return String(name || "").toLowerCase()
    .replace(/&\s*co\.?/g, " ")
    .replace(/\b(gmbh|mbh|ag|kg|kgaa|ohg|ug|gbr|se|co|e\.\s?k\.|e\.\s?v\.|haftungsbeschränkt)\b/g, " ")
    .replace(/[^\wäöüß]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseVacancyText(raw, options) {
  const opts = options || {};
  const own = opts.own || {};
  const directions = opts.directions || [];
  const text = clean(raw);
  const lines = text.split("\n").map((s) => s.trim()).filter(Boolean);
  const contact = findContact(lines, text);
  const addr = findAddress(lines, own);
  return {
    direction: findDirection(lines, text, directions),
    role: findRole(lines),
    firm: findFirm(lines, addr, contact),
    contact,
    street: addr.street,
    city: addr.city,
    email: findMail(text, own),
    start: findStart(text),
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { parseVacancyText, normalizeFirmName, genderOfFirstName };
}

if (typeof require !== "undefined" && typeof module !== "undefined" && require.main === module) {
  const chunks = [];
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (c) => chunks.push(c));
  process.stdin.on("end", () => {
    // Eingabe: {"text": "...", "options": {...}} als JSON (umgeht Windows-Quoting bei Argumenten).
    const input = JSON.parse(chunks.join(""));
    process.stdout.write(JSON.stringify(parseVacancyText(input.text, input.options)));
  });
}
