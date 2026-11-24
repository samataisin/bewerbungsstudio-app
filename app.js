// Oberfläche der Web-App. Logik liegt in core.js (Anschreiben, Prüfer, PDF) und parser.js (Anzeige auslesen).
// Speicher: Paket in IndexedDB (groß, enthält PDFs), Verlauf und Entwurf in localStorage. Nichts verlässt das Gerät,
// außer Samat teilt die Mappe selbst.
"use strict";

(function () {
  const VERSION = "2026-11-24.1";
  const core = window.StudioCore;
  const rules = window.STUDIO_RULES;
  const $ = (id) => document.getElementById(id);
  const DAY = 86400000;
  const STATUSES = ["vorbereitet", "gesendet", "Gespräch", "Absage", "Zusage"];

  let paket = null;       // geladenes Paket (Profil, Bausteine, PDFs als Bytes)
  let letter = null;      // aktuelles Anschreiben (Objekt wie in build.py)
  let mappeFile = null;   // fertige Mappe als File, wird vorab gebaut (Teilen muss direkt im Tipp passieren)
  let mappeFor = "";      // Schlüssel der Daten, zu denen mappeFile gehört
  let lastPages = 0;
  let buildTimer = null;

  // ---------- Speicher ----------
  const store = {
    get(key, fallback) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; } },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* voll oder gesperrt */ } },
  };

  function idb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open("bewerbungsstudio", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("kv");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function idbGet(key) {
    const db = await idb();
    return new Promise((resolve, reject) => {
      const r = db.transaction("kv").objectStore("kv").get(key);
      r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
    });
  }
  async function idbSet(key, value) {
    const db = await idb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("kv", "readwrite");
      if (value === undefined) tx.objectStore("kv").delete(key); else tx.objectStore("kv").put(value, key);
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    });
  }

  // ---------- Paket ----------
  function b64ToBytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function validatePaket(p) {
    const ok = p && p.format === "bewerbungsstudio-paket" && p.profile && p.profile.name &&
      p.directions && Object.keys(p.directions).length && p.lebenslauf && p.lebenslauf.b64 && p.zeugnis && p.zeugnis.b64;
    if (!ok) throw new Error("Das ist kein Bewerbungsstudio-Paket.");
    for (const d of Object.values(p.directions)) {
      if (!Array.isArray(d.letter) || !Array.isArray(d.email) || !d.label) throw new Error("Textbausteine im Paket sind unvollständig.");
    }
    return p;
  }

  async function usePaket(raw) {
    const p = validatePaket(raw);
    const cv = b64ToBytes(p.lebenslauf.b64);
    const zeugnis = b64ToBytes(p.zeugnis.b64);
    const [cvDoc, zDoc] = await Promise.all([PDFLib.PDFDocument.load(cv), PDFLib.PDFDocument.load(zeugnis)]);
    paket = Object.assign({}, p, {
      cvBytes: cv, zeugnisBytes: zeugnis, cvPages: cvDoc.getPageCount(), zeugnisPages: zDoc.getPageCount(),
    });
  }

  async function loadStoredPaket() {
    try {
      const raw = await idbGet("paket");
      if (raw) await usePaket(raw);
    } catch (e) {
      toast("Gespeichertes Paket konnte nicht geladen werden: " + e.message, true);
    }
  }

  function parserOptions() {
    return {
      own: { mails: [paket.profile.email], street: paket.profile.street },
      directions: Object.entries(paket.directions).map(([key, d]) => ({ key: key, keywords: d.keywords })),
    };
  }

  // ---------- Formular ----------
  const F = {};
  ["direction", "role", "firm", "gender", "title", "first", "last", "street", "city", "email", "start", "notiz"]
    .forEach((k) => { F[k] = $("f-" + k); });

  function fillDirections() {
    F.direction.textContent = "";
    if (!paket) return;
    for (const [key, d] of Object.entries(paket.directions)) {
      const o = document.createElement("option"); o.value = key; o.textContent = d.label; F.direction.appendChild(o);
    }
  }

  function formData() {
    const last = F.last.value.trim();
    return {
      direction: F.direction.value || null,
      role: F.role.value.trim(), firm: F.firm.value.trim(),
      contact: last ? { gender: F.gender.value || null, title: F.title.value.trim(), first: F.first.value.trim(), last: last } : null,
      street: F.street.value.trim(), city: F.city.value.trim(), email: F.email.value.trim(), start: F.start.value.trim(),
    };
  }

  function setForm(p) {
    if (p.direction) F.direction.value = p.direction;
    F.role.value = p.role || ""; F.firm.value = p.firm || "";
    const c = p.contact || {};
    F.gender.value = c.gender || ""; F.title.value = c.title || ""; F.first.value = c.first || ""; F.last.value = c.last || "";
    F.street.value = p.street || ""; F.city.value = p.city || ""; F.email.value = p.email || ""; F.start.value = p.start || "";
  }

  function saveDraft() {
    store.set("entwurf", { anzeige: $("anzeige").value, form: formData(), notiz: F.notiz.value });
  }

  function doParse() {
    if (!paket) { toast("Zuerst das Paket laden (Einstellungen).", true); return; }
    const text = $("anzeige").value;
    if (text.trim().length < 20) { toast("Erst eine Anzeige einfügen.", true); return; }
    setForm(window.parseVacancyText ? window.parseVacancyText(text, parserOptions()) : {});
    update();
  }

  // ---------- Anschreiben, Prüfer, Vorschau ----------
  function update() {
    saveDraft();
    if (!paket) { renderChecks([]); return; }
    letter = core.buildLetter(formData(), new Date(), paket, F.notiz.value);
    letter.email_body = core.renderEmailText(letter, paket);
    renderPreview();
    renderChecks(currentChecks());
    scheduleMappe();
  }

  function currentChecks() {
    const res = core.checkLetter(letter, rules);
    if (lastPages > 1) res.push([core.ERROR, "Anschreiben hat " + lastPages + " Seiten. Text kürzen."]);
    else if (lastPages === 1 && mappeFor === key()) res.push([core.OK, "Anschreiben hat genau 1 Seite."]);
    const hist = store.get("verlauf", []);
    const dup = letter.firm && hist.find((h) => core.isDuplicate(letter.firm, h.firm, window.normalizeFirmName));
    if (dup) res.push([core.WARN, "Bei " + dup.firm + " hast du dich am " + new Date(dup.date).toLocaleDateString("de-DE") + " schon beworben."]);
    return res;
  }

  function renderPreview() {
    $("l-addr").textContent = letter.address_lines.join("\n");
    $("l-date").textContent = paket.profile.place + ", " + letter.date;
    $("l-subject").textContent = letter.subject;
    const body = $("l-body"); body.textContent = "";
    for (const t of [letter.anrede].concat(letter.paragraphs, ["Mit freundlichen Grüßen", paket.profile.name])) {
      const p = document.createElement("p"); p.textContent = t; body.appendChild(p);
    }
    $("m-to").textContent = letter.email_to || "(keine Adresse)";
    $("m-subject").textContent = letter.subject;
    $("m-body").textContent = letter.email_body;
  }

  function renderChecks(res) {
    const ul = $("checks"); ul.textContent = "";
    const icon = { OK: "✓", WARNUNG: "!", FEHLER: "✕" };
    for (const [lvl, msg] of res) {
      const li = document.createElement("li"); li.className = lvl;
      const a = document.createElement("span"); a.className = "ic"; a.textContent = icon[lvl];
      const b = document.createElement("span"); b.textContent = msg;
      li.append(a, b); ul.appendChild(li);
    }
    const blocked = !paket || res.some((r) => r[0] === core.ERROR);
    $("shareBtn").disabled = blocked || !mappeFile || mappeFor !== key();
    $("sentBtn").disabled = !paket || !letter || !letter.firm;
  }

  function key() { return JSON.stringify(letter); }

  function scheduleMappe() {
    clearTimeout(buildTimer);
    $("shareBtn").disabled = true;
    buildTimer = setTimeout(buildMappeNow, 350);
  }

  async function buildMappeNow() {
    if (!letter) return;
    const k = key();
    try {
      const l = await core.renderLetterPdf(PDFLib, letter, paket);
      const m = await core.buildMappe(PDFLib, [l.bytes, paket.cvBytes, paket.zeugnisBytes],
        "Bewerbung " + paket.profile.name + ", " + letter.firm, paket.profile.name);
      if (k !== key()) return; // inzwischen geändert
      lastPages = l.pages;
      mappeFile = new File([m.bytes], mappeName(), { type: "application/pdf" });
      mappeFor = k;
      $("m-attach").textContent = mappeFile.name + " · " + m.pages + " Seiten · " + Math.round(mappeFile.size / 1024) + " KB";
      renderChecks(currentChecks());
    } catch (e) {
      toast("PDF konnte nicht gebaut werden: " + e.message, true);
    }
  }

  function mappeName() {
    const last = paket.profile.name.split(/\s+/).pop();
    return last + "-Bewerbungsmappe.pdf";
  }

  // ---------- Aktionen ----------
  async function copy(text, label) {
    try { await navigator.clipboard.writeText(text); toast(label + " kopiert."); }
    catch (e) { toast("Kopieren ging nicht. Text bitte von Hand markieren.", true); }
  }

  function share() {
    if (!mappeFile || mappeFor !== key()) { toast("Mappe wird noch gebaut, kurz warten.", true); return; }
    const data = { files: [mappeFile], title: letter.subject, text: letter.email_body };
    if (navigator.canShare && navigator.canShare({ files: [mappeFile] })) {
      // Direkt im Tipp aufrufen, ohne vorheriges await: Safari verlangt das.
      navigator.share(data).then(() => toast("Geteilt. Wenn die Mail raus ist: „Als gesendet eintragen“."))
        .catch((e) => { if (e.name !== "AbortError") toast("Teilen ging nicht: " + e.message, true); });
    } else {
      download(mappeFile);
      toast("Teilen gibt es in diesem Browser nicht. Die PDF wurde heruntergeladen.");
    }
  }

  function download(file) {
    const url = URL.createObjectURL(file);
    const a = document.createElement("a"); a.href = url; a.download = file.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  function viewPdf() {
    if (!mappeFile) { toast("Mappe wird noch gebaut.", true); return; }
    const url = URL.createObjectURL(mappeFile);
    window.open(url, "_blank") || (location.href = url);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  function markSent() {
    if (!letter || !letter.firm) return;
    const hist = store.get("verlauf", []);
    hist.unshift({ id: Date.now(), date: Date.now(), firm: letter.firm, role: letter.role || letter.direction_label,
      direction: letter.direction, email: letter.email_to, status: "gesendet" });
    store.set("verlauf", hist);
    renderHist();
    toast("Im Verlauf eingetragen.");
  }

  // ---------- Verlauf ----------
  let filter = "Alle";
  function isDue(h) { return h.status === "gesendet" && Date.now() - h.date > 14 * DAY; }

  function renderHist() {
    const hist = store.get("verlauf", []);
    const due = hist.filter(isDue).length;
    $("histCount").textContent = hist.length;
    $("histCount").classList.toggle("due", due > 0);
    const st = $("stats"); st.textContent = "";
    for (const k of ["Alle"].concat(STATUSES, ["Nachfassen"])) {
      const n = k === "Alle" ? hist.length : k === "Nachfassen" ? due : hist.filter((h) => h.status === k).length;
      if (n === 0 && k !== "Alle") continue;
      const b = document.createElement("button"); b.className = "chip"; b.setAttribute("aria-pressed", String(filter === k));
      b.textContent = (k === "Nachfassen" ? "Nachfassen fällig" : k) + " " + n;
      b.addEventListener("click", () => { filter = k; renderHist(); });
      st.appendChild(b);
    }
    const list = $("hist"); list.textContent = "";
    hist.filter((h) => filter === "Alle" || (filter === "Nachfassen" ? isDue(h) : h.status === filter))
      .sort((a, b) => b.date - a.date)
      .forEach((h) => {
        const e = document.createElement("div"); e.className = "entry";
        const left = document.createElement("div");
        const firm = document.createElement("div"); firm.className = "firm"; firm.textContent = h.firm;
        const role = document.createElement("div"); role.className = "role"; role.textContent = h.role + (h.email ? " · " + h.email : "");
        const days = Math.floor((Date.now() - h.date) / DAY);
        const when = document.createElement("div"); when.className = "when";
        when.textContent = new Date(h.date).toLocaleDateString("de-DE") + (days > 0 ? " · vor " + days + " Tagen" : " · heute");
        left.append(firm, role, when);
        const side = document.createElement("div"); side.className = "side";
        const sel = document.createElement("select"); sel.setAttribute("aria-label", "Status für " + h.firm);
        for (const s of STATUSES) { const o = document.createElement("option"); o.textContent = s; o.selected = s === h.status; sel.appendChild(o); }
        sel.addEventListener("change", () => { updateEntry(h.id, { status: sel.value }); });
        const del = document.createElement("button"); del.className = "del"; del.textContent = "Löschen";
        del.addEventListener("click", () => { if (confirm("Eintrag „" + h.firm + "“ löschen?")) removeEntry(h.id); });
        side.append(sel, del);
        e.append(left, side);
        if (isDue(h)) { const t = document.createElement("span"); t.className = "tag"; t.textContent = "Nachfassen fällig"; e.appendChild(t); }
        list.appendChild(e);
      });
    if (!list.children.length) { const p = document.createElement("p"); p.className = "hint"; p.textContent = "Noch keine Einträge."; list.appendChild(p); }
  }
  function updateEntry(id, patch) { store.set("verlauf", store.get("verlauf", []).map((h) => (h.id === id ? Object.assign(h, patch) : h))); renderHist(); }
  function removeEntry(id) { store.set("verlauf", store.get("verlauf", []).filter((h) => h.id !== id)); renderHist(); }

  function exportCsv() {
    const hist = store.get("verlauf", []);
    const cell = (v) => { let s = String(v == null ? "" : v); if (/^[=+\-@\t]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
    const rows = [["Datum", "Firma", "Stelle", "Richtung", "E-Mail", "Status"]]
      .concat(hist.map((h) => [new Date(h.date).toLocaleDateString("de-DE"), h.firm, h.role, h.direction, h.email, h.status]));
    const csv = "﻿" + rows.map((r) => r.map(cell).join(";")).join("\r\n");
    const file = new File([csv], "Bewerbungen-Verlauf.csv", { type: "text/csv" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) navigator.share({ files: [file] }).catch(() => {});
    else download(file);
  }

  // ---------- Einstellungen ----------
  function renderPaketStatus() {
    const dl = $("paketStatus"); dl.textContent = "";
    const rows = paket ? [
      ["Name", paket.profile.name],
      ["Kontakt", paket.profile.email + " · " + paket.profile.phone],
      ["Richtungen", Object.values(paket.directions).map((d) => d.label).join(", ")],
      ["Lebenslauf", paket.cvPages + " Seite(n), " + Math.round(paket.cvBytes.length / 1024) + " KB"],
      ["Zeugnis", paket.zeugnisPages + " Seite(n), " + Math.round(paket.zeugnisBytes.length / 1024) + " KB"],
      ["Erstellt", String(paket.created || "?").replace("T", " ")],
    ] : [["Status", "Kein Paket geladen"]];
    for (const [k, v] of rows) {
      const dt = document.createElement("dt"); dt.textContent = k;
      const dd = document.createElement("dd"); dd.textContent = v;
      dl.append(dt, dd);
    }
    $("noPaket").hidden = !!paket;
    $("paketRemove").disabled = !paket;
  }

  async function onPaketFile(ev) {
    const file = ev.target.files && ev.target.files[0];
    ev.target.value = "";
    if (!file) return;
    try {
      const raw = JSON.parse(await file.text());
      await usePaket(raw);
      await idbSet("paket", raw);
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
      fillDirections(); renderPaketStatus(); update();
      toast("Paket geladen: " + paket.profile.name + ".");
    } catch (e) {
      toast("Paket nicht geladen: " + e.message, true);
    }
  }

  async function removePaket() {
    if (!confirm("Paket von diesem Gerät entfernen? Der Verlauf bleibt.")) return;
    await idbSet("paket", undefined);
    paket = null; letter = null; mappeFile = null;
    fillDirections(); renderPaketStatus(); renderChecks([]);
    toast("Paket entfernt.");
  }

  // ---------- Kleinkram ----------
  let toastTimer;
  function toast(msg, bad) {
    const t = $("toast"); t.textContent = msg; t.style.color = bad ? "var(--bad)" : "var(--ok)";
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.textContent = ""; }, 6000);
    if (bad && $("p-bew").hidden) alert(msg); // Meldung steht im Tab „Bewerbung“, sonst als Hinweisfenster
  }

  function showTab(name) {
    document.querySelectorAll(".tabs button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === name)));
    ["bew", "hist", "set"].forEach((k) => { $("p-" + k).hidden = k !== name; });
  }

  // ---------- Start ----------
  async function start() {
    $("version").textContent = "Version " + VERSION;
    document.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
    $("pasteBtn").addEventListener("click", async () => {
      try { $("anzeige").value = await navigator.clipboard.readText(); doParse(); }
      catch (e) { toast("Einfügen ging nicht. Lange ins Feld tippen und „Einsetzen“ wählen.", true); }
    });
    $("parseBtn").addEventListener("click", doParse);
    $("clearBtn").addEventListener("click", () => { $("anzeige").value = ""; setForm({}); F.notiz.value = ""; update(); });
    $("anzeige").addEventListener("input", saveDraft);
    Object.values(F).forEach((el) => el.addEventListener(el.tagName === "SELECT" ? "change" : "input", update));
    $("v-letter").addEventListener("click", () => switchView(true));
    $("v-mail").addEventListener("click", () => switchView(false));
    $("copyTo").addEventListener("click", () => letter && letter.email_to ? copy(letter.email_to, "Empfänger") : toast("Keine E-Mail-Adresse.", true));
    $("copySubject").addEventListener("click", () => letter && copy(letter.subject, "Betreff"));
    $("copyText").addEventListener("click", () => letter && copy(letter.email_body, "Text"));
    $("shareBtn").addEventListener("click", share);
    $("viewBtn").addEventListener("click", viewPdf);
    $("sentBtn").addEventListener("click", markSent);
    $("paketFile").addEventListener("change", onPaketFile);
    $("paketRemove").addEventListener("click", removePaket);
    $("exportCsv").addEventListener("click", exportCsv);

    await loadStoredPaket();
    fillDirections();
    renderPaketStatus();
    renderHist();
    const draft = store.get("entwurf", null);
    if (draft) { $("anzeige").value = draft.anzeige || ""; setForm(draft.form || {}); F.notiz.value = draft.notiz || ""; }
    if (paket) update();
    if (!paket) showTab("set");

    if ("serviceWorker" in navigator && location.protocol === "https:") {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
  }

  function switchView(letterView) {
    $("v-letter").setAttribute("aria-pressed", String(letterView));
    $("v-mail").setAttribute("aria-pressed", String(!letterView));
    $("letterView").hidden = !letterView; $("mailView").hidden = letterView;
  }

  // Für Tests im Browser (z. B. Paket ohne Datei-Dialog laden)
  window.StudioApp = { usePaketForTest: async (raw) => { await usePaket(raw); fillDirections(); renderPaketStatus(); update(); } };

  start();
})();
