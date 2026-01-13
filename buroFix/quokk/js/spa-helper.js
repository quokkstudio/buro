// /quokk/js/spa-helper.js
(() => {
  "use strict";

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

  function findHeaderEl() {
    return (
      HEADER_SELECTORS.map((s) => document.querySelector(s)).find(
        (el) => el && el.offsetHeight > 0
      ) || null
    );
  }

  const getViewportHeight = () => {
    const vv = window.visualViewport;
    return Math.round((vv && vv.height) || window.innerHeight || document.documentElement.clientHeight);
  };

  let lastViewportW = window.innerWidth;
  let lastViewportH = getViewportHeight();

  function setHeaderH() {
    const headerEl = findHeaderEl();
    const headerH = headerEl ? Math.ceil(headerEl.getBoundingClientRect().height) : 0;

    const SPA_WRAP =
      document.querySelector(".quok-spa-wrap") ||
      document.getElementById("quok-wrap") ||
      document.querySelector("#quok-wrap");

    const wrapTop = SPA_WRAP ? Math.max(0, Math.ceil(SPA_WRAP.getBoundingClientRect().top)) : 0;
    const pos = headerEl ? getComputedStyle(headerEl).position : "";
    const finalH =
      pos === "fixed" || pos === "sticky" || wrapTop === 0 ? Math.max(wrapTop, headerH) : wrapTop;

    document.documentElement.style.setProperty("--quok-header-h", `${finalH}px`);
  }

  function setVh() {
    const currentW = window.innerWidth;
    const currentH = getViewportHeight();
    if (currentW === lastViewportW && currentH === lastViewportH) return;
    lastViewportW = currentW;
    lastViewportH = currentH;
    document.documentElement.style.setProperty("--quok-vh", `${currentH * 0.01}px`);
  }

  function run() {
    setVh();
    setHeaderH();
  }

  window.addEventListener("resize", run);
  window.addEventListener("orientationchange", run);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", run, { passive: true });
    window.visualViewport.addEventListener("scroll", run, { passive: true });
  }
  document.addEventListener("DOMContentLoaded", run);

  // 폰트 로딩/이미지 로딩으로 헤더 높이가 변하는 케이스 보정
  window.addEventListener("load", run);

  // 헤더가 동적으로 바뀌는 스킨 대응
  const mo = new MutationObserver(() => setHeaderH());
  mo.observe(document.documentElement, { childList: true, subtree: true });
})();
