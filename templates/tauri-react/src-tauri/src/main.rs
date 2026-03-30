// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Tauri command - callable from JavaScript
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! Welcome to {{projectName}}! 🦀", name)
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running {{projectName}} application");
}
