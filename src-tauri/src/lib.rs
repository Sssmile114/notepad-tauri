use std::fs;
use std::path::PathBuf;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};
use tauri_plugin_dialog::DialogExt;

#[derive(serde::Serialize, Clone)]
struct FileData {
    path: String,
    content: String,
    encoding: String,
}

// ---- 编码：UTF-8 优先，失败回退 GBK ----

fn decode_bytes(bytes: &[u8]) -> (String, String) {
    match std::str::from_utf8(bytes) {
        Ok(s) => (s.to_string(), "UTF-8".to_string()),
        Err(_) => {
            let (cow, _, _) = encoding_rs::GBK.decode(bytes);
            (cow.into_owned(), "GBK".to_string())
        }
    }
}

fn encode_text(content: &str, encoding: &str) -> Vec<u8> {
    if encoding == "GBK" {
        let (bytes, _, _) = encoding_rs::GBK.encode(content);
        bytes.into_owned()
    } else {
        content.as_bytes().to_vec()
    }
}

// ---- 文件操作 ----

#[tauri::command]
fn open_file(app: tauri::AppHandle) -> Result<Option<FileData>, String> {
    let picked = app
        .dialog()
        .file()
        .add_filter("文本文件", &["txt", "md", "log", "json", "js", "html", "css", "xml", "ini"])
        .add_filter("所有文件", &["*"])
        .blocking_pick_file();
    let Some(file_path) = picked else {
        return Ok(None);
    };
    let path = file_path.into_path().map_err(|e| e.to_string())?;
    let bytes = fs::read(&path).map_err(|e| e.to_string())?;
    let (content, encoding) = decode_bytes(&bytes);
    Ok(Some(FileData {
        path: path.to_string_lossy().to_string(),
        content,
        encoding,
    }))
}

#[tauri::command]
fn save_file(
    app: tauri::AppHandle,
    content: String,
    path: Option<String>,
    encoding: Option<String>,
) -> Result<Option<FileData>, String> {
    let enc = encoding.unwrap_or_else(|| "UTF-8".to_string());
    let target = match path {
        Some(p) => PathBuf::from(p),
        None => {
            let picked = app
                .dialog()
                .file()
                .add_filter("文本文件", &["txt"])
                .add_filter("所有文件", &["*"])
                .set_file_name("未命名.txt")
                .blocking_save_file();
            let Some(fp) = picked else {
                return Ok(None);
            };
            fp.into_path().map_err(|e| e.to_string())?
        }
    };
    let bytes = encode_text(&content, &enc);
    fs::write(&target, bytes).map_err(|e| e.to_string())?;
    Ok(Some(FileData {
        path: target.to_string_lossy().to_string(),
        content,
        encoding: enc,
    }))
}

#[tauri::command]
fn open_path(path: String) -> Result<Option<FileData>, String> {
    let pb = PathBuf::from(path);
    if !pb.exists() {
        return Ok(None);
    }
    let bytes = fs::read(&pb).map_err(|e| e.to_string())?;
    let (content, encoding) = decode_bytes(&bytes);
    Ok(Some(FileData {
        path: pb.to_string_lossy().to_string(),
        content,
        encoding,
    }))
}

// ---- 置顶 ----

#[tauri::command]
fn toggle_always_on_top(window: tauri::Window) -> Result<bool, String> {
    let current = window.is_always_on_top().map_err(|e| e.to_string())?;
    let next = !current;
    window.set_always_on_top(next).map_err(|e| e.to_string())?;
    Ok(next)
}

#[tauri::command]
fn get_always_on_top(window: tauri::Window) -> Result<bool, String> {
    window.is_always_on_top().map_err(|e| e.to_string())
}

// ---- 自动保存 ----

fn autosave_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("autosave.txt"))
}

#[tauri::command]
fn autosave(app: tauri::AppHandle, content: String) -> Result<(), String> {
    let path = autosave_path(&app)?;
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    fs::write(path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn load_autosave(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let path = autosave_path(&app)?;
    if !path.exists() {
        return Ok(None);
    }
    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    let (content, _) = decode_bytes(&bytes);
    Ok(Some(content))
}

#[tauri::command]
fn clear_autosave(app: tauri::AppHandle) -> Result<(), String> {
    let path = autosave_path(&app)?;
    if path.exists() {
        fs::remove_file(path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ---- 最近文件 ----

fn recent_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("recent.json"))
}

#[tauri::command]
fn add_recent(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let p = recent_path(&app)?;
    let mut list: Vec<String> = if p.exists() {
        let s = fs::read_to_string(&p).map_err(|e| e.to_string())?;
        serde_json::from_str(&s).unwrap_or_default()
    } else {
        vec![]
    };
    list.retain(|x| x != &path);
    list.insert(0, path);
    list.truncate(10);
    if let Some(dir) = p.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string(&list).map_err(|e| e.to_string())?;
    fs::write(&p, json).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_recent(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    let p = recent_path(&app)?;
    if !p.exists() {
        return Ok(vec![]);
    }
    let s = fs::read_to_string(&p).map_err(|e| e.to_string())?;
    Ok(serde_json::from_str(&s).unwrap_or_default())
}

// ---- 关闭（隐藏到托盘）----

#[tauri::command]
fn hide_window(window: tauri::Window) {
    let _ = window.hide();
}

// ---- 托盘图标（运行时生成纯色方块，避免编译期依赖图标文件）----

fn make_tray_icon() -> tauri::image::Image<'static> {
    const SIZE: usize = 32;
    let mut rgba = vec![0u8; SIZE * SIZE * 4];
    for y in 0..SIZE {
        for x in 0..SIZE {
            let i = (y * SIZE + x) * 4;
            rgba[i] = 0x00;
            rgba[i + 1] = 0x78;
            rgba[i + 2] = 0xd4;
            rgba[i + 3] = 0xff;
        }
    }
    tauri::image::Image::new_owned(rgba, SIZE as u32, SIZE as u32)
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(|app| {
            let show_i = MenuItem::with_id(app, "show", "显示记事本", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

            TrayIconBuilder::new()
                .icon(make_tray_icon())
                .tooltip("记事本")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                })
                .build(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            open_file,
            save_file,
            open_path,
            toggle_always_on_top,
            get_always_on_top,
            autosave,
            load_autosave,
            clear_autosave,
            add_recent,
            get_recent,
            hide_window
        ])
        .on_window_event(|window, event| {
            match event {
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    api.prevent_close();
                    let _ = window.emit("close-requested", ());
                }
                tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Drop { paths, .. }) => {
                    if let Some(p) = paths.first() {
                        if let Ok(bytes) = fs::read(p) {
                            let (content, encoding) = decode_bytes(&bytes);
                            let _ = window.emit(
                                "file-dropped",
                                FileData {
                                    path: p.to_string_lossy().to_string(),
                                    content,
                                    encoding,
                                },
                            );
                        }
                    }
                }
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
