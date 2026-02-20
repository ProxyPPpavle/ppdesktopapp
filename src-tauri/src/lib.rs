
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
        .timeout(std::time::Duration::from_secs(20)) // Reduced timeout
        .build()
        .map_err(|e| format!("Client initialization failed: {}", e))
}

#[tauri::command(rename_all = "camelCase")]
async fn ask_ai(prompt: String, client_id: String) -> Result<AiResponse, String> {
    println!(">>> ask_ai called with prompt: {} and clientId: {}", prompt, client_id);
    let client = get_client()?;
    let req_body = AiRequest {
        prompt,
        client_id,
        extension_id: "ppbot".to_string(),
    };

    let url = format!("{}/answer-questions", SERVER_URL);
    println!(">>> POSTing to: {}", url);

    let res = client.post(&url)
        .header("Accept", "application/json")
        .header("Content-Type", "application/json")
        .json(&req_body)
        .send()
        .await
        .map_err(|e| {
            println!(">>> Request failed: {}", e);
            format!("Network Request Error: {}", e)
        })?;

    let status = res.status();
    println!(">>> Server status: {}", status);

    if !status.is_success() {
        let text = res.text().await.unwrap_or_else(|_| "Unknown error".to_string());
        println!(">>> Server error response: {}", text);
        return Err(format!("Server returned {}: {}", status, text));
    }

    let data = res.json::<AiResponse>().await.map_err(|e| {
        println!(">>> Parse error: {}", e);
        format!("Failed to parse response: {}", e)
    })?;

    println!(">>> Success! Data received: {:?}", data);
    Ok(data)
}

#[tauri::command(rename_all = "camelCase")]
async fn refresh_credits(client_id: String) -> Result<AiResponse, String> {
    println!(">>> refresh_credits called for clientId: {}", client_id);
    let client = get_client()?;
    let req_body = CreditRequest {
        client_id,
        extension_id: "ppbot".to_string(),
    };

    let url = format!("{}/check-client", SERVER_URL);
    let res = client.post(&url)
        .header("Accept", "application/json")
        .header("Content-Type", "application/json")
        .json(&req_body)
        .send()
        .await
        .map_err(|e| format!("Network error (Status): {}\nPlease verify the server is online.", e))?;

    let status = res.status();
    if !status.is_success() {
        let text = res.text().await.unwrap_or_else(|_| "Unknown error".to_string());
        return Err(format!("Server error ({}): {}", status, text));
    }

    let data = res.json::<AiResponse>().await.map_err(|e| format!("Data error (Status): {}", e))?;
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

                let x = screen_size.width - window_size.width - 20.0;
                let y = screen_size.height - window_size.height - 60.0;

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

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
