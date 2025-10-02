let groups = [];

// Elementos del DOM
const messageContainer = document.getElementById('message-container');
const addGroupForm = document.getElementById('add-group-form');
const addGroupBtn = document.getElementById('add-group-btn');
const groupsList = document.getElementById('groups-list');
const groupSelect = document.getElementById('group-select');
const queryInput = document.getElementById('query-input');
const queryBtn = document.getElementById('query-btn');
const queryResponse = document.getElementById('query-response');

// Funciones de utilidad
function showMessage(message, type = 'info') {
    const messageDiv = document.createElement('div');
    messageDiv.className = type === 'error' ? 'error' : 'success';
    messageDiv.textContent = message;
    messageContainer.innerHTML = '';
    messageContainer.appendChild(messageDiv);
    
    setTimeout(() => {
        messageDiv.remove();
    }, 5000);
}

function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Cargar grupos
async function loadGroups() {
    console.log('🔄 Iniciando loadGroups...');
    debugLog('🔄 Iniciando loadGroups...');
    
    try {
        console.log('📡 Haciendo fetch a /groups');
        const response = await fetch('/groups');
        console.log('📨 Response recibido:', response.status, response.statusText);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log('📊 Data recibido:', data);
        debugLog(`📊 Grupos recibidos: ${JSON.stringify(data, null, 2)}`);

        if (data.success) {
            groups = data.groups;
            console.log('✅ Grupos asignados:', groups.length);
            renderGroups();
            updateGroupSelect();
            debugLog(`✅ ${groups.length} grupos cargados exitosamente`);
        } else {
            throw new Error(data.error || 'Error cargando grupos');
        }
    } catch (error) {
        console.error('❌ Error cargando grupos:', error);
        debugLog(`❌ Error cargando grupos: ${error.message}`);
        if (groupsList) {
            groupsList.innerHTML = `
                <div class="error">
                    Error cargando grupos: ${error.message}
                </div>
            `;
        }
    }
}

// Renderizar lista de grupos
function renderGroups() {
    if (groups.length === 0) {
        groupsList.innerHTML = `
            <div class="empty-state">
                <h3>No hay grupos indexados</h3>
                <p>Agrega tu primer grupo de GitLab para comenzar</p>
            </div>
        `;
        return;
    }
    
    const groupsHtml = groups.map(group => `
        <div class="group-item">
            <div class="group-header">
                <div>
                    <h3 class="group-name">${group.name || group.groupId}</h3>
                    <div class="group-path">${group.fullPath || group.groupId}</div>
                </div>
            </div>
            ${group.description ? `<p style="color: #666; margin: 10px 0;">${group.description}</p>` : ''}
            <div class="group-stats">
                <div class="stat-item">
                    <div class="stat-number">${group.projectsCount}</div>
                    <div class="stat-label">Proyectos</div>
                </div>
                <div class="stat-item">
                    <div class="stat-number">${group.filesCount}</div>
                    <div class="stat-label">Archivos</div>
                </div>
                <div class="stat-item">
                    <div class="stat-number">${group.chunksCount}</div>
                    <div class="stat-label">Chunks</div>
                </div>
            </div>
            <div style="margin-top: 10px; font-size: 12px; color: #666;">
                Indexado: ${formatDate(group.indexedAt)}
            </div>
            <div class="group-actions">
                <button class="btn btn-sm btn-reindex" data-group-id="${group.groupId}">
                    Reindexar
                </button>
                <button class="btn btn-sm btn-danger btn-remove" data-group-id="${group.groupId}">
                    Eliminar
                </button>
            </div>
        </div>
    `).join('');
    
    groupsList.innerHTML = groupsHtml;
}

// Actualizar selector de grupos
function updateGroupSelect() {
    const options = groups.map(group => 
        `<option value="${group.groupId}">${group.name || group.groupId}</option>`
    ).join('');
    
    groupSelect.innerHTML = `
        <option value="">Todos los grupos</option>
        ${options}
    `;
    
    // Actualizar también el filtro de repositorios
    const repositoryGroupFilter = document.getElementById('repository-group-filter');
    if (repositoryGroupFilter) {
        repositoryGroupFilter.innerHTML = `
            <option value="">Todos los grupos</option>
            ${options}
        `;
    }
}

// Variables para repositorios
let repositories = [];
const repositoriesList = document.getElementById('repositories-list');

// Cargar repositorios
async function loadRepositories() {
    console.log('🔄 Iniciando loadRepositories...');
    debugLog('🔄 Iniciando loadRepositories...');
    
    try {
        const repositoryGroupFilter = document.getElementById('repository-group-filter');
        const groupId = repositoryGroupFilter ? repositoryGroupFilter.value : '';
        
        let url = '/repositories';
        if (groupId) {
            url += `?groupId=${encodeURIComponent(groupId)}`;
        }
        
        console.log('📡 Haciendo fetch a:', url);
        const response = await fetch(url);
        console.log('📨 Response recibido:', response.status, response.statusText);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log('📊 Data recibido:', data);
        debugLog(`📊 Repositorios recibidos: ${JSON.stringify(data, null, 2)}`);
        
        if (data.success) {
            repositories = data.repositories;
            console.log('✅ Repositorios asignados:', repositories.length);
            renderRepositories();
            debugLog(`✅ ${repositories.length} repositorios cargados exitosamente`);
        } else {
            throw new Error(data.error || 'Error cargando repositorios');
        }
    } catch (error) {
        console.error('❌ Error cargando repositorios:', error);
        debugLog(`❌ Error cargando repositorios: ${error.message}`);
        if (repositoriesList) {
            repositoriesList.innerHTML = `
                <div class="error">
                    Error cargando repositorios: ${error.message}
                </div>
            `;
        }
    }
}

// Renderizar lista de repositorios
function renderRepositories() {
    if (repositories.length === 0) {
        repositoriesList.innerHTML = `
            <div class="empty-state">
                <h3>No hay repositorios indexados</h3>
                <p>Los repositorios aparecerán aquí después de indexar grupos</p>
            </div>
        `;
        return;
    }

    const repositoriesHtml = repositories.map(repo => `
        <div class="repository-item">
            <div class="repository-info">
                <div class="repository-name">${repo.projectName}</div>
                <div class="repository-stats">
                    <span>📄 ${repo.documentCount} documentos</span>
                    <span>🧩 ${repo.chunkCount} chunks</span>
                    <span>🕒 Última indexación: ${formatDate(repo.lastIndexed)}</span>
                    ${repo.projectPath ? `<span>📁 ${repo.projectPath}</span>` : ''}
                </div>
            </div>
            <div class="repository-actions">
                <button class="btn-reindex" data-project="${repo.projectName}" data-group="${repo.groupId || ''}">
                    🔄 Reindexar
                </button>
                ${repo.webUrl ? `<a href="${repo.webUrl}" target="_blank" class="btn btn-secondary">Ver en GitLab</a>` : ''}
            </div>
        </div>
    `).join('');

    repositoriesList.innerHTML = repositoriesHtml;
}

// Reindexar repositorio
async function reindexRepository(projectName, groupId) {
    const button = event.target;
    const originalText = button.innerHTML;
    
    button.disabled = true;
    button.innerHTML = '⏳ Reindexando...';

    try {
        let url = `/repositories/${encodeURIComponent(projectName)}/reindex`;
        const body = {};
        
        if (groupId && groupId !== 'null' && groupId !== '') {
            body.groupId = groupId;
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        const data = await response.json();

        if (data.success) {
            showMessage(`Repositorio reindexado: ${data.filesIndexed} archivos, ${data.chunksGenerated} chunks en ${Math.round(data.processingTime/1000)}s`, 'success');
            await loadRepositories(); // Recargar la lista
        } else {
            throw new Error(data.error || 'Error reindexando repositorio');
        }
    } catch (error) {
        console.error('Error reindexando repositorio:', error);
        showMessage(`Error reindexando repositorio: ${error.message}`, 'error');
    } finally {
        button.disabled = false;
        button.innerHTML = originalText;
    }
}

// Variables para control de progreso
let reindexingInProgress = false;
let progressInterval = null;

// Función para mostrar progreso en tiempo real
function showProgressIndicator(groupId, groupName) {
    const progressHtml = `
        <div id="reindex-progress" class="reindex-progress">
            <div class="progress-header">
                <h3>🔄 Reindexando: ${groupName}</h3>
                <div class="progress-status" id="progress-status">Iniciando...</div>
            </div>
            <div class="progress-bar">
                <div class="progress-fill" id="progress-fill"></div>
            </div>
            <div class="progress-details" id="progress-details">
                <div class="progress-item">
                    <span class="progress-label">Proyectos:</span>
                    <span class="progress-value" id="projects-progress">0/0</span>
                </div>
                <div class="progress-item">
                    <span class="progress-label">Archivos:</span>
                    <span class="progress-value" id="files-progress">0</span>
                </div>
                <div class="progress-item">
                    <span class="progress-label">Chunks:</span>
                    <span class="progress-value" id="chunks-progress">0</span>
                </div>
            </div>
            <div class="progress-log" id="progress-log"></div>
        </div>
    `;
    
    // Insertar indicador de progreso en la parte superior
    const container = document.querySelector('.groups-container');
    const existingProgress = document.getElementById('reindex-progress');
    if (existingProgress) {
        existingProgress.remove();
    }
    container.insertAdjacentHTML('afterbegin', progressHtml);
    
    // Hacer scroll hacia el indicador
    document.getElementById('reindex-progress').scrollIntoView({ behavior: 'smooth' });
}

// Función para actualizar el progreso
function updateProgress(status, details = {}) {
    const statusEl = document.getElementById('progress-status');
    const fillEl = document.getElementById('progress-fill');
    const projectsEl = document.getElementById('projects-progress');
    const filesEl = document.getElementById('files-progress');
    const chunksEl = document.getElementById('chunks-progress');
    const logEl = document.getElementById('progress-log');
    
    // Detectar errores de rate limiting
    if (status.includes('ECONNRESET') || status.includes('network socket disconnected')) {
        status = '⚠️ GitLab temporalmente bloqueó la IP. Reintentando...';
    }
    
    if (statusEl) statusEl.textContent = status;
    
    if (details.projectsCount !== undefined) {
        const total = details.totalProjects || '?';
        if (projectsEl) projectsEl.textContent = `${details.projectsCount}/${total}`;
    }
    
    if (details.filesCount !== undefined) {
        if (filesEl) filesEl.textContent = details.filesCount;
    }
    
    if (details.chunksCount !== undefined) {
        if (chunksEl) chunksEl.textContent = details.chunksCount;
    }
    
    // Actualizar barra de progreso (estimación basada en archivos)
    if (details.filesCount && details.estimatedTotalFiles) {
        const percentage = Math.min((details.filesCount / details.estimatedTotalFiles) * 100, 95);
        if (fillEl) fillEl.style.width = `${percentage}%`;
    }
    
    // Agregar log si se proporciona
    if (details.logMessage && logEl) {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = document.createElement('div');
        logEntry.className = 'log-entry';
        logEntry.innerHTML = `<span class="log-time">${timestamp}</span> ${details.logMessage}`;
        logEl.appendChild(logEntry);
        logEl.scrollTop = logEl.scrollHeight;
        
        // Mantener solo las últimas 10 entradas
        while (logEl.children.length > 10) {
            logEl.removeChild(logEl.firstChild);
        }
    }
}

// Función para monitorear progreso en tiempo real
function startProgressMonitoring(groupId) {
    let previousFiles = 0;
    let previousChunks = 0;
    
    progressInterval = setInterval(async () => {
        try {
            const response = await fetch('/groups');
            const data = await response.json();
            
            if (data.success) {
                const group = data.groups.find(g => g.groupId === groupId);
                if (group) {
                    const statusText = group.filesCount > previousFiles ? 
                        `Procesando archivos... (${group.filesCount} archivos indexados)` :
                        `Indexando datos... (${group.chunksCount} chunks generados)`;
                    
                    updateProgress(statusText, {
                        projectsCount: group.projectsCount,
                        filesCount: group.filesCount,
                        chunksCount: group.chunksCount,
                        logMessage: group.filesCount > previousFiles ? 
                            `📄 +${group.filesCount - previousFiles} archivos procesados` :
                            group.chunksCount > previousChunks ?
                            `🧩 +${group.chunksCount - previousChunks} chunks generados` : null
                    });
                    
                    previousFiles = group.filesCount;
                    previousChunks = group.chunksCount;
                }
            }
        } catch (error) {
            console.error('Error monitoreando progreso:', error);
        }
    }, 2000); // Actualizar cada 2 segundos
}

// Función para detener monitoreo
function stopProgressMonitoring() {
    if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
    }
    
    // Ocultar indicador después de 5 segundos
    setTimeout(() => {
        const progressEl = document.getElementById('reindex-progress');
        if (progressEl) {
            progressEl.style.opacity = '0';
            setTimeout(() => progressEl.remove(), 500);
        }
    }, 5000);
}

// Funciones para los botones de acción
async function reindexGroup(groupId) {
    if (reindexingInProgress) {
        showMessage('Ya hay una reindexación en progreso. Espera a que termine.', 'error');
        return;
    }
    
    if (!confirm('¿Estás seguro de que quieres reindexar este grupo? Esto puede tomar varios minutos.')) {
        return;
    }
    
    const group = groups.find(g => g.groupId === groupId);
    if (!group) return;
    
    try {
        reindexingInProgress = true;
        showProgressIndicator(groupId, group.name);
        startProgressMonitoring(groupId);
        
        updateProgress('Conectando con GitLab...', {
            logMessage: '🚀 Iniciando reindexación del grupo'
        });
        
        const response = await fetch('/groups', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                groupId: group.groupId,
                groupName: group.name,
                indexSubgroups: true
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            updateProgress('✅ Reindexación completada', {
                logMessage: `✅ Completado: ${data.projectsIndexed} proyectos, ${data.totalChunks} chunks en ${Math.round((data.processingTime || 0)/1000)}s`
            });
            
            showMessage(`Grupo reindexado exitosamente: ${data.projectsIndexed} proyectos, ${data.totalChunks} chunks`, 'success');
            await loadGroups();
        } else {
            updateProgress('❌ Error en la reindexación', {
                logMessage: `❌ Error: ${data.error}`
            });
            throw new Error(data.error || 'Error reindexando grupo');
        }
    } catch (error) {
        console.error('Error reindexando grupo:', error);
        updateProgress('❌ Error en la reindexación', {
            logMessage: `❌ Error: ${error.message}`
        });
        showMessage(`Error reindexando grupo: ${error.message}`, 'error');
    } finally {
        reindexingInProgress = false;
        stopProgressMonitoring();
    }
}

async function removeGroup(groupId) {
    if (!confirm('¿Estás seguro de que quieres eliminar este grupo? Se eliminarán todos sus datos indexados.')) {
        return;
    }
    
    // Esta funcionalidad se implementaría con un endpoint DELETE /groups/:id
    showMessage('Funcionalidad de eliminación no implementada aún', 'error');
}

// Event listeners para botones
function setupEventListeners() {
    // Agregar grupo
    if (addGroupForm) {
        addGroupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const formData = new FormData(addGroupForm);
            const groupData = {
                groupId: formData.get('groupId').trim(),
                groupName: formData.get('groupName').trim() || null,
                indexSubgroups: formData.has('indexSubgroups')
            };
            
            if (!groupData.groupId) {
                showMessage('El ID del grupo es requerido', 'error');
                return;
            }
            
            addGroupBtn.disabled = true;
            addGroupBtn.textContent = 'Indexando...';
            
            try {
                const response = await fetch('/groups', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(groupData)
                });
                
                const data = await response.json();
                
                if (data.success) {
                    showMessage(`Grupo indexado exitosamente: ${data.projectsIndexed} proyectos, ${data.totalChunks} chunks`, 'success');
                    addGroupForm.reset();
                    document.getElementById('include-subgroups').checked = true;
                    await loadGroups();
                } else {
                    throw new Error(data.error || 'Error agregando grupo');
                }
            } catch (error) {
                console.error('Error agregando grupo:', error);
                showMessage(`Error agregando grupo: ${error.message}`, 'error');
            } finally {
                addGroupBtn.disabled = false;
                addGroupBtn.textContent = 'Agregar e Indexar Grupo';
            }
        });
    }
    
    // Consultar
    if (queryBtn) {
        queryBtn.addEventListener('click', async () => {
            const query = queryInput.value.trim();
            if (!query) {
                showMessage('Escribe una pregunta para consultar', 'error');
                return;
            }
            
            const groupId = groupSelect.value;
            
            queryBtn.disabled = true;
            queryBtn.textContent = 'Consultando...';
            queryResponse.textContent = 'Procesando consulta...';
            queryResponse.style.display = 'block';
            
            try {
                const response = await fetch('/ask', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        prompt: query,
                        groupId: groupId || null,
                        aiProvider: 'claude'
                    })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    const groupInfo = groupId ? ` (Grupo: ${groups.find(g => g.groupId === groupId)?.name || groupId})` : '';
                    queryResponse.innerHTML = `
                        <strong>Respuesta${groupInfo}:</strong><br><br>
                        ${data.response.answer}
                        <br><br>
                        <small style="color: #666;">
                            Chunks encontrados: ${data.response.metadata.context_chunks_count} | 
                            Relevancia promedio: ${data.response.metadata.average_relevance} | 
                            Tiempo: ${data.response.metadata.processing_time}ms
                        </small>
                    `;
                } else {
                    throw new Error(data.error || 'Error en la consulta');
                }
            } catch (error) {
                console.error('Error en consulta:', error);
                queryResponse.innerHTML = `<strong>Error:</strong> ${error.message}`;
            } finally {
                queryBtn.disabled = false;
                queryBtn.textContent = 'Consultar';
            }
        });
    }

    // Filtro de repositorios
    const repositoryGroupFilter = document.getElementById('repository-group-filter');
    if (repositoryGroupFilter) {
        repositoryGroupFilter.addEventListener('change', loadRepositories);
    }

    // Botón de actualizar repositorios
    const refreshReposBtn = document.getElementById('refresh-repositories-btn');
    if (refreshReposBtn) {
        refreshReposBtn.addEventListener('click', loadRepositories);
    }

    // Botones del panel de debug
    const testGroupsBtn = document.getElementById('test-groups-btn');
    if (testGroupsBtn) {
        testGroupsBtn.addEventListener('click', testGroups);
    }

    const testRepositoriesBtn = document.getElementById('test-repositories-btn');
    if (testRepositoriesBtn) {
        testRepositoriesBtn.addEventListener('click', testRepositories);
    }

    const forceReloadBtn = document.getElementById('force-reload-btn');
    if (forceReloadBtn) {
        forceReloadBtn.addEventListener('click', forceReload);
    }

    // Event delegation para botones dinámicos
    document.addEventListener('click', function(event) {
        // Botones de reindexar repositorios
        if (event.target.classList.contains('btn-reindex') && event.target.getAttribute('data-project')) {
            const projectName = event.target.getAttribute('data-project');
            const groupId = event.target.getAttribute('data-group');
            if (projectName) {
                reindexRepository(projectName, groupId);
            }
        }
        
        // Botones de reindexar grupos
        if (event.target.classList.contains('btn-reindex') && event.target.getAttribute('data-group-id')) {
            const groupId = event.target.getAttribute('data-group-id');
            if (groupId) {
                reindexGroup(groupId);
            }
        }
        
        // Botones de eliminar grupos
        if (event.target.classList.contains('btn-remove') && event.target.getAttribute('data-group-id')) {
            const groupId = event.target.getAttribute('data-group-id');
            if (groupId) {
                removeGroup(groupId);
            }
        }
    });
}

// Debug function para mostrar que el JavaScript se está ejecutando
function showDebugInfo() {
    console.log('JavaScript se está ejecutando correctamente');
    const debugDiv = document.createElement('div');
    debugDiv.innerHTML = '🟢 JavaScript cargado correctamente';
    debugDiv.style.cssText = 'position:fixed;top:10px;right:10px;background:green;color:white;padding:10px;z-index:9999;border-radius:5px;';
    document.body.appendChild(debugDiv);
    setTimeout(() => debugDiv.remove(), 3000);
}

// Funciones de debug
function debugLog(message) {
    const timestamp = new Date().toLocaleTimeString();
    const logMessage = `[${timestamp}] ${message}`;
    
    // Log a consola siempre
    console.log(logMessage);
    
    // Log al panel de debug si existe
    const debugOutput = document.getElementById('debug-output');
    if (debugOutput) {
        debugOutput.innerHTML += logMessage + '<br>';
        debugOutput.scrollTop = debugOutput.scrollHeight;
    }
    
    // Log a una lista global para debugging
    if (!window.debugLogs) window.debugLogs = [];
    window.debugLogs.push(logMessage);
    if (window.debugLogs.length > 100) {
        window.debugLogs = window.debugLogs.slice(-50); // Mantener solo los últimos 50
    }
}

async function testGroups() {
    debugLog('🔄 Probando endpoint /groups...');
    try {
        const response = await fetch('/groups');
        debugLog(`✅ Response status: ${response.status}`);
        const data = await response.json();
        debugLog(`📊 Datos recibidos: ${JSON.stringify(data, null, 2)}`);
        if (data.success) {
            groups = data.groups;
            renderGroups();
            updateGroupSelect();
        }
    } catch (error) {
        debugLog(`❌ Error: ${error.message}`);
    }
}

async function testRepositories() {
    debugLog('🔄 Probando endpoint /repositories...');
    try {
        // Filtrar solo repositorios del grupo 890 (PLABACOM)
        const response = await fetch('/repositories?groupId=890');
        debugLog(`✅ Response status: ${response.status}`);
        const data = await response.json();
        debugLog(`📊 Datos recibidos (filtrado por grupo 890): ${JSON.stringify(data, null, 2)}`);
        if (data.success) {
            repositories = data.repositories;
            renderRepositories();
            debugLog(`✅ Mostrando ${repositories.length} repositorios del grupo PLABACOM (890)`);
        }
    } catch (error) {
        debugLog(`❌ Error: ${error.message}`);
    }
}

function forceReload() {
    console.log('🔄 ForceReload ejecutado');
    debugLog('🔄 Forzando recarga de datos...');
    
    // Limpiar datos existentes
    groups = [];
    repositories = [];
    
    // Mostrar indicadores de carga
    if (groupsList) {
        groupsList.innerHTML = '<div class="loading">🔄 Recargando grupos...</div>';
    }
    if (repositoriesList) {
        repositoriesList.innerHTML = '<div class="loading">🔄 Recargando repositorios...</div>';
    }
    
    // Ejecutar cargas
    loadGroups();
    loadRepositories();
}

// Verificar que todos los elementos DOM existan
function checkDOMElements() {
    const elements = {
        'groups-list': groupsList,
        'repositories-list': repositoriesList,
        'group-select': groupSelect,
        'debug-output': document.getElementById('debug-output')
    };
    
    debugLog('🔍 Verificando elementos DOM...');
    for (const [name, element] of Object.entries(elements)) {
        if (element) {
            debugLog(`✅ ${name}: encontrado`);
        } else {
            debugLog(`❌ ${name}: NO encontrado`);
        }
    }
}

// Inicialización
async function init() {
    showDebugInfo();
    setupEventListeners();
    checkDOMElements();
    
    // Cargar grupos primero
    await loadGroups();
    
    // Después de cargar grupos, configurar filtro para grupo 890 (PLABACOM)
    const repositoryGroupFilter = document.getElementById('repository-group-filter');
    if (repositoryGroupFilter) {
        repositoryGroupFilter.value = '890';  // Seleccionar automáticamente PLABACOM
        debugLog('✅ Filtro configurado automáticamente para grupo 890 (PLABACOM)');
    }
    
    // Cargar repositorios con el filtro aplicado
    loadRepositories();
}

// Cargar datos al iniciar
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}