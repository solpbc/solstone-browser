// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc
(() => {
  "use strict";
  const api = globalThis.SolstoneI18nBundles.browser;
  const contracts = globalThis.SolstoneI18nContracts;
  const SOURCE_LOCALE = "en-US";
  const PROBE_ID = "browser.options.remove";
  function hasPackagedLocale(tag) {
    try {
      api.render(tag, PROBE_ID, [], { useIsolating: false });
      return true;
    } catch {
      return false;
    }
  }
  function resolveLocale() {
    const rawCandidates = [];
    if (typeof globalThis.SOLSTONE_LOCALE === "string" && globalThis.SOLSTONE_LOCALE.trim()) {
      rawCandidates.push(globalThis.SOLSTONE_LOCALE);
    }
    try {
      const ui = globalThis.chrome?.i18n?.getUILanguage?.();
      if (typeof ui === "string" && ui.trim()) rawCandidates.push(ui);
    } catch {}
    if (typeof navigator !== "undefined") {
      if (Array.isArray(navigator.languages)) rawCandidates.push(...navigator.languages);
      if (typeof navigator.language === "string") rawCandidates.push(navigator.language);
    }
    for (const raw of rawCandidates) {
      const tag = String(raw).trim().replace(/_/g, "-");
      if (!tag) continue;
      if (hasPackagedLocale(tag)) return tag;
      const parts = tag.split("-");
      const primary = parts[0].toLowerCase();
      if (parts.length > 1) {
        const canonical = `${primary}-${parts[1].toUpperCase()}`;
        if (hasPackagedLocale(canonical)) return canonical;
      }
      if (primary === "es" && hasPackagedLocale("es-419")) return "es-419";
      if (hasPackagedLocale(primary)) return primary;
    }
    return SOURCE_LOCALE;
  }
  const locale = resolveLocale();
  function t(id, input = {}) {
    const args = { ...input };
    const selector = contracts[id]?.selector?.name;
    if (selector === "place" && typeof args.place === "string") args.place = args.place.replace(/^this /, "");
    if (selector === "browser" && typeof args.browser === "string") args.browser = args.browser.toLowerCase();
    return api.render(locale, id, Object.entries(args), { useIsolating: locale !== SOURCE_LOCALE });
  }
  function localize(root = document) {
    if (locale !== SOURCE_LOCALE && root?.documentElement) root.documentElement.lang = locale;
    for (const element of root.querySelectorAll("[data-i18n]")) element.textContent = t(element.dataset.i18n, JSON.parse(element.getAttribute("data-i18n-args") || "{}"));
    for (const attribute of ["aria-label", "title", "placeholder"]) {
      for (const element of root.querySelectorAll(`[data-i18n-${attribute}]`)) element.setAttribute(attribute, t(element.getAttribute(`data-i18n-${attribute}`)));
    }
  }
  globalThis.SolstoneI18n = Object.freeze({ t, localize, locale, ids: Object.freeze(Object.keys(contracts)) });
  if (typeof document !== "undefined") localize();
})();
