// /buroPix/js/pd-gallery.js
(() => {
  "use strict";

  function ensureSplideAssets() {
    if (window.Splide) return Promise.resolve();
    return Promise.reject(new Error("Splide assets not ready"));
  }

  function waitForSplide(maxMs = 4000) {
    if (window.Splide) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const tick = () => {
        if (window.Splide) return resolve();
        if (Date.now() - start > maxMs) return reject(new Error("Splide timeout"));
        requestAnimationFrame(tick);
      };
      tick();
    });
  }

  function ensureStructure(gallery) {
    if (!gallery.classList.contains("splide")) gallery.classList.add("splide");

    const track = gallery.querySelector("[data-pd-track]");
    if (!track) return null;

    const viewport = track.closest(".pd2-viewport");
    if (viewport) viewport.classList.add("splide__track");
    track.classList.add("splide__list");

    track.querySelectorAll(".pd2-slide").forEach((slide) => {
      slide.classList.add("splide__slide");
    });

    return track;
  }

  function hydrateLazyImages(scope) {
    if (!scope) return;
    const imgs = scope.querySelectorAll("img");
    const pickAttr = (img) => {
      const attrs = [
        "data-src",
        "data-original",
        "data-lazy",
        "data-ec-src",
        "ec-data-src",
        "data-srcset",
        "data-ec-srcset",
      ];
      for (const key of attrs) {
        const val = img.getAttribute(key);
        if (val && val.trim()) return { key, val: val.trim() };
      }
      return null;
    };

    imgs.forEach((img) => {
      const src = img.getAttribute("src") || "";
      const isPlaceholder =
        !src ||
        src.includes("blank") ||
        src.includes("img.gif") ||
        src.includes("loading") ||
        src === "about:blank";

      const picked = pickAttr(img);
      if (picked) {
        if (picked.key.includes("srcset")) {
          img.setAttribute("srcset", picked.val);
        } else if (isPlaceholder) {
          img.setAttribute("src", picked.val);
        }
      }
    });
  }

  function pruneSmallSlides(gallery) {
    if (!gallery) return;
    const pickAttr = (img) => {
      const attrs = [
        "data-src",
        "data-original",
        "data-lazy",
        "data-ec-src",
        "ec-data-src",
      ];
      for (const key of attrs) {
        const val = img.getAttribute(key);
        if (val && val.trim()) return val.trim();
      }
      return "";
    };

    gallery.querySelectorAll(".pd2-slide").forEach((slide) => {
      const img = slide.querySelector("img");
      if (!img) return;
      const src = img.getAttribute("src") || pickAttr(img);
      if (!src) return;
      const isSmall = src.includes("/product/small/") && !src.includes("/product/extra/");
      if (isSmall) slide.remove();
    });
  }

  function waitForImages(scope, timeoutMs = 1500) {
    if (!scope) return Promise.resolve();
    const imgs = Array.from(scope.querySelectorAll("img"));
    const pending = imgs.filter((img) => !img.complete);
    if (!pending.length) return Promise.resolve();
    return new Promise((resolve) => {
      let done = 0;
      const finish = () => {
        done += 1;
        if (done >= pending.length) resolve();
      };
      pending.forEach((img) => {
        img.addEventListener("load", finish, { once: true });
        img.addEventListener("error", finish, { once: true });
      });
      if (timeoutMs > 0) setTimeout(resolve, timeoutMs);
    });
  }

  function normalizeDescription(scope) {
    const root = scope?.closest?.(".product-view") || scope;
    if (!root) return;
    const descs = Array.from(root.querySelectorAll(".pd2-desc"));
    let shown = false;
    descs.forEach((el) => {
      const text = (el.textContent || "").replace(/\s+/g, "");
      if (!text || shown) {
        el.style.display = "none";
      } else {
        shown = true;
        el.style.display = "";
      }
    });
  }

  function parseMs(value, fallback) {
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
  }

  function getDetailHoldMs() {
    const root = document.documentElement;
    if (!root) return 1102;
    const styles = getComputedStyle(root);
    const dur = parseMs(styles.getPropertyValue("--quok-dur-overlay"), 1100);
    return dur + 2;
  }

  function pauseAutoScrollForMs(splide, ms) {
    const auto = splide?.Components?.AutoScroll;
    if (!auto) return;
    try {
      auto.pause();
    } catch {}
    if (!splide) return;
    if (splide.__pdAutoResumeTimer) clearTimeout(splide.__pdAutoResumeTimer);
    splide.__pdAutoResumeAt = Date.now() + ms;
    splide.__pdAutoResumeTimer = setTimeout(() => {
      try {
        const prevSpeed = splide.options?.speed;
        if (typeof prevSpeed === "number") splide.options = { speed: 0 };
        splide.go(0);
        const move = splide.Components?.Move;
        if (move) {
          // Force exact start alignment (avoid clone offset during loop/autoWidth).
          const target = move.toPosition(0, true);
          move.translate(target, true);
        }
        if (typeof prevSpeed === "number") splide.options = { speed: prevSpeed };
      } catch {}
      try {
        auto.play();
      } catch {}
      splide.__pdAutoResumeAt = 0;
    }, ms);
  }

  function pauseAutoScrollDuringEnter(splide) {
    const auto = splide?.Components?.AutoScroll;
    if (!auto) return;
    const main = document.querySelector(".quok-main");
    if (main?.classList?.contains("is-detail-enter")) {
      pauseAutoScrollForMs(splide, getDetailHoldMs());
    }
  }

  function scheduleSplideRefresh(
    gallery,
    { delay = 120, resetIndex = false, holdAutoMs = 0 } = {}
  ) {
    if (!gallery) return;
    if (gallery.__pdRefreshTimer) clearTimeout(gallery.__pdRefreshTimer);
    gallery.__pdRefreshTimer = setTimeout(() => {
      const splide = gallery.__pdSplide;
      if (!splide) return;
      const auto = splide.Components?.AutoScroll;
      const prevSpeed = splide.options?.speed;
      if (holdAutoMs > 0) {
        pinToStart(gallery, holdAutoMs);
        pauseAutoScrollForMs(splide, holdAutoMs);
      } else {
        try {
          auto?.pause?.();
        } catch {}
      }
      try {
        if (typeof prevSpeed === "number") splide.options = { speed: 0 };
        splide.refresh();
        const isPinned = gallery.dataset.pdPinned === "1";
        const shouldReset = resetIndex || isPinned;
        if (shouldReset) splide.go(0);
        const move = splide.Components?.Move;
        if (move) {
          const target = move.toPosition(shouldReset ? 0 : splide.index, true);
          move.translate(target, true);
        }
      } catch {}
      try {
        if (typeof prevSpeed === "number") splide.options = { speed: prevSpeed };
      } catch {}
      if (auto && holdAutoMs <= 0) {
        const resumeAt = splide.__pdAutoResumeAt || 0;
        if (resumeAt && resumeAt > Date.now()) return;
        if (splide.__pdAutoResumeTimer) clearTimeout(splide.__pdAutoResumeTimer);
        splide.__pdAutoResumeTimer = setTimeout(() => {
          try {
            auto.play();
          } catch {}
        }, 60);
      }
      releaseStaging(gallery);
    }, delay);
  }

  function releaseStaging(gallery) {
    if (!gallery || gallery.dataset.pdStaging !== "1") return;
    gallery.dataset.pdStaging = "0";
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        gallery.classList.remove("pd2-is-staging");
      })
    );
  }

  function pinToStart(gallery, ms) {
    if (!gallery) return;
    const holdMs = Math.max(0, Number(ms) || 0);
    const until = Date.now() + holdMs;
    const prevUntil = gallery.__pdPinUntil || 0;
    gallery.__pdPinUntil = Math.max(prevUntil, until);
    gallery.dataset.pdPinned = "1";
    gallery.classList.add("pd2-is-pinned");
    if (gallery.__pdPinTimer) clearTimeout(gallery.__pdPinTimer);
    gallery.__pdPinTimer = setTimeout(() => {
      if (Date.now() < (gallery.__pdPinUntil || 0)) return;
      gallery.dataset.pdPinned = "0";
      gallery.classList.remove("pd2-is-pinned");
    }, holdMs + 3);
  }

  function syncSlideWidth(gallery) {
    if (!gallery) return;
    const viewport =
      gallery.querySelector(".splide__track") ||
      gallery.querySelector(".pd2-viewport") ||
      gallery;
    const w = viewport?.clientWidth || gallery.clientWidth;
    if (!w) return;
    gallery.style.setProperty("--pd2-slide-w", `${w}px`);
  }

  function observeSlideWidth(gallery) {
    if (!gallery || gallery.__pdResizeObserver || !window.ResizeObserver) return;
    const viewport =
      gallery.querySelector(".splide__track") ||
      gallery.querySelector(".pd2-viewport") ||
      gallery;
    if (!viewport) return;
    const ro = new ResizeObserver(() => {
      syncSlideWidth(gallery);
      const splide = gallery.__pdSplide;
      const resumeAt = splide?.__pdAutoResumeAt || 0;
      const shouldReset = resumeAt && resumeAt > Date.now();
      scheduleSplideRefresh(gallery, { delay: 140, resetIndex: shouldReset });
    });
    ro.observe(viewport);
    gallery.__pdResizeObserver = ro;
  }

  function observeMainState(gallery, splide) {
    if (!gallery || gallery.__pdMainObserver) return;
    const main = document.querySelector(".quok-main");
    if (!main) return;
    let prevDetail = main.classList.contains("is-detail-enter");
    const onChange = () => {
      const nowDetail = main.classList.contains("is-detail-enter");
      if (!prevDetail && nowDetail) {
        pauseAutoScrollForMs(splide, getDetailHoldMs());
      }
      prevDetail = nowDetail;
    };
    const mo = new MutationObserver(onChange);
    mo.observe(main, { attributes: true, attributeFilter: ["class"] });
    gallery.__pdMainObserver = mo;
  }

  function initGallery(gallery) {
    if (!gallery || gallery.dataset.pdInit === "1") return;

    const track = ensureStructure(gallery);
    if (!track) return;
    gallery.__pdTrack = track;
    bindWheelGuard(gallery);
    gallery.dataset.pdStaging = "1";
    gallery.classList.add("pd2-is-staging");

    hydrateLazyImages(gallery);
    pruneSmallSlides(gallery);
    syncSlideWidth(gallery);
    observeSlideWidth(gallery);
    normalizeDescription(gallery);

    const mountSplide = (useAutoScroll) => {
      if (!window.Splide || gallery.dataset.pdInit === "1") return;
      if (gallery.__pdSplide) {
        try {
          gallery.__pdSplide.destroy(true);
        } catch {}
      }

    const baseSpeed = 900;
      const splide = new Splide(gallery, {
        arrows: true,
        autoWidth: true,
        pagination: false,
        autoScroll: false,
        type: "loop",
        speed: baseSpeed,
        easing: "cubic-bezier(.22, 1, .36, 1)",
        mediaQuery: "min",
        breakpoints: {
          1024: {
            arrows: false,
            drag: "free",
            wheel: true,
            releaseWheel: false,
            autoScroll: {
              speed: 0.35,
              pauseOnHover: false,
              autoStart: false,
            },
          },
        },
        reducedMotion: {
          autoScroll: false,
        },
      });

      const setArrowIcons = () => {
        const arrows = gallery.querySelectorAll(".splide__arrow");
        if (!arrows.length) return;
        const svg =
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" aria-hidden="true">' +
          '<path fill="none" stroke="currentColor" stroke-linecap="square" d="m7.5 5 5 5-5 5"></path>' +
          "</svg>";
        arrows.forEach((btn) => {
          btn.innerHTML = svg;
        });
      };

      splide.on("move", () => hydrateLazyImages(gallery));
      splide.on("visible", () => hydrateLazyImages(gallery));
      splide.on("mounted", () => {
        setArrowIcons();
        waitForImages(track, 1500)
          .catch(() => {})
          .finally(() => {
            const holdMs = (() => {
              const root = gallery.closest("#view-root");
              if (!root) return 0;
              const raw = root.dataset.pdHold;
              const n = raw ? parseInt(raw, 10) : 0;
              return Number.isFinite(n) && n > 0 ? n : 0;
            })();
            scheduleSplideRefresh(gallery, { delay: 0, resetIndex: true, holdAutoMs: holdMs });
          });
      });
      const AutoScroll = useAutoScroll ? window.splide?.Extensions?.AutoScroll : null;
      splide.mount(AutoScroll ? { AutoScroll } : {});
      pauseAutoScrollDuringEnter(splide);
      observeMainState(gallery, splide);
      setArrowIcons();
      gallery.__pdSplide = splide;
      gallery.__pdSync = (opts = {}) => scheduleSplideRefresh(gallery, opts);
      gallery.dataset.pdInit = "1";
    };

    ensureSplideAssets()
      .then(() => waitForSplide())
      .then(() => {
        const hasAutoScroll = !!window.splide?.Extensions?.AutoScroll;
        mountSplide(hasAutoScroll);
      })
      .catch((err) => {
        console.error("[pd-gallery] Splide not ready", err);
      });
  }

  function observe() {
    const viewRoot = document.getElementById("view-root");
    if (!viewRoot) return;

    const scan = () => {
      viewRoot.querySelectorAll("[data-pd-gallery]").forEach((g) => initGallery(g));
    };

    scan();

    const mo = new MutationObserver(() => scan());
    mo.observe(viewRoot, { childList: true, subtree: true });
  }

  document.addEventListener("DOMContentLoaded", observe);

  function bindWheelGuard(gallery) {
    if (!gallery || gallery.__pdWheelGuard) return;
    const target =
      gallery.querySelector(".splide__track") ||
      gallery.querySelector(".pd2-viewport") ||
      gallery;
    if (!target) return;
    const handler = (e) => {
      const root = gallery.closest("#view-root");
      const holdRaw = root?.dataset?.pdHold;
      const holdMs = holdRaw ? parseInt(holdRaw, 10) : 0;
      const isHolding =
        gallery.dataset.pdPinned === "1" ||
        gallery.dataset.pdStaging === "1" ||
        (Number.isFinite(holdMs) && holdMs > 0);
      if (!isHolding) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    };
    target.addEventListener("wheel", handler, { passive: false, capture: true });
    gallery.__pdWheelGuard = handler;
  }
})();
