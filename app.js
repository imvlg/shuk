/* Shuk is intentionally plain JavaScript: no build step, framework, server, or API key. */
const API = {
  wikipedia: "https://en.wikipedia.org/w/api.php",
  wikidata: "https://www.wikidata.org/w/api.php",
  commons: "https://commons.wikimedia.org/w/api.php",
  openLibrary: "https://openlibrary.org/search.json"
};

const elements = {
  form: document.querySelector("#search-form"), input: document.querySelector("#search-input"),
  loading: document.querySelector("#loading"), loadingMessage: document.querySelector("#loading-message"),
  empty: document.querySelector("#empty-state"), results: document.querySelector("#results"),
  title: document.querySelector("#result-title"), summary: document.querySelector("#result-summary"),
  type: document.querySelector("#result-type"), label: document.querySelector("#result-label"),
  wikiLink: document.querySelector("#wikipedia-link"), image: document.querySelector("#lead-image"),
  facts: document.querySelector("#fact-grid"), sections: document.querySelector("#article-sections"),
  mapCard: document.querySelector("#map-card"), mapFrame: document.querySelector("#map-frame"), mapLink: document.querySelector("#map-link"),
  mediaCard: document.querySelector("#media-card"), media: document.querySelector("#media-strip"), commonsLink: document.querySelector("#commons-link"),
  booksCard: document.querySelector("#books-card"), books: document.querySelector("#book-list"), booksLink: document.querySelector("#books-link"),
  save: document.querySelector("#save-button"), exportCurrent: document.querySelector("#export-current-button"),
  notesButton: document.querySelector("#notes-button"), noteCount: document.querySelector("#note-count"), drawer: document.querySelector("#notes-drawer"),
  closeNotes: document.querySelector("#close-notes"), backdrop: document.querySelector("#backdrop"), notesList: document.querySelector("#notes-list"),
  exportAll: document.querySelector("#export-all-button"), theme: document.querySelector("#theme-button")
};

let currentResult = null;

function getJson(url) { return fetch(url).then(response => { if (!response.ok) throw new Error("Source request failed"); return response.json(); }); }
function apiUrl(base, parameters) { return `${base}?${new URLSearchParams({ origin: "*", format: "json", ...parameters })}`; }
function escapeHtml(text = "") { const node = document.createElement("div"); node.textContent = text; return node.innerHTML; }
function show(element, visible) { element.classList.toggle("hidden", !visible); }
function setLoading(visible, message = "Looking through open sources…") { elements.loadingMessage.textContent = message; show(elements.loading, visible); }

async function findWikipediaPage(query) {
  const search = await getJson(apiUrl(API.wikipedia, { action: "query", list: "search", srsearch: query, srlimit: "1" }));
  const page = search.query.search[0];
  if (!page) throw new Error("No Wikipedia result found");
  return page.title;
}

async function getWikipediaSummary(title) {
  return getJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
}

async function getSections(title) {
  const data = await getJson(apiUrl(API.wikipedia, { action: "parse", page: title, prop: "sections" }));
  return (data.parse?.sections || []).filter(section => section.toclevel === 1 && !section.line.match(/References|External links|See also/i)).slice(0, 7);
}

async function getSectionText(title, index) {
  const data = await getJson(apiUrl(API.wikipedia, { action: "parse", page: title, section: index, prop: "text", disableeditsection: "1" }));
  const documentFromWiki = new DOMParser().parseFromString(data.parse?.text?.["*"] || "", "text/html");
  return [...documentFromWiki.querySelectorAll("p")].slice(0, 3).map(paragraph => escapeHtml(paragraph.textContent.trim())).filter(Boolean).map(text => `<p>${text}</p>`).join("");
}

async function getWikidata(entityId) {
  if (!entityId) return null;
  const data = await getJson(apiUrl(API.wikidata, { action: "wbgetentities", ids: entityId, props: "labels|descriptions|claims", languages: "en" }));
  return data.entities[entityId];
}

function valueFromClaim(claim) {
  const value = claim?.mainsnak?.datavalue?.value;
  if (value === undefined) return null;
  if (typeof value === "object" && value.id) return value.id;
  if (typeof value === "object" && "amount" in value) return `${value.amount} ${value.unit === "1" ? "" : value.unit.split("/").pop()}`;
  if (typeof value === "object" && "latitude" in value) return `${value.latitude.toFixed(4)}, ${value.longitude.toFixed(4)}`;
  if (typeof value === "object" && value.text) return value.text;
  if (typeof value === "object" && value.time) return value.time.slice(1, 5);
  return String(value);
}

async function buildFacts(entity) {
  if (!entity) return [];
  const usefulProperties = ["P31", "P17", "P131", "P571", "P2043", "P2044", "P2046", "P625", "P1082", "P361", "P495"];
  const rawFacts = usefulProperties.map(property => ({ property, value: valueFromClaim(entity.claims[property]?.[0]) })).filter(fact => fact.value);
  const entityIds = rawFacts.map(fact => fact.value).filter(value => /^Q\d+$/.test(value));
  let labels = {};
  if (entityIds.length) {
    const data = await getJson(apiUrl(API.wikidata, { action: "wbgetentities", ids: entityIds.join("|"), props: "labels", languages: "en" }));
    labels = Object.fromEntries(Object.entries(data.entities).map(([id, item]) => [id, item.labels.en?.value || id]));
  }
  const propertyNames = { P31: "Type", P17: "Country", P131: "Location", P571: "Founded", P2043: "Length", P2044: "Elevation", P2046: "Area", P625: "Coordinates", P1082: "Population", P361: "Part of", P495: "Origin" };
  return rawFacts.map(fact => ({ label: propertyNames[fact.property], value: labels[fact.value] || fact.value.replace(/^\+/, "") })).slice(0, 6);
}

function coordinatesFromEntity(entity) {
  const coordinate = entity?.claims?.P625?.[0]?.mainsnak?.datavalue?.value;
  return coordinate && typeof coordinate.latitude === "number" ? coordinate : null;
}

async function getCommons(query) {
  const data = await getJson(apiUrl(API.commons, { action: "query", generator: "search", gsrsearch: query, gsrnamespace: "6", gsrlimit: "3", prop: "imageinfo", iiprop: "url", iiurlwidth: "420" }));
  return Object.values(data.query?.pages || {}).map(page => ({ title: page.title, url: page.imageinfo?.[0]?.thumburl, pageUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}` })).filter(image => image.url);
}

async function getBooks(query) {
  const data = await getJson(`${API.openLibrary}?${new URLSearchParams({ q: query, limit: "3", fields: "title,author_name,first_publish_year,key" })}`);
  return (data.docs || []).map(book => ({ title: book.title, author: book.author_name?.[0] || "Unknown author", year: book.first_publish_year || "", url: `https://openlibrary.org${book.key}` }));
}

function renderFacts(facts) { elements.facts.innerHTML = facts.map(fact => `<article class="fact"><p>${escapeHtml(fact.label)}</p><strong>${escapeHtml(fact.value)}</strong></article>`).join(""); }
function renderSections(sections, title) {
  elements.sections.innerHTML = sections.map(section => `<details><summary>${escapeHtml(section.line)}</summary><div class="article-text" data-section="${section.index}"><p>Open to load this section.</p></div></details>`).join("");
  elements.sections.querySelectorAll("details").forEach(detail => detail.addEventListener("toggle", async () => {
    const target = detail.querySelector(".article-text");
    if (!detail.open || target.dataset.loaded) return;
    target.innerHTML = "<p>Loading source text…</p>";
    try { target.innerHTML = await getSectionText(title, target.dataset.section) || "<p>This section has no readable text.</p>"; }
    catch { target.innerHTML = "<p>This section could not be loaded right now.</p>"; }
    target.dataset.loaded = "true";
  }));
}
function renderMap(coordinates, title) {
  show(elements.mapCard, Boolean(coordinates)); if (!coordinates) return;
  const { latitude, longitude } = coordinates, padding = 0.035;
  const bbox = `${longitude-padding},${latitude-padding},${longitude+padding},${latitude+padding}`;
  elements.mapFrame.src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${latitude},${longitude}`;
  elements.mapLink.href = `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=12/${latitude}/${longitude}`;
}
function renderMedia(images, title) { show(elements.mediaCard, images.length > 0); elements.media.innerHTML = images.map(image => `<a href="${image.pageUrl}" target="_blank" rel="noreferrer"><img src="${image.url}" alt="${escapeHtml(image.title.replace(/^File:/, ""))}" loading="lazy"></a>`).join(""); elements.commonsLink.href = `https://commons.wikimedia.org/w/index.php?search=${encodeURIComponent(title)}&title=Special:MediaSearch&type=image`; }
function renderBooks(books, query) { show(elements.booksCard, books.length > 0); elements.books.innerHTML = books.map(book => `<li><a href="${book.url}" target="_blank" rel="noreferrer">${escapeHtml(book.title)}</a><span>${escapeHtml(book.author)}${book.year ? ` · ${book.year}` : ""}</span></li>`).join(""); elements.booksLink.href = `https://openlibrary.org/search?q=${encodeURIComponent(query)}`; }

async function search(query) {
  setLoading(true); show(elements.empty, false); show(elements.results, false);
  try {
    const title = await findWikipediaPage(query);
    elements.loadingMessage.textContent = "Assembling the overview…";
    const summary = await getWikipediaSummary(title);
    const pageInfo = await getJson(apiUrl(API.wikipedia, { action: "query", prop: "pageprops", titles: title }));
    const page = Object.values(pageInfo.query.pages)[0];
    const entity = await getWikidata(page.pageprops?.wikibase_item);
    const [sections, facts, commons, books] = await Promise.allSettled([getSections(title), buildFacts(entity), getCommons(title), getBooks(query)]);
    currentResult = { query, title, extract: summary.extract, url: summary.content_urls.desktop.page, facts: facts.value || [], date: new Date().toISOString() };
    elements.title.textContent = title; elements.summary.textContent = summary.extract || "No short description is available for this topic.";
    elements.type.textContent = summary.description?.toUpperCase() || "WIKIPEDIA OVERVIEW"; elements.label.textContent = `Results for “${query}”`;
    elements.wikiLink.href = summary.content_urls.desktop.page;
    if (summary.thumbnail?.source) { elements.image.src = summary.thumbnail.source; elements.image.alt = summary.title; show(elements.image, true); } else show(elements.image, false);
    renderFacts(currentResult.facts); renderSections(sections.value || [], title); renderMap(coordinatesFromEntity(entity), title); renderMedia(commons.value || [], title); renderBooks(books.value || [], query);
    show(elements.results, true); elements.results.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    elements.empty.innerHTML = "<div class='empty-mark'>!</div><h2>That source was unavailable.</h2><p>Try a different spelling or search again in a moment.</p>"; show(elements.empty, true);
  } finally { setLoading(false); }
}

function savedNotes() { return JSON.parse(localStorage.getItem("shuk-notes") || "[]"); }
function saveNotes(notes) { localStorage.setItem("shuk-notes", JSON.stringify(notes)); renderNotes(); }
function makeMarkdown(note) { return `# ${note.title}\n\n${note.extract}\n\n## Facts\n${note.facts.map(fact => `- **${fact.label}:** ${fact.value}`).join("\n")}\n\n## Sources\n- Wikipedia: ${note.url}\n\n---\nSaved with Shuk on ${new Date(note.date).toLocaleDateString()}.\n`; }
function download(filename, content) { const blob = new Blob([content], { type: "text/markdown;charset=utf-8" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = filename; link.click(); URL.revokeObjectURL(link.href); }
function renderNotes() { const notes = savedNotes(); elements.noteCount.textContent = notes.length; elements.notesList.innerHTML = notes.length ? notes.map((note, index) => `<article class="note-item"><h3>${escapeHtml(note.title)}</h3><p>${escapeHtml(note.extract.slice(0, 130))}…</p><div class="note-actions"><button class="text-button" data-export="${index}">Export</button><button class="text-button" data-delete="${index}">Remove</button></div></article>`).join("") : "<p class='drawer-copy'>Nothing saved yet.</p>"; show(elements.exportAll, notes.length > 0); }
function openDrawer(open) { elements.drawer.classList.toggle("open", open); elements.drawer.setAttribute("aria-hidden", String(!open)); show(elements.backdrop, open); }

elements.form.addEventListener("submit", event => { event.preventDefault(); search(elements.input.value.trim()); });
elements.save.addEventListener("click", () => { if (!currentResult) return; const notes = savedNotes(); if (!notes.some(note => note.url === currentResult.url)) saveNotes([currentResult, ...notes]); openDrawer(true); });
elements.exportCurrent.addEventListener("click", () => { if (currentResult) download(`${currentResult.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.md`, makeMarkdown(currentResult)); });
elements.notesButton.addEventListener("click", () => openDrawer(true)); elements.closeNotes.addEventListener("click", () => openDrawer(false)); elements.backdrop.addEventListener("click", () => openDrawer(false));
elements.notesList.addEventListener("click", event => { const index = event.target.dataset.export ?? event.target.dataset.delete; if (index === undefined) return; const notes = savedNotes(); if (event.target.dataset.export !== undefined) download(`${notes[index].title}.md`, makeMarkdown(notes[index])); else { notes.splice(index, 1); saveNotes(notes); } });
elements.exportAll.addEventListener("click", () => download("shuk-library.md", savedNotes().map(makeMarkdown).join("\n\n")));
elements.theme.addEventListener("click", () => { const dark = document.documentElement.dataset.theme !== "dark"; document.documentElement.dataset.theme = dark ? "dark" : "light"; localStorage.setItem("shuk-theme", dark ? "dark" : "light"); });
document.documentElement.dataset.theme = localStorage.getItem("shuk-theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"); renderNotes();
