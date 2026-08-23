/* ─────────────────────────────────────────────────────────────
   Shared, anonymous page-visit beacon for the unified dashboard.
   Include with <script src="track.js" defer></script>. Fires once per
   browser session (sessionStorage flag), via sendBeacon so it never
   blocks or delays the page. Posts to functions/api/track.js.

   Also exposes window.GE_TRACK(type) so a page can log its own one-off
   events — currently just fablegear.html, for 'survey_start'.
   ───────────────────────────────────────────────────────────── */
(function () {
  function send(type, extra) {
    try {
      var body = JSON.stringify(Object.assign({ type: type, path: location.pathname }, extra || {}));
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/track', new Blob([body], { type: 'application/json' }));
      } else {
        fetch('/api/track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: body,
          keepalive: true,
        }).catch(function () {});
      }
    } catch (e) { /* counters are a nice-to-have, never worth surfacing an error */ }
  }

  try {
    if (!sessionStorage.getItem('ge_visit_logged')) {
      sessionStorage.setItem('ge_visit_logged', '1');
      send('visit');
    }
  } catch (e) {
    send('visit');
  }

  window.GE_TRACK = send;
})();
