/*
 * Cloudflare Pages Function — reports the current FableGear macOS release.
 *
 * fablegear.html fetches this to decorate the download button with a version
 * and file size. The button itself is a static link to
 * releases/latest/download/FableGear.zip, so this endpoint is decoration only:
 * if it fails, the page keeps the static href and simply shows no version.
 *
 * Before this existed the page called /fablegear/release with no handler behind
 * it, so it 404'd on every load and the .catch() swallowed it — a feature that
 * looked wired up but never once ran.
 *
 * No configuration required. Unauthenticated GitHub API calls are rate limited
 * per IP, so the response is cached at the edge to stay well inside it.
 */

const REPO = 'fabledharbinger0993/FableGear';
const CACHE_SECONDS = 900;

export async function onRequestGet({ waitUntil }) {
  const cache = caches.default;
  const cacheKey = new Request('https://guthrieent.com/fablegear/release', { method: 'GET' });

  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  let payload;
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: {
        Accept: 'application/vnd.github+json',
        // GitHub rejects API requests without one.
        'User-Agent': 'guthrieent.com-fablegear',
      },
    });

    if (!res.ok) return json({ error: 'upstream' }, 502);

    const release = await res.json();
    const asset = (release.assets || []).find(
      (a) => typeof a.name === 'string' && a.name.toLowerCase().endsWith('.zip')
    );

    payload = {
      tag: release.tag_name || null,
      mac_url: asset ? asset.browser_download_url : null,
      mac_size_mb: asset && asset.size ? Math.round((asset.size / 1048576) * 10) / 10 : null,
      published_at: release.published_at || null,
    };
  } catch {
    return json({ error: 'unreachable' }, 502);
  }

  const response = json(payload);
  waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${CACHE_SECONDS}`,
    },
  });
}
