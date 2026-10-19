//! Presentation is separate from the stable JSON envelope and backend execution.

use std::io::{self, Write};

use serde_json::Value;

use crate::core::{self, BackendError};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum OutputMode {
    Text,
    Json,
    Pretty,
}

/// Explicit formats work identically in terminals and pipes. Auto keeps redirected
/// operation results machine-readable while making an interactive terminal readable.
pub fn resolve_mode(format: &str, json: bool, stdout_is_terminal: bool) -> OutputMode {
    if json {
        return OutputMode::Json;
    }
    match format {
        "text" => OutputMode::Text,
        "json" => OutputMode::Json,
        "pretty" => OutputMode::Pretty,
        _ if stdout_is_terminal => OutputMode::Text,
        _ => OutputMode::Json,
    }
}

/// Success belongs to stdout and failure belongs to stderr, in every format.
pub fn emit(ok: bool, data: Option<Value>, error: Option<BackendError>, mode: OutputMode) -> i32 {
    let (value, exit_code) = core::envelope(ok, data, error);
    write_text(&render(&value, mode), ok, exit_code)
}

/// Help and version use the same pipe-safe writer as operation results.
pub fn write_text(text: &str, success: bool, exit_code: i32) -> i32 {
    let mut text = text.to_owned();
    if !text.ends_with('\n') {
        text.push('\n');
    }
    let written = if success {
        io::stdout().lock().write_all(text.as_bytes())
    } else {
        io::stderr().lock().write_all(text.as_bytes())
    };
    match written {
        // A downstream consumer may stop once it has the records it needs.
        Ok(()) => exit_code,
        Err(error) if error.kind() == io::ErrorKind::BrokenPipe => exit_code,
        Err(error) => {
            let _ = writeln!(io::stderr().lock(), "无法写入命令输出: {error}");
            if exit_code == 0 {
                1
            } else {
                exit_code
            }
        }
    }
}

pub fn render(envelope: &Value, mode: OutputMode) -> String {
    match mode {
        OutputMode::Json => serde_json::to_string(envelope).expect("serialize envelope"),
        OutputMode::Pretty => serde_json::to_string_pretty(envelope).expect("serialize envelope"),
        OutputMode::Text if envelope.get("ok").and_then(Value::as_bool) == Some(true) => {
            render_success(envelope.get("data"))
        }
        OutputMode::Text => render_error(envelope),
    }
}

fn render_success(data: Option<&Value>) -> String {
    let Some(data) = data else {
        return "完成".into();
    };
    if let Some(markdown) = data.get("markdown").and_then(Value::as_str) {
        return markdown.into();
    }
    // codeflow.read returns source in content. Do not indent or JSON-escape source.
    if let Some(content) = data.get("content").and_then(Value::as_str) {
        return content.into();
    }
    let mut lines = Vec::new();
    render_value(data, 0, &mut lines);
    lines.join("\n")
}

fn render_value(value: &Value, indent: usize, lines: &mut Vec<String>) {
    let padding = " ".repeat(indent);
    match value {
        Value::Object(fields) if fields.is_empty() => lines.push(format!("{padding}(空)")),
        Value::Object(fields) => {
            for (key, value) in fields {
                if is_single_line(value) {
                    lines.push(format!("{padding}{key}: {}", scalar(value)));
                } else {
                    lines.push(format!("{padding}{key}:"));
                    render_value(value, indent + 2, lines);
                }
            }
        }
        Value::Array(items) if items.is_empty() => lines.push(format!("{padding}(无)")),
        Value::Array(items) => {
            if let Some(table) = render_table(items, &padding) {
                lines.extend(table);
                return;
            }
            for (index, item) in items.iter().enumerate() {
                if is_single_line(item) {
                    lines.push(format!("{padding}- {}", scalar(item)));
                } else {
                    lines.push(format!("{padding}[{}]", index + 1));
                    render_value(item, indent + 2, lines);
                }
            }
        }
        Value::String(text) => {
            for line in text.lines() {
                lines.push(format!("{padding}{line}"));
            }
            if text.is_empty() {
                lines.push(padding);
            }
        }
        value => lines.push(format!("{padding}{}", scalar(value))),
    }
}

/// Compact rectangular data gets a table; nested or lengthy rows use the object
/// tree instead. No result is truncated to fit a terminal.
fn render_table(items: &[Value], padding: &str) -> Option<Vec<String>> {
    let first = items.first()?.as_object()?;
    if first.is_empty() || first.len() > 6 {
        return None;
    }
    let keys: Vec<&str> = first.keys().map(String::as_str).collect();
    let mut rows = Vec::new();
    for item in items {
        let object = item.as_object()?;
        if object.len() != keys.len() || !keys.iter().all(|key| object.contains_key(*key)) {
            return None;
        }
        let mut row = Vec::new();
        for key in &keys {
            let value = &object[*key];
            if !is_single_line(value) {
                return None;
            }
            let cell = scalar(value);
            if cell.contains('|') || cell.chars().count() > 72 {
                return None;
            }
            row.push(cell);
        }
        rows.push(row.join(" | "));
    }
    let mut table = vec![
        format!("{padding}{}", keys.join(" | ")),
        format!("{padding}{}", vec!["---"; keys.len()].join(" | ")),
    ];
    table.extend(rows.into_iter().map(|row| format!("{padding}{row}")));
    Some(table)
}

fn is_single_line(value: &Value) -> bool {
    match value {
        Value::Array(_) | Value::Object(_) => false,
        Value::String(text) => !text.contains(['\n', '\r']),
        _ => true,
    }
}

fn scalar(value: &Value) -> String {
    match value {
        Value::String(text) => text.clone(),
        Value::Null => "—".into(),
        _ => value.to_string(),
    }
}

fn render_error(envelope: &Value) -> String {
    let error = &envelope["error"];
    let code = error["code"].as_str().unwrap_or("ERROR");
    let message = error["message"].as_str().unwrap_or("命令执行失败");
    let mut lines = vec![format!("错误 [{code}]: {message}")];
    if let Some(data) = envelope.get("data") {
        if let Some(usage) = data.get("usage").and_then(Value::as_str) {
            lines.push(format!("\n{usage}"));
        }
        let mut recovery = Vec::new();
        collect_recovery(data, "", &mut recovery);
        lines.extend(recovery);
    }
    if let Some(hint) = error["hint"].as_str().filter(|hint| !hint.is_empty()) {
        lines.push(format!("提示: {hint}"));
    }
    lines.push("可用 --json 输出完整错误详情。".into());
    lines.join("\n")
}

fn is_recovery_field(key: &str) -> bool {
    matches!(
        key,
        "applied"
            | "operation"
            | "outcome"
            | "run_id"
            | "task_id"
            | "app_id"
            | "expected_app_id"
            | "actual_app_id"
            | "flow_id"
            | "resume_command"
            | "confirmed"
            | "uploaded"
            | "closed"
            | "active"
            | "status"
            | "run_succeeded"
            | "user_paused"
            | "user_stopped"
            | "path"
            | "risk"
            | "expected_kind"
            | "requested"
            | "active_flow_id"
            | "candidates"
    )
}

/// Keep actionable evidence without dumping a backend response or captured
/// process output. Wrapper traversal also preserves nested unknown outcomes.
fn collect_recovery(value: &Value, prefix: &str, lines: &mut Vec<String>) {
    let Some(object) = value.as_object() else {
        return;
    };
    for (key, value) in object {
        let name = if prefix.is_empty() {
            key.clone()
        } else {
            format!("{prefix}.{key}")
        };
        if is_recovery_field(key) {
            if is_single_line(value) {
                let text = if key == "outcome" && value.as_str() == Some("unknown") {
                    "unknown (结果未知，请先查询状态，避免重复执行)".into()
                } else {
                    scalar(value)
                };
                lines.push(format!("{name}: {text}"));
            } else {
                lines.push(format!("{name}:"));
                render_value(value, 2, lines);
            }
        } else if matches!(
            key.as_str(),
            "data" | "run" | "task" | "result" | "cause" | "response" | "process"
        ) {
            collect_recovery(value, &name, lines);
        }
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn automatic_mode_only_uses_terminal_for_default() {
        assert_eq!(resolve_mode("auto", false, true), OutputMode::Text);
        assert_eq!(resolve_mode("auto", false, false), OutputMode::Json);
        for terminal in [true, false] {
            assert_eq!(resolve_mode("text", false, terminal), OutputMode::Text);
            assert_eq!(resolve_mode("json", false, terminal), OutputMode::Json);
            assert_eq!(resolve_mode("pretty", false, terminal), OutputMode::Pretty);
            assert_eq!(resolve_mode("text", true, terminal), OutputMode::Json);
        }
    }

    #[test]
    fn json_and_pretty_preserve_full_envelope() {
        let value =
            json!({"ok":false,"error":{"code":"FAILED"},"data":{"process":{"stdout":"debug"}}});
        assert_eq!(render(&value, OutputMode::Json), value.to_string());
        let pretty = render(&value, OutputMode::Pretty);
        assert_eq!(serde_json::from_str::<Value>(&pretty).unwrap(), value);
        assert!(pretty.contains('\n'));
    }

    #[test]
    fn guide_and_source_preserve_raw_text() {
        let markdown = "# Guide\n\nUse `xbot-cli status`.\n";
        let source = "def main():\n    print('你好')\n";
        assert_eq!(
            render(
                &json!({"ok":true,"data":{"topic":"cli","markdown":markdown}}),
                OutputMode::Text
            ),
            markdown
        );
        assert_eq!(
            render(
                &json!({"ok":true,"data":{"flow_id":"main","content":source}}),
                OutputMode::Text
            ),
            source
        );
    }

    #[test]
    fn tables_and_nested_results_are_readable_without_losing_records() {
        let text = render(
            &json!({"ok":true,"data":{
                "flows":[{"id":"one","name":"第一"},{"id":"two","name":"第二"}],
                "state":{"active":false},"notes":["first","second"]
            }}),
            OutputMode::Text,
        );
        assert!(text.contains("id | name\n  --- | ---\n  one | 第一\n  two | 第二"));
        assert!(text.contains("state:\n  active: false"));
        assert!(text.contains("notes:\n  - first\n  - second"));
        assert!(!text.contains("\u{1b}"));
    }

    #[test]
    fn text_errors_keep_recovery_without_backend_dump() {
        let (value, exit) = core::envelope(false, None, Some(
            BackendError::new("FLOW_RUN_TIMEOUT", "等待超时")
                .with_hint("继续等待同一次运行")
                .with_data(json!({
                    "applied":true,"run_id":"run-1","task_id":"task-1",
                    "resume_command":"xbot-cli flow wait run-1",
                    "cause":{"data":{"process":{"outcome":"unknown","stdout":"DEBUG_SECRET","stderr":"RAW_TRACE"}}},
                    "unrelated":{"large":"RAW_OBJECT"}
                }))
        ));
        let text = render(&value, OutputMode::Text);
        assert_eq!(exit, 4);
        for expected in [
            "错误 [FLOW_RUN_TIMEOUT]: 等待超时",
            "applied: true",
            "run_id: run-1",
            "task_id: task-1",
            "xbot-cli flow wait run-1",
            "结果未知",
            "继续等待同一次运行",
            "--json",
        ] {
            assert!(text.contains(expected), "missing {expected}: {text}");
        }
        for hidden in [
            "DEBUG_SECRET",
            "RAW_TRACE",
            "RAW_OBJECT",
            "stdout:",
            "stderr:",
        ] {
            assert!(!text.contains(hidden), "unexpected {hidden}: {text}");
        }
        assert!(render(&value, OutputMode::Json).contains("DEBUG_SECRET"));
    }
}
