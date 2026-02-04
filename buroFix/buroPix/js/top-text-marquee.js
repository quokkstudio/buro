// /buroPix/js/top-text-marquee.js
(() => {
  "use strict";

  const initTopMarquee = () => {
    document.querySelectorAll(".topText").forEach((bar) => {
      if (!bar || bar.querySelector(".topText__track")) return;
      const raw = bar.textContent.trim();
      if (!raw) return;

      const track = document.createElement("div");
      track.className = "topText__track";

      const makeSpan = (hidden) => {
        const span = document.createElement("span");
        if (hidden) span.setAttribute("aria-hidden", "true");
        span.textContent = raw;
        return span;
      };

      const spans = [];
      const addClone = (hidden) => {
        const span = makeSpan(hidden);
        track.appendChild(span);
        spans.push(span);
      };

      for (let i = 0; i < 3; i += 1) addClone(i > 0);

      bar.textContent = "";
      bar.appendChild(track);

      const ensureCoverage = () => {
        if (!bar.clientWidth) return;
        while (track.scrollWidth < bar.clientWidth * 2) addClone(true);
      };

      ensureCoverage();

      const computeSegmentWidth = () => {
        if (spans.length > 1) {
          const delta = spans[1].offsetLeft - spans[0].offsetLeft;
          if (delta > 0) return delta;
        }
        return track.scrollWidth / spans.length || bar.clientWidth;
      };

      const shift = -computeSegmentWidth();
      track.style.setProperty("--topText-shift", `${shift}px`);
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initTopMarquee, { once: true });
  } else {
    initTopMarquee();
  }
})();
