
use tauri::{
    tray::TrayIconBuilder,
    menu::{Menu, MenuItem},
    Manager,
    Emitter,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct AiResponse {
    status: String,
    answer: Option<String>,
    message: Option<String>,
    credits: Option<i32>,
    #[serde(rename = "accountType")]
    account_type: Option<String>,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
struct AiRequest {
    prompt: String,
    client_id: String,
    extension_id: String,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
struct CreditRequest {
    client_id: String,
    extension_id: String,
}

const SERVER_URL: &str = "https://pp-server-eight.vercel.app";

fn get_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .timeout(std::time::Duration::from_secs(60)) // Increased timeout for AI responses
        .danger_accept_invalid_certs(false) // Ensure SSL verification
        .build()
        .map_err(|e| format!("Client initialization failed: {}", e))
}

#[tauri::command]
async fn ask_ai(prompt: String, client_id: String) -> Result<AiResponse, String> {
    println!("========================================");
    println!("[RUST] 🦀 ask_ai FUNKCIJA POZVANA!");
    println!("[RUST] 📝 Prompt: {}", prompt);
    println!("[RUST] 🆔 Client ID: {}", client_id);
    println!("========================================");
    
    println!("[RUST] 1️⃣ Kreiranje HTTP klijenta...");
    let client = get_client().map_err(|e| {
        println!("[RUST] ❌ Greška pri kreiranju klijenta: {}", e);
        e
    })?;
    println!("[RUST] ✅ HTTP klijent kreiran");
    
    let req_body = AiRequest {
        prompt: prompt.clone(),
        client_id: client_id.clone(),
        extension_id: "ppbot".to_string(),
    };

    let url = format!("{}/answer-questions", SERVER_URL);
    println!("[RUST] 2️⃣ Priprema zahteva ka serveru...");
    println!("[RUST]    URL: {}", url);
    let req_body_json = serde_json::to_string(&req_body).unwrap_or_default();
    println!("[RUST]    Request body: {}", req_body_json);

    println!("[RUST] 3️⃣ Slanje POST zahteva ka serveru...");
    let res = client.post(&url)
        .header("Accept", "application/json")
        .header("Content-Type", "application/json")
        .json(&req_body)
        .send()
        .await
        .map_err(|e| {
            println!("[RUST] ❌ Zahtev ka serveru neuspešan: {}", e);
            format!("Network Request Error: {}", e)
        })?;

    let status = res.status();
    println!("[RUST] 4️⃣ Odgovor primljen od servera!");
    println!("[RUST]    Status: {} {}", status.as_u16(), status.as_str());

    // Read raw response text first for debugging
    println!("[RUST] 5️⃣ Čitanje raw odgovora...");
    let raw_text = res.text().await.map_err(|e| {
        println!("[RUST] ❌ Greška pri čitanju odgovora: {}", e);
        format!("Failed to read response: {}", e)
    })?;
    
    println!("[RUST] ✅ Raw server response:");
    println!("[RUST] {}", raw_text);

    if !status.is_success() {
        println!("[RUST] ❌ Server je vratio grešku!");
        println!("[RUST]    Status: {}", status);
        println!("[RUST]    Response: {}", raw_text);
        return Err(format!("Server returned {}: {}", status, raw_text));
    }

    // Try to parse the response
    println!("[RUST] 6️⃣ Parsiranje JSON odgovora...");
    let data: AiResponse = serde_json::from_str(&raw_text).map_err(|e| {
        println!("[RUST] ❌ Greška pri parsiranju JSON-a: {}", e);
        println!("[RUST]    Response koji nije mogao da se parsira: {}", raw_text);
        format!("Failed to parse response: {}. Raw: {}", e, raw_text)
    })?;

    println!("[RUST] ✅✅✅ USPEŠNO PARSIRAN ODGOVOR!");
    println!("[RUST]    Status: {}", data.status);
    if let Some(ref answer) = data.answer {
        println!("[RUST]    Answer (prvih 100 karaktera): {}", &answer.chars().take(100).collect::<String>());
    }
    println!("========================================");
    Ok(data)
}

#[tauri::command]
async fn refresh_credits(client_id: String) -> Result<AiResponse, String> {
    println!(">>> refresh_credits called for clientId: {}", client_id);
    let client = get_client()?;
    let req_body = CreditRequest {
        client_id,
        extension_id: "ppbot".to_string(),
    };

    let url = format!("{}/check-client", SERVER_URL);
    println!(">>> POSTing to: {}", url);
    
    let res = client.post(&url)
        .header("Accept", "application/json")
        .header("Content-Type", "application/json")
        .json(&req_body)
        .send()
        .await
        .map_err(|e| {
            println!(">>> Request failed: {}", e);
            format!("Network error (Status): {}\nPlease verify the server is online.", e)
        })?;

    let status = res.status();
    println!(">>> Server status: {}", status);
    
    // Read raw response text first for debugging
    let raw_text = res.text().await.map_err(|e| {
        println!(">>> Failed to read response text: {}", e);
        format!("Failed to read response: {}", e)
    })?;
    
    println!(">>> Raw server response: {}", raw_text);
    
    if !status.is_success() {
        println!(">>> Server error response: {}", raw_text);
        return Err(format!("Server error ({}): {}", status, raw_text));
    }

    // Try to parse the response
    let data: AiResponse = serde_json::from_str(&raw_text).map_err(|e| {
        println!(">>> Parse error: {}", e);
        println!(">>> Response that failed to parse: {}", raw_text);
        format!("Data error (Status): {}. Raw: {}", e, raw_text)
    })?;
    
    println!(">>> Credits refreshed: {:?}", data);
    Ok(data)
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![ask_ai, refresh_credits])
        .setup(|app| {
            // Get main window
            let window = app.get_webview_window("main").unwrap();

            // Initial positioning to bottom-right
            if let Some(monitor) = window.primary_monitor().unwrap() {
                let monitor_size = monitor.size();
                let scale_factor = monitor.scale_factor();
                
                // Get window size (logical)
                let window_size = window.outer_size().unwrap().to_logical::<f64>(scale_factor);
                let screen_size = monitor_size.to_logical::<f64>(scale_factor);

                let x = screen_size.width - window_size.width;
                let y = screen_size.height - window_size.height;

                let _ = window.set_position(tauri::LogicalPosition::new(x, y));
            }

            // Tray Menu
            let quit_i = MenuItem::with_id(app, "quit", "Exit PP Agent 7", true, None::<&str>)?;
            let settings_i = MenuItem::with_id(app, "settings", "Settings / Login", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&settings_i, &quit_i])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(move |app_handle, event| {
                    match event.id.as_ref() {
                        "quit" => { app_handle.exit(0); }
                        "settings" => {
                             if let Some(window) = app_handle.get_webview_window("main") {
                                let _ = window.emit("show-hub", "");
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        _ => {}
                    }
                })
                .build(app)?;

            // Shortcut: Ctrl + Shift + A (Open/Close Setup Window)
            let shortcut_a = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyA);
            app.global_shortcut().on_shortcut(shortcut_a, move |app_handle, _shortcut, event| {
                if event.state() == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                    if let Some(window) = app_handle.get_webview_window("main") {
                        let _ = window.emit("show-hub", "");
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            })?;

            // Shortcut: Ctrl + Shift + K (Focus Minimal AI Input)
            let shortcut_k = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyK);
            app.global_shortcut().on_shortcut(shortcut_k, move |app_handle, _shortcut, event| {
                if event.state() == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                    if let Some(window) = app_handle.get_webview_window("main") {
                        let _ = window.emit("focus-minimal-input", "");
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            })?;

            // Shortcut: Ctrl + Shift + X (Copy last AI response)
            let shortcut_x = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyX);
            app.global_shortcut().on_shortcut(shortcut_x, move |app_handle, _shortcut, event| {
                if event.state() == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                    if let Some(window) = app_handle.get_webview_window("main") {
                        let _ = window.emit("copy-last-response", "");
                    }
                }
            })?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
