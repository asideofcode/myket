use tauri::{Manager, window::Color};

#[cfg(target_os = "macos")]
fn configure_macos_pet_window(window: &tauri::WebviewWindow) {
    use objc2_app_kit::{NSColor, NSWindow, NSWindowCollectionBehavior};

    let _ = window.set_background_color(Some(Color(0, 0, 0, 0)));
    let _ = window.set_visible_on_all_workspaces(true);

    let Ok(ns_window) = window.ns_window() else {
        return;
    };
    let ns_window = ns_window as *mut NSWindow;
    unsafe {
        let ns_window = &*ns_window;
        ns_window.setOpaque(false);
        ns_window.setBackgroundColor(Some(&NSColor::clearColor()));
        ns_window.setHasShadow(false);
        // Follow Mission Control Spaces + stay over full-screen apps.
        ns_window.setCollectionBehavior(
            NSWindowCollectionBehavior::CanJoinAllSpaces
                | NSWindowCollectionBehavior::FullScreenAuxiliary
                | NSWindowCollectionBehavior::Stationary,
        );
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let window = app
                .get_webview_window("main")
                .expect("main window missing");

            #[cfg(target_os = "macos")]
            configure_macos_pet_window(&window);

            #[cfg(not(target_os = "macos"))]
            {
                let _ = window.set_background_color(Some(Color(0, 0, 0, 0)));
            }

            let _ = window.set_always_on_top(true);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
