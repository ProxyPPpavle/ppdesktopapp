
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
  window.sendMessageToAI = function() {
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
      if (mode === 'input') { w = 260; h = 80; }
      else if (mode === 'result') { w = 260; h = 260; } // taller to show debug logs
      else if (mode === 'none') { w = 1; h = 1; }

      try {
        await appWindow.setSize(new LogicalSize(w, h));
      } catch (e) {
        console.warn('[SYNC] setSize greška (možda nedostaju permisije):', e.message);
      }
      
      try {
        await appWindow.setIgnoreCursorEvents(mode === 'none');
      } catch (e) {
        console.warn('[SYNC] setIgnoreCursorEvents greška:', e.message);
      }

      // Delay slightly for size change to reflect in OS
      await new Promise(r => setTimeout(r, 10));

      try {
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

    await syncPosition('hub');
    await appWindow.show();
    await appWindow.setFocus();
  }

  // Toggle Shortcut logic
  listen('show-hub', () => showHub());

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
      console.log('[SHORTCUT] Re-attaching send button listener...');
      attachSendButtonListener();
      aiPrompt.focus();
    }, 200);
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
    resLabel.innerHTML = '<span style="font-size:10px; opacity:0.7;">[ INIT ]</span>';
    stealthResult.style.display = 'block';

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
      resLabel.innerHTML += '<br><span style="font-size:10px; color:#93c5fd;">→ ' + msg + '</span>';
    };
    const dbgErr = (msg) => {
      console.error('[FLOW-ERR]', msg);
      resLabel.innerHTML += '<br><b style="font-size:10px; color:#fca5a5;">❌ ' + msg + '</b>';
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
        console.log('[FLOW]    Odgovor (prvih 100 karaktera):', data.answer.substring(0, 100));
        lastAiResponse = data.answer;
        resLabel.textContent = data.answer;
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

  // Wire: Enter key (without Ctrl) OR Ctrl+Enter in textarea
  function attachEnterKeyListener() {
    const prompt = document.getElementById('ai-prompt');
    if (prompt) {
      console.log('[INIT] aiPrompt pronađen, dodajem Enter listener...');
      prompt.addEventListener('keydown', (e) => {
        console.log('[KEY]', e.key, 'ctrl=', e.ctrlKey, 'shift=', e.shiftKey);
        if (e.key === 'Enter' && !e.shiftKey) {
          console.log('[KEY] Enter pritisnut, šaljem poruku...');
          e.preventDefault();
          const val = prompt.value.trim();
          console.log('[KEY] Trimmed value:', val);
          if (!val) {
            console.warn('[KEY] Prazan prompt, ne šaljem');
            return;
          }
          prompt.value = '';
          console.log('[KEY] Pozivam triggerAI sa:', val);
          triggerAI(val);
        }
      });
      console.log('[INIT] ✅ Enter key listener dodat!');
      return true;
    } else {
      console.error('[INIT] ❌ aiPrompt NOT FOUND for Enter listener!');
      return false;
    }
  }
  
  if (!attachEnterKeyListener()) {
    setTimeout(() => {
      attachEnterKeyListener();
    }, 100);
  }

  // Wire Send button (sendBtn declared at top)
  function attachSendButtonListener() {
    const btn = document.getElementById('sendBtn');
    if (btn) {
      console.log('[INIT] sendBtn pronađen, dodajem listener...');
      // Remove existing listeners by cloning
      const newBtn = btn.cloneNode(true);
      btn.parentNode.replaceChild(newBtn, btn);
      
      newBtn.addEventListener('click', (e) => {
        console.log('[CLICK] ========== SEND BUTTON CLICKED ==========');
        console.log('[CLICK] Event:', e);
        
        // VAŽNO: Pročitaj vrednost PRE nego što se triggerAI pozove!
        const promptEl = document.getElementById('ai-prompt');
        console.log('[CLICK] aiPrompt element:', promptEl);
        
        if (!promptEl) {
          console.error('[CLICK] ❌ ai-prompt element nije pronađen!');
          return;
        }
        
        const val = promptEl.value.trim();
        console.log('[CLICK] Trimmed value:', val);
        
        if (!val) {
          console.warn('[CLICK] Prazan prompt, ne šaljem');
          return;
        }
        
        // Očisti vrednost PRE pozivanja triggerAI
        promptEl.value = '';
        console.log('[CLICK] ✅ Pozivam triggerAI sa:', val);
        triggerAI(val);
      });
      console.log('[INIT] ✅ sendBtn listener uspešno dodat!');
      return true;
    } else {
      console.error('[INIT] ❌ sendBtn NOT FOUND in DOM!');
      return false;
    }
  }
  
  // Try to attach immediately
  if (!attachSendButtonListener()) {
    // If not found, try again after a short delay
    console.log('[INIT] sendBtn nije pronađen, pokušavam ponovo za 100ms...');
    setTimeout(() => {
      if (!attachSendButtonListener()) {
        console.error('[INIT] ❌ sendBtn i dalje nije pronađen nakon 100ms!');
        // Try one more time after DOM is ready
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', () => {
            console.log('[INIT] DOMContentLoaded, pokušavam ponovo...');
            attachSendButtonListener();
          });
        }
      }
    }, 100);
  }

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

  // Event delegation as backup - listen on document for clicks
  document.addEventListener('click', (e) => {
    // Check if clicked element is sendBtn or contains sendBtn
    const clickedBtn = e.target.closest('#sendBtn') || (e.target.id === 'sendBtn' ? e.target : null);
    
    if (clickedBtn) {
      console.log('[DELEGATION] ✅ Send button kliknut preko event delegation!');
      e.stopPropagation(); // Prevent multiple triggers
      e.preventDefault();
      
      // VAŽNO: Pročitaj vrednost PRE nego što se triggerAI pozove!
      const promptEl = document.getElementById('ai-prompt');
      console.log('[DELEGATION] Prompt element:', promptEl);
      
      if (!promptEl) {
        console.error('[DELEGATION] ❌ ai-prompt element nije pronađen!');
        return;
      }
      
      const val = promptEl.value.trim();
      console.log('[DELEGATION] Prompt value:', val);
      
      if (!val) {
        console.warn('[DELEGATION] Prazan prompt!');
        return;
      }
      
      // Očisti vrednost PRE pozivanja triggerAI
      promptEl.value = '';
      console.log('[DELEGATION] ✅ Šaljem:', val);
      triggerAI(val);
    }
  }, true); // Use capture phase to catch all clicks

  // Test function - manually trigger send
  window.testSend = function() {
    console.log('[TEST] testSend pozvan!');
    const promptEl = document.getElementById('ai-prompt');
    const sendBtnEl = document.getElementById('sendBtn');
    const containerEl = document.getElementById('minimal-input-container');
    
    console.log('[TEST] promptEl:', promptEl);
    console.log('[TEST] sendBtnEl:', sendBtnEl);
    console.log('[TEST] containerEl:', containerEl);
    console.log('[TEST] container display:', containerEl ? window.getComputedStyle(containerEl).display : 'N/A');
    console.log('[TEST] container visible:', containerEl ? containerEl.offsetParent !== null : 'N/A');
    
    if (promptEl && promptEl.value.trim()) {
      console.log('[TEST] Pozivam triggerAI direktno...');
      triggerAI(promptEl.value.trim());
    } else {
      console.log('[TEST] Dodajem test tekst...');
      if (promptEl) {
        promptEl.value = 'test pitanje';
        console.log('[TEST] Test tekst dodat, pozivam triggerAI...');
        triggerAI('test pitanje');
      }
    }
  };
  
  console.log('[INIT] Test funkcija dostupna: window.testSend()');

  // Init check
  const startId = localStorage.getItem('clientId');
  if (!startId) {
    console.log('[INIT] Nema Client ID, prikazujem hub');
    showHub();
  } else {
    console.log('[INIT] Client ID postoji, sakrivam prozor');
    syncPosition('none');
  }

  console.log('[INIT] ✅ Svi event listeneri su postavljeni!');
  console.log('[INIT] ⚠️ VAŽNO: Input container je sakriven po defaultu!');
  console.log('[INIT] ⚠️ Pritisni Ctrl+Shift+K da otvoriš input!');
  console.log('[INIT] ⚠️ Ili pozovi window.testSend() u konzoli za test!');
  
  // Final check - test if elements exist and are accessible
  setTimeout(() => {
    const sendBtnEl = document.getElementById('sendBtn');
    const promptEl = document.getElementById('ai-prompt');
    const containerEl = document.getElementById('minimal-input-container');
    
    console.log('[INIT-CHECK] Finalna provera elemenata:');
    console.log('[INIT-CHECK] sendBtn:', sendBtnEl);
    console.log('[INIT-CHECK] sendBtn display:', sendBtnEl ? window.getComputedStyle(sendBtnEl).display : 'N/A');
    console.log('[INIT-CHECK] sendBtn pointer-events:', sendBtnEl ? window.getComputedStyle(sendBtnEl).pointerEvents : 'N/A');
    console.log('[INIT-CHECK] sendBtn visible:', sendBtnEl ? sendBtnEl.offsetParent !== null : 'N/A');
    console.log('[INIT-CHECK] aiPrompt:', promptEl);
    console.log('[INIT-CHECK] container:', containerEl);
    console.log('[INIT-CHECK] container display:', containerEl ? window.getComputedStyle(containerEl).display : 'N/A');
    
    // Try to manually trigger click to test
    if (sendBtnEl) {
      console.log('[INIT-CHECK] Testiram direktan klik na sendBtn...');
      sendBtnEl.onclick = function(e) {
        console.log('[DIRECT-ONCLICK] ✅ Send button kliknut direktno!', e);
        const promptEl = document.getElementById('ai-prompt');
        if (promptEl) {
          const val = promptEl.value.trim();
          if (val) {
            promptEl.value = '';
            triggerAI(val);
          }
        }
      };
      console.log('[INIT-CHECK] ✅ Direktan onclick handler dodat!');
    }
  }, 500);

})();
