// /buroPix/js/view-web.js
(function () {
  function initWebView({ viewRoot } = {}) {
    const view = viewRoot?.querySelector('.spa-view[data-spa-view="web"]');
    if (!view) return;
    view.dataset.enhanced = "1";
  }

  window.quokViewModules = window.quokViewModules || {};
  window.quokViewModules.web = initWebView;
})();
