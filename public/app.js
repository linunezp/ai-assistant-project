async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function getKbInfo(retries = 3, delay = 500) {
  let attempt = 0;
  while (attempt < retries) {
    try {
      const res = await fetch('/knowledge-base/info');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    } catch (err) {
      attempt++;
      if (attempt >= retries) {
        throw new Error(`No se pudo obtener info de la KB después de ${attempt} intentos: ${err.message}`);
      }
      // exponencial backoff
      await sleep(delay * Math.pow(2, attempt - 1));
      // update UI so the user sees retries (if refreshInfo controls it)
      const el = document.getElementById('kb-summary');
      if (el) el.textContent = `Reintentando carga... (${attempt}/${retries})`;
    }
  }
}

async function ask(prompt, aiProvider = null) {
  const body = { prompt };
  if (aiProvider) {
    body.aiProvider = aiProvider;
  }
  
  const res = await fetch('/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error('Error asking assistant: ' + res.status);
  return res.json();
}

// Función para cambiar el proveedor de IA
async function changeAIProvider(provider) {
  try {
    const res = await fetch('/ai/provider', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider })
    });
    const data = await res.json();
    return data;
  } catch (error) {
    console.error('Error cambiando proveedor de IA:', error);
    return { success: false, error: error.message };
  }
}

// Función para obtener el estado de los proveedores de IA
async function getAIStatus() {
  try {
    const res = await fetch('/ai/status');
    return res.json();
  } catch (error) {
    console.error('Error obteniendo estado de IA:', error);
    return { gemini: false, claude: false, current: 'gemini' };
  }
}

function $(id) { return document.getElementById(id); }

function syntaxHighlight(json) {
  if (typeof json !== 'string') {
    json = JSON.stringify(json, null, 2);
  }
  json = json
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
    let cls = 'number';
    if (/^"/.test(match)) {
      if (/:$/.test(match)) {
        cls = 'key';
      } else {
        cls = 'string';
      }
    } else if (/true|false/.test(match)) {
      cls = 'boolean';
    } else if (/null/.test(match)) {
      cls = 'null';
    }
    return '<span class="' + cls + '">' + match + '</span>';
  });
}

async function refreshInfo() {
  try {
    $('kb-summary').textContent = 'Cargando métricas...';
    $('kb-info').innerHTML = '<em>Cargando...</em>';
    const info = await getKbInfo();
    const payload = info.data || info;

    // Mostrar resumen legible
    const docs = payload.total_documents ?? payload.totalDocuments ?? payload.documents ?? null;
    const chunks = payload.total_chunks ?? payload.totalChunks ?? payload.chunks ?? null;
    const projects = payload.total_projects ?? payload.projects ?? (payload.project_count ?? null);

    const summaryParts = [];
    if (docs !== null) summaryParts.push(`Documentos: ${docs}`);
    if (chunks !== null) summaryParts.push(`Chunks: ${chunks}`);
    if (projects !== null) summaryParts.push(`Proyectos: ${projects}`);
    if (summaryParts.length === 0) summaryParts.push('No hay métricas disponibles en la respuesta');

    $('kb-summary').textContent = summaryParts.join(' · ');
  $('kb-info').textContent = '(Se ha ocultado la vista detallada de documentos)';
  } catch (err) {
    $('kb-summary').textContent = 'Error cargando métricas';
    $('kb-info').textContent = 'Error: ' + err.message;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  refreshInfo();
  
  // Inicializar selector de IA
  await initAISelector();
  
  $('refresh-info').addEventListener('click', refreshInfo);

  $('ask').addEventListener('click', async () => {
    const prompt = $('prompt').value.trim();
    if (!prompt) return;
    const askBtn = $('ask');
    askBtn.disabled = true;
    $('loading').classList.remove('hidden');
    $('answer').textContent = '';
    const start = Date.now();
    try {
      const selectedProvider = $('ai-provider').value;
      const resp = await ask(prompt, selectedProvider);
      // Normalize response display
      const elapsed = ((Date.now() - start) / 1000).toFixed(2);
      if (resp && resp.response && resp.response.answer) {
        $('answer').textContent = resp.response.answer + `\n\n(${elapsed}s)`;
      } else if (resp && resp.response && resp.response.choices) {
        $('answer').innerHTML = '<code class="json">' + syntaxHighlight(resp) + '</code>' + `<div class="meta">(${elapsed}s)</div>`;
      } else if (resp && typeof resp === 'object') {
        $('answer').innerHTML = '<code class="json">' + syntaxHighlight(resp) + '</code>' + `<div class="meta">(${elapsed}s)</div>`;
      } else {
        $('answer').textContent = String(resp) + `\n\n(${elapsed}s)`;
      }
    } catch (err) {
      $('answer').textContent = 'Error: ' + err.message;
    } finally {
      $('loading').classList.add('hidden');
      $('ask').disabled = false;
    }
  });

  // Reindex UI actions
  $('reindex-all')?.addEventListener('click', async () => {
    const status = $('reindex-status');
    try {
      status.textContent = 'Reindexando todo...';
      const res = await fetch('/knowledge-base/reindex-all', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      const data = await res.json();
      if (data.jobId) {
        status.textContent = `Job encolado: ${data.jobId}. Consultando estado...`;
        // Poll job status until finished
        const poll = async () => {
          const r = await fetch(`/jobs/${data.jobId}`);
          const j = await r.json();
          if (j.job && (j.job.status === 'completed' || j.job.status === 'failed')) {
            status.textContent = j.job.status === 'completed' ? `Reindex completado (job ${data.jobId})` : `Reindex falló (job ${data.jobId})`;
            refreshInfo();
            return;
          }
          setTimeout(poll, 2000);
        };
        poll();
      } else {
        status.textContent = data.success ? `Reindex iniciado` : `Error: ${data.reason || 'unknown'}`;
        refreshInfo();
      }
    } catch (err) {
      status.textContent = 'Error iniciando reindex: ' + err.message;
    }
    setTimeout(() => { if ($('reindex-status')) $('reindex-status').textContent = ''; }, 10000);
  });

  $('reindex-project')?.addEventListener('click', async () => {
    const name = $('reindex-project-name').value.trim();
    const status = $('reindex-status');
    if (!name) return status.textContent = 'Ingresa un nombre de proyecto';
    try {
      status.textContent = `Reindexando ${name}...`;
      const res = await fetch(`/knowledge-base/reindex/${encodeURIComponent(name)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      const data = await res.json();
      if (data.jobId) {
        status.textContent = `Job encolado: ${data.jobId}. Consultando estado...`;
        const poll = async () => {
          const r = await fetch(`/jobs/${data.jobId}`);
          const j = await r.json();
          if (j.job && (j.job.status === 'completed' || j.job.status === 'failed')) {
            status.textContent = j.job.status === 'completed' ? `Reindex completado (job ${data.jobId})` : `Reindex falló (job ${data.jobId})`;
            refreshInfo();
            return;
          }
          setTimeout(poll, 1500);
        };
        poll();
      } else if (data.success && data.job) {
        status.textContent = `Reindex completado (esperado respuesta sin job): ${data.job.result?.indexedCount || 0} archivos`;
        refreshInfo();
      } else if (data.success) {
        status.textContent = `Reindex iniciado`;
        refreshInfo();
      } else {
        status.textContent = `Error: ${data.reason || 'unknown'}`;
      }
    } catch (err) {
      status.textContent = 'Error iniciando reindex: ' + err.message;
    }
    setTimeout(() => { if ($('reindex-status')) $('reindex-status').textContent = ''; }, 10000);
  });
});

// Función para inicializar el selector de IA
async function initAISelector() {
  const selector = $('ai-provider');
  const status = $('ai-status');
  
  if (!selector || !status) return;
  
  // Obtener estado inicial de los proveedores
  const aiStatus = await getAIStatus();
  
  // Configurar el selector con el proveedor actual
  selector.value = aiStatus.current || 'gemini';
  updateAIStatus(aiStatus);
  
  // Event listener para cambio de proveedor
  selector.addEventListener('change', async () => {
    const newProvider = selector.value;
    status.textContent = 'Cambiando proveedor...';
    status.className = 'ai-status';
    
    try {
      const result = await changeAIProvider(newProvider);
      if (result.success) {
        status.textContent = `✓ ${newProvider === 'claude' ? 'Claude' : 'Gemini'} activo`;
        status.className = 'ai-status connected';
      } else {
        status.textContent = `✗ Error: ${result.error || 'No disponible'}`;
        status.className = 'ai-status error';
        // Revertir selección si falla
        const currentStatus = await getAIStatus();
        selector.value = currentStatus.current || 'gemini';
      }
    } catch (error) {
      status.textContent = `✗ Error de conexión`;
      status.className = 'ai-status error';
      // Revertir selección si falla
      const currentStatus = await getAIStatus();
      selector.value = currentStatus.current || 'gemini';
    }
  });
}

// Función para actualizar el estado visual del selector de IA
function updateAIStatus(aiStatus) {
  const status = $('ai-status');
  if (!status) return;
  
  const current = aiStatus.current || 'gemini';
  const currentName = current === 'claude' ? 'Claude' : 'Gemini';
  
  if (aiStatus[current]) {
    status.textContent = `✓ ${currentName} conectado`;
    status.className = 'ai-status connected';
  } else {
    status.textContent = `✗ ${currentName} no disponible`;
    status.className = 'ai-status error';
  }
}
