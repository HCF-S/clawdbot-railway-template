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
  var restartGatewayEl = document.getElementById('restartGateway');

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

  // Pairing
  var pairingFetchEl = document.getElementById('pairingFetch');
  var pairingApproveEl = document.getElementById('pairingApprove');
  var pairingChannelEl = document.getElementById('pairingChannel');
  var pairingCodeEl = document.getElementById('pairingCode');
  var pairingOutEl = document.getElementById('pairingOut');
  var pairingDeviceFetchEl = document.getElementById('pairingDeviceFetch');
  var pairingDeviceApproveEl = document.getElementById('pairingDeviceApprove');
  var deviceListEl = document.getElementById('deviceList');
  var deviceRequestIdEl = document.getElementById('deviceRequestId');
  var channelPairingSection = document.getElementById('channelPairingSection');
  var devicePairingSection = document.getElementById('devicePairingSection');
  var pairingModeButtons = document.querySelectorAll('[data-pairing-mode]');

  // Models
  var modelsFetchEl = document.getElementById('modelsFetch');
  var modelsStatusEl = document.getElementById('modelsStatus');
  var modelSelectEl = document.getElementById('modelSelect');
  var modelInputEl = document.getElementById('modelInput');
  var modelSetEl = document.getElementById('modelSet');
  var modelOutEl = document.getElementById('modelOut');
  var modelsStatusTextEl = document.getElementById('modelsStatusText');
  var channelsSaveEl = document.getElementById('channelsSave');
  var channelsOutEl = document.getElementById('channelsOut');
  var amikoPullEl = document.getElementById('amikoPull');
  var amikoDocsPullEl = document.getElementById('amikoDocsPull');
  var amikoOutEl = document.getElementById('amikoOut');

  // Export
  var exportRunEl = document.getElementById('exportRun');
  var menuItems = document.querySelectorAll('.menu-item');
  var panels = document.querySelectorAll('.panel');
  var sectionKey = 'openclaw_setup_section';
  var menuOnboardingEl = document.getElementById('menuOnboarding');
  var onboardingHeadingEl = document.getElementById('onboardingHeading');
  var initRunEl = document.getElementById('initRun');
  var initLogEl = document.getElementById('initLog');
  var onboardModeButtons = document.querySelectorAll('[data-onboard-mode]');
  var onboardSections = document.querySelectorAll('[data-onboard-section]');

  var tokenKey = 'openclaw_setup_api_token';
  var apiToken = '';

  function setStatus(s) {
    if (statusEl) statusEl.textContent = s;
  }

  function setStatusMeta(s) {
    if (statusMetaEl) statusMetaEl.textContent = s || '';
  }

function showSection(id) {
  for (var i = 0; i < panels.length; i++) {
    var panel = panels[i];
    var match = panel.getAttribute('data-section') === id;
    if (match) panel.removeAttribute('hidden');
    else panel.setAttribute('hidden', 'hidden');
  }
  for (var j = 0; j < menuItems.length; j++) {
    var item = menuItems[j];
    if (item.getAttribute('data-target') === id) {
      item.classList.add('is-active');
    } else {
      item.classList.remove('is-active');
    }
  }
  try { localStorage.setItem(sectionKey, id); } catch (_e) {}
}

  function loadToken() {
    // Check if token is in URL query parameter first
    var urlParams = new URLSearchParams(window.location.search);
    var tokenFromUrl = urlParams.get('token');
    
    if (tokenFromUrl) {
      // Save token from URL to localStorage
      apiToken = tokenFromUrl.trim();
      try {
        localStorage.setItem(tokenKey, apiToken);
        console.log('[setup] Token loaded from URL and saved to localStorage');
        
        // Clean up URL to remove token from browser history
        var cleanUrl = window.location.protocol + '//' + window.location.host + window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
      } catch (_e) {
        // ignore storage errors
      }
      return apiToken;
    }
    
    // Otherwise, try to load from localStorage
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

  function authorizedFetch(url, opts) {
    opts = opts || {};
    opts.credentials = 'same-origin';
    opts.headers = opts.headers || {};
    return ensureToken().then(function () {
      opts.headers['x-api-token'] = apiToken;
      return fetch(url, opts);
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

  function setValue(el, value, force) {
    if (!el) return;
    if (!force && el.value && el.value.trim()) return;
    el.value = value || '';
  }

  function prefillFromConfig(force) {
    return httpJson('/setup/api/prefill', { method: 'GET' }).then(function (j) {
      setValue(document.getElementById('telegramToken'), j.channels && j.channels.telegramToken, force);
      setValue(document.getElementById('discordToken'), j.channels && j.channels.discordToken, force);
      setValue(document.getElementById('slackBotToken'), j.channels && j.channels.slackBotToken, force);
      setValue(document.getElementById('slackAppToken'), j.channels && j.channels.slackAppToken, force);

      if (modelInputEl && j.modelPrimary) {
        setValue(modelInputEl, j.modelPrimary, force);
      }
      if (modelSelectEl && j.modelPrimary) {
        if (force || !modelSelectEl.value) modelSelectEl.value = j.modelPrimary;
      }

      if (j.provider && authGroupEl) {
        authGroupEl.value = j.provider;
        authGroupEl.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (j.authChoice && authChoiceEl) {
        if (force || !authChoiceEl.value) authChoiceEl.value = j.authChoice;
      }
    }).catch(function (_e) {
      // best effort
    });
  }

  function refreshStatus() {
    setStatus('Loading...');
    setStatusMeta(apiToken ? 'API auth saved' : 'API auth missing');
    return httpJson('/setup/api/status').then(function (j) {
    var ver = j.openclawVersion ? (' - OpenClaw ' + j.openclawVersion) : '';
    setStatus((j.configured ? 'Configured' : 'Not configured - run setup below') + ver);
      setStatusMeta(apiToken ? 'API auth saved' : 'API auth missing');
      if (menuOnboardingEl) menuOnboardingEl.textContent = 'Onboard';
      if (onboardingHeadingEl) onboardingHeadingEl.textContent = 'Onboard';
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

  function switchOnboardMode(mode) {
    if (!onboardSections || !onboardModeButtons) return;
    onboardSections.forEach(function (sec) {
      var id = sec.getAttribute('data-onboard-section');
      if (id === mode) sec.removeAttribute('hidden');
      else sec.setAttribute('hidden', 'hidden');
    });
    onboardModeButtons.forEach(function (btn) {
      btn.classList.toggle('is-active', btn.getAttribute('data-onboard-mode') === mode);
    });
  }

  if (onboardModeButtons && onboardModeButtons.length) {
    onboardModeButtons.forEach(function (btn) {
      btn.onclick = function () {
        var mode = btn.getAttribute('data-onboard-mode') || 'full';
        switchOnboardMode(mode);
      };
    });
    switchOnboardMode('full');
  }

  // Run full onboard
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

    if (logEl) {
      logEl.removeAttribute('hidden');
      logEl.textContent = 'Running...\n';
    }

      authorizedFetch('/setup/api/onboard', {
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

  // Run init (plug real OpenRouter key + model)
  if (initRunEl) {
    initRunEl.onclick = function () {
      var payload = {
        authSecret: document.getElementById('initAuthSecret').value,
        model: document.getElementById('initModel').value
      };

      if (!payload.authSecret) {
        alert('Enter an OpenRouter API key (authSecret)');
        return;
      }

      if (initLogEl) {
        initLogEl.removeAttribute('hidden');
        initLogEl.textContent = 'Running init...\n';
      }

      httpJson('/setup/api/init', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(function (j) {
        if (initLogEl) initLogEl.textContent += (j.output || JSON.stringify(j, null, 2));
        return refreshStatus();
      }).catch(function (e) {
        if (initLogEl) initLogEl.textContent += '\nError: ' + String(e) + '\n';
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

  if (pairingFetchEl) {
    pairingFetchEl.onclick = function () {
      var channel = pairingChannelEl ? pairingChannelEl.value : '';
      if (!channel) {
        alert('Select a channel before fetching pairings');
        return;
      }
      if (pairingOutEl) pairingOutEl.textContent = 'Fetching pending pairings for ' + channel + '...\n';
      httpJson('/setup/api/pairing/pending?channel=' + encodeURIComponent(channel), { method: 'GET' }).then(function (j) {
        if (pairingOutEl) pairingOutEl.textContent = (j.output || JSON.stringify(j, null, 2));
      }).catch(function (e) {
        if (pairingOutEl) pairingOutEl.textContent += '\nError: ' + String(e) + '\n';
      });
    };
  }

  function switchPairingMode(mode) {
    if (mode === 'device') {
      pairingModeButtons.forEach(function (btn) {
        btn.classList.toggle('is-active', btn.getAttribute('data-pairing-mode') === 'device');
      });
      if (channelPairingSection) channelPairingSection.classList.add('hidden');
      if (devicePairingSection) devicePairingSection.classList.remove('hidden');
    } else {
      pairingModeButtons.forEach(function (btn) {
        btn.classList.toggle('is-active', btn.getAttribute('data-pairing-mode') === 'channel');
      });
      if (channelPairingSection) channelPairingSection.classList.remove('hidden');
      if (devicePairingSection) devicePairingSection.classList.add('hidden');
    }
  }

  if (pairingModeButtons && pairingModeButtons.length) {
    pairingModeButtons.forEach(function (btn) {
      btn.onclick = function () {
        var mode = btn.getAttribute('data-pairing-mode');
        switchPairingMode(mode);
      };
    });
    switchPairingMode('channel');
  }

  if (pairingDeviceFetchEl) {
    pairingDeviceFetchEl.onclick = function () {
      if (pairingOutEl) pairingOutEl.textContent = 'Fetching pending devices...\n';
      httpJson('/setup/api/devices/list', { method: 'GET' }).then(function (j) {
        var data = parseJsonOutput(j.output || '');
        if (deviceListEl) {
          deviceListEl.innerHTML = '';
          if (data && data.pending && data.pending.length) {
            data.pending.forEach(function (entry) {
              var opt = document.createElement('option');
              opt.value = entry.requestId || (entry.id || '');
              opt.textContent = (entry.requestId || entry.id) + ' — ' + (entry.displayName || entry.deviceId || entry.provider || '');
              deviceListEl.appendChild(opt);
            });
          } else {
            var opt = document.createElement('option');
            opt.value = '';
            opt.textContent = 'No pending devices';
            deviceListEl.appendChild(opt);
          }
        }
        if (modelOutEl) {} // keep consistent
      }).catch(function (e) {
        if (pairingOutEl) pairingOutEl.textContent += '\nError: ' + String(e) + '\n';
      });
    };
  }

  if (pairingDeviceApproveEl) {
    pairingDeviceApproveEl.onclick = function () {
      var requestId = (deviceRequestIdEl && deviceRequestIdEl.value.trim()) || (deviceListEl && deviceListEl.value);
      if (!requestId) {
        alert('Pick or enter a device request ID');
        return;
      }
      if (pairingOutEl) pairingOutEl.textContent = 'Approving device ' + requestId + '...\n';
      authorizedFetch('/setup/api/devices/approve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ requestId: requestId })
      }).then(function (r) { return r.text(); })
        .then(function (t) { if (pairingOutEl) pairingOutEl.textContent += t + '\n'; })
        .catch(function (e) { if (pairingOutEl) pairingOutEl.textContent += 'Error: ' + String(e) + '\n'; });
    };
  }

  if (pairingApproveEl) {
    pairingApproveEl.onclick = function () {
      var channel = pairingChannelEl ? pairingChannelEl.value : '';
      var code = pairingCodeEl ? pairingCodeEl.value : '';
      if (!channel || !code) {
        alert('Channel and pairing code are required');
        return;
      }
      if (pairingOutEl) pairingOutEl.textContent = 'Approving pairing for ' + channel + '...\n';
      authorizedFetch('/setup/api/pairing/approve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ channel: String(channel).trim(), code: String(code).trim() })
      }).then(function (r) { return r.text(); })
        .then(function (t) { if (pairingOutEl) pairingOutEl.textContent += t + '\n'; })
        .catch(function (e) { if (pairingOutEl) pairingOutEl.textContent += 'Error: ' + String(e) + '\n'; });
    };
  }

  if (channelsSaveEl) {
    channelsSaveEl.onclick = function () {
      var payload = {
        telegramToken: document.getElementById('telegramToken').value,
        discordToken: document.getElementById('discordToken').value,
        slackBotToken: document.getElementById('slackBotToken').value,
        slackAppToken: document.getElementById('slackAppToken').value
      };
      if (channelsOutEl) channelsOutEl.textContent = 'Saving channels...\n';
      authorizedFetch('/setup/api/channels/set', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(function (res) { return res.json(); })
        .then(function (data) {
          if (!channelsOutEl) return;
          var lines = [];
          lines.push('ok: ' + Boolean(data.ok));
          if (data.output) {
            lines.push('');
            lines.push(data.output);
          }
          channelsOutEl.textContent = lines.join('\n');
        })
        .catch(function (e) { if (channelsOutEl) channelsOutEl.textContent += 'Error: ' + String(e) + '\n'; });
    };
  }

  function parseJsonOutput(text) {
    try {
      return JSON.parse(text);
    } catch (_e) {
      return null;
    }
  }

  function updateModelStatusDisplay(output, silent) {
    var parsed = parseJsonOutput(output || "");
    var summary = "";
    if (parsed) {
      if (parsed.resolved?.model) summary = parsed.resolved.model;
      else if (parsed.defaultModel) summary = parsed.defaultModel;
      else if (parsed.primary) summary = parsed.primary;
    }
    if (!summary) summary = (output || "").trim();
    if (modelsStatusTextEl) {
      modelsStatusTextEl.textContent = summary ? "Current model: " + summary : "Current model: (unknown)";
    }
    if (!silent && modelOutEl) {
      modelOutEl.textContent = output;
    }
  }

  function loadModelStatus(silent) {
    if (modelsStatusTextEl && !silent) {
      modelsStatusTextEl.textContent = "Fetching current model…";
    }
    if (modelOutEl && !silent) {
      modelOutEl.textContent = "Fetching current model…\n";
    }
    return httpJson("/setup/api/models/status", { method: "GET" })
      .then(function (j) {
        updateModelStatusDisplay(j.output, silent);
      })
      .catch(function (e) {
        if (modelsStatusTextEl) {
          modelsStatusTextEl.textContent = "Current model: (error)";
        }
        if (modelOutEl) {
          modelOutEl.textContent += "\nError: " + String(e) + "\n";
        }
      });
  }

  function renderModels(list) {
    if (!modelSelectEl) return;
    modelSelectEl.innerHTML = '';
    if (!list || !list.length) {
      var opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'No models available';
      modelSelectEl.appendChild(opt);
      return;
    }
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      var id = m.id || m.model || m.name || '';
      if (!id) continue;
      var opt2 = document.createElement('option');
      opt2.value = id;
      opt2.textContent = id + (m.label ? ' — ' + m.label : '');
      modelSelectEl.appendChild(opt2);
    }
  }

  function fetchModelList() {
    if (modelOutEl) modelOutEl.textContent = 'Fetching models...\n';
    return httpJson('/setup/api/models/list', { method: 'GET' })
      .then(function (j) {
        var data = parseJsonOutput(j.output || '');
        if (data && data.models) {
          renderModels(data.models);
          if (modelOutEl) modelOutEl.textContent = 'Loaded ' + data.models.length + ' models.\n';
        } else if (modelOutEl) {
          modelOutEl.textContent = (j.output || JSON.stringify(j, null, 2));
        }
      })
      .catch(function (e) {
        if (modelOutEl) modelOutEl.textContent += '\nError: ' + String(e) + '\n';
      });
  }

  if (modelsFetchEl) {
    modelsFetchEl.onclick = fetchModelList;
  }

  if (modelsStatusEl) {
    modelsStatusEl.onclick = function () {
      loadModelStatus();
    };
  }

  if (modelSetEl) {
    modelSetEl.onclick = function () {
      var model = '';
      if (modelInputEl && modelInputEl.value) model = modelInputEl.value.trim();
      if (!model && modelSelectEl) model = modelSelectEl.value;
      if (!model) {
        alert('Select or enter a model ID');
        return;
      }
      if (modelOutEl) modelOutEl.textContent = 'Setting model to ' + model + '...\n';
      authorizedFetch('/setup/api/models/set', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: model })
      }).then(function (r) { return r.text(); })
        .then(function (t) { if (modelOutEl) modelOutEl.textContent += t + '\n'; })
        .catch(function (e) { if (modelOutEl) modelOutEl.textContent += 'Error: ' + String(e) + '\n'; });
    };
  }

  if (amikoPullEl) {
    amikoPullEl.onclick = function () {
      if (amikoOutEl) amikoOutEl.textContent = 'Pulling from Amiko...\n';
      authorizedFetch('/setup/api/amiko/pull', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({})
      }).then(function (res) {
        return res.text().then(function (t) {
          var j;
          try { j = JSON.parse(t); } catch (_e) { j = { ok: false, error: t }; }
          if (!res.ok || !j.ok) {
            throw new Error(j.error || ('HTTP ' + res.status));
          }
          return j;
        });
      }).then(function (j) {
        if (amikoOutEl) amikoOutEl.textContent = 'Saved: ' + (j.path || 'AMIKO.md') + '\n';
      }).catch(function (e) {
        if (amikoOutEl) amikoOutEl.textContent += '\nError: ' + String(e) + '\n';
      });
    };
  }

  if (amikoDocsPullEl) {
    amikoDocsPullEl.onclick = function () {
      if (amikoOutEl) amikoOutEl.textContent = 'Pulling docs from Amiko...\n';
      authorizedFetch('/setup/api/amiko/docs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ limit: 20, offset: 0 })
      }).then(function (res) {
        return res.text().then(function (t) {
          var j;
          try { j = JSON.parse(t); } catch (_e) { j = { ok: false, error: t }; }
          if (!res.ok || !j.ok) {
            throw new Error(j.error || ('HTTP ' + res.status));
          }
          return j;
        });
      }).then(function (j) {
        if (amikoOutEl) {
          amikoOutEl.textContent = 'Saved ' + j.count + ' docs to: ' + (j.docsDir || 'amiko-docs') + '\n';
          if (j.total) {
            amikoOutEl.textContent += 'Total available: ' + j.total + '\n';
          }
        }
      }).catch(function (e) {
        if (amikoOutEl) amikoOutEl.textContent += '\nError: ' + String(e) + '\n';
      });
    };
  }

  var resetBtn = document.getElementById('reset');
  if (resetBtn) {
    resetBtn.onclick = function () {
      if (!confirm('Reset setup? This deletes the config file so onboarding can run again.')) return;
      if (logEl) {
        logEl.removeAttribute('hidden');
        logEl.textContent = 'Resetting...\n';
      }
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

  if (refreshBtn) {
    refreshBtn.onclick = function () {
      refreshStatus().then(function () {
        prefillFromConfig(true);
        loadModelStatus(true);
        fetchModelList();
      });
    };
  }
  if (authResetBtn) {
    authResetBtn.onclick = function () {
      saveToken('');
      promptForToken();
      refreshStatus();
    };
  }

  if (restartGatewayEl) {
    restartGatewayEl.onclick = function () {
      if (!confirm('Restart gateway?')) return;
      restartGatewayEl.disabled = true;
      restartGatewayEl.textContent = 'Restarting...';
      authorizedFetch('/setup/api/gateway/restart', { method: 'POST' })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          alert(j.output || 'Gateway restart queued');
        })
        .catch(function (e) {
          alert('Gateway restart failed: ' + String(e));
        })
        .finally(function () {
          restartGatewayEl.disabled = false;
          restartGatewayEl.textContent = 'Restart gateway';
        });
    };
  }

  if (menuItems && menuItems.length) {
    for (var m = 0; m < menuItems.length; m++) {
      menuItems[m].onclick = function (e) {
        var target = e.currentTarget && e.currentTarget.getAttribute('data-target');
        if (target) showSection(target);
      };
    }
    var saved = '';
    try { saved = localStorage.getItem(sectionKey) || ''; } catch (_e) {}
    if (saved) showSection(saved);
    else showSection(menuItems[0].getAttribute('data-target'));
  }

  loadToken();
  refreshStatus();
})();
