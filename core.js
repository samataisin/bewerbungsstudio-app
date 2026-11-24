// Kern der Web-App: Anschreiben aus Anzeige-Daten bauen, prüfen, als PDF zeichnen, Mappe zusammenfügen.
// Gleiche Logik wie bewerbung/src/build.py (make_letter) und validator.py (check_letter);
// bewerbung/src/tests.py vergleicht beide. Läuft im Browser (window.StudioCore) und in Node (require).
"use strict";

(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.StudioCore = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const OK = "OK", WARN = "WARNUNG", ERROR = "FEHLER";
  const MONTHS = "januar|februar|märz|april|mai|juni|juli|august|september|oktober|november|dezember";
  const MONTH_RE = new RegExp("^(" + MONTHS + ")\\s+\\d{4}$", "i");
  const LEGAL_SUFFIX = /\s*(,\s*)?(GmbH\s*&\s*Co\.?\s*KG|GmbH|mbH|AG|KGaA|KG|SE|UG(\s*\(haftungsbeschränkt\))?|OHG|GbR|e\.\s?V\.|e\.\s?K\.)\s*$/;

  // ---------- Text bauen (wie build.py) ----------

  function firmShort(firm) {
    let short = (firm || "").trim();
    for (;;) {
      const next = short.replace(LEGAL_SUFFIX, "").trim();
      if (next === short || !next) return short;
      short = next;
    }
  }

  function beginnPhrase(start) {
    const s = (start || "").trim();
    if (!s) return "";
    if (s.toLowerCase() === "ab sofort") return " ab sofort";
    if (MONTH_RE.test(s)) return " ab " + s[0].toUpperCase() + s.slice(1);
    return " zum " + s;
  }

  function anredeAndPerson(contact) {
    if (!contact || !contact.last) return ["Sehr geehrte Damen und Herren,", ""];
    const title = (contact.title || "").trim();
    const full = [title, contact.first || "", contact.last].filter(Boolean).join(" ");
    const t = title ? title + " " : "";
    if (contact.gender === "Frau") return ["Sehr geehrte Frau " + t + contact.last + ",", "Frau " + full];
    if (contact.gender === "Herr") return ["Sehr geehrter Herr " + t + contact.last + ",", "Herrn " + full];
    return ["Sehr geehrte Damen und Herren,", full];
  }

  function makeSubject(role, label, start) {
    let text = (role || label).replace(/^Bewerbung\s*(als|für|:)?\s*/i, "");
    const s = start || "";
    if (s.toLowerCase() === "ab sofort") text += ", ab sofort";
    else if (MONTH_RE.test(s)) text += ", ab " + s;
    else if (s) text += ", Beginn " + s;
    return "Bewerbung: " + text;
  }

  function fill(template, values) {
    return template.replace(/\{(firma_kurz|stelle|beginn)\}/g, (_, k) => values[k]);
  }

  function formatDate(d) {
    const p = (n) => String(n).padStart(2, "0");
    return p(d.getDate()) + "." + p(d.getMonth() + 1) + "." + d.getFullYear();
  }

  function buildLetter(parsed, today, paket, notiz) {
    const directions = paket.directions;
    const key = parsed.direction || Object.keys(directions)[0];
    const direction = directions[key];
    const firm = (parsed.firm || "").trim();
    const role = (parsed.role || "").trim();
    const values = {
      firma_kurz: firmShort(firm) || "Ihrem Unternehmen",
      stelle: role || direction.default_role || direction.label,
      beginn: beginnPhrase(parsed.start || ""),
    };
    const paragraphs = direction.letter.map((t) => fill(t, values));
    if (notiz && notiz.trim()) paragraphs.splice(paragraphs.length - 1, 0, notiz.trim());
    const [anrede, person] = anredeAndPerson(parsed.contact);
    const address = [firm, person, parsed.street || "", parsed.city || ""].filter(Boolean);
    return {
      direction: key,
      direction_label: direction.label,
      firm: firm,
      role: role,
      city: parsed.city || "",
      contact_name: person,
      address_lines: address.length ? address : ["Firma"],
      date: typeof today === "string" ? today : formatDate(today),
      subject: makeSubject(role, direction.label, parsed.start || ""),
      anrede: anrede,
      paragraphs: paragraphs,
      email_paragraphs: direction.email.map((t) => fill(t, values)),
      email_to: (parsed.email || "").trim(),
    };
  }

  function renderEmailText(letter, paket) {
    const p = paket.profile;
    const lines = [letter.anrede, ""];
    for (const para of letter.email_paragraphs) lines.push(para, "");
    lines.push(paket.email_attachment_line, "", "Mit freundlichen Grüßen", p.name, p.street + ", " + p.city, p.phone);
    return lines.join("\n");
  }

  // ---------- Prüfer (wie validator.py) ----------

  function hits(rules, text, level) {
    const found = [];
    for (const rule of rules) {
      const seen = new Set();
      const re = new RegExp(rule.pattern, (rule.flags || "") + "g");
      for (const m of text.matchAll(re)) {
        const hit = m[0].trim();
        if (!seen.has(hit.toLowerCase())) {
          seen.add(hit.toLowerCase());
          found.push([level, rule.message.split("{0}").join(hit)]);
        }
      }
    }
    return found;
  }

  function checkText(text, rules) {
    return hits(rules.floskeln, text, WARN).concat(hits(rules.unbelegt, text, ERROR));
  }

  function checkLetter(letter, rules) {
    let res = [];
    const body = letter.paragraphs.join("\n");
    res = res.concat(checkText(body + "\n" + (letter.email_body || ""), rules));
    if (!res.some((r) => r[0] === WARN)) res.unshift([OK, "Keine Floskeln und keine Gedankenstriche gefunden."]);

    const anrede = letter.anrede;
    for (const rule of rules.anrede_fehler) if (new RegExp(rule.pattern).test(anrede)) res.push([ERROR, rule.message]);
    if (!anrede.endsWith(",")) res.push([ERROR, "Nach der Anrede fehlt das Komma."]);
    const address = letter.address_lines;
    if (address.some((l) => /^Herr\s/.test(l))) res.push([ERROR, "Im Adressfeld steht „Herrn …“, nicht „Herr …“."]);
    if (address.some((l) => /z\.\s?Hd\./.test(l))) res.push([WARN, "„z. Hd.“ ist veraltet und kann weg."]);
    if (address.some((l) => l.startsWith("Frau ")) && anrede.includes("Herr")) res.push([ERROR, "Adresse sagt Frau, Anrede sagt Herr."]);
    if (address.some((l) => l.startsWith("Herrn ")) && anrede.includes("Frau")) res.push([ERROR, "Adresse sagt Herrn, Anrede sagt Frau."]);
    if (letter.contact_name && anrede.startsWith("Sehr geehrte Damen und Herren")) {
      res.push([WARN, "Bei „" + letter.contact_name + "“ ist unklar, ob Frau oder Herr. Deshalb steht „Sehr geehrte Damen und Herren“."]);
    } else if (!letter.contact_name) {
      res.push([WARN, "Kein Ansprechpartner gefunden. Mit Namen wirkt die Bewerbung persönlicher."]);
    } else {
      res.push([OK, "Anrede passt zur Adresse: „" + anrede + "“"]);
    }

    res.push(letter.firm ? [OK, "Firma: " + letter.firm] : [ERROR, "Keine Firma erkannt. Bitte eintragen."]);
    if (!letter.city) res.push([WARN, "Keine Adresse (PLZ und Ort) erkannt. Im Anschreiben steht nur die Firma."]);

    const mail = letter.email_to || "";
    if (!mail) res.push([ERROR, "Keine E-Mail-Adresse für die Bewerbung. Bitte eintragen."]);
    else if (!new RegExp(rules.mail).test(mail)) res.push([ERROR, "E-Mail-Adresse sieht falsch aus: " + mail]);
    else res.push([OK, "E-Mail an: " + mail]);

    const role = letter.role || "";
    if ((letter.direction === "wi" || letter.direction === "wiinf") && new RegExp(rules.short_job, "i").test(role)) {
      res.push([WARN, "Die Stelle „" + role + "“ klingt nach Job, die Vorlage ist für ein duales Studium. Richtung prüfen."]);
    }
    if (letter.direction === "sales" && new RegExp(rules.dual, "i").test(role)) {
      res.push([WARN, "Die Stelle „" + role + "“ klingt nach dualem Studium, die Vorlage ist für Vertrieb. Richtung prüfen."]);
    }
    if (/werkstudent/i.test(role)) {
      res.push([WARN, "Werkstudent geht nur mit Immatrikulationsbescheinigung. Erst senden, wenn du eingeschrieben bist."]);
    }
    const words = (anrede + " " + body).split(/\s+/).filter(Boolean).length;
    if (words > rules.max_words) res.push([WARN, words + " Wörter. Das wird auf einer Seite eng."]);
    return res;
  }

  function isDuplicate(firm, oldFirm, normalize) {
    const a = normalize(firm), b = normalize(oldFirm);
    if (!a || !b) return false;
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return a === b || new RegExp("\\b" + esc(b) + "\\b").test(a) || new RegExp("\\b" + esc(a) + "\\b").test(b);
  }

  // ---------- PDF ----------

  // Standardschrift Helvetica kann nur WinAnsi (Latin-1 + ein paar Zeichen). Alles andere wird ersetzt.
  const WIN_ANSI_EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
  function winAnsiSafe(text) {
    let out = "";
    for (const ch of String(text || "")) {
      const c = ch.codePointAt(0);
      if (c === 10 || (c >= 32 && c <= 126) || (c >= 160 && c <= 255) || WIN_ANSI_EXTRA.includes(ch)) out += ch;
      else if (c === 9) out += " ";
      else if (c === 0x2011 || c === 0x2010) out += "-";
      else out += "?";
    }
    return out;
  }

  const MM = 72 / 25.4;
  const A4 = [595.28, 841.89];
  const LAYOUT = { left: 24 * MM, right: 22 * MM, top: 16 * MM, bottom: 12 * MM, size: 10.5, lead: 10.5 * 1.5 };

  async function renderLetterPdf(PDFLib, letter, paket) {
    const { PDFDocument, StandardFonts, rgb } = PDFLib;
    const p = paket.profile;
    const doc = await PDFDocument.create();
    const regular = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const accent = rgb(27 / 255, 58 / 255, 87 / 255);
    const ink = rgb(31 / 255, 41 / 255, 51 / 255);
    const grey = rgb(82 / 255, 96 / 255, 109 / 255);
    const width = A4[0] - LAYOUT.left - LAYOUT.right;
    const maxY = A4[1] - LAYOUT.bottom;
    let page = doc.addPage(A4);
    let y = LAYOUT.top; // Abstand von oben

    const text = (s, x, yTop, font, size, color) =>
      page.drawText(winAnsiSafe(s), { x: x, y: A4[1] - yTop, size: size, font: font, color: color });
    const widthOf = (s, font, size) => font.widthOfTextAtSize(winAnsiSafe(s), size);
    const ensure = (h) => { if (y + h > maxY) { page = doc.addPage(A4); y = LAYOUT.top; } };

    function wrap(s, font, size) {
      const lines = [];
      let line = "";
      for (const word of String(s).split(/\s+/).filter(Boolean)) {
        const test = line ? line + " " + word : word;
        if (line && widthOf(test, font, size) > width) { lines.push(line); line = word; } else line = test;
      }
      if (line) lines.push(line);
      return lines;
    }
    function paragraph(s, font, size, after, color) {
      const lead = size * 1.5;
      for (const line of wrap(s, font, size)) { ensure(lead); y += lead; text(line, LAYOUT.left, y - size * 0.3, font, size, color || ink); }
      y += after;
    }
    function rightAligned(s, yTop, font, size, color) {
      text(s, A4[0] - LAYOUT.right - widthOf(s, font, size), yTop, font, size, color);
    }

    // Kopf: Name links, Kontakt rechts, Linie darunter
    const contact = [p.street + ", " + p.city, p.phone, p.email];
    contact.forEach((c, i) => rightAligned(c, y + 9 + i * 13.5, regular, 9, grey));
    const nameBase = y + 9 + 2 * 13.5;
    page.pushOperators(PDFLib.setCharacterSpacing(1.5));
    text(p.name.toUpperCase(), LAYOUT.left, nameBase, bold, 20, accent);
    page.pushOperators(PDFLib.setCharacterSpacing(0));
    y = nameBase + 3 * MM + 4;
    page.drawLine({ start: { x: LAYOUT.left, y: A4[1] - y }, end: { x: A4[0] - LAYOUT.right, y: A4[1] - y }, thickness: 1.5, color: accent });
    y += 9 * MM;

    // Empfänger (mindestens 22 mm hoch), Datum, Betreff
    const addrStart = y;
    for (const line of letter.address_lines) { y += LAYOUT.lead; text(line, LAYOUT.left, y - 3, regular, LAYOUT.size, ink); }
    y = Math.max(y, addrStart + 22 * MM) + 7 * MM;
    y += LAYOUT.lead;
    rightAligned(p.place + ", " + letter.date, y - 3, regular, LAYOUT.size, ink);
    y += 6 * MM;
    paragraph(letter.subject, bold, LAYOUT.size, 7 * MM - 3.6 * MM);
    y += 3.6 * MM;

    paragraph(letter.anrede, regular, LAYOUT.size, 3.6 * MM);
    for (const para of letter.paragraphs) paragraph(para, regular, LAYOUT.size, 3.6 * MM);
    paragraph("Mit freundlichen Grüßen", regular, LAYOUT.size, 9 * MM);
    paragraph(p.name, regular, LAYOUT.size, 7 * MM - 3.6 * MM);
    paragraph(paket.attachments, regular, 9, 0, grey);

    setMeta(doc, "Anschreiben " + p.name + ", " + letter.firm, p.name);
    const bytes = await doc.save();
    return { bytes: bytes, pages: doc.getPageCount() };
  }

  function setMeta(doc, title, author) {
    doc.setTitle(title);
    doc.setAuthor(author);
    doc.setSubject(title);
    doc.setCreator(author);
    doc.setProducer(author);
  }

  async function buildMappe(PDFLib, parts, title, author) {
    const out = await PDFLib.PDFDocument.create();
    for (const bytes of parts) {
      const src = await PDFLib.PDFDocument.load(bytes);
      const pages = await out.copyPages(src, src.getPageIndices());
      pages.forEach((pg) => out.addPage(pg));
    }
    setMeta(out, title, author);
    const bytes = await out.save();
    return { bytes: bytes, pages: out.getPageCount() };
  }

  function slug(text) {
    let s = firmShort(text).toLowerCase();
    for (const [a, b] of [["ä", "ae"], ["ö", "oe"], ["ü", "ue"], ["ß", "ss"]]) s = s.split(a).join(b);
    s = s.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return s.slice(0, 40) || "firma";
  }

  return {
    OK, WARN, ERROR, firmShort, beginnPhrase, anredeAndPerson, makeSubject, buildLetter, renderEmailText,
    checkText, checkLetter, isDuplicate, winAnsiSafe, renderLetterPdf, buildMappe, formatDate, slug,
  };
});
