// /buroPix/js/spa-shell.js
(() => {
  "use strict";

  document.addEventListener("DOMContentLoaded", () => {
    const mainWrap = document.querySelector(".quok-main"); // CSS: .quok-main.mode-project
    const gnbButtons = document.querySelectorAll(".gnb-main__link[data-main]");
    const panelTabs = document.querySelectorAll(".panel-tab[data-tab][data-list-url]");
    const panelListBody = document.getElementById("panel-list-body");
    const viewRoot = document.getElementById("view-root");

    if (!mainWrap || !panelListBody || !viewRoot || gnbButtons.length === 0) return;

    const parser = new DOMParser();

    const SPA_ASSET_PREFIXES = ["/buroPix/"];
    const skinBase = (() => {
      const path = location.pathname || "/";
      const match = path.match(/^\/(skin-[^/]+)(?:\/|$)/);
      return match ? `/${match[1]}` : "";
    })();

    const withSkinBase = (path) => {
      if (!path || typeof path !== "string") return path;
      if (!skinBase) return path;
      if (!path.startsWith("/")) return path;
      if (path.startsWith(`${skinBase}/`)) return path;
      return SPA_ASSET_PREFIXES.some((prefix) => path.startsWith(prefix))
        ? `${skinBase}${path}`
        : path;
    };

    // ✅ 0) 헤더/상단바 높이 → CSS 변수 반영 + body 스크롤 잠금
    const HEADER_SELECTORS = [
      "#header",
      "#wrap > #header",
      ".topBanner",
      ".topbanner",
      ".topText",
      "#top",
      ".topArea",
      "header",
    ];

    const findHeaderEl = () =>
      HEADER_SELECTORS.map((s) => document.querySelector(s)).find((el) => el && el.offsetHeight > 0) || null;

    let layoutSyncTimer = null;
    let lastGnbStack = 0;
    const getViewportHeight = () => {
      const vv = window.visualViewport;
      return Math.round((vv && vv.height) || window.innerHeight || document.documentElement.clientHeight);
    };

    let lastViewportW = window.innerWidth;
    let lastViewportH = getViewportHeight();
    const scheduleLayoutSync = () => {
      syncShellLayout();
      requestAnimationFrame(syncShellLayout);
      if (layoutSyncTimer) clearTimeout(layoutSyncTimer);
      layoutSyncTimer = setTimeout(syncShellLayout, 200);
    };

    const syncShellLayout = () => {
      const currentW = window.innerWidth;
      const currentH = getViewportHeight();
      if (currentW !== lastViewportW || currentH !== lastViewportH) {
        document.documentElement.style.setProperty("--quok-vh", `${currentH * 0.01}px`);
        lastViewportW = currentW;
        lastViewportH = currentH;
      }

      const SPA_WRAP =
        document.querySelector(".quok-spa-wrap") ||
        document.getElementById("quok-wrap") ||
        document.querySelector("#quok-wrap");

      const headerEl = findHeaderEl();
      const headerH = headerEl ? Math.ceil(headerEl.getBoundingClientRect().height) : 0;

      const wrapTop = SPA_WRAP ? Math.max(0, Math.ceil(SPA_WRAP.getBoundingClientRect().top)) : 0;

      const pos = headerEl ? getComputedStyle(headerEl).position : "";
      const finalH =
        pos === "fixed" || pos === "sticky" || wrapTop === 0 ? Math.max(wrapTop, headerH) : wrapTop;

      document.documentElement.style.setProperty("--quok-header-h", `${finalH}px`);
      document.body.classList.add("quok-spa-on");

      const gnbEl = document.querySelector(".quok-gnb");
      if (gnbEl) {
        const gnbRect = gnbEl.getBoundingClientRect();
        const gnbHeight = Math.max(0, Math.ceil(gnbRect.height));
        const gnbBottomGap = Math.max(0, Math.ceil(currentH - gnbRect.bottom));
        const gnbStackA = Math.max(0, Math.ceil(currentH - gnbRect.top));
        const gnbStackB = gnbHeight + gnbBottomGap;
        const fallback =
          parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--gnb-h")) || 70;
        const rawStack = Math.max(gnbStackA, gnbStackB, fallback);
        const gnbStack = Math.max(lastGnbStack, rawStack);
        lastGnbStack = gnbStack;
        document.documentElement.style.setProperty("--quok-gnb-stack", `${gnbStack}px`);
        if (gnbStackA === 0 && gnbStackB === 0) requestAnimationFrame(syncShellLayout);
      }
      const isPc = window.innerWidth >= 1025;
      const radiusTargets = [document.querySelector(".panel-list"), document.getElementById("quok-view")];
      radiusTargets.forEach((el) => {
        if (!el) return;
        if (isPc) {
          el.style.borderRadius = "var(--card-radius)";
        } else {
          el.style.removeProperty("border-radius");
        }
      });
      lastViewportW = currentW;
      lastViewportH = currentH;
    };

    syncShellLayout();
    syncPdMode();
    syncHomeMode();
    scheduleLayoutSync();
    window.addEventListener("resize", syncShellLayout, { passive: true });
    window.addEventListener("orientationchange", syncShellLayout, { passive: true });
    window.addEventListener("load", syncShellLayout);
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", syncShellLayout, { passive: true });
      window.visualViewport.addEventListener("scroll", syncShellLayout, { passive: true });
    }

    const _headerEl = findHeaderEl();
    if (_headerEl && window.ResizeObserver) {
      const ro = new ResizeObserver(syncShellLayout);
      ro.observe(_headerEl);
    }
    const _gnbEl = document.querySelector(".quok-gnb");
    if (_gnbEl && window.ResizeObserver) {
      const roGnb = new ResizeObserver(syncShellLayout);
      roGnb.observe(_gnbEl);
    }

    const MAIN_VIEWS = {
      home: withSkinBase("/buroPix/views/home.html"),
      web: withSkinBase("/buroPix/views/web.html"),
      guide: withSkinBase("/buroPix/views/guide.html"),
      contact: withSkinBase("/buroPix/views/contact.html"),
      book: withSkinBase("/buroPix/views/book.html"),
    };

    const LIST_PAGE_SIZE = 6;
    let listObserver = null;
    let listSentinel = null;
    let listPageAbort = null;
    const listPagingState = {
      url: "",
      page: 1,
      loading: false,
      ended: false,
      listEl: null,
    };

    // 캐시
    const listCache = new Map(); // url -> html(string)
    const viewCache = new Map(); // url -> markup(string)

    // 요청 경합 방지
    let listAbort = null;
    let viewAbort = null;

    // 상태
    const state = {
      main: document.querySelector(".gnb-main__link.is-active")?.dataset.main || "home",
      tab: document.querySelector(".panel-tab.is-active")?.dataset.tab || "lookbook",
      listUrl: document.querySelector(".panel-tab.is-active")?.dataset.listUrl || "",
      viewUrl: "",
    };
    const OVERLAY_KEY = "quokProjectOverlay";
    const OVERLAY_TAB_KEY = "quokProjectOverlayTab";
    const PROJECT_VIEW_KEY = "quokProjectViewUrl";
    let projectListSticky = false;
    let projectEntryFromOther = false;

    const setProjectEntryFlag = (on) => {
      projectEntryFromOther = !!on;
      if (projectEntryFromOther) {
        document.body.dataset.quokProjectEntry = "1";
      } else {
        delete document.body.dataset.quokProjectEntry;
      }
    };

    const setOverlayPersist = (on) => {
      try {
        if (on) {
          sessionStorage.setItem(OVERLAY_KEY, "1");
        } else {
          sessionStorage.removeItem(OVERLAY_KEY);
          sessionStorage.removeItem(OVERLAY_TAB_KEY);
        }
      } catch {}
    };

    const saveOverlayTab = (tab) => {
      if (!tab) return;
      try {
        if (sessionStorage.getItem(OVERLAY_KEY) === "1") {
          sessionStorage.setItem(OVERLAY_TAB_KEY, tab);
        }
      } catch {}
    };

    const saveProjectViewUrl = (url) => {
      if (!url) return;
      try {
        sessionStorage.setItem(PROJECT_VIEW_KEY, url);
      } catch {}
    };

    const getSavedProjectViewUrl = () => {
      try {
        return sessionStorage.getItem(PROJECT_VIEW_KEY) || "";
      } catch {
        return "";
      }
    };

    // ---------- Utils ----------
    const setActive = (nodes, active) => {
      nodes.forEach((n) => n.classList.toggle("is-active", n === active));
    };

    let overlayPrevMain = state.main;
    let overlayActiveBtn = null;

    const runViewHook = (main) => {
      const handler = window.quokViewModules?.[main];
      if (typeof handler === "function") {
        try {
          handler({ main, viewRoot });
        } catch (err) {
          console.error("View module error:", err);
        }
      }
    };

    const setLoading = (target, on, placeholder = "Loading...") => {
      if (!target) return;
      if (on) {
        target.setAttribute("aria-busy", "true");
        target.innerHTML = `<p class="panel-placeholder">${placeholder}</p>`;
      } else {
        target.removeAttribute("aria-busy");
      }
    };

    const sanitizeNode = (node) => {
      const clone = node.cloneNode(true);
      clone
        .querySelectorAll("script, style, link[rel='modulepreload'], link[rel='preload']")
        .forEach((n) => n.remove());
      return clone;
    };

    const pickFragmentHTML = (html, selectorPriority) => {
      const doc = parser.parseFromString(html, "text/html");
      for (const sel of selectorPriority) {
        const el = doc.querySelector(sel);
        if (el) return sanitizeNode(el).innerHTML;
      }
      return doc.body ? doc.body.innerHTML : html;
    };

    function syncPdMode() {
      const isPd =
        !!viewRoot.querySelector(".product-view") ||
        !!viewRoot.querySelector(".quok-pd2") ||
        !!viewRoot.querySelector("[data-pd-gallery]");

      viewRoot.classList.toggle("is-pd", isPd);
      document.getElementById("quok-view")?.classList.toggle("is-pd", isPd);
      document.body.classList.toggle("is-pd", isPd);
    }

    function syncHomeMode() {
      const isHome =
        !!viewRoot.querySelector(".home-view") ||
        !!viewRoot.querySelector('.spa-view[data-spa-view="home"]');
      viewRoot.classList.toggle("is-home-view", isHome);
      document.getElementById("quok-view")?.classList.toggle("is-home-view", isHome);
      document.body.classList.toggle("is-home-view", isHome);
    }

    function getPdCategoryLabel() {
      const tab = state.tab || "";
      if (tab === "lookbook") return "LOOKBOOK";
      if (tab === "project") return "PROJECT";
      if (tab === "content") return "CONTENT";
      return tab ? tab.toUpperCase() : "LOOKBOOK";
    }

    function syncPdCategoryLabel() {
      const label = getPdCategoryLabel();
      viewRoot.querySelectorAll("[data-pd-category]").forEach((el) => {
        el.textContent = label;
      });
    }

    const rAFEnter = () => {
      const animTarget =
        viewRoot.querySelector(".product-view") ||
        viewRoot.querySelector(".home-view") ||
        viewRoot.firstElementChild;

      if (!animTarget) return;
      requestAnimationFrame(() => animTarget.classList.add("is-enter"));
    };

    const parseMs = (value, fallback) => {
      if (!value) return fallback;
      const raw = String(value).trim();
      if (!raw) return fallback;
      if (raw.endsWith("ms")) {
        const n = parseFloat(raw.replace("ms", ""));
        return Number.isFinite(n) ? n : fallback;
      }
      if (raw.endsWith("s")) {
        const n = parseFloat(raw.replace("s", ""));
        return Number.isFinite(n) ? n * 1000 : fallback;
      }
      const n = parseFloat(raw);
      return Number.isFinite(n) ? n : fallback;
    };

    const getDetailHoldMs = () => {
      const styles = getComputedStyle(document.documentElement);
      const dur = parseMs(styles.getPropertyValue("--quok-dur-overlay"), 1100);
      return dur + 2;
    };

    const scheduleDetailGallerySync = (holdAutoMs = 0) => {
      let tries = 0;
      const attempt = () => {
        let synced = false;
        viewRoot.querySelectorAll("[data-pd-gallery]").forEach((gallery) => {
          if (typeof gallery.__pdSync === "function") {
            gallery.__pdSync({ delay: 0, resetIndex: true, holdAutoMs });
            synced = true;
          }
        });
        if (!synced && tries < 10) {
          tries += 1;
          requestAnimationFrame(attempt);
        }
      };
      requestAnimationFrame(() => requestAnimationFrame(attempt));
    };

    const triggerInlineDetailEnter = () => {
      if (mobileMq.matches) return;
      mainWrap.classList.remove("is-detail-inline-enter");
      void mainWrap.offsetWidth;
      mainWrap.classList.add("is-detail-inline-enter");
      if (mainWrap.__detailInlineTimer) clearTimeout(mainWrap.__detailInlineTimer);
      mainWrap.__detailInlineTimer = setTimeout(() => {
        mainWrap.classList.remove("is-detail-inline-enter");
      }, 1300);
    };

    // hash 상태
    const pushHash = () => {
      const qs = new URLSearchParams();
      if (state.main === "project") {
        if (state.tab) qs.set("tab", state.tab);
        if (state.viewUrl) qs.set("view", state.viewUrl);
      }
      const h = `#/${encodeURIComponent(state.main)}${qs.toString() ? "?" + qs.toString() : ""}`;
      if (location.hash !== h) history.pushState({ ...state }, "", h);
    };

    const readHash = () => {
      const hash = location.hash || "";
      const m = hash.match(/^#\/([^?]+)(\?(.*))?$/);
      if (!m) return null;
      const main = decodeURIComponent(m[1] || "home");
      const qs = new URLSearchParams(m[3] || "");
      return {
        main,
        tab: qs.get("tab") || null,
        viewUrl: qs.get("view") || null,
      };
    };

    // ✅ 탭 모드 클래스 토글 (CSS 스코프 안정화)
    function setListModeClass(tabKey) {
      panelListBody.classList.remove("is-lookbook", "is-project", "is-content");
      if (!tabKey) return;
      panelListBody.classList.add(`is-${tabKey}`);
    }

    const resetListPaging = () => {
      if (listObserver) {
        listObserver.disconnect();
        listObserver = null;
      }
      if (listSentinel && listSentinel.parentNode) {
        listSentinel.parentNode.removeChild(listSentinel);
      }
      listSentinel = null;
      if (listPageAbort) {
        listPageAbort.abort();
        listPageAbort = null;
      }
      listPagingState.url = "";
      listPagingState.page = 1;
      listPagingState.loading = false;
      listPagingState.ended = false;
      listPagingState.listEl = null;
    };

    const buildPagedUrl = (url, page) => {
      if (!url) return url;
      try {
        const u = new URL(url, location.origin);
        u.searchParams.set("page", String(page));
        return u.pathname + u.search + u.hash;
      } catch {
        return url;
      }
    };

    const revealItems = (items) => {
      if (!items || !items.length) return;
      items.forEach((item, idx) => {
        item.classList.add("spa-reveal-item");
        item.classList.remove("is-hidden");
        item.style.display = "";
        item.style.setProperty("--reveal-delay", `${idx * 40}ms`);
        item.querySelectorAll("img").forEach((img) => {
          img.loading = "lazy";
          img.decoding = "async";
        });
        requestAnimationFrame(() => item.classList.add("is-revealed"));
      });
    };

    const setupListReveal = (container, { initial = true } = {}) => {
      if (!container) return;
      if (listObserver) {
        listObserver.disconnect();
        listObserver = null;
      }
      if (listSentinel && listSentinel.parentNode) {
        listSentinel.parentNode.removeChild(listSentinel);
      }
      listSentinel = null;

      const list = container.querySelector(".prdList");
      const items = list ? Array.from(list.children).filter((el) => el.tagName === "LI") : [];

      container.classList.remove("is-list-ready");

      if (!items.length) {
        requestAnimationFrame(() => container.classList.add("is-list-ready"));
        return;
      }

      items.forEach((item) => {
        item.classList.remove("is-revealed", "is-hidden");
        item.style.removeProperty("display");
        item.style.removeProperty("--reveal-delay");
      });
      revealItems(items);

      if (initial) {
        listPagingState.url = container.dataset.listUrl || "";
        listPagingState.page = 1;
        listPagingState.loading = false;
        listPagingState.ended = items.length < LIST_PAGE_SIZE;
        listPagingState.listEl = list;
      }

      if (listPagingState.ended) {
        requestAnimationFrame(() => container.classList.add("is-list-ready"));
        return;
      }

      listSentinel = document.createElement("div");
      listSentinel.className = "spa-reveal-sentinel";
      list.appendChild(listSentinel);

      const root = (() => {
        const cs = getComputedStyle(container);
        const overflowY = cs.overflowY;
        if (!overflowY || overflowY === "visible") return null;
        return container;
      })();

      listObserver = new IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) return;
          if (listPagingState.loading || listPagingState.ended) return;
          loadNextListPage().catch(console.error);
        },
        { root, rootMargin: "160px 0px", threshold: 0.01 }
      );
      listObserver.observe(listSentinel);

      requestAnimationFrame(() => container.classList.add("is-list-ready"));
    };

    const mobileMq = window.matchMedia("(max-width: 1024px)");
    let detailOverlayActive = false;
    let detailOverlayRaf = 0;

    const enterDetailOverlay = () => {
      if (mobileMq.matches) return;
      detailOverlayActive = true;
      setProjectEntryFlag(false);
      if (detailOverlayRaf) cancelAnimationFrame(detailOverlayRaf);
      mainWrap.classList.add("mode-project");
      mainWrap.classList.add("is-list-closed");
      mainWrap.classList.add("is-detail-overlay");
      mainWrap.classList.remove("is-detail-enter");
      detailOverlayRaf = requestAnimationFrame(() => {
        mainWrap.classList.add("is-detail-enter");
      });
    };

    const exitDetailOverlay = () => {
      detailOverlayActive = false;
      if (detailOverlayRaf) cancelAnimationFrame(detailOverlayRaf);
      mainWrap.classList.remove("is-detail-enter");
      mainWrap.classList.remove("is-detail-overlay");
    };
    const syncListOpenState = () => {
      const isOpen =
        mainWrap.classList.contains("mode-project") &&
        !mainWrap.classList.contains("is-list-closed");
      if (mobileMq.matches && isOpen) {
        document.body.classList.add("quok-list-open");
      } else {
        document.body.classList.remove("quok-list-open");
      }
    };

    if (mobileMq.addEventListener) {
      mobileMq.addEventListener("change", syncListOpenState);
    } else if (mobileMq.addListener) {
      mobileMq.addListener(syncListOpenState);
    }

    const openProjectSheet = async () => {
      overlayPrevMain = state.main;
      setOverlayPersist(true);
      if (mobileMq.matches) {
        document.body.classList.add("quok-sheet-open");
      } else {
        mainWrap.classList.add("mode-project");
        mainWrap.classList.add("is-list-closed");
      }

      const activeTab =
        document.querySelector(".panel-tab.is-active") ||
        document.querySelector('.panel-tab[data-tab="lookbook"]') ||
        panelTabs[0];

      if (activeTab) {
        await applyTab(activeTab, { autoOpenFirst: false, pushHash: false });
        saveOverlayTab(activeTab.dataset.tab || "");
      }

      requestAnimationFrame(() => {
        if (mobileMq.matches) {
          document.body.classList.add("quok-sheet-open");
        } else {
          mainWrap.classList.remove("is-list-closed");
        }
        syncListOpenState();
      });

      overlayActiveBtn =
        Array.from(gnbButtons).find((b) => b.dataset.main === "project") || null;
      if (overlayActiveBtn) setActive(gnbButtons, overlayActiveBtn);

      syncListOpenState();
    };

    const closeProjectSheet = () => {
      if (mobileMq.matches) {
        document.body.classList.remove("quok-sheet-open");
      } else {
        mainWrap.classList.add("is-list-closed");
      }
      setOverlayPersist(false);
      syncListOpenState();

      const prevBtn =
        Array.from(gnbButtons).find((b) => b.dataset.main === overlayPrevMain) ||
        null;
      if (prevBtn) setActive(gnbButtons, prevBtn);
    };

    // -----------------------------
    // ✅ URL 정규화 + “SEO 상품 URL → product_no 추출 → 커스텀 상세로 매핑”
    // -----------------------------
    function normalizeHref(href) {
      if (!href) return "";
      href = String(href).trim();
      if (!href || href.startsWith("#") || href.startsWith("javascript:")) return "";

      if (href.startsWith("//")) href = location.protocol + href;

      if (/^https?:\/\//i.test(href)) {
        try {
          const u = new URL(href, location.origin);
          if (u.origin !== location.origin) return "";
          href = u.pathname + u.search + u.hash;
        } catch {
          return "";
        }
      }
      return withSkinBase(href);
    }

    function extractProductNo(url) {
      url = normalizeHref(url);
      if (!url) return "";

      try {
        const u = new URL(url, location.origin);
        const q = u.searchParams.get("product_no");
        if (q) return q;
        url = u.pathname;
      } catch {}

      const m1 = url.match(/\/product\/[^/]+\/(\d+)(?:\/|$)/);
      if (m1 && m1[1]) return m1[1];

      const m2 = url.match(/product_no=(\d+)/);
      if (m2 && m2[1]) return m2[1];

      return "";
    }

    function toCustomDetailUrl(rawUrl) {
      const href = normalizeHref(rawUrl);
      if (!href) return "";

      if (href.includes("/buroPix/views/product-1.html")) return href;

      const pn = extractProductNo(href);
      if (!pn) return "";

      return withSkinBase(`/buroPix/views/product-1.html?product_no=${encodeURIComponent(pn)}`);
    }

    // ---------- Core ----------
    function renderSimpleView(main) {
      viewRoot.innerHTML = `
        <section class="home-view">
          <h1 class="home-title">${escapeHtml(capitalize(main))}</h1>
          <p class="home-desc">${escapeHtml(capitalize(main))} 페이지용 컨텐츠를 여기에 채우면 됩니다.</p>
        </section>
      `;
      syncPdMode();
      syncHomeMode();
      rAFEnter();
      scheduleLayoutSync();
    }

    async function loadList(url) {
      url = normalizeHref(url);
      if (!url) return;

      resetListPaging();
      panelListBody.dataset.listUrl = url;
      panelListBody.classList.add("is-list-loading");
      panelListBody.classList.remove("is-list-ready");

      if (listCache.has(url)) {
        panelListBody.innerHTML = listCache.get(url);
        panelListBody.classList.remove("is-list-loading");
        setupListReveal(panelListBody, { initial: true });
        return;
      }

      if (listAbort) listAbort.abort();
      listAbort = new AbortController();

      setLoading(panelListBody, true, "Loading...");

      try {
        const res = await fetch(url, {
          method: "GET",
          credentials: "include",
          signal: listAbort.signal,
          headers: { "X-Requested-With": "XMLHttpRequest" },
        });

        if (!res.ok) throw new Error(`List fetch failed: ${res.status} ${url}`);

        const html = await res.text();
        const bodyHTML = pickFragmentHTML(html, [
          "[data-spa-fragment='list']",
          "#panel-list-body",
          ".panel-list__body",
          "body",
        ]);

        listCache.set(url, bodyHTML);
        panelListBody.innerHTML = bodyHTML;
        panelListBody.classList.remove("is-list-loading");
        setupListReveal(panelListBody, { initial: true });
      } catch (e) {
        if (e?.name === "AbortError") return;
        console.error(e);
        panelListBody.innerHTML = `<p class="panel-placeholder">리스트를 불러오지 못했습니다.</p>`;
        panelListBody.classList.remove("is-list-loading");
        panelListBody.classList.add("is-list-ready");
      } finally {
        panelListBody.removeAttribute("aria-busy");
      }
    }

    async function loadNextListPage() {
      if (!listPagingState.url || !listPagingState.listEl) return;
      if (listPagingState.loading || listPagingState.ended) return;

      listPagingState.loading = true;
      const nextPage = listPagingState.page + 1;
      const nextUrl = buildPagedUrl(listPagingState.url, nextPage);

      if (listPageAbort) listPageAbort.abort();
      listPageAbort = new AbortController();

      try {
        const res = await fetch(nextUrl, {
          method: "GET",
          credentials: "include",
          signal: listPageAbort.signal,
          headers: { "X-Requested-With": "XMLHttpRequest" },
        });
        if (!res.ok) throw new Error(`List page fetch failed: ${res.status} ${nextUrl}`);

        const html = await res.text();
        const doc = parser.parseFromString(html, "text/html");
        const list = doc.querySelector(".prdList");
        if (!list) {
          listPagingState.ended = true;
          return;
        }

        const items = Array.from(list.children).filter((el) => el.tagName === "LI");
        if (!items.length) {
          listPagingState.ended = true;
          return;
        }

        const frag = document.createDocumentFragment();
        const appended = [];
        items.forEach((item) => {
          const cloned = document.importNode(item, true);
          frag.appendChild(cloned);
          appended.push(cloned);
        });
        listPagingState.listEl.appendChild(frag);
        revealItems(appended);

        listPagingState.page = nextPage;
        if (items.length < LIST_PAGE_SIZE) {
          listPagingState.ended = true;
        }
      } catch (e) {
        if (e?.name === "AbortError") return;
        console.error(e);
        listPagingState.ended = true;
      } finally {
        listPagingState.loading = false;
      }
    }

    async function fetchAndRenderView(url, { rememberViewUrl = true } = {}) {
      const normalized = normalizeHref(url);
      if (!normalized) return false;

      state.viewUrl = rememberViewUrl ? normalized : "";
      if (rememberViewUrl) {
        saveProjectViewUrl(state.viewUrl);
      }

      if (viewCache.has(normalized)) {
        viewRoot.innerHTML = viewCache.get(normalized);
        syncPdMode();
        syncHomeMode();
        syncPdCategoryLabel();
        projectListSticky = state.main === "project" && viewRoot.classList.contains("is-pd");
        if (projectListSticky) setProjectEntryFlag(false);
        rAFEnter();
        scheduleLayoutSync();
        pushHash();
        return true;
      }

      if (viewAbort) viewAbort.abort();
      viewAbort = new AbortController();

      viewRoot.innerHTML = `
        <section class="home-view">
          <p>Loading...</p>
        </section>
      `;
      rAFEnter();
      scheduleLayoutSync();

      try {
        const res = await fetch(normalized, {
          method: "GET",
          credentials: "include",
          signal: viewAbort.signal,
          headers: { "X-Requested-With": "XMLHttpRequest" },
        });

        if (!res.ok) throw new Error(`View fetch failed: ${res.status} ${normalized}`);

        const html = await res.text();
        const doc = parser.parseFromString(html, "text/html");

        const picked =
          doc.querySelector("[data-spa-fragment='view']") ||
          doc.querySelector(".product-view") ||
          doc.querySelector("#view-root") ||
          doc.querySelector("main") ||
          doc.body;

        if (!picked) throw new Error("No usable fragment found in detail page");

        const safeNode = sanitizeNode(picked);

        let markup = "";
        if (safeNode.hasAttribute?.("data-spa-fragment") || safeNode.classList?.contains("product-view")) {
          markup = safeNode.outerHTML;
        } else {
          markup = safeNode.innerHTML;
        }

        viewCache.set(normalized, markup);
        viewRoot.innerHTML = markup;
        syncPdMode();
        syncHomeMode();
        syncPdCategoryLabel();
        projectListSticky = state.main === "project" && viewRoot.classList.contains("is-pd");
        if (projectListSticky) setProjectEntryFlag(false);
        rAFEnter();
        scheduleLayoutSync();
        pushHash();
        return true;
      } catch (e) {
        if (e?.name === "AbortError") return false;
        console.error(e);
        viewRoot.innerHTML = `<p>상세 화면을 불러오지 못했습니다.</p>`;
        syncPdMode();
        syncHomeMode();
        syncPdCategoryLabel();
        scheduleLayoutSync();
        return false;
      }
    }

    async function loadDetail(rawUrl, { useOverlay = false, inlineAnim = false } = {}) {
      const url = toCustomDetailUrl(rawUrl);
      if (!url) return;
      const holdMs = !mobileMq.matches && (useOverlay || inlineAnim) ? getDetailHoldMs() : 0;
      if (holdMs > 0) {
        viewRoot.dataset.pdHold = String(holdMs);
      } else {
        delete viewRoot.dataset.pdHold;
      }
      if (!mobileMq.matches && useOverlay) {
        enterDetailOverlay();
      }
      await fetchAndRenderView(url, { rememberViewUrl: true });
      scheduleDetailGallerySync(holdMs);
      if (inlineAnim) {
        triggerInlineDetailEnter();
      }
      if (holdMs > 0) {
        const holdToken = String(holdMs);
        setTimeout(() => {
          if (viewRoot.dataset.pdHold === holdToken) {
            delete viewRoot.dataset.pdHold;
          }
        }, holdMs + 200);
      }
    }

    async function loadMainView(main) {
      const url = MAIN_VIEWS[main];
      if (!url) {
        renderSimpleView(main);
        pushHash();
        return;
      }

      const ok = await fetchAndRenderView(url, { rememberViewUrl: false });
      if (!ok) {
        renderSimpleView(main);
        pushHash();
        return;
      }

      runViewHook(main);
    }

    function applyMain(main, opts = {}) {
      const { forceAutoOpen = false } = opts;
      exitDetailOverlay();
      const prevMain = state.main;
      state.main = main;
      document.body.dataset.quokMain = main;
      document.body.classList.toggle("is-contact-view", main === "contact");
      if (main === "project") setOverlayPersist(false);

      const activeBtn = Array.from(gnbButtons).find((b) => b.dataset.main === main) || null;
      if (activeBtn) setActive(gnbButtons, activeBtn);

      if (main === "project") {
        if (prevMain !== "project") setProjectEntryFlag(true);
        projectListSticky = viewRoot.classList.contains("is-pd");
        mainWrap.classList.add("mode-project");
        mainWrap.classList.remove("is-list-closed"); // 프로젝트 진입 시 기본은 “열림”

        const activeTab =
          document.querySelector(".panel-tab.is-active") ||
          document.querySelector('.panel-tab[data-tab="project"]') ||
          panelTabs[0];

        // ✅ 핵심 변경: 프로젝트 들어와도 오른쪽은 그대로 유지
        // 리스트만 로드하고, 첫 상품 자동 오픈 금지
        const shouldAutoOpen = forceAutoOpen && !state.viewUrl;
        if (activeTab) applyTab(activeTab, { autoOpenFirst: shouldAutoOpen }).catch(console.error);
        else pushHash();
        syncHomeMode();
        syncListOpenState();
      } else {
        setProjectEntryFlag(false);
        projectListSticky = false;
        if (prevMain === "project") {
          mainWrap.classList.add("is-main-switch");
          mainWrap.classList.add("is-list-closed");
          setTimeout(() => {
            mainWrap.classList.remove("is-main-switch");
          }, 200);
        }
        mainWrap.classList.remove("mode-project");
        state.viewUrl = "";
        loadMainView(main).catch((err) => {
          console.error(err);
          renderSimpleView(main);
          pushHash();
        });
        syncHomeMode();
        syncListOpenState();
      }
    }

    async function applyTab(tabBtn, opts = {}) {
      const { autoOpenFirst = false, pushHash: shouldPushHash = true } = opts;

      const tab = tabBtn.dataset.tab;
      const url = tabBtn.dataset.listUrl;

      setListModeClass(tab);

      state.tab = tab || state.tab;
      state.listUrl = url || state.listUrl;
      if (state.main !== "project") saveOverlayTab(state.tab);

      panelTabs.forEach((t) => {
        const on = t === tabBtn;
        t.classList.toggle("is-active", on);
        t.setAttribute("aria-selected", on ? "true" : "false");
      });

      await loadList(url);
      if (viewRoot.classList.contains("is-pd")) syncPdCategoryLabel();
      if (shouldPushHash) pushHash();

      if (!autoOpenFirst) return;

      const firstLink = panelListBody.querySelector("a[href]");
      if (firstLink) {
        const href = firstLink.getAttribute("href");
        const detailUrl = toCustomDetailUrl(href);
        if (detailUrl) loadDetail(detailUrl, { useOverlay: state.main !== "project" }).catch(console.error);
      }
      // if (firstCustom) loadDetail(firstCustom);
    }

    // ---------- Event Binding ----------
    document.addEventListener(
      "click",
      (e) => {
        // 1) GNB
        const gnb = e.target.closest(".gnb-main__link[data-main]");
        if (gnb) {
          e.preventDefault();
          e.stopPropagation();
          if (e.stopImmediatePropagation) e.stopImmediatePropagation();

          const key = gnb.dataset.main || "home";

          if (mobileMq.matches && document.body.classList.contains("quok-sheet-open")) {
            closeProjectSheet();
            if (key === "project" || key === state.main) {
              return;
            }
            if (key !== state.main) {
              applyMain(key);
            }
            return;
          }

          if (key === "project" && state.main !== "project") {
            const isOpen =
              mainWrap.classList.contains("mode-project") &&
              !mainWrap.classList.contains("is-list-closed");

            if (isOpen) {
              closeProjectSheet();
            } else {
              openProjectSheet().catch(console.error);
            }
            return;
          }

          // ✅ 프로젝트에서 프로젝트를 다시 누르면: 리스트만 접기/펼치기 (mode-project는 건드리지 않음)
          if (key === "project" && state.main === "project") {
            if (!mobileMq.matches && detailOverlayActive) {
              exitDetailOverlay();
              mainWrap.classList.remove("is-list-closed");
              projectListSticky = viewRoot.classList.contains("is-pd");
              if (!panelListBody.firstElementChild && state.listUrl) {
                loadList(state.listUrl).catch(console.error);
              }
              pushHash();
              syncListOpenState();
              return;
            }

            const willClose = !mainWrap.classList.contains("is-list-closed");

            if (willClose) {
              mainWrap.classList.add("is-list-closed");
            } else {
              mainWrap.classList.remove("is-list-closed");
              projectListSticky = viewRoot.classList.contains("is-pd");
              if (!panelListBody.firstElementChild && state.listUrl) {
                loadList(state.listUrl).catch(console.error);
              }
            }

            pushHash();
            syncListOpenState();
            return;
          }

          applyMain(key);
          return;
        }

        // 2) Panel close (mobile sheet)
        const closeBtn = e.target.closest(".panel-list__close");
        if (closeBtn) {
          e.preventDefault();
          e.stopPropagation();
          if (e.stopImmediatePropagation) e.stopImmediatePropagation();

          closeProjectSheet();
          return;
        }

        // 3) Tabs
        const tabBtn = e.target.closest(".panel-tab[data-list-url]");
        if (tabBtn) {
          e.preventDefault();
          e.stopPropagation();
          if (e.stopImmediatePropagation) e.stopImmediatePropagation();

          // 탭 누르면 리스트는 열림 상태가 자연스러움
          if (state.main === "project") mainWrap.classList.remove("is-list-closed");

          // ✅ 핵심 변경: 탭 바꿔도 오른쪽은 유지, 자동 오픈 X
          applyTab(tabBtn, { autoOpenFirst: false }).catch(console.error);
          return;
        }

        // 4) List -> Detail (panelListBody 내부 링크만)
        const insideList = e.target.closest("#panel-list-body");
        if (!insideList) return;

        const isProjectMain = state.main === "project";
        const isProjectSheetOpen = mainWrap.classList.contains("mode-project");
        const isDetailView = viewRoot.classList.contains("is-pd");
        projectListSticky = isDetailView;
        const shouldCloseList =
          !mobileMq.matches && (projectEntryFromOther || !isProjectMain) && !isProjectSheetOpen;
        const useDetailOverlay =
          !mobileMq.matches &&
          !isDetailView &&
          (projectEntryFromOther || !isProjectMain) &&
          !isProjectSheetOpen;
        const isLookbookList = panelListBody.classList.contains("is-lookbook");

        const link = e.target.closest("a[href]");
        if (!link) {
          if (isLookbookList) {
            return;
          }
          if (shouldCloseList) {
            mainWrap.classList.add("is-list-closed");
            mainWrap.classList.remove("mode-project");
            syncListOpenState();
          }
          return;
        }

        if (link.target === "_blank" || link.hasAttribute("download")) return;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

        const href = link.getAttribute("href");
        const custom = toCustomDetailUrl(href);
        if (!custom) {
          if (shouldCloseList) {
            mainWrap.classList.add("is-list-closed");
            if (!isProjectMain) {
              mainWrap.classList.remove("mode-project");
            }
            syncListOpenState();
          }
          return;
        }

        e.preventDefault();
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();

        // ✅ 리스트에서 클릭할 때만 오른쪽 뷰 변경
        if (mobileMq.matches && document.body.classList.contains("quok-sheet-open")) {
          closeProjectSheet();
        }
        const inlineAnim = isProjectMain && !useDetailOverlay;
        loadDetail(custom, { useOverlay: useDetailOverlay, inlineAnim });
        if (shouldCloseList) {
          if (!useDetailOverlay) {
            mainWrap.classList.add("is-list-closed");
            if (!isProjectMain) {
              mainWrap.classList.remove("mode-project");
            }
          }
          syncListOpenState();
        }
      },
      true
    );

    // 4) 뒤로가기 복원
    window.addEventListener("popstate", () => {
      const st = readHash();
      if (!st) return;

      state.viewUrl = st.viewUrl || "";

      applyMain(st.main || "home", { forceAutoOpen: (st.main || "home") === "project" && !st.viewUrl });

      if ((st.main || "home") === "project") {
        if (st.tab) {
          const tabBtn = Array.from(panelTabs).find((t) => t.dataset.tab === st.tab);
          if (tabBtn) applyTab(tabBtn, { autoOpenFirst: false }).catch(console.error);
        }

        // ✅ URL에 view가 있을 때만 상세 로드
        if (st.viewUrl) loadDetail(st.viewUrl, { useOverlay: false });
      }
    });

    // ---------- Init ----------
    const initialHome = viewRoot.querySelector(".home-view");
    if (initialHome) requestAnimationFrame(() => initialHome.classList.add("is-enter"));

    const initState = readHash();
    if (initState?.main) {
      state.viewUrl = initState.viewUrl || "";
      const forceAuto = initState.main === "project" && !initState.viewUrl;
      applyMain(initState.main, { forceAutoOpen: forceAuto });

      if (initState.main === "project") {
        if (initState.tab) {
          const tabBtn = Array.from(panelTabs).find((t) => t.dataset.tab === initState.tab);
          if (tabBtn) applyTab(tabBtn, { autoOpenFirst: false }).catch(console.error);
        }
        if (initState.viewUrl) {
          loadDetail(initState.viewUrl, { useOverlay: false });
        } else {
          const savedView = getSavedProjectViewUrl();
          if (savedView) loadDetail(savedView, { useOverlay: false });
        }
      }
    } else {
      applyMain(state.main || "home");
    }

    // restore project sheet if it was open before refresh (non-project main)
    try {
      const overlayWanted = sessionStorage.getItem(OVERLAY_KEY) === "1";
      if (overlayWanted && state.main !== "project") {
        const overlayTab = sessionStorage.getItem(OVERLAY_TAB_KEY);
        openProjectSheet()
          .then(() => {
            if (!overlayTab) return;
            const tabBtn = Array.from(panelTabs).find((t) => t.dataset.tab === overlayTab);
            if (tabBtn) applyTab(tabBtn, { autoOpenFirst: false, pushHash: false }).catch(console.error);
          })
          .catch(console.error);
      }
    } catch {}

    syncListOpenState();

    // ---------- helpers ----------
    function capitalize(text) {
      if (!text) return "";
      return text.charAt(0).toUpperCase() + text.slice(1);
    }

    function escapeHtml(str) {
      return String(str)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    }
  });
})();
