// /buroPix/js/view-home.js
(function () {
  function absoluteUrl(href) {
    try {
      return new URL(href, window.location.origin).href;
    } catch {
      return "";
    }
  }

  async function fetchDetail(href) {
    const res = await fetch(href, { credentials: "include" });
    if (!res.ok) throw new Error(`detail fetch failed ${res.status}`);
    const html = await res.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    const detail =
      doc.querySelector(".detail") ||
      doc.querySelector(".ec-base-table .detail") ||
      doc.querySelector(".boardRead") ||
      doc.querySelector(".viewContent");

    if (!detail) throw new Error("detail fragment not found");
    return detail.innerHTML.trim();
  }

  function initHomeView({ viewRoot } = {}) {
    const view = viewRoot?.querySelector('.spa-view[data-spa-view="home"]');
    if (!view) return;

    const postsWrap = view.querySelector("[data-board-posts]");
    if (!postsWrap) return;

    postsWrap.innerHTML = "";

    (async () => {
      const sourceLinks = Array.from(view.querySelectorAll(".spa-board__source-link[href]"));

      if (!sourceLinks.length) {
        showEmpty("게시글이 아직 없습니다.");
        return;
      }

      let rendered = 0;
      let settled = 0;
      let nextIndex = 0;
      const slots = new Array(sourceLinks.length).fill(null);

      const flush = () => {
        while (slots[nextIndex]) {
          const article = slots[nextIndex];
          if (nextIndex === 0) article.classList.add("is-enter-first");
          postsWrap.appendChild(article);
          slots[nextIndex] = null;
          nextIndex += 1;
        }
      };

      const checkComplete = () => {
        settled += 1;
        if (settled === sourceLinks.length && rendered === 0) {
          showEmpty("게시글을 불러오지 못했습니다.");
        }
      };

      sourceLinks.forEach((link, index) => {
        const href = absoluteUrl(link.getAttribute("href"));
        if (!href) {
          checkComplete();
          return;
        }

        fetchDetail(href)
          .then((detailHtml) => {
            const article = buildArticle(detailHtml);
            slots[index] = article;
            rendered += 1;
            flush();
          })
          .catch((err) => {
            console.error("[home-board]", err);
          })
          .finally(checkComplete);
      });
    })();

    function buildArticle(detailHtml) {
      const article = document.createElement("article");
      article.className = "spa-board__post";
      const body = document.createElement("div");
      body.className = "spa-board__post-body";
      body.innerHTML = detailHtml;
      body.querySelectorAll("img").forEach((img) => {
        img.loading = "lazy";
        img.decoding = "async";
      });
      article.appendChild(body);
      return article;
    }

    function showEmpty(message) {
      postsWrap.innerHTML = `<p class="spa-board__empty">${message}</p>`;
      requestAnimationFrame(() => {
        postsWrap.querySelector(".spa-board__empty")?.classList.add("is-enter");
      });
    }
  }

  window.quokViewModules = window.quokViewModules || {};
  window.quokViewModules.home = initHomeView;
})();
