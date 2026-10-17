(() => {
  const script = document.currentScript;
  const siteKey = script && script.getAttribute("data-site-key");
  const apiBase = (script && script.getAttribute("data-api")) || "";
  const rootId =
    (script && script.getAttribute("data-target")) ||
    "reachline-blog";
  if (!siteKey || !apiBase) {
    console.error("[Agency OS] embed requires data-site-key and data-api");
    return;
  }
  let root = document.getElementById(rootId);
  if (!root) {
    root = document.getElementById("kitchenline-blog");
  }
  if (!root) {
    console.error(
      "[Agency OS] missing #" + rootId + " (or #kitchenline-blog) container"
    );
    return;
  }

  const style = document.createElement("style");
  style.textContent =
    ".rl-blog,.kl-blog{font-family:Georgia,'Times New Roman',serif;color:#1c1917;line-height:1.55}" +
    ".rl-blog h2,.kl-blog h2{font-size:1.5rem;margin:0 0 .35rem}" +
    ".rl-blog .rl-meta,.kl-blog .kl-meta{color:#6b6560;font-size:.9rem;margin-bottom:1rem;font-family:system-ui,sans-serif}" +
    ".rl-blog .rl-card,.kl-blog .kl-card{border-bottom:1px solid rgba(28,25,23,.12);padding:1rem 0;cursor:pointer}" +
    ".rl-blog .rl-card:hover h3,.kl-blog .kl-card:hover h3{color:#c45c26}" +
    ".rl-blog .rl-card h3,.kl-blog .kl-card h3{margin:0 0 .35rem;font-size:1.15rem}" +
    ".rl-blog .rl-excerpt,.kl-blog .kl-excerpt{margin:0;color:#4a4541;font-family:system-ui,sans-serif;font-size:.95rem}" +
    ".rl-blog .rl-back,.kl-blog .kl-back{font-family:system-ui,sans-serif;border:none;background:transparent;color:#c45c26;cursor:pointer;padding:0;margin-bottom:1rem}" +
    ".rl-blog .rl-body,.kl-blog .kl-body{font-size:1.05rem}" +
    ".rl-blog .rl-body h2,.kl-blog .kl-body h2{margin-top:1.5rem}";
  document.head.appendChild(style);

  function hashSlug() {
    const h = location.hash.replace(/^#\/?/, "");
    return h.indexOf("post/") === 0 ? h.slice(5) : "";
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async function loadList() {
    const res = await fetch(
      apiBase.replace(/\/$/, "") + "/public/blog/" + encodeURIComponent(siteKey)
    );
    if (!res.ok) throw new Error("Failed to load blog");
    return res.json();
  }

  async function loadPost(slug) {
    const res = await fetch(
      apiBase.replace(/\/$/, "") +
        "/public/blog/" +
        encodeURIComponent(siteKey) +
        "/" +
        encodeURIComponent(slug)
    );
    if (!res.ok) throw new Error("Post not found");
    return res.json();
  }

  function renderList(data) {
    root.className = "rl-blog";
    const name =
      (data.business && data.business.name) ||
      (data.restaurant && data.restaurant.name) ||
      "our business";
    const cards = (data.posts || [])
      .map(function (p) {
        return (
          '<article class="rl-card" data-slug="' +
          escapeHtml(p.slug) +
          '"><h3>' +
          escapeHtml(p.title || "Untitled") +
          '</h3><p class="rl-excerpt">' +
          escapeHtml(p.excerpt || "") +
          "</p></article>"
        );
      })
      .join("");
    root.innerHTML =
      "<h2>From " +
      escapeHtml(name) +
      '</h2><p class="rl-meta">Latest posts</p>' +
      (cards || '<p class="rl-meta">No posts published yet.</p>');
    root.querySelectorAll(".rl-card").forEach(function (el) {
      el.addEventListener("click", function () {
        location.hash = "post/" + el.getAttribute("data-slug");
        render();
      });
    });
  }

  function renderArticle(post) {
    root.className = "rl-blog";
    root.innerHTML =
      '<button type="button" class="rl-back">← All posts</button><h2>' +
      escapeHtml(post.title || "") +
      '</h2><p class="rl-meta">' +
      (post.publishedAt ? new Date(post.publishedAt).toLocaleDateString() : "") +
      '</p><div class="rl-body">' +
      (post.bodyHtml || "") +
      "</div>";
    var back = root.querySelector(".rl-back");
    if (back) {
      back.addEventListener("click", function () {
        location.hash = "";
        render();
      });
    }
  }

  async function render() {
    try {
      var slug = hashSlug();
      if (slug) {
        renderArticle(await loadPost(slug));
      } else {
        renderList(await loadList());
      }
    } catch (e) {
      root.innerHTML = '<p class="rl-meta">Unable to load blog posts.</p>';
      console.error(e);
    }
  }

  window.addEventListener("hashchange", function () {
    render();
  });
  render();
})();
