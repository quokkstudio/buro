// /buroPix/js/view-guide.js
(function () {
  function initGuideView({ viewRoot } = {}) {
    const view = viewRoot?.querySelector('.spa-view[data-spa-view="guide"]');
    if (!view) return;

    const scroller = viewRoot;
    const navLinks = Array.from(view.querySelectorAll('.guide-services__nav a[href^="#guide-"]'));
    const sections = navLinks
      .map((link) => view.querySelector(link.getAttribute("href")))
      .filter(Boolean);

    const getOffset = () => {
      const h = scroller?.clientHeight || 0;
      return Math.round(h * 0.3);
    };

    const setActive = (id) => {
      navLinks.forEach((link) => {
        const on = link.getAttribute("href") === `#${id}`;
        link.classList.toggle("is-active", on);
        const item = link.closest("li");
        if (item) item.classList.toggle("is-active", on);
      });
      sections.forEach((section) => {
        section.classList.toggle("is-focus", section.id === id);
      });
    };

    const getActiveSection = () => {
      const rootRect = scroller.getBoundingClientRect();
      const offset = getOffset();
      let current = sections[0]?.id;
      const activeSections = sections.filter((s) => !s.classList.contains("is-collapsed"));
      const first = activeSections[0];
      const second = activeSections[1];
      if (scroller.scrollTop <= 2 && first) {
        setActive(first.id);
        return;
      }
      if (first && second) {
        const switchPoint = second.offsetTop || 0;
        if (scroller.scrollTop + offset < switchPoint) {
          setActive(first.id);
          return;
        }
      }
      activeSections.forEach((section) => {
        const rect = section.getBoundingClientRect();
        const top = rect.top - rootRect.top;
        if (top <= offset) current = section.id;
      });
      if (!current && activeSections.length) current = activeSections[0].id;
      if (current) setActive(current);
    };

    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        getActiveSection();
      });
    };

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const smoothScrollTo = (targetTop, duration = 750) => {
      if (!scroller || prefersReduced) {
        scroller.scrollTop = targetTop;
        return;
      }
      const startTop = scroller.scrollTop;
      const maxTop = scroller.scrollHeight - scroller.clientHeight;
      const clamped = Math.max(0, Math.min(targetTop, maxTop));
      const delta = clamped - startTop;
      if (Math.abs(delta) < 1) return;
      const start = performance.now();
      const easeInOut = (t) =>
        t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      const step = (now) => {
        const elapsed = now - start;
        const t = Math.min(1, elapsed / duration);
        scroller.scrollTop = startTop + delta * easeInOut(t);
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };

    if (scroller && !view.__guideScrollBound) {
      scroller.addEventListener("scroll", onScroll, { passive: true });
      view.__guideScrollBound = true;
    }

    const setAccordionHeight = (section) => {
      if (!section) return;
      const body = section.querySelector(".guide-services__section-body");
      if (!body) return;
      if (!view.classList.contains("is-accordion")) {
        body.style.maxHeight = "";
        return;
      }
      if (section.classList.contains("is-collapsed")) {
        body.style.maxHeight = "0px";
        return;
      }
      body.style.maxHeight = `${body.scrollHeight}px`;
    };

    const refreshAccordionHeights = () => {
      sections.forEach((section) => setAccordionHeight(section));
    };

    navLinks.forEach((link) => {
      link.addEventListener("click", (e) => {
        const target = view.querySelector(link.getAttribute("href"));
        if (!target) return;
        e.preventDefault();
        if (view.classList.contains("is-accordion")) {
          const section = target.closest(".guide-services__section");
          if (section && section.classList.contains("is-collapsed")) {
            section.classList.remove("is-collapsed");
            const btn = section.querySelector(".guide-services__toggle");
            if (btn) btn.setAttribute("aria-expanded", "true");
            requestAnimationFrame(() => setAccordionHeight(section));
          }
        }
        const top = target === sections[0] ? 0 : (target.offsetTop || 0);
        smoothScrollTo(top);
      });
    });

    const mq = window.matchMedia("(max-width: 1024px)");
    const applyAccordion = () => {
      if (!mq.matches) {
        view.classList.remove("is-accordion");
        sections.forEach((section) => {
          section.classList.remove("is-collapsed");
          const btn = section.querySelector(".guide-services__toggle");
          if (btn) btn.setAttribute("aria-expanded", "true");
        });
        refreshAccordionHeights();
        setActive(sections[0]?.id);
        getActiveSection();
        return;
      }
      view.classList.add("is-accordion");
      sections.forEach((section, index) => {
        const collapsed = index !== 0;
        section.classList.toggle("is-collapsed", collapsed);
        const btn = section.querySelector(".guide-services__toggle");
        if (btn) btn.setAttribute("aria-expanded", collapsed ? "false" : "true");
      });
      refreshAccordionHeights();
      setActive(sections[0]?.id);
      getActiveSection();
    };

    const toggles = Array.from(view.querySelectorAll(".guide-services__toggle"));
    toggles.forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!view.classList.contains("is-accordion")) return;
        const section = btn.closest(".guide-services__section");
        if (!section) return;
        const isCollapsed = section.classList.toggle("is-collapsed");
        btn.setAttribute("aria-expanded", isCollapsed ? "false" : "true");
        requestAnimationFrame(() => setAccordionHeight(section));
        getActiveSection();
      });
    });

    if (sections[0]?.id) setActive(sections[0].id);
    applyAccordion();
    if (mq.addEventListener) {
      mq.addEventListener("change", applyAccordion);
    } else if (mq.addListener) {
      mq.addListener(applyAccordion);
    }

    getActiveSection();
    view.dataset.enhanced = "1";
  }

  window.quokViewModules = window.quokViewModules || {};
  window.quokViewModules.guide = initGuideView;
})();
