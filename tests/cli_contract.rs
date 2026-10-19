//! Black-box CLI checks against an isolated, local fake MCP server.
//! No installed client, application, browser, or account is used.
use serde_json::{json, Value};
use std::io::{Read, Write};
use std::net::TcpListener;
use std::process::{Command, Output, Stdio};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use std::thread::{self, JoinHandle};
use std::time::Duration;

fn invoke(args: &[&str], stdin: Option<&str>, endpoint: Option<&str>) -> Output {
    let mut command = Command::new(env!("CARGO_BIN_EXE_xbot-cli"));
    command
        .args(args)
        .env("XBOT_SHELL_CLI", "__xbot_test_missing_shell__.exe")
        .env(
            "XBOT_MCP_ENDPOINT",
            endpoint.unwrap_or("http://127.0.0.1:1/unavailable"),
        )
        .env(
            "XBOT_BROWSER_MCP_ENDPOINT",
            endpoint.unwrap_or("http://127.0.0.1:1/unavailable"),
        )
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = command.spawn().unwrap();
    if let Some(input) = stdin {
        child
            .stdin
            .take()
            .unwrap()
            .write_all(input.as_bytes())
            .unwrap();
    }
    drop(child.stdin.take());
    child.wait_with_output().unwrap()
}

fn envelope(output: &Output, expected: i32) -> Value {
    assert_eq!(
        output.status.code(),
        Some(expected),
        "stdout={} stderr={}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    let (data, empty) = if expected == 0 {
        (&output.stdout, &output.stderr)
    } else {
        (&output.stderr, &output.stdout)
    };
    assert!(empty.is_empty(), "Unexpected output on the other stream");
    let value: Value = serde_json::from_slice(data).unwrap();
    assert_eq!(value["ok"], expected == 0);
    value
}

#[test]
fn missing_leaf_arguments_are_errors_but_command_groups_are_discoverable() {
    for args in [
        vec!["app", "open"],
        vec!["wiki", "read"],
        vec!["--expect-app", "invalid", "--dry-run"],
        vec!["--yes"],
    ] {
        let value = envelope(&invoke(&args, None, None), 2);
        assert_eq!(value["error"]["code"], "BAD_ARGS");
    }
    let server = MockMcp::new(|_| json!({}));
    for args in [
        vec![],
        vec!["app"],
        vec!["flow", "code"],
        vec!["tool", "studio"],
        vec!["--help"],
    ] {
        let help = invoke(&args, None, Some(&server.endpoint));
        assert!(help.status.success());
        assert!(help.stderr.is_empty());
        assert!(String::from_utf8_lossy(&help.stdout).contains("Usage:"));
        assert!(serde_json::from_slice::<Value>(&help.stdout).is_err());
    }
    assert!(server.requests.lock().unwrap().is_empty());
}

#[test]
fn schemas_support_canonical_and_legacy_nested_paths() {
    for args in [
        vec!["schema", "tool", "studio", "call"],
        vec!["schema", "mcp", "call"],
        vec!["schema", "flow", "visual", "disable"],
        vec!["schema", "code", "write"],
    ] {
        envelope(&invoke(&args, None, None), 0);
    }
}

#[test]
fn preview_rejects_bad_inputs_without_backend_and_can_read_stdin() {
    for args in [
        vec![
            "task",
            "run",
            "11111111-1111-1111-1111-111111111111",
            "--input",
            "broken",
            "--dry-run",
        ],
        vec![
            "flow",
            "params",
            "set",
            "main",
            "--operations",
            "null",
            "--dry-run",
        ],
        vec!["tool", "studio", "call", "x", "[]", "--dry-run"],
        vec!["flow", "run", "main", "--timeout", "0", "--dry-run"],
        vec![
            "flow",
            "wait",
            "existing-run",
            "--timeout",
            "18446744073709551615",
        ],
        vec![
            "flow",
            "run",
            "main",
            "--timeout",
            "18446744073709551615",
            "--dry-run",
        ],
    ] {
        envelope(&invoke(&args, None, None), 2);
    }
    let value = envelope(
        &invoke(
            &["flow", "code", "write", "main", "--file", "-", "--dry-run"],
            Some("print('一次读取')\n"),
            None,
        ),
        0,
    );
    assert_eq!(value["data"]["arguments"]["content"], "print('一次读取')\n");
    assert_eq!(value["data"]["validation"]["runtime"], "not_checked");
}

struct MockMcp {
    endpoint: String,
    requests: Arc<Mutex<Vec<Value>>>,
    stop: Arc<AtomicBool>,
    worker: Option<JoinHandle<()>>,
}

impl MockMcp {
    fn new(handler: impl Fn(&Value) -> Value + Send + 'static) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let endpoint = format!("http://{}/mcp", listener.local_addr().unwrap());
        listener.set_nonblocking(true).unwrap();
        let requests = Arc::new(Mutex::new(Vec::new()));
        let log = Arc::clone(&requests);
        let stop = Arc::new(AtomicBool::new(false));
        let signal = Arc::clone(&stop);
        let worker = thread::spawn(move || {
            while !signal.load(Ordering::SeqCst) {
                let (mut stream, _) = match listener.accept() {
                    Ok(connection) => connection,
                    Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                        thread::sleep(Duration::from_millis(5));
                        continue;
                    }
                    Err(e) => panic!("mock accept: {e}"),
                };
                stream
                    .set_read_timeout(Some(Duration::from_secs(5)))
                    .unwrap();
                let mut buf = Vec::new();
                let mut chunk = [0; 4096];
                let request = loop {
                    let count = stream.read(&mut chunk).unwrap();
                    assert!(count > 0, "incomplete HTTP request");
                    buf.extend_from_slice(&chunk[..count]);
                    if let Some(at) = buf.windows(4).position(|w| w == b"\r\n\r\n") {
                        let headers = String::from_utf8_lossy(&buf[..at]);
                        let length: usize = headers
                            .lines()
                            .find_map(|line| {
                                let (name, value) = line.split_once(':')?;
                                name.eq_ignore_ascii_case("content-length")
                                    .then(|| value.trim().parse().unwrap())
                            })
                            .unwrap();
                        if buf.len() >= at + 4 + length {
                            break serde_json::from_slice::<Value>(&buf[at + 4..at + 4 + length])
                                .unwrap();
                        }
                    }
                };
                log.lock().unwrap().push(request.clone());
                let result = handler(&request);
                let body =
                    json!({"jsonrpc":"2.0", "id":request["id"], "result":result}).to_string();
                write!(stream, "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", body.len(), body).unwrap();
            }
        });
        Self {
            endpoint,
            requests,
            stop,
            worker: Some(worker),
        }
    }
    fn calls(&self) -> Vec<String> {
        self.requests
            .lock()
            .unwrap()
            .iter()
            .filter_map(|r| r["params"]["name"].as_str().map(str::to_owned))
            .collect()
    }
}

impl Drop for MockMcp {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
        self.worker.take().unwrap().join().unwrap();
    }
}

fn studio_fixture(request: &Value) -> Value {
    let content = match request["params"]["name"].as_str().unwrap_or("") {
        "app.get_info" => {
            json!({"app":{"app_id":"11111111-1111-1111-1111-111111111111"},"flows":{"active_flow_id":"main"}})
        }
        "app.list_flows" => {
            json!({"flows":[{"flow_id":"main","flow_name":"主流程","flow_kind":"code"}]})
        }
        "diagnostics.snapshot" => json!({"static_errors":[]}),
        _ => json!({}),
    };
    json!({"structuredContent":content})
}

#[test]
fn raw_stdin_is_executed_once_and_mcp_errors_cannot_report_success() {
    let server = MockMcp::new(
        |request| json!({"structuredContent":{"received":request["params"]["arguments"]}}),
    );
    let value = envelope(
        &invoke(
            &["tool", "studio", "call", "example", "-"],
            Some("{\"value\":42}"),
            Some(&server.endpoint),
        ),
        0,
    );
    assert_eq!(value["data"]["received"]["value"], 42);
    assert_eq!(server.calls(), ["example"]);
    let server = MockMcp::new(
        |_| json!({"isError":true,"content":[{"type":"text","text":"backend failure"}]}),
    );
    let result = invoke(
        &["tool", "studio", "call", "example"],
        None,
        Some(&server.endpoint),
    );
    assert!(!result.status.success());
    assert!(result.stdout.is_empty());
    let value: Value = serde_json::from_slice(&result.stderr).unwrap();
    assert_eq!(value["ok"], false);
}

#[test]
fn application_assertion_blocks_writes_to_another_application() {
    let server = MockMcp::new(studio_fixture);
    let value = envelope(
        &invoke(
            &[
                "flow",
                "code",
                "write",
                "main",
                "--file",
                "-",
                "--expect-app",
                "22222222-2222-2222-2222-222222222222",
            ],
            Some("print('safe')"),
            Some(&server.endpoint),
        ),
        5,
    );
    assert_eq!(value["ok"], false);
    assert_eq!(server.calls(), ["app.get_info"]);
}

#[test]
fn verify_does_not_succeed_without_a_run_handle() {
    let server = MockMcp::new(studio_fixture);
    let result = invoke(
        &["flow", "verify", "main", "--timeout", "1"],
        None,
        Some(&server.endpoint),
    );
    assert!(!result.status.success());
    assert!(result.stdout.is_empty());
    let value: Value = serde_json::from_slice(&result.stderr).unwrap();
    assert_eq!(value["ok"], false);
    assert_ne!(value["data"]["verified"], true);
    assert_eq!(
        server
            .calls()
            .iter()
            .filter(|name| name.as_str() == "app.run")
            .count(),
        1
    );
}

#[test]
fn wait_uses_existing_run_without_starting_a_second_run() {
    let server = MockMcp::new(|request| {
        assert_eq!(request["params"]["name"], "app.wait_run_finish");
        assert_eq!(request["params"]["arguments"]["run_id"], "existing-run");
        json!({"structuredContent":{"run_id":"existing-run", "terminal_status":"completed","run_succeeded":true,"result":{"outputs":{"answer":42}}}})
    });
    let value = envelope(
        &invoke(
            &["flow", "wait", "existing-run", "--timeout", "5"],
            None,
            Some(&server.endpoint),
        ),
        0,
    );
    assert_eq!(value["data"]["run_id"], "existing-run");
    assert_eq!(server.calls(), ["app.wait_run_finish"]);
}

#[test]
fn write_keeps_applied_evidence_when_followup_diagnostics_fail() {
    let server = MockMcp::new(|request| match request["params"]["name"].as_str() {
        Some("codeflow.write") => {
            assert_eq!(request["params"]["arguments"]["content"], "print('once')\n");
            json!({"structuredContent":{"success":true,"revision":"written-once"}})
        }
        Some("diagnostics.snapshot") => {
            json!({"isError":true,"content":[{"type":"text","text":"diagnostics unavailable"}]})
        }
        _ => studio_fixture(request),
    });
    let value = envelope(
        &invoke(
            &["flow", "code", "write", "main", "--file", "-"],
            Some("print('once')\n"),
            Some(&server.endpoint),
        ),
        1,
    );
    assert_eq!(value["error"]["code"], "MUTATION_DIAGNOSTICS_FAILED");
    assert_eq!(value["error"]["retryable"], false);
    assert_eq!(value["data"]["applied"], true);
    assert_eq!(value["data"]["result"]["revision"], "written-once");
    assert_eq!(
        server
            .calls()
            .iter()
            .filter(|name| name.as_str() == "codeflow.write")
            .count(),
        1
    );
}

#[test]
fn static_check_never_runs_and_verify_stops_on_static_errors() {
    let server = MockMcp::new(|request| {
        if request["params"]["name"] == "diagnostics.snapshot" {
            json!({"structuredContent":{"static_errors":[{"message":"invalid code"}]}})
        } else {
            studio_fixture(request)
        }
    });
    for command in ["check", "verify"] {
        let value = envelope(
            &invoke(&["flow", command, "main"], None, Some(&server.endpoint)),
            1,
        );
        assert_eq!(value["data"]["executed"], false);
    }
    assert!(!server.calls().iter().any(|name| name == "app.run"));
}

#[test]
fn completion_without_success_evidence_is_not_success() {
    let server = MockMcp::new(
        |_| json!({"structuredContent":{"run_id":"existing-run","terminal_status":"completed","run_succeeded":null}}),
    );
    let value = envelope(
        &invoke(
            &["flow", "wait", "existing-run"],
            None,
            Some(&server.endpoint),
        ),
        6,
    );
    assert_eq!(value["error"]["code"], "FLOW_RUN_UNKNOWN");
    assert_eq!(value["error"]["retryable"], false);
}
