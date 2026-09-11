/**
 * PulseDock Embed Widget (script-tag embed)
 *
 * Usage:
 *   <div data-pulsedock-monitor="MONITOR_ID" data-label="API Status" data-theme="dark" data-style="compact"></div>
 *   <script src="https://your-pulsedock.com/embed.js" async></script>
 *
 * Attributes on the container div:
 *   data-pulsedock-monitor  — Monitor ID (required)
 *   data-label              — Custom label (optional, defaults to monitor name)
 *   data-style              — "compact" (default) or "card"
 *   data-theme              — "dark" (default) or "light"
 *
 * The script auto-discovers all [data-pulsedock-monitor] elements on the page.
 */
(function () {
  'use strict';

  var API_BASE = (function () {
    // Derive API base from the script's own src attribute so it works
    // regardless of where PulseDock is hosted.
    var scripts = document.querySelectorAll('script[src*="embed.js"]');
    if (scripts.length > 0) {
      try {
        var url = new URL(scripts[scripts.length - 1].src);
        return url.origin + '/api';
      } catch (e) { /* ignore */ }
    }
    return window.location.origin + '/api';
  })();

  function statusColor(status) {
    if (status === 'up') return '#3fb950';
    if (status === 'degraded') return '#d29922';
    if (status === 'down') return '#f85149';
    return '#9ca3af';
  }

  function statusLabel(status) {
    if (status === 'up') return 'Operational';
    if (status === 'degraded') return 'Degraded';
    if (status === 'down') return 'Down';
    if (status === 'paused') return 'Paused';
    return 'Unknown';
  }

  function formatLatency(ms) {
    if (ms === null || ms === undefined) return '';
    return ms < 1000 ? ms + 'ms' : (ms / 1000).toFixed(1) + 's';
  }

  function injectCompact(el, data, theme, label) {
    var isDark = theme !== 'light';
    var bg = isDark ? '#0d1117' : '#ffffff';
    var border = isDark ? '#30363d' : '#d0d7de';
    var textPrimary = isDark ? '#e6edf3' : '#1f2328';
    var textSecondary = isDark ? '#8b949e' : '#656d76';
    var color = statusColor(data.status);
    var latency = formatLatency(data.responseMs);
    var name = label || data.name;
    var statusText = statusLabel(data.status);

    el.innerHTML = '';
    el.style.cssText = [
      'display:inline-flex',
      'align-items:center',
      'gap:8px',
      'padding:6px 12px',
      'background:' + bg,
      'border:1px solid ' + border,
      'border-radius:8px',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif',
      'font-size:13px',
      'line-height:1',
      'box-shadow:0 1px 3px rgba(0,0,0,0.12)',
      'max-width:100%',
    ].join(';');

    // Dot
    var dot = document.createElement('span');
    dot.style.cssText = 'display:inline-block;width:8px;height:8px;border-radius:50%;background:' + color + ';flex-shrink:0;';
    el.appendChild(dot);

    // Name
    var nameEl = document.createElement('span');
    nameEl.textContent = name;
    nameEl.style.cssText = 'font-weight:600;color:' + textPrimary + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:160px;';
    el.appendChild(nameEl);

    // Status
    var statusEl = document.createElement('span');
    statusEl.textContent = statusText;
    statusEl.style.cssText = 'font-weight:500;color:' + color + ';white-space:nowrap;';
    el.appendChild(statusEl);

    // Latency
    if (latency) {
      var sep = document.createElement('span');
      sep.textContent = '·';
      sep.style.cssText = 'color:' + textSecondary + ';';
      el.appendChild(sep);

      var latencyEl = document.createElement('span');
      latencyEl.textContent = latency;
      latencyEl.style.cssText = 'font-size:11px;color:' + textSecondary + ';white-space:nowrap;';
      el.appendChild(latencyEl);
    }
  }

  function injectCard(el, data, theme, label) {
    var isDark = theme !== 'light';
    var bg = isDark ? '#0d1117' : '#ffffff';
    var border = isDark ? '#30363d' : '#d0d7de';
    var textPrimary = isDark ? '#e6edf3' : '#1f2328';
    var textSecondary = isDark ? '#8b949e' : '#656d76';
    var color = statusColor(data.status);
    var latency = formatLatency(data.responseMs);
    var name = label || data.name;
    var statusText = statusLabel(data.status);

    el.innerHTML = '';
    el.style.cssText = [
      'display:inline-block',
      'background:' + bg,
      'border:1px solid ' + border,
      'border-radius:10px',
      'padding:14px 16px',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif',
      'font-size:13px',
      'line-height:1.4',
      'box-shadow:0 1px 3px rgba(0,0,0,0.12)',
      'min-width:200px',
      'max-width:320px',
      'width:100%',
    ].join(';');

    // Header row
    var header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;gap:9px;';

    var dot = document.createElement('span');
    dot.style.cssText = 'display:inline-block;width:10px;height:10px;border-radius:50%;background:' + color + ';flex-shrink:0;';
    header.appendChild(dot);

    var nameEl = document.createElement('span');
    nameEl.textContent = name;
    nameEl.style.cssText = 'font-size:14px;font-weight:600;color:' + textPrimary + ';flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
    header.appendChild(nameEl);

    var badge = document.createElement('span');
    badge.textContent = statusText;
    badge.style.cssText = 'font-size:11px;font-weight:500;padding:2px 8px;border-radius:20px;background:' + color + '20;color:' + color + ';flex-shrink:0;';
    header.appendChild(badge);

    el.appendChild(header);

    // Meta row
    var meta = document.createElement('div');
    meta.style.cssText = 'display:flex;gap:16px;margin-top:10px;padding-top:10px;border-top:1px solid ' + border + ';';

    function metaItem(lbl, val) {
      var item = document.createElement('div');
      item.style.cssText = 'display:flex;flex-direction:column;gap:2px;';
      var l = document.createElement('span');
      l.textContent = lbl;
      l.style.cssText = 'font-size:10px;color:' + textSecondary + ';text-transform:uppercase;letter-spacing:0.05em;';
      var v = document.createElement('span');
      v.textContent = val;
      v.style.cssText = 'font-size:13px;font-weight:600;color:' + textPrimary + ';';
      item.appendChild(l);
      item.appendChild(v);
      return item;
    }

    meta.appendChild(metaItem('Uptime', data.uptimePct.toFixed(2) + '%'));
    if (latency) meta.appendChild(metaItem('Response', latency));

    el.appendChild(meta);

    // Branding
    var branding = document.createElement('div');
    branding.style.cssText = 'margin-top:8px;text-align:right;';
    var link = document.createElement('a');
    link.href = 'https://github.com/No749ah/PulseDock';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Powered by PulseDock';
    link.style.cssText = 'font-size:10px;color:' + textSecondary + ';text-decoration:none;opacity:0.5;';
    branding.appendChild(link);
    el.appendChild(branding);
  }

  function renderWidget(el) {
    var monitorId = el.getAttribute('data-pulsedock-monitor');
    if (!monitorId) return;

    var style = el.getAttribute('data-style') || 'compact';
    var theme = el.getAttribute('data-theme') || 'dark';
    var label = el.getAttribute('data-label') || '';

    fetch(API_BASE + '/v1/public/embed/' + monitorId)
      .then(function (res) {
        if (!res.ok) throw new Error('not found');
        return res.json();
      })
      .then(function (data) {
        if (style === 'card') {
          injectCard(el, data, theme, label);
        } else {
          injectCompact(el, data, theme, label);
        }
        // Set aria-label for accessibility
        el.setAttribute('role', 'status');
        el.setAttribute('aria-label', (label || data.name) + ': ' + statusLabel(data.status));
      })
      .catch(function () {
        // Show graceful error state
        var isDark = theme !== 'light';
        el.style.cssText = 'display:inline-flex;align-items:center;gap:8px;padding:6px 12px;background:' + (isDark ? '#0d1117' : '#fff') + ';border:1px solid ' + (isDark ? '#30363d' : '#d0d7de') + ';border-radius:8px;font-family:system-ui,sans-serif;font-size:13px;color:' + (isDark ? '#8b949e' : '#656d76') + ';';
        el.innerHTML = '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#9ca3af;"></span><span>Status unavailable</span>';
      });
  }

  function init() {
    var elements = document.querySelectorAll('[data-pulsedock-monitor]');
    for (var i = 0; i < elements.length; i++) {
      renderWidget(elements[i]);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Auto-refresh every 60 seconds
  setInterval(function () {
    var elements = document.querySelectorAll('[data-pulsedock-monitor]');
    for (var i = 0; i < elements.length; i++) {
      renderWidget(elements[i]);
    }
  }, 60000);
})();
