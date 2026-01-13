// /quokk/js/view-contact.js
(function () {
  function initContactView({ viewRoot } = {}) {
    const view = viewRoot?.querySelector('.spa-view[data-spa-view="contact"]');
    if (!view) return;
    document.body.classList.add("is-contact-view");
    const dateEl = view.querySelector("[data-contact-date]");
    const timeEl = view.querySelector("[data-contact-time]");

    const updateClock = () => {
      if (!dateEl || !timeEl) return;
      const now = new Date();
      const dateFmt = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Seoul",
        weekday: "long",
        month: "long",
        day: "numeric",
      });
      const timeFmt = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Seoul",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      dateEl.textContent = dateFmt.format(now);
      timeEl.textContent = timeFmt.format(now);
    };

    const scheduleNextTick = () => {
      updateClock();
      const now = new Date();
      const msToNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
      view.__contactClockTimer = setTimeout(() => {
        updateClock();
        view.__contactClockInterval = setInterval(updateClock, 60 * 1000);
      }, Math.max(1000, msToNextMinute));
    };

    scheduleNextTick();
    view.dataset.enhanced = "1";
  }

  window.quokViewModules = window.quokViewModules || {};
  window.quokViewModules.contact = initContactView;
})();
