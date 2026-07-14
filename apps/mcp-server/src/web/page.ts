/**
 * Plain HTML + vanilla JS, no framework/build step. This page is the ONLY
 * client allowed to call POST /api/upload and POST /api/unlock - Claude and
 * ChatGPT only ever see this project's state through the read-only MCP
 * tools in src/tools/, never through these two routes.
 */
export function renderPocPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>AI Catalyst - Remote MCP POC</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; max-width: 720px; margin: 2rem auto; padding: 0 1rem; line-height: 1.5; }
  h1 { font-size: 1.4rem; }
  h2 { font-size: 1.05rem; margin-top: 2rem; }
  p.lede { opacity: 0.8; }
  .module { border: 1px solid rgba(128,128,128,0.35); border-radius: 8px; padding: 1rem; margin: 1rem 0; }
  .status { display: inline-block; padding: 0.15rem 0.6rem; border-radius: 999px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.02em; }
  .status-locked { background: rgba(107,114,128,0.15); color: #6b7280; }
  .status-in_progress { background: rgba(37,99,235,0.15); color: #2563eb; }
  .status-needs_revision { background: rgba(220,38,38,0.15); color: #dc2626; }
  .status-ready_to_unlock { background: rgba(217,119,6,0.15); color: #d97706; }
  .status-completed { background: rgba(22,163,74,0.15); color: #16a34a; }
  .issues { color: #dc2626; margin-top: 0.4rem; }
  .submission-meta { margin-top: 0.4rem; opacity: 0.85; font-size: 0.9rem; }
  button { cursor: pointer; padding: 0.55rem 1.1rem; border-radius: 6px; border: 1px solid rgba(128,128,128,0.35); background: #2563eb; color: white; font-weight: 600; }
  button:disabled { opacity: 0.45; cursor: not-allowed; }
  input[type="password"] { padding: 0.45rem; border-radius: 6px; border: 1px solid rgba(128,128,128,0.35); width: 100%; box-sizing: border-box; background: transparent; }
  .row { display: flex; gap: 0.6rem; align-items: center; margin: 0.6rem 0; }
  .row label { flex-shrink: 0; opacity: 0.8; font-size: 0.9rem; }
  code { background: rgba(128,128,128,0.2); padding: 0.1rem 0.35rem; border-radius: 4px; }
  #log { white-space: pre-wrap; font-family: ui-monospace, monospace; font-size: 0.8rem; background: rgba(128,128,128,0.1); padding: 0.75rem; border-radius: 6px; max-height: 220px; overflow: auto; }
</style>
</head>
<body>
  <h1>AI Catalyst &mdash; Remote MCP + Website Unlock POC</h1>
  <p class="lede">
    This page is the <strong>only</strong> place that can upload a submission or unlock the next module.
    Claude and ChatGPT connect to <code>/mcp</code> and can only read this project's state through
    <code>get_current_module</code>, <code>get_module_context</code>,
    <code>get_latest_validation_feedback</code>, and <code>check_draft</code> &mdash; none of those tools can
    change anything here.
  </p>

  <div class="row">
    <label for="adminKey">Admin key</label>
    <input id="adminKey" type="password" placeholder="only needed if POC_ADMIN_KEY is set on the server" />
  </div>

  <div id="modules"></div>

  <h2>Upload a submission</h2>
  <div class="row">
    <input id="fileInput" type="file" accept=".md" />
    <button id="uploadBtn" disabled>Upload</button>
  </div>

  <h2>Unlock</h2>
  <div class="row">
    <button id="unlockBtn" disabled>Confirm and unlock next module</button>
  </div>

  <h2>Log</h2>
  <div id="log"></div>

<script>
  var state = { projectState: null, submissions: [] };

  function log(message) {
    var el = document.getElementById('log');
    el.textContent = new Date().toISOString() + '  ' + message + '\\n' + el.textContent;
  }

  function adminHeaders() {
    var key = document.getElementById('adminKey').value;
    return key ? { 'X-POC-Admin-Key': key } : {};
  }

  var adminKeyInput = document.getElementById('adminKey');
  var savedKey = sessionStorage.getItem('pocAdminKey');
  if (savedKey) adminKeyInput.value = savedKey;
  adminKeyInput.addEventListener('change', function (e) {
    sessionStorage.setItem('pocAdminKey', e.target.value);
  });

  function latestSubmissionFor(moduleId) {
    var matching = state.submissions.filter(function (s) { return s.module_id === moduleId; });
    if (matching.length === 0) return null;
    return matching.reduce(function (a, b) { return b.version > a.version ? b : a; });
  }

  function render() {
    var modulesEl = document.getElementById('modules');
    modulesEl.innerHTML = '';
    var anyReadyToUnlock = false;
    var uploadTargetModuleId = null;

    state.projectState.modules.forEach(function (mod) {
      var submission = latestSubmissionFor(mod.module_id);
      var div = document.createElement('div');
      div.className = 'module';

      var html = '<strong>' + mod.module_id + '</strong> ' +
        '<span class="status status-' + mod.status + '">' + mod.status.replace(/_/g, ' ') + '</span>';

      if (submission) {
        html += '<div class="submission-meta">Latest submission: v' + submission.version + ' &mdash; ' + submission.validation_status + '</div>';
        if (submission.issues && submission.issues.length > 0) {
          html += '<div class="issues">Issues: ' + submission.issues.join('; ') + '</div>';
        }
      } else {
        html += '<div class="submission-meta">No submission yet.</div>';
      }

      div.innerHTML = html;
      modulesEl.appendChild(div);

      if (mod.status === 'ready_to_unlock') anyReadyToUnlock = true;
      if (mod.status === 'in_progress' || mod.status === 'needs_revision') uploadTargetModuleId = mod.module_id;
    });

    document.getElementById('unlockBtn').disabled = !anyReadyToUnlock;
    var uploadBtn = document.getElementById('uploadBtn');
    uploadBtn.dataset.moduleId = uploadTargetModuleId || '';
    uploadBtn.disabled = !uploadTargetModuleId;
  }

  function refresh() {
    return fetch('/api/state')
      .then(function (res) { return res.json(); })
      .then(function (body) {
        state.projectState = body.project_state;
        state.submissions = body.submissions;
        render();
      })
      .catch(function (error) { log('Failed to refresh state: ' + error); });
  }

  document.getElementById('uploadBtn').addEventListener('click', function () {
    var moduleId = document.getElementById('uploadBtn').dataset.moduleId;
    var fileInput = document.getElementById('fileInput');
    var file = fileInput.files[0];
    if (!moduleId) { log('No module is currently accepting uploads.'); return; }
    if (!file) { log('Choose a .md file first.'); return; }

    file.text().then(function (content) {
      var headers = Object.assign({ 'Content-Type': 'application/json' }, adminHeaders());
      return fetch('/api/upload', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ module_id: moduleId, filename: file.name, content: content }),
      });
    }).then(function (res) {
      return res.json().then(function (body) { return { ok: res.ok, body: body }; });
    }).then(function (result) {
      if (!result.ok) {
        log('Upload failed: ' + (result.body.message || 'unknown error'));
      } else {
        var issueSuffix = result.body.issues && result.body.issues.length
          ? ' (missing: ' + result.body.issues.join('; ') + ')'
          : '';
        log('Uploaded v' + result.body.version + ' for ' + moduleId + ' -> ' + result.body.validation_status + issueSuffix);
      }
      return refresh();
    }).catch(function (error) { log('Upload error: ' + error); });
  });

  document.getElementById('unlockBtn').addEventListener('click', function () {
    var headers = Object.assign({ 'Content-Type': 'application/json' }, adminHeaders());
    fetch('/api/unlock', { method: 'POST', headers: headers, body: '{}' })
      .then(function (res) {
        return res.json().then(function (body) { return { ok: res.ok, body: body }; });
      })
      .then(function (result) {
        if (!result.ok) {
          log('Unlock failed: ' + (result.body.message || 'unknown error'));
        } else {
          log('Unlocked ' + result.body.unlocked_module + ' (completed ' + result.body.module_id + ')');
        }
        return refresh();
      })
      .catch(function (error) { log('Unlock error: ' + error); });
  });

  refresh();
  setInterval(refresh, 4000);
</script>
</body>
</html>
`;
}
