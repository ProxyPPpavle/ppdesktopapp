
(function () {
  const { listen } = window.__TAURI__.event;
  const { getCurrentWindow, LogicalSize, LogicalPosition } = window.__TAURI__.window;

  const appWindow = getCurrentWindow();

  // Elements
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

  let lastAiResponse = "";

  /**
   * PUSH EVERYTHING TO THE ABSOLUTE BOTTOM-RIGHT CORNER
   */
  async function syncPosition(mode) {
    try {
      let w = 300, h = 210;
      if (mode === 'input') { w = 260; h = 80; }
      else if (mode === 'result') { w = 260; h = 180; }
      else if (mode === 'none') { w = 1; h = 1; }

      await appWindow.setSize(new LogicalSize(w, h));
      await appWindow.setIgnoreCursorEvents(mode === 'none');

      // Delay slightly for size change to reflect in OS
      await new Promise(r => setTimeout(r, 10));

      let monitor = await appWindow.currentMonitor();
      if (!monitor) monitor = (await appWindow.availableMonitors())[0];

      if (monitor) {
        const factor = monitor.scaleFactor;
        const screenW = monitor.size.width / factor;
        const screenH = monitor.size.height / factor;

        // Positioning: bottom right with a small margin for taskbar
        let posX = screenW - w - 10;
        let posY = screenH - h - 50;

        if (mode === 'none') {
          posX = screenW - 1;
          posY = screenH - 1;
        }

        await appWindow.setPosition(new LogicalPosition(Math.floor(posX), Math.floor(posY)));
      }
    } catch (e) {
      console.error("Sync error:", e);
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

    await syncPosition('hub');
    await appWindow.show();
    await appWindow.setFocus();
  }

  // Toggle Shortcut logic
  listen('show-hub', () => showHub());

  listen('focus-minimal-input', async () => {
    const id = localStorage.getItem('clientId');
    if (!id) { showHub(); return; }

    // Toggle: if open, close
    if (inputContainer.style.display === 'block') {
      inputContainer.style.display = 'none';
      await appWindow.hide();
      await syncPosition('none');
      return;
    }

    hubView.style.display = 'none';
    stealthResult.style.display = 'none';
    inputContainer.style.display = 'block';

    await syncPosition('input'); // Handles ignoreCursorEvents
    await appWindow.show();
    await appWindow.setFocus();
    setTimeout(() => aiPrompt.focus(), 200); // 200ms is safer for focus
  });

  // Hub Buttons - English
  activateBtn.addEventListener('click', async () => {
    const id = clientIdInput.value.trim();
    if (!id) return;
    hubStatus.textContent = "Checking...";
    try {
      // Using Rust backend for consistency
      let invoke = window.__TAURI__.core.invoke || window.__TAURI__.invoke;
      const data = await invoke('refresh_credits', { clientId: id });

      if (data.status === 'success') {
        // ... (existing success logic)
        localStorage.setItem('clientId', id);
        hubStatus.textContent = "Success!";
        hubStatus.style.color = "#10b981";
        const creditsEl = document.getElementById('hub-credits');
        if (creditsEl) creditsEl.textContent = `Credits: ${data.credits}`;
        hubView.classList.add('success-mode');
        setTimeout(() => {
          setupSection.style.display = 'none';
          activeSection.style.display = 'block';
        }, 1200);
      } else {
        hubStatus.textContent = data.message || "Invalid ID.";
        hubStatus.style.color = "#ef4444";
      }
    } catch (err) {
      console.error("Login Failed:", err);
      hubStatus.textContent = "Error: " + (err.message || JSON.stringify(err) || err);
      hubStatus.style.color = "#ef4444";
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

  // AI Workflow - English
  aiPrompt.addEventListener('keydown', async (e) => {
    if (e.ctrlKey && e.key === 'Enter') {
      const val = aiPrompt.value.trim();
      if (!val) return;
      aiPrompt.value = '';
      inputContainer.style.display = 'none';

      stealthResult.classList.remove('fail');
      resLabel.innerHTML = '<span style="font-size:10px; opacity:0.7;">[ INIT ]</span>';
      stealthResult.style.display = 'block';

      await syncPosition('result');
      await appWindow.show();
      await appWindow.setFocus();

      const dbg = (msg) => {
        console.log(msg);
        resLabel.innerHTML += '<br><span style="font-size:10px;">→ ' + msg + '</span>';
        resLabel.scrollTop = resLabel.scrollHeight;
        syncPosition('result');
      };

      try {
        const id = localStorage.getItem('clientId');
        if (!id) throw new Error("Nema Client ID u localStorage!");
        const trimmedId = id.trim();
        dbg('clientId: ' + trimmedId.substring(0, 8) + '...');

        let invoke = null;
        if (window.__TAURI__ && window.__TAURI__.core) invoke = window.__TAURI__.core.invoke;
        else if (window.__TAURI__ && window.__TAURI__.invoke) invoke = window.__TAURI__.invoke;

        if (!invoke) throw new Error("Tauri invoke API nije pronađen!");
        dbg('invoke: OK. Šaljem ask_ai...');

        // Timeout protection for the invoke call
        const responsePromise = invoke('ask_ai', { prompt: val, clientId: trimmedId });
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("TIMEOUT 20s - server ne odgovara")), 20000)
        );

        dbg('Čekam odgovor od servera...');
        const data = await Promise.race([responsePromise, timeoutPromise]);
        dbg('Odgovor primljen! status: ' + data.status);

        if (data.status === 'success' && data.answer) {
          lastAiResponse = data.answer;
          resLabel.textContent = data.answer;
          setTimeout(() => syncPosition('result'), 50);
          refreshCredits(trimmedId);
        } else {
          throw new Error(data.message || 'Server vratio status: ' + data.status);
        }
      } catch (err) {
        console.error("AI Request Failed:", err);
        lastAiResponse = err.toString();
        resLabel.innerHTML += '<br><b style="color:#fca5a5;">❌ ' + (err.message || err) + '</b>';
        stealthResult.classList.add('fail');
        setTimeout(() => syncPosition('result'), 50);
      }
    }
  });

  async function refreshCredits(id) {
    try {
      console.log("Refreshing credits...");
      let invoke = null;
      if (window.__TAURI__ && window.__TAURI__.core) invoke = window.__TAURI__.core.invoke;
      else if (window.__TAURI__ && window.__TAURI__.invoke) invoke = window.__TAURI__.invoke;

      if (!invoke) return;

      const data = await invoke('refresh_credits', { clientId: id.trim() });
      const creditsEl = document.getElementById('hub-credits');
      if (creditsEl && data.status === 'success') {
        creditsEl.textContent = `Credits: ${data.credits}`;
      }
    } catch (e) { console.error("Refresh credits failed", e); }
  }

  stealthResult.addEventListener('click', async (e) => {
    e.stopPropagation(); // Prevent issues
    if (lastAiResponse) {
      resLabel.textContent = "COPYING...";

      let copied = false;
      try {
        const tauri = window.__TAURI__;
        // 1. Try Tauri v2 Clipboard plugin if available on window
        if (tauri && tauri.clipboard) {
          await tauri.clipboard.writeText(lastAiResponse);
          copied = true;
        } else {
          // Fallback to internal plugin call if possible or just navigator
          // But the best is to use the global tauri.core.invoke if we had a rust command for it
          // Let's use navigator.clipboard as it works well in webview if window is focused
          await navigator.clipboard.writeText(lastAiResponse);
          copied = true;
        }
      } catch (err) {
        console.error("Clipboard failed:", err);
        // Nuclear Fallback
        try {
          const textArea = document.createElement("textarea");
          textArea.value = lastAiResponse;
          textArea.style.position = "fixed";
          textArea.style.left = "-9999px";
          textArea.style.top = "0";
          document.body.appendChild(textArea);
          textArea.focus();
          textArea.select();
          document.execCommand('copy');
          document.body.removeChild(textArea);
          copied = true;
        } catch (e) { }
      }

      if (copied) {
        resLabel.textContent = "COPIED!";
      } else {
        resLabel.textContent = "ERROR (C)";
      }

      // Keep "COPIED!" visible for a moment before hiding
      setTimeout(async () => {
        stealthResult.style.display = 'none';
        resLabel.textContent = "Ready";
        await appWindow.hide();
        await syncPosition('none');
      }, 300);
    }
  });

  // Init check
  const startId = localStorage.getItem('clientId');
  if (!startId) {
    showHub();
  } else {
    syncPosition('none');
  }

})();
