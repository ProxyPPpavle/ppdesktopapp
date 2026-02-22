
(function () {
  // === DIAGNOSTIC v6 ===
  console.log('========================================');
  console.log('=== MAIN.JS v6 LOADED ===', new Date().toISOString());
  console.log('========================================');
  console.log('__TAURI__ type:', typeof window.__TAURI__);
  if (window.__TAURI__) {
    console.log('  core.invoke:', typeof window.__TAURI__.core?.invoke);
    console.log('  root.invoke:', typeof window.__TAURI__.invoke);
  }

  // Expose function globally for inline onclick
  window.sendMessageToAI = function () {
    console.log('[GLOBAL-FUNC] sendMessageToAI pozvan!');
    const promptEl = document.getElementById('ai-prompt');

    if (!promptEl) {
      console.error('[GLOBAL-FUNC] ❌ ai-prompt element nije pronađen!');
      return;
    }

    // VAŽNO: Pročitaj vrednost PRE nego što se triggerAI pozove!
    const val = promptEl.value.trim();
    console.log('[GLOBAL-FUNC] Prompt value:', val);

    if (!val) {
      console.warn('[GLOBAL-FUNC] Prazan prompt!');
      return;
    }

    // Očisti vrednost PRE pozivanja triggerAI
    promptEl.value = '';

    if (window.triggerAI) {
      console.log('[GLOBAL-FUNC] ✅ Pozivam triggerAI sa:', val);
      window.triggerAI(val);
    } else {
      console.error('[GLOBAL-FUNC] ❌ triggerAI funkcija ne postoji!');
    }
  };

  const { listen } = window.__TAURI__.event;
  const { getCurrentWindow, LogicalSize, LogicalPosition } = window.__TAURI__.window;

  const appWindow = getCurrentWindow();

  // Elements
  console.log('[INIT] Tražim DOM elemente...');
  const hubView = document.getElementById('hub-view');
  const setupSection = document.getElementById('setup-section');
  const activeSection = document.getElementById('active-section');
  const inputContainer = document.getElementById('minimal-input-container');
  const aiPrompt = document.getElementById('ai-prompt');
  const stealthResult = document.getElementById('stealth-result');
  const resLabel = document.getElementById('res-label');
  const clientIdInput = document.getElementById('clientIdInput');
  const activateBtn = document.getElementById('activateBtn');
  const closeHubBtn = document.getElementById('closeHubBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const hubStatus = document.getElementById('hub-status');
  const sendBtn = document.getElementById('sendBtn');

  console.log('[INIT] DOM elementi:');
  console.log('  hubView:', !!hubView, hubView);
  console.log('  inputContainer:', !!inputContainer, inputContainer);
  console.log('  sendBtn:', !!sendBtn, sendBtn);
  console.log('  aiPrompt:', !!aiPrompt, aiPrompt);
  console.log('  stealthResult:', !!stealthResult, stealthResult);
  console.log('  resLabel:', !!resLabel, resLabel);

  let lastAiResponse = "";

  /**
   * PUSH EVERYTHING TO THE ABSOLUTE BOTTOM-RIGHT CORNER
   */
  async function syncPosition(mode) {
    try {
      let w = 300, h = 210;
      if (mode === 'input') { w = 260; h = 50; }
      else if (mode === 'result') { w = 30; h = 30; }
      else if (mode === 'none') { w = 1; h = 1; }
      else if (mode === 'hub') { w = 260; h = 200; }

      try {
        await appWindow.setSize(new LogicalSize(w, h));
      } catch (e) {
        console.warn('[SYNC] setSize greška:', e.message);
      }

      try {
        await appWindow.setIgnoreCursorEvents(mode === 'none');
      } catch (e) {
        console.warn('[SYNC] setIgnoreCursorEvents greška:', e.message);
      }

      // Important: Wait a bit longer for the OS to register the size change
      await new Promise(r => setTimeout(r, 100));

      try {
        let monitor = await appWindow.currentMonitor();
        if (!monitor) monitor = (await appWindow.availableMonitors())[0];

        if (monitor) {
          const factor = monitor.scaleFactor;
          const screenW = monitor.availableSize.width / factor;
          const screenH = monitor.availableSize.height / factor;

          // Positioning
          let posX = screenW - w;
          let posY = screenH - h;

          if (mode === 'hub') {
            posX = screenW - w;
            posY = screenH - h;
          }

          if (mode === 'none') {
            posX = screenW - 1;
            posY = screenH - 1;
          }

          const finalX = Math.floor(posX);
          const finalY = Math.floor(posY);
          console.log(`[SYNC] Final Window Geometry: Mode=${mode}, Pos=[${finalX}, ${finalY}], Size=[${w}, ${h}]`);

          await appWindow.setPosition(new LogicalPosition(finalX, finalY));
        }
      } catch (e) {
        console.warn('[SYNC] setPosition greška:', e.message);
      }
    } catch (e) {
      console.error("[SYNC] Sync error:", e);
    }
  }

  // HUB Logic
  async function showHub() {
    hubView.style.display = 'block';
    inputContainer.style.display = 'none';
    stealthResult.style.display = 'none';

    const id = localStorage.getItem('clientId');
    if (id) {
      setupSection.style.display = 'none';
      activeSection.style.display = 'block';
      refreshCredits(id);
    } else {
      setupSection.style.display = 'block';
      activeSection.style.display = 'none';
    }

    // Sync position and size BEFORE showing to avoid visual jumps or clipping
    await syncPosition('hub');
    await appWindow.show();
    await appWindow.setFocus();
  }

  // Toggle Shortcut logic
  listen('show-hub', async () => {
    if (hubView.style.display === 'block') {
      hubView.style.display = 'none';
      await appWindow.hide();
      await syncPosition('none');
    } else {
      showHub();
    }
  });

  const closeHubX = document.getElementById('close-hub-x');
  if (closeHubX) {
    closeHubX.addEventListener('click', async () => {
      hubView.style.display = 'none';
      await appWindow.hide();
      await syncPosition('none');
    });
  }

  listen('copy-last-response', async () => {
    console.log('[SHORTCUT] copy-last-response pozvan!');
    if (lastAiResponse) {
      copyToClipboard(lastAiResponse);
      // Flash the button if visible
      if (stealthResult.style.display === 'flex') {
        resLabel.textContent = '✔';
        setTimeout(() => {
          resLabel.textContent = 'C';
          stealthResult.style.display = 'none';
        }, 300);
      }
    }
  });

  listen('focus-minimal-input', async () => {
    console.log('[SHORTCUT] focus-minimal-input pozvan!');
    const id = localStorage.getItem('clientId');
    if (!id) {
      console.log('[SHORTCUT] Nema Client ID, prikazujem hub');
      showHub();
      return;
    }

    // Toggle: if open, close
    if (inputContainer.style.display === 'block') {
      console.log('[SHORTCUT] Container je već otvoren, zatvaram...');
      inputContainer.style.display = 'none';
      await appWindow.hide();
      await syncPosition('none');
      return;
    }

    console.log('[SHORTCUT] Otvaram input container...');
    hubView.style.display = 'none';
    stealthResult.style.display = 'none';
    inputContainer.style.display = 'block';
    console.log('[SHORTCUT] Container display:', inputContainer.style.display);

    await syncPosition('input'); // Handles ignoreCursorEvents
    await appWindow.show();
    await appWindow.setFocus();

    // Re-attach listeners after showing
    setTimeout(() => {
      aiPrompt.focus();
    }, 200);
  });

  // Hub Buttons - English
  activateBtn.addEventListener('click', async () => {
    const id = clientIdInput.value.trim();
    if (!id) return;

    const statusText = document.getElementById('status-text');
    hubStatus.className = 'status-pending';
    if (statusText) statusText.textContent = "Authenticating...";

    try {
      let invoke = window.__TAURI__.core.invoke || window.__TAURI__.invoke;
      const data = await invoke('refresh_credits', { clientId: id });

      if (data.status === 'success') {
        localStorage.setItem('clientId', id);
        hubStatus.className = 'status-active';
        if (statusText) statusText.textContent = "Agent Activated";

        const creditsEl = document.getElementById('hub-credits');
        if (creditsEl) creditsEl.textContent = data.credits;

        hubView.classList.add('success-mode');
        setTimeout(() => {
          setupSection.style.display = 'none';
          activeSection.style.display = 'block';
          hubView.classList.remove('success-mode');
        }, 1200);
      } else {
        hubStatus.className = 'status-error';
        if (statusText) statusText.textContent = data.message || "Invalid ID";
      }
    } catch (err) {
      console.error("Login Failed:", err);
      hubStatus.className = 'status-error';
      if (statusText) statusText.textContent = "Connection Error";
    }
  });

  closeHubBtn.addEventListener('click', async () => {
    hubView.style.display = 'none';
    await appWindow.hide();
    await syncPosition('none');
  });

  logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('clientId');
    setupSection.style.display = 'block';
    activeSection.style.display = 'none';
    hubStatus.textContent = "Logged out.";
    hubStatus.style.color = "";
  });

  // ---- AI core function ----
  // Expose globally for inline onclick
  window.triggerAI = async function triggerAI(val) {
    console.log('========================================');
    console.log('[FLOW] 🚀 KORISNIK JE KLIKNUO SEND!');
    console.log('[FLOW] 📝 Prompt:', val);
    console.log('========================================');

    if (!val) {
      console.warn('[FLOW] ⚠️ Prazan prompt, izlazim');
      return;
    }

    console.log('[FLOW] 1️⃣ Postavljam UI...');
    inputContainer.style.display = 'none';

    stealthResult.classList.remove('fail');
    resLabel.textContent = 'C';
    stealthResult.style.display = 'flex';

    console.log('[FLOW] 2️⃣ Sync pozicije...');
    await syncPosition('result');

    try {
      await appWindow.show();
    } catch (e) {
      console.warn('[FLOW] show() greška (možda nedostaju permisije):', e.message);
    }

    try {
      await appWindow.setFocus();
    } catch (e) {
      console.warn('[FLOW] setFocus() greška:', e.message);
    }

    const dbg = (msg) => {
      console.log('[FLOW-DBG]', msg);
    };
    const dbgErr = (msg) => {
      console.error('[FLOW-ERR]', msg);
    };

    // Step 1: Check localStorage
    console.log('[FLOW] 3️⃣ Proveravam localStorage za Client ID...');
    const id = localStorage.getItem('clientId');
    console.log('[FLOW] ✅ Client ID iz localStorage:', id);
    dbg('clientId: ' + (id ? id.substring(0, 10) + '...' : 'NULL!'));

    if (!id) {
      console.error('[FLOW] ❌ Nema Client ID!');
      dbgErr('Nema Client ID! Otvori hub (Ctrl+Shift+A).');
      stealthResult.classList.add('fail');
      setTimeout(() => syncPosition('result'), 50);
      return;
    }

    // Step 2: Check Tauri invoke
    console.log('[FLOW] 4️⃣ Proveravam Tauri invoke API...');
    console.log('[FLOW]    window.__TAURI__:', !!window.__TAURI__);
    console.log('[FLOW]    window.__TAURI__.core:', !!window.__TAURI__?.core);
    console.log('[FLOW]    window.__TAURI__.core.invoke:', typeof window.__TAURI__?.core?.invoke);
    console.log('[FLOW]    window.__TAURI__.invoke:', typeof window.__TAURI__?.invoke);

    let invoke = null;
    if (window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke) {
      invoke = window.__TAURI__.core.invoke;
      console.log('[FLOW] ✅ Koristim core.invoke');
      dbg('invoke: core.invoke OK');
    } else if (window.__TAURI__ && window.__TAURI__.invoke) {
      invoke = window.__TAURI__.invoke;
      console.log('[FLOW] ✅ Koristim root.invoke');
      dbg('invoke: root.invoke OK');
    } else {
      console.error('[FLOW] ❌ __TAURI__ invoke API ne postoji!');
      dbgErr('__TAURI__ invoke API ne postoji!');
      stealthResult.classList.add('fail');
      setTimeout(() => syncPosition('result'), 50);
      return;
    }

    // Step 3: Call Rust ask_ai
    console.log('[FLOW] 5️⃣ Pozivam Rust ask_ai funkciju...');
    dbg('ask_ai pozvan... cekam...');
    await syncPosition('result');

    try {
      const trimmedId = id.trim();
      const requestData = { prompt: val, clientId: trimmedId };
      console.log('[FLOW] 6️⃣ Šaljem zahtev ka Rust backend-u:');
      console.log('[FLOW]    Request data:', JSON.stringify(requestData, null, 2));
      console.log('[FLOW]    invoke tipa:', typeof invoke);

      dbg('Šaljem zahtev ka Rust backend-u...');
      console.log('[FLOW] 7️⃣ Pozivam invoke("ask_ai", ...)...');
      const responsePromise = invoke('ask_ai', requestData);
      console.log('[FLOW] ✅ Promise kreiran, čekam odgovor od Rust-a...');

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => {
          console.error('[FLOW] ⏱️ TIMEOUT! Rust ne odgovara nakon 60s');
          reject(new Error('TIMEOUT 60s - Rust ne odgovara'));
        }, 60000)
      );

      console.log('[FLOW] 8️⃣ Čekam Promise.race (Rust odgovor ili timeout)...');
      const data = await Promise.race([responsePromise, timeoutPromise]);
      console.log('[FLOW] 9️⃣ ✅ Odgovor primljen od Rust-a!');
      console.log('[FLOW]    Odgovor:', JSON.stringify(data, null, 2));
      dbg('Odgovor primljen! status=' + (data?.status || 'undefined'));

      if (data && data.status === 'success' && data.answer) {
        console.log('[FLOW] ✅✅✅ USPEŠAN ODGOVOR!');
        lastAiResponse = data.answer;
        resLabel.textContent = 'C';
        setTimeout(() => syncPosition('result'), 50);
        console.log('[FLOW] 🔄 Osvežavam kredite...');
        refreshCredits(trimmedId);
      } else {
        console.error('[FLOW] ❌ Neuspešan odgovor:', data);
        dbgErr(data?.message || 'status=' + (data?.status || 'undefined'));
        stealthResult.classList.add('fail');
        setTimeout(() => syncPosition('result'), 50);
      }
    } catch (err) {
      console.error('[FLOW] ❌❌❌ GREŠKA U FLOW-U!');
      console.error('[FLOW]    Error:', err);
      console.error('[FLOW]    Error stack:', err.stack);
      console.error('[FLOW]    Error name:', err.name);
      console.error('[FLOW]    Error message:', err.message);
      lastAiResponse = err.toString();
      dbgErr(err.message || String(err));
      stealthResult.classList.add('fail');
      setTimeout(() => syncPosition('result'), 50);
    }
    console.log('========================================');
    console.log('[FLOW] 🏁 Flow završen');
    console.log('========================================');
  }

  // Wire: Ctrl+Enter OR Ctrl+Shift+Enter in textarea
  function attachEnterKeyListener() {
    const prompt = document.getElementById('ai-prompt');
    if (prompt) {
      prompt.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.shiftKey)) {
          e.preventDefault();
          const val = prompt.value.trim();
          if (!val) return;
          prompt.value = '';
          triggerAI(val);
        }
      });
      return true;
    } else {
      return false;
    }
  }

  if (!attachEnterKeyListener()) {
    setTimeout(() => {
      attachEnterKeyListener();
    }, 100);
  }

  async function refreshCredits(id) {
    try {
      let invoke = window.__TAURI__.core?.invoke || window.__TAURI__.invoke;
      if (!invoke) return;

      const statusText = document.getElementById('status-text');
      const data = await invoke('refresh_credits', { clientId: id.trim() });
      const creditsEl = document.getElementById('hub-credits');

      if (data.status === 'success') {
        if (creditsEl) creditsEl.textContent = data.credits;
        hubStatus.className = 'status-active';
        if (statusText) statusText.textContent = "Agent Active";
      } else {
        hubStatus.className = 'status-error';
        if (statusText) statusText.textContent = "Session Error";
      }
    } catch (e) {
      console.error("Refresh credits failed", e);
    }
  }

  async function copyToClipboard(text) {
    try {
      const tauri = window.__TAURI__;
      if (tauri && tauri.clipboard) {
        await tauri.clipboard.writeText(text);
      } else {
        await navigator.clipboard.writeText(text);
      }
      return true;
    } catch (err) {
      console.error("Clipboard failed:", err);
      try {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        return true;
      } catch (e) {
        return false;
      }
    }
  }

  stealthResult.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (lastAiResponse) {
      await copyToClipboard(lastAiResponse);

      // Hide after copy
      stealthResult.style.display = 'none';
      await appWindow.hide();
      await syncPosition('none');
    }
  });

  // Init check
  const startId = localStorage.getItem('clientId');
  if (!startId) {
    showHub();
  } else {
    syncPosition('none');
  }

  console.log('[INIT] ✅ PP Agent Loaded');
})();
