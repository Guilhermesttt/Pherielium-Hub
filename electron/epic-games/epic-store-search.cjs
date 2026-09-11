const clean = (value, maxLength = 500) =>
  String(value ?? "").replace(/\0/g, "").trim().slice(0, maxLength);

const normalizeTitle = (value) =>
  clean(value, 160)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .toLocaleLowerCase("pt-BR");

const EPIC_STORE_GRAPHQL_QUERY = `
  query searchStoreQuery($keywords: String, $locale: String, $country: String!, $count: Int, $start: Int) {
    Catalog {
      searchStore(keywords: $keywords, locale: $locale, country: $country, count: $count, start: $start) {
        elements {
          id
          namespace
          title
          description
          productSlug
          urlSlug
          keyImages {
            type
            url
          }
        }
      }
    }
  }
`;

const installedGamesByTitle = (installedGames) => {
  const installedByTitle = new Map();
  for (const game of Array.isArray(installedGames) ? installedGames : []) {
    const key = normalizeTitle(game?.name || game?.title);
    if (key && !installedByTitle.has(key)) installedByTitle.set(key, game);
  }
  return installedByTitle;
};

const normalizeEpicStoreCards = (cards, installedGames = []) => {
  const installedByTitle = installedGamesByTitle(installedGames);

  const results = new Map();
  for (const raw of Array.isArray(cards) ? cards : []) {
    const productUrl = clean(raw?.productUrl, 2_000);
    let parsedUrl;
    try {
      parsedUrl = new URL(productUrl);
    } catch {
      continue;
    }
    if (parsedUrl.protocol !== "https:" || parsedUrl.hostname !== "store.epicgames.com") continue;
    const slugMatch = parsedUrl.pathname.match(/\/p\/([^/?#]+)/i);
    const productSlug = clean(slugMatch?.[1], 200);
    const name = clean(raw?.name, 160);
    if (!productSlug || !name) continue;
    const installed = installedByTitle.get(normalizeTitle(name));
    const image = clean(raw?.image, 4_096);
    const catalogId = clean(installed?.catalogId, 200);
    const namespace = clean(installed?.namespace, 200);
    const appName = clean(installed?.appName, 200);

    results.set(productSlug.toLocaleLowerCase("en-US"), {
      id: `epic-store:${productSlug}`,
      catalogId,
      namespace,
      appName,
      epicLaunchId: clean(installed?.epicLaunchId, 700),
      executablePath: clean(installed?.executablePath, 2_000),
      name,
      title: name,
      category: clean(raw?.category, 80),
      price: clean(raw?.price, 120),
      image,
      tiny_image: image,
      cardImage: image,
      backgroundImage: image,
      productSlug,
      productUrl: `https://store.epicgames.com/p/${productSlug}`,
      source: "epic-store",
      installed: Boolean(installed),
    });
  }
  return [...results.values()];
};

const pickEpicImage = (images, preferredTypes) => {
  const available = Array.isArray(images)
    ? images.filter((image) => clean(image?.url, 4_096))
    : [];
  for (const type of preferredTypes) {
    const match = available.find((image) =>
      clean(image?.type, 100).toLocaleLowerCase("en-US").includes(type));
    if (match) return clean(match.url, 4_096);
  }
  return clean(available[0]?.url, 4_096);
};

const normalizeEpicGraphqlElements = (elements, installedGames = []) => {
  const installedByTitle = installedGamesByTitle(installedGames);
  const results = [];
  for (const element of Array.isArray(elements) ? elements : []) {
    const catalogId = clean(element?.id, 200);
    const namespace = clean(element?.namespace, 200);
    const name = clean(element?.title, 160);
    const productSlug = clean(element?.productSlug || element?.urlSlug, 200)
      .replace(/^\/+|\/+$/g, "")
      .replace(/\/home$/i, "");
    if (!catalogId || !namespace || !name || !productSlug) continue;
    const installed = installedByTitle.get(normalizeTitle(name));
    const cardImage = pickEpicImage(element?.keyImages, ["tall", "thumbnail", "box"]);
    const backgroundImage = pickEpicImage(element?.keyImages, ["wide", "hero", "offerimagewide"]) || cardImage;
    const appName = clean(installed?.appName, 200);
    results.push({
      id: catalogId,
      catalogId,
      namespace,
      appName,
      epicLaunchId: clean(installed?.epicLaunchId, 700) || `${namespace}:${catalogId}`,
      executablePath: clean(installed?.executablePath, 2_000),
      name,
      title: name,
      description: clean(element?.description, 2_000),
      image: backgroundImage,
      tiny_image: cardImage,
      cardImage,
      backgroundImage,
      productSlug,
      productUrl: `https://store.epicgames.com/p/${productSlug}`,
      source: "epic-store",
      installed: Boolean(installed),
    });
  }
  return results;
};

const safeHttpsUrl = (value) => {
  const candidate = clean(value, 4_096);
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "https:" ? parsed.toString() : "";
  } catch {
    return "";
  }
};

const collectEpicMedia = (value, output, depth = 0) => {
  if (!value || depth > 6) return;
  if (Array.isArray(value)) {
    value.forEach((item) => collectEpicMedia(item, output, depth + 1));
    return;
  }
  if (typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    if (typeof nested === "string" && /^(?:src|thumbnail|backgroundImageUrl)$/i.test(key)) {
      const url = safeHttpsUrl(nested);
      if (url) output.push(url);
    } else if (typeof nested === "object") {
      collectEpicMedia(nested, output, depth + 1);
    }
  }
};

const markdownImages = (value) => {
  const urls = [];
  const pattern = /!\[[^\]]*]\((https:\/\/[^)\s]+)\)/gi;
  let match;
  while ((match = pattern.exec(clean(value, 100_000)))) {
    const url = safeHttpsUrl(match[1]);
    if (url) urls.push(url);
  }
  return urls;
};

const escapeHtml = (value) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const epicMarkdownToHtml = (value) => {
  const text = clean(value, 100_000)
    .replace(/!\[[^\]]*]\(https:\/\/[^)\s]+\)/gi, "")
    .replace(/\\([!#*_[\]()=-])/g, "$1")
    .replace(/^=+$/gm, "")
    .replace(/^#{1,6}\s*/gm, "")
    .trim();
  return text
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
};

const formatEpicReleaseDate = (value) => {
  const raw = clean(value, 100);
  const date = new Date(raw);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "UTC",
    }).format(date)
    : raw;
};

const normalizeEpicStoreDetails = (
  payload,
  requested = {},
  installedGames = [],
) => {
  const pages = Array.isArray(payload?.pages) ? payload.pages : [];
  const requestedCatalogId = clean(requested?.catalogId, 200);
  const requestedSlug = clean(requested?.productSlug, 200);
  const page =
    pages.find((candidate) => requestedCatalogId && clean(candidate?.offer?.id) === requestedCatalogId)
    || pages.find((candidate) => clean(candidate?._title).toLowerCase() === "home")
    || pages.find((candidate) => clean(candidate?._title) === requestedSlug)
    || pages.find((candidate) => candidate?.data?.about?.title);
  if (!page) return null;

  const data = page.data || {};
  const about = data.about || {};
  const hero = data.hero || {};
  const meta = data.meta || {};
  const catalogId = clean(page?.offer?.id || requestedCatalogId, 200);
  const namespace = clean(page?.offer?.namespace || page?.namespace || requested?.namespace, 200);
  const title = clean(about.title || data.navTitle || payload?.productName || page?.productName, 160);
  if (!title) return null;
  const installed = installedGamesByTitle(installedGames).get(normalizeTitle(title));
  const cardImage = safeHttpsUrl(
    hero.portraitBackgroundImageUrl
    || about?.image?.src
    || data?.seo?.image?.src,
  );
  const backgroundImage = safeHttpsUrl(
    hero.backgroundImageUrl
    || data?.banner?.image?.src
    || cardImage,
  );
  const logoImage = safeHttpsUrl(hero?.logoImage?.src || meta?.logo?.src);
  const media = [];
  collectEpicMedia(data.carousel, media);
  collectEpicMedia(data.gallery, media);
  collectEpicMedia(data.productSections, media);
  media.push(...markdownImages(about.description));
  const screenshots = [...new Set(media)]
    .filter((url) => url !== cardImage && url !== backgroundImage && url !== logoImage)
    .slice(0, 40);

  let trailerUrl = "";
  for (const item of Array.isArray(data?.carousel?.items) ? data.carousel.items : []) {
    try {
      const recipes = JSON.parse(clean(item?.video?.recipes, 20_000));
      trailerUrl = (Array.isArray(recipes?.output) ? recipes.output : [])
        .map(safeHttpsUrl)
        .find((url) => /\.mp4(?:$|\?)/i.test(url)) || "";
    } catch {
      // Carousel item is an image or has no Epic-hosted video recipe.
    }
    if (trailerUrl) break;
  }

  return {
    catalogId,
    namespace,
    appName: clean(installed?.appName, 200),
    title,
    image: backgroundImage || cardImage,
    cardImage: cardImage || backgroundImage,
    backgroundImage: backgroundImage || cardImage,
    logoImage,
    description: clean(about.shortDescription || about.description, 2_000),
    aboutTheGame: epicMarkdownToHtml(about.description || about.shortDescription),
    screenshots,
    releaseDate: formatEpicReleaseDate(meta.customReleaseDate || meta.releaseDate),
    developer: clean(
      (Array.isArray(meta.developer) ? meta.developer[0] : meta.developer)
      || about.developerAttribution,
      160,
    ),
    publisher: clean(
      (Array.isArray(meta.publisher) ? meta.publisher[0] : meta.publisher)
      || about.publisherAttribution,
      160,
    ),
    tags: (Array.isArray(meta.tags) ? meta.tags : [])
      .map((tag) => clean(tag, 80))
      .filter(Boolean)
      .slice(0, 30),
    trailerUrl,
    productSlug: requestedSlug || clean(payload?._slug || payload?._title, 200),
    productUrl: requestedSlug ? `https://store.epicgames.com/p/${requestedSlug}` : "",
    epicLaunchId:
      clean(installed?.epicLaunchId, 700)
      || (namespace && catalogId ? `${namespace}:${catalogId}` : catalogId),
    executablePath: clean(installed?.executablePath, 2_000),
    source: "epic-store",
  };
};

const EPIC_STORE_CARD_EXTRACTOR = `(() => {
  const cards = [];
  document.querySelectorAll('a[href*="/p/"]').forEach((anchor) => {
    try {
      const url = new URL(anchor.href, location.origin);
      if (url.hostname !== "store.epicgames.com" || !/\\/p\\/[^/]+/i.test(url.pathname)) return;
      const lines = String(anchor.innerText || "")
        .split("\\n")
        .map((line) => line.trim())
        .filter(Boolean);
      const image = anchor.querySelector('img');
      const name = String(image?.alt || lines[1] || lines[0] || "").trim();
      if (!name) return;
      cards.push({
        productUrl: url.href,
        name,
        category: lines[0] === name ? "" : (lines[0] || ""),
        price: lines.slice(2).join(" · "),
        image: String(image?.currentSrc || image?.src || image?.getAttribute("data-image") || "")
      });
    } catch {}
  });
  return cards;
})()`;

module.exports = {
  EPIC_STORE_CARD_EXTRACTOR,
  EPIC_STORE_GRAPHQL_QUERY,
  normalizeEpicGraphqlElements,
  normalizeEpicStoreDetails,
  normalizeEpicStoreCards,
};
