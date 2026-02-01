// Served at /setup/app.js
// No fancy syntax: keep it maximally compatible.

(function () {
  var statusEl = document.getElementById('status');
  var statusMetaEl = document.getElementById('statusMeta');
  var authGroupEl = document.getElementById('authGroup');
  var authChoiceEl = document.getElementById('authChoice');
  var logEl = document.getElementById('log');
  var refreshBtn = document.getElementById('refreshStatus');
  var authResetBtn = document.getElementById('authReset');

  // Debug console
  var consoleCmdEl = document.getElementById('consoleCmd');
  var consoleArgEl = document.getElementById('consoleArg');
  var consoleRunEl = document.getElementById('consoleRun');
  var consoleOutEl = document.getElementById('consoleOut');

  // Config editor
  var configPathEl = document.getElementById('configPath');
  var configTextEl = document.getElementById('configText');
  var configReloadEl = document.getElementById('configReload');
  var configSaveEl = document.getElementById('configSave');
  var configOutEl = document.getElementById('configOut');

  // Import
  var importFileEl = document.getElementById('importFile');
  var importRunEl = document.getElementById('importRun');
  var importOutEl = document.getElementById('importOut');

  // Export
  var exportRunEl = document.getElementById('exportRun');

  var tokenKey = 'openclaw_setup_api_token';
  var apiToken = '';

  function setStatus(s) {
    if (statusEl) statusEl.textContent = s;
  }

  function setStatusMeta(s) {
    if (statusMetaEl) statusMetaEl.textContent = s || '';
  }

  function loadToken() {
    try {
      apiToken = localStorage.getItem(tokenKey) || '';
    } catch (_e) {
      apiToken = '';
    }
    return apiToken;
  }

  function saveToken(t) {
    apiToken = t || '';
    try {
      if (apiToken) localStorage.setItem(tokenKey, apiToken);
      else localStorage.removeItem(tokenKey);
    } catch (_e) {
      // ignore
    }
  }

  function promptForToken() {
    var t = window.prompt('Enter API token (SETUP_PASSWORD):', apiToken || '');
    if (t && String(t).trim()) {
      saveToken(String(t).trim());
      return apiToken;
    }
    return '';
  }

  function ensureToken() {
    if (apiToken) return Promise.resolve(apiToken);
    loadToken();
    if (apiToken) return Promise.resolve(apiToken);
    var t = promptForToken();
    if (!t) return Promise.reject(new Error('Missing API token'));
    return Promise.resolve(t);
  }

  function authorizedFetch(url, opts, retried) {
    opts = opts || {};
    opts.credentials = 'same-origin';
    opts.headers = opts.headers || {};
    return ensureToken().then(function () {
      opts.headers['x-api-token'] = apiToken;
      return fetch(url, opts);
    }).then(function (res) {
      if (res.status === 401 && !retried) {
        saveToken('');
        promptForToken();
        return authorizedFetch(url, opts, true);
      }
      return res;
    });
  }

  function httpJson(url, opts) {
    opts = opts || {};
    return authorizedFetch(url, opts).then(function (res) {
      if (!res.ok) {
        return res.text().then(function (t) {
          throw new Error('HTTP ' + res.status + ': ' + (t || res.statusText));
        });
      }
      return res.json();
    });
  }

  function renderAuth(groups) {
    if (!authGroupEl || !authChoiceEl) return;
    authGroupEl.innerHTML = '';
    for (var i = 0; i < groups.length; i++) {
      var g = groups[i];
      var opt = document.createElement('option');
      opt.value = g.value;
      opt.textContent = g.label + (g.hint ? ' - ' + g.hint : '');
      authGroupEl.appendChild(opt);
    }

    authGroupEl.onchange = function () {
      var sel = null;
      for (var j = 0; j < groups.length; j++) {
        if (groups[j].value === authGroupEl.value) sel = groups[j];
      }
      authChoiceEl.innerHTML = '';
      var opts = (sel && sel.options) ? sel.options : [];
      for (var k = 0; k < opts.length; k++) {
        var o = opts[k];
        var opt2 = document.createElement('option');
        opt2.value = o.value;
        opt2.textContent = o.label + (o.hint ? ' - ' + o.hint : '');
        authChoiceEl.appendChild(opt2);
      }
    };

    authGroupEl.onchange();
  }

  function refreshStatus() {
    setStatus('Loading...');
    setStatusMeta(apiToken ? 'API auth saved' : 'API auth missing');
    return httpJson('/setup/api/status').then(function (j) {
      var ver = j.openclawVersion ? (' | ' + j.openclawVersion) : '';
      setStatus((j.configured ? 'Configured - open /openclaw' : 'Not configured - run setup below') + ver);
      setStatusMeta(apiToken ? 'API auth saved' : 'API auth missing');
      renderAuth(j.authGroups || []);
      if (j.channelsAddHelp && j.channelsAddHelp.indexOf('telegram') === -1) {
        if (logEl) logEl.textContent += '\nNote: this openclaw build does not list telegram in `channels add --help`. Telegram auto-add will be skipped.\n';
      }

      if (configReloadEl && configTextEl) {
        loadConfigRaw();
      }
    }).catch(function (e) {
      setStatus('Error: ' + String(e));
    });
  }

  // Run onboarding
  var runBtn = document.getElementById('run');
  if (runBtn) {
    runBtn.onclick = function () {
      var payload = {
        flow: document.getElementById('flow').value,
        authChoice: authChoiceEl.value,
        authSecret: document.getElementById('authSecret').value,
        telegramToken: document.getElementById('telegramToken').value,
        discordToken: document.getElementById('discordToken').value,
        slackBotToken: document.getElementById('slackBotToken').value,
        slackAppToken: document.getElementById('slackAppToken').value
      };

      if (logEl) logEl.textContent = 'Running...\n';

      authorizedFetch('/setup/api/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(function (res) {
        return res.text();
      }).then(function (text) {
        var j;
        try { j = JSON.parse(text); } catch (_e) { j = { ok: false, output: text }; }
        if (logEl) logEl.textContent += (j.output || JSON.stringify(j, null, 2));
        return refreshStatus();
      }).catch(function (e) {
        if (logEl) logEl.textContent += '\nError: ' + String(e) + '\n';
      });
    };
  }

  // Debug console runner
  function runConsole() {
    if (!consoleCmdEl || !consoleRunEl) return;
    var cmd = consoleCmdEl.value;
    var arg = consoleArgEl ? consoleArgEl.value : '';
    if (consoleOutEl) consoleOutEl.textContent = 'Running ' + cmd + '...\n';

    return httpJson('/setup/api/console/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cmd: cmd, arg: arg })
    }).then(function (j) {
      if (consoleOutEl) consoleOutEl.textContent = (j.output || JSON.stringify(j, null, 2));
      return refreshStatus();
    }).catch(function (e) {
      if (consoleOutEl) consoleOutEl.textContent += '\nError: ' + String(e) + '\n';
    });
  }

  if (consoleRunEl) {
    consoleRunEl.onclick = runConsole;
  }

  // Config raw load/save
  function loadConfigRaw() {
    if (!configTextEl) return;
    if (configOutEl) configOutEl.textContent = '';
    return httpJson('/setup/api/config/raw').then(function (j) {
      if (configPathEl) {
        configPathEl.textContent = 'Config file: ' + (j.path || '(unknown)') + (j.exists ? '' : ' (does not exist yet)');
      }
      configTextEl.value = j.content || '';
    }).catch(function (e) {
      if (configOutEl) configOutEl.textContent = 'Error loading config: ' + String(e);
    });
  }

  function saveConfigRaw() {
    if (!configTextEl) return;
    if (!confirm('Save config and restart gateway? A timestamped .bak backup will be created.')) return;
    if (configOutEl) configOutEl.textContent = 'Saving...\n';
    return httpJson('/setup/api/config/raw', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: configTextEl.value })
    }).then(function (j) {
      if (configOutEl) configOutEl.textContent = 'Saved: ' + (j.path || '') + '\nGateway restarted.\n';
      return refreshStatus();
    }).catch(function (e) {
      if (configOutEl) configOutEl.textContent += '\nError: ' + String(e) + '\n';
    });
  }

  if (configReloadEl) configReloadEl.onclick = loadConfigRaw;
  if (configSaveEl) configSaveEl.onclick = saveConfigRaw;

  // Import backup
  function runImport() {
    if (!importRunEl || !importFileEl) return;
    var f = importFileEl.files && importFileEl.files[0];
    if (!f) {
      alert('Pick a .tar.gz file first');
      return;
    }
    if (!confirm('Import backup? This overwrites files under /data and restarts the gateway.')) return;

    if (importOutEl) importOutEl.textContent = 'Uploading ' + f.name + ' (' + f.size + ' bytes)...\n';

    return f.arrayBuffer().then(function (buf) {
      return authorizedFetch('/setup/import', {
        method: 'POST',
        headers: { 'content-type': 'application/gzip' },
        body: buf
      });
    }).then(function (res) {
      return res.text().then(function (t) {
        if (importOutEl) importOutEl.textContent += t + '\n';
        if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + t);
        return refreshStatus();
      });
    }).catch(function (e) {
      if (importOutEl) importOutEl.textContent += '\nError: ' + String(e) + '\n';
    });
  }

  if (importRunEl) importRunEl.onclick = runImport;

  // Pairing approve helper
  var pairingBtn = document.getElementById('pairingApprove');
  if (pairingBtn) {
    pairingBtn.onclick = function () {
      var channel = prompt('Enter channel (telegram or discord):');
      if (!channel) return;
      channel = channel.trim().toLowerCase();
      if (channel !== 'telegram' && channel !== 'discord') {
        alert('Channel must be "telegram" or "discord"');
        return;
      }
      var code = prompt('Enter pairing code (e.g. 3EY4PUYS):');
      if (!code) return;
      if (logEl) logEl.textContent += '\nApproving pairing for ' + channel + '...\n';
      authorizedFetch('/setup/api/pairing/approve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ channel: channel, code: code.trim() })
      }).then(function (r) { return r.text(); })
        .then(function (t) { if (logEl) logEl.textContent += t + '\n'; })
        .catch(function (e) { if (logEl) logEl.textContent += 'Error: ' + String(e) + '\n'; });
    };
  }

  var resetBtn = document.getElementById('reset');
  if (resetBtn) {
    resetBtn.onclick = function () {
      if (!confirm('Reset setup? This deletes the config file so onboarding can run again.')) return;
      if (logEl) logEl.textContent = 'Resetting...\n';
      authorizedFetch('/setup/api/reset', { method: 'POST' })
        .then(function (res) { return res.text(); })
        .then(function (t) { if (logEl) logEl.textContent += t + '\n'; return refreshStatus(); })
        .catch(function (e) { if (logEl) logEl.textContent += 'Error: ' + String(e) + '\n'; });
    };
  }

  // Export backup
  function runExport() {
    if (!exportRunEl) return;
    exportRunEl.disabled = true;
    exportRunEl.textContent = 'Preparing...';
    return authorizedFetch('/setup/export', { method: 'GET' }).then(function (res) {
      if (!res.ok) {
        return res.text().then(function (t) {
          throw new Error('HTTP ' + res.status + ': ' + (t || res.statusText));
        });
      }
      var filename = 'openclaw-backup.tar.gz';
      var dispo = res.headers.get('content-disposition') || '';
      var match = /filename="([^"]+)"/.exec(dispo);
      if (match && match[1]) filename = match[1];
      return res.blob().then(function (blob) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(function () {
          URL.revokeObjectURL(url);
          a.remove();
        }, 0);
      });
    }).catch(function (e) {
      alert('Export failed: ' + String(e));
    }).finally(function () {
      exportRunEl.disabled = false;
      exportRunEl.textContent = 'Download backup';
    });
  }

  if (exportRunEl) exportRunEl.onclick = runExport;

  if (refreshBtn) refreshBtn.onclick = refreshStatus;
  if (authResetBtn) {
    authResetBtn.onclick = function () {
      saveToken('');
      promptForToken();
      refreshStatus();
    };
  }

  loadToken();
  refreshStatus();
})();
