/*
 * Cloudflare Pages Function — reports the current FableGear macOS release.
 *
 * fablegear.html fetches this to decorate the download button with a version
 * and file size. The button itself is a static link to
 * releases/latest/download/FableGear.zip, so this endpoint is decoration only:
 * if it fails, the page keeps the static href and simply shows no version.
 *
 * WHY THIS DOES NOT USE api.github.com
 *   It used to. Unauthenticated GitHub API calls are rate limited per source IP,
 *   and Cloudflare's egress addresses are shared with enough other traffic that
 *   the quota is routinely already spent — the endpoint returned real data on
 *   one deploy and a solid 502 on the next, with no code change between them.
 *   Adding a token to fix that would mean storing a credential for something
 *   that only paints a version number next to a button.
 *
 *   Instead this uses two unauthenticated, unmetered github.com paths:
 *     1. /releases/latest 302-redirects to /releases/tag/<tag>, so the redirect
 *        Location carries the version.
 *     2. A HEAD on the asset returns Content-Length for the size.
 *   Neither is an API call, so neither is subject to the API rate limit.
 */

const REPO = 'fabledharbinger0993/FableGear';
const ASSET = 'FableGear.zip';
const CACHE_SECONDS = 900;
// Failures are cached briefly too. Without this, an outage turns every page load
// into a fresh upstream request, which is exactly how the rate limit got hit.
const ERROR_CACHE_SECONDS = 120;

export async function onRequestGet({ waitUntil }) {
  const cache = caches.default;
  const cacheKey = new Request('https://guthrieent.com/fablegear/release', { method: 'GET' });

  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const downloadUrl = `https://github.com/${REPO}/releases/latest/download/${ASSET}`;
  let response;

  try {
    const [tag, size] = await Promise.all([resolveTag(), resolveSize(downloadUrl)]);

    if (!tag) {
      response = json({ error: 'no-release' }, 502, ERROR_CACHE_SECONDS);
    } else {
      response = json(
        {
          tag,
          mac_url: downloadUrl,
          mac_size_mb: size === null ? null : Math.round((size / 1048576) * 10) / 10,
        },
        200,
        CACHE_SECONDS
      );
    }
  } catch (err) {
    console.error('release lookup failed:', err);
    response = json({ error: 'unreachable' }, 502, ERROR_CACHE_SECONDS);
  }

  waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

/** /releases/latest 302s to /releases/tag/<tag>; the tag is in the Location. */
async function resolveTag() {
  const res = await fetch(`https://github.com/${REPO}/releases/latest`, {
    method: 'HEAD',
    redirect: 'manual',
    headers: { 'User-Agent': 'guthrieent.com-fablegear' },
  });

  const location = res.headers.get('location');
  if (!location) return null;

  const match = location.match(/\/releases\/tag\/([^/?#]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Size is a nice-to-have, so a failure here still yields a usable version tag.
 * The asset URL redirects to object storage, which is what carries the length.
 */
async function resolveSize(downloadUrl) {
  try {
    const res = await fetch(downloadUrl, {
      method: 'HEAD',
      redirect: 'follow',
      headers: { 'User-Agent': 'guthrieent.com-fablegear' },
    });
    if (!res.ok) return null;
    const length = res.headers.get('content-length');
    return length ? Number(length) : null;
  } catch {
    return null;
  }
}

function json(body, status = 200, maxAge = CACHE_SECONDS) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${maxAge}`,
    },
  });
}
