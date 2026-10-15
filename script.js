const STORAGE_KEY = 'smartgov360-incidents-v1';
const STORAGE_BACKUP_KEY = 'smartgov360-incidents-v1-backup';
const ADMIN_USERS_KEY = 'smartgov360-admin-users-v1';
const ADMIN_SESSION_KEY = 'smartgov360-admin-session-v1';
const SYSTEM_ADMIN_ROLE = 'system_admin';
const CATEGORY_ADMIN_ROLE = 'category_admin';

const occurrenceForm = document.getElementById('occurrence-form');
const formMessage = document.getElementById('form-message');
const submitButton = document.getElementById('submit-button');
const submitLoading = document.getElementById('submit-loading');
const cepMessage = document.getElementById('cep-message');
const cepInput = document.getElementById('cep');
const streetInput = document.getElementById('street');
const numberInput = document.getElementById('number');
const noNumberCheckbox = document.getElementById('no-number');
const neighborhoodInput = document.getElementById('neighborhood');
const cityInput = document.getElementById('city');
const stateInput = document.getElementById('state');
const phoneInput = document.getElementById('phone');
const categoryInput = document.getElementById('category');
const priorityInput = document.getElementById('priority');
const photoInput = document.getElementById('photo');
const photoCameraFallback = document.getElementById('photo-camera-fallback');
const cameraOpenBtn = document.getElementById('camera-open');
const photoPreview = document.getElementById('photo-preview');
const photoPreviewImg = document.getElementById('photo-preview-img');
const photoPreviewName = document.getElementById('photo-preview-name');
const photoRemoveBtn = document.getElementById('photo-remove');
const photoMessage = document.getElementById('photo-message');
const cameraModal = document.getElementById('camera-modal');
const cameraVideo = document.getElementById('camera-video');
const cameraCanvas = document.getElementById('camera-canvas');
const cameraCaptureBtn = document.getElementById('camera-capture');
const cameraRetakeBtn = document.getElementById('camera-retake');
const cameraUseBtn = document.getElementById('camera-use');
const cameraSwitchBtn = document.getElementById('camera-switch');
const cameraCancelBtn = document.getElementById('camera-cancel');
const cameraMessage = document.getElementById('camera-message');
let capturedPhotoFile = null;
const categorySelect = document.getElementById('category-select');
const prioritySelect = document.getElementById('priority-select');
const categoryList = document.getElementById('category-list');
const priorityList = document.getElementById('priority-list');
const newCategoryInput = document.getElementById('new-category');
const newPriorityInput = document.getElementById('new-priority');
const addCategoryBtn = document.getElementById('add-category-btn');
const addPriorityBtn = document.getElementById('add-priority-btn');
const geoRadio = document.getElementById('location-geo');
const manualRadio = document.getElementById('location-manual');
const addressFields = document.getElementById('address-fields');
const detailsFields = document.getElementById('details-fields');
const geoMessage = document.getElementById('geo-message');
const geoModal = document.getElementById('geo-permission-modal');
const geoModalSteps = document.getElementById('geo-modal-steps');
const geoModalRetry = document.getElementById('geo-modal-retry');
const geoModalManual = document.getElementById('geo-modal-manual');
const geoModalMessage = document.getElementById('geo-modal-message');
const loginForm = document.getElementById('login-form');
const loginMessage = document.getElementById('login-message');
const adminLogin = document.getElementById('admin-login');
const adminDashboard = document.getElementById('admin-dashboard');
const adminSettings = document.getElementById('admin-settings');
const incidentList = document.getElementById('incident-list');
const logoutBtn = document.getElementById('logout-btn');
const adminUserForm = document.getElementById('admin-user-form');
const newAdminUsernameInput = document.getElementById('new-admin-username');
const newAdminPasswordInput = document.getElementById('new-admin-password');
const newAdminRoleSelect = document.getElementById('new-admin-role');
const userCategoriesWrap = document.getElementById('user-categories-wrap');
const userCategoryAccess = document.getElementById('user-category-access');
const adminUsersList = document.getElementById('admin-users-list');
const year = document.getElementById('year');
let adminMap = null;
let googleMapsLoaded = false;
let adminMarkers = [];
let userLocationMarker = null;
let currentAdminUser = null;

function normalizeHistoryEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;

  return {
    id: entry.id || crypto.randomUUID(),
    type: entry.type === 'status' ? 'status' : 'work',
    text: (entry.text || '').toString(),
    by: (entry.by || '').toString(),
    at: entry.at || new Date().toISOString()
  };
}

function normalizeIncident(incident) {
  if (!incident || typeof incident !== 'object') return null;

  const history = Array.isArray(incident.history)
    ? incident.history.map(normalizeHistoryEntry).filter(Boolean)
    : [];

  // Backfill history for occurrences that already had a latest update, before timeline support.
  if (!history.length && incident.workUpdate) {
    history.push({
      id: crypto.randomUUID(),
      type: 'work',
      text: incident.workUpdate,
      by: incident.workUpdatedBy || '',
      at: incident.workUpdatedAt || incident.createdAt || new Date().toISOString()
    });
  }

  return {
    ...incident,
    workUpdate: incident.workUpdate || '',
    workUpdatedBy: incident.workUpdatedBy || '',
    workUpdatedAt: incident.workUpdatedAt || '',
    history
  };
}

function onGoogleMapsLoaded() {
  googleMapsLoaded = true;
  if (adminDashboard && !adminDashboard.classList.contains('hidden') && tabOccurrences?.classList.contains('active')) {
    refreshDashboard();
  }
}

// As ocorrencias vivem no servidor. O cliente guarda so uma copia em memoria,
// carregada ao abrir o painel; toda alteracao vai pela API e a copia e
// atualizada com a resposta.
let incidentesCache = [];

function getIncidents() {
  return incidentesCache;
}

function definirIncidentes(lista) {
  incidentesCache = (Array.isArray(lista) ? lista : []).map(normalizeIncident).filter(Boolean);
  return incidentesCache;
}

function substituirIncidenteNoCache(incidente) {
  const normalizado = normalizeIncident(incidente);
  if (!normalizado) return;
  const indice = incidentesCache.findIndex((item) => item.id === normalizado.id);
  if (indice === -1) incidentesCache.unshift(normalizado);
  else incidentesCache[indice] = normalizado;
}

async function carregarIncidentesDoServidor() {
  try {
    const resposta = await apiAutenticada('/api/incidentes');
    if (!resposta.ok) return false;
    const corpo = await resposta.json().catch(() => ({}));
    if (!Array.isArray(corpo.incidentes)) return false;
    definirIncidentes(corpo.incidentes);
    return true;
  } catch (error) {
    console.warn('[incidentes] Nao foi possivel carregar as ocorrencias:', error);
    return false;
  }
}

// Envia so os campos alterados; o servidor confere a permissao por categoria.
async function atualizarIncidenteNoServidor(id, campos) {
  try {
    const resposta = await apiAutenticada(`/api/incidentes/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(campos)
    });
    const corpo = await resposta.json().catch(() => ({}));
    if (!resposta.ok) {
      return { ok: false, erro: corpo.error || 'Não foi possível salvar a alteração.' };
    }
    substituirIncidenteNoCache(corpo.incidente);
    return { ok: true, incidente: corpo.incidente };
  } catch (error) {
    console.error('[incidentes] Falha ao atualizar:', error);
    return { ok: false, erro: 'Não foi possível falar com o servidor.' };
  }
}

const CATEGORY_CONFIG_KEY = 'smartgov360-category-config';
const PRIORITY_CONFIG_KEY = 'smartgov360-priority-config';
const DEFAULT_CATEGORIES = [
  'iluminação pública',
  'buracos',
  'árvores caídas',
  'descarte irregular',
  'boca de lobo entupida',
  'semáforo',
  'sinalização',
  'vazamentos',
  'mato alto',
  'animais mortos',
  'pontos de dengue',
  'terrenos abandonados',
  'ônibus atrasado',
  'acessibilidade',
  'poda',
  'limpeza urbana',
  'danos em praças',
  'danos em escolas',
  'danos em UBS',
  'pichações',
  'enchentes'
];
const DEFAULT_PRIORITIES = ['Baixa', 'Média', 'Alta', 'Urgente'];

function normalizePermissionValue(value) {
  return (value || '').toString().trim().toLowerCase();
}

function createDefaultSystemAdmin() {
  return {
    id: crypto.randomUUID(),
    username: 'admin',
    role: SYSTEM_ADMIN_ROLE,
    allowedCategories: [],
    createdAt: new Date().toISOString()
  };
}

// A lista local e um espelho do que o servidor devolve, sem senhas. Por isso
// a senha nao pode ser exigida aqui: se fosse, todo usuario vindo do servidor
// seria descartado e a tela mostraria so o admin padrao.
function normalizeAdminUser(user) {
  if (!user || typeof user !== 'object') return null;

  const username = (user.username || '').toString().trim();
  if (!username) return null;

  return {
    id: user.id || crypto.randomUUID(),
    username,
    role: user.role === SYSTEM_ADMIN_ROLE ? SYSTEM_ADMIN_ROLE : CATEGORY_ADMIN_ROLE,
    allowedCategories: Array.isArray(user.allowedCategories)
      ? user.allowedCategories.filter(Boolean).map((item) => item.toString().trim())
      : [],
    createdAt: user.createdAt || new Date().toISOString()
  };
}

// ------------------------------------------------------------------ sessao
//
// A autenticacao acontece no servidor: o login devolve um token assinado, que
// acompanha toda requisicao administrativa. O localStorage guarda apenas um
// espelho dos usuarios para a tela, nunca senhas.
const TOKEN_KEY = 'smartgov360-token';

function getToken() {
  return sessionStorage.getItem(TOKEN_KEY) || '';
}

function setToken(token) {
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
}

// fetch com o token da sessao; 401 significa sessao expirada.
async function apiAutenticada(caminho, opcoes = {}) {
  const token = getToken();
  const headers = { ...(opcoes.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opcoes.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';

  const resposta = await fetch(caminho, { ...opcoes, headers });

  if (resposta.status === 401) {
    setToken('');
    if (typeof hideAdminDashboard === 'function') hideAdminDashboard();
    if (loginMessage) {
      showMessage(loginMessage, 'Sua sessão expirou. Entre novamente.', true);
    }
  }

  return resposta;
}

function saveAdminUsers(users) {
  localStorage.setItem(ADMIN_USERS_KEY, JSON.stringify(users));
}

function getAdminUsers() {
  let users = [];

  try {
    const raw = localStorage.getItem(ADMIN_USERS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        users = parsed.map(normalizeAdminUser).filter(Boolean);
      }
    }
  } catch (error) {
    users = [];
  }

  if (!users.length) {
    users = [createDefaultSystemAdmin()];
    saveAdminUsers(users);
    return users;
  }

  const hasSystemAdmin = users.some((user) => user.role === SYSTEM_ADMIN_ROLE);
  if (!hasSystemAdmin) {
    users.unshift(createDefaultSystemAdmin());
    saveAdminUsers(users);
  }

  return users;
}

function persistAdminSession(user) {
  if (!user) {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    return;
  }

  sessionStorage.setItem(
    ADMIN_SESSION_KEY,
    JSON.stringify({
      username: user.username,
      role: user.role,
      allowedCategories: user.allowedCategories || []
    })
  );
}

function restoreAdminSession() {
  try {
    const raw = sessionStorage.getItem(ADMIN_SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (!session?.username) return null;

    const user = getAdminUsers().find((item) => item.username === session.username);
    if (!user) return null;
    return user;
  } catch (error) {
    return null;
  }
}

function isSystemAdmin(user = currentAdminUser) {
  return user?.role === SYSTEM_ADMIN_ROLE;
}

function canViewIncident(incident, user = currentAdminUser) {
  if (!incident || !user) return false;
  if (isSystemAdmin(user)) return true;

  const allowed = new Set((user.allowedCategories || []).map(normalizePermissionValue));
  if (!allowed.size) return false;
  return allowed.has(normalizePermissionValue(incident.category));
}

function getVisibleIncidents(incidents) {
  if (!Array.isArray(incidents)) return [];
  return incidents.filter((incident) => canViewIncident(incident));
}

function ensureSystemAdminAction() {
  if (isSystemAdmin()) return true;
  showMessage(adminMessage, 'Apenas o administrador do sistema pode realizar essa ação.', true);
  return false;
}

function updateAdminRoleUi() {
  if (!newAdminRoleSelect || !userCategoriesWrap) return;
  const isCategoryAdmin = newAdminRoleSelect.value === CATEGORY_ADMIN_ROLE;
  userCategoriesWrap.style.display = isCategoryAdmin ? 'block' : 'none';
}

function renderUserCategoryAccessOptions() {
  if (!userCategoryAccess) return;
  const categories = getCategoryConfig();

  if (!categories.length) {
    userCategoryAccess.innerHTML = '<p>Nenhuma categoria cadastrada.</p>';
    return;
  }

  userCategoryAccess.innerHTML = categories
    .map(
      (category, index) => `
        <label class="radio-option" for="access-category-${index}">
          <input id="access-category-${index}" type="checkbox" value="${category}" name="access-category" />
          ${category}
        </label>
      `
    )
    .join('');
}

function renderAdminUsers() {
  if (!adminUsersList) return;

  const users = getAdminUsers();
  adminUsersList.innerHTML = users
    .map((user) => {
      const profileLabel = user.role === SYSTEM_ADMIN_ROLE ? 'Administrador do sistema' : 'Administrador por categoria';
      const categoriesLabel = user.role === SYSTEM_ADMIN_ROLE
        ? 'Acesso: todas as categorias'
        : `Acesso: ${(user.allowedCategories || []).join(', ') || 'nenhuma categoria'}`;

      return `
        <li class="admin-list-item" data-user-id="${user.id}">
          <div>
            <strong>${user.username}</strong><br />
            <small>${profileLabel}</small><br />
            <small>${categoriesLabel}</small>
          </div>
          ${user.username === currentAdminUser?.username ? '' : '<div style="display:flex; gap:6px;"><button type="button" class="btn btn-secondary" data-action="edit-admin-user" data-user-id="' + user.id + '">Editar</button><button type="button" class="btn btn-danger" data-action="remove-admin-user" data-user-id="' + user.id + '">Remover</button></div>'}
        </li>
      `;
    })
    .join('');
}

function syncUsersWithCurrentCategories() {
  const validCategories = new Set(getCategoryConfig().map(normalizePermissionValue));
  const users = getAdminUsers();
  const updated = users.map((user) => {
    if (user.role === SYSTEM_ADMIN_ROLE) return user;
    const allowedCategories = (user.allowedCategories || []).filter((category) => validCategories.has(normalizePermissionValue(category)));
    return { ...user, allowedCategories };
  });

  saveAdminUsers(updated);

  if (currentAdminUser) {
    const refreshed = updated.find((user) => user.username === currentAdminUser.username);
    if (refreshed) {
      currentAdminUser = refreshed;
      persistAdminSession(refreshed);
    }
  }
}

function updateTabVisibilityByRole() {
  const restrictedTabs = [tabCategories, tabPriorities, tabUsers, tabNotifications, tabExecutive];
  const restrictedPanels = [panelCategories, panelPriorities, panelUsers, panelNotifications, panelExecutive];

  if (isSystemAdmin()) {
    restrictedTabs.forEach((tab) => {
      if (tab) tab.style.display = '';
    });
    if (clearIncidentsBtn) clearIncidentsBtn.style.display = '';
    return;
  }

  restrictedTabs.forEach((tab) => {
    if (tab) tab.style.display = 'none';
  });
  restrictedPanels.forEach((panel) => {
    if (panel) panel.classList.add('hidden');
  });

  if (clearIncidentsBtn) clearIncidentsBtn.style.display = 'none';
  if (tabOccurrences && panelOccurrences) {
    tabOccurrences.classList.add('active');
    panelOccurrences.classList.remove('hidden');
  }
}

function createAdminUser(event) {
  event.preventDefault();
  if (!ensureSystemAdminAction()) return;

  const username = newAdminUsernameInput?.value?.trim() || '';
  const password = newAdminPasswordInput?.value?.trim() || '';
  const role = newAdminRoleSelect?.value === SYSTEM_ADMIN_ROLE ? SYSTEM_ADMIN_ROLE : CATEGORY_ADMIN_ROLE;

  if (!username) {
    showMessage(adminMessage, 'Informe o nome de usuário.', true);
    return;
  }

  if (!editingUserId && !password) {
    showMessage(adminMessage, 'Informe usuário e senha para cadastrar o administrador.', true);
    return;
  }

  const users = getAdminUsers();
  const duplicated = users.some(
    (user) => normalizePermissionValue(user.username) === normalizePermissionValue(username) && user.id !== editingUserId
  );
  if (duplicated) {
    showMessage(adminMessage, 'Já existe um usuário com esse nome.', true);
    return;
  }

  let allowedCategories = [];
  if (role === CATEGORY_ADMIN_ROLE) {
    allowedCategories = Array.from(document.querySelectorAll('input[name="access-category"]:checked')).map((node) => node.value);
    if (!allowedCategories.length) {
      showMessage(adminMessage, 'Selecione ao menos uma categoria para este perfil.', true);
      return;
    }
  }

  if (editingUserId) {
    atualizarUsuarioNoServidor(editingUserId, { username, senha: password, role, allowedCategories });
  } else {
    criarUsuarioNoServidor({ username, senha: password, role, allowedCategories });
  }
}

// A edicao tambem acontece no servidor: senha vazia mantem a atual.
async function atualizarUsuarioNoServidor(userId, dados) {
  try {
    const resposta = await apiAutenticada(`/api/auth/usuarios/${encodeURIComponent(userId)}`, {
      method: 'PUT',
      body: JSON.stringify(dados)
    });

    const corpo = await resposta.json().catch(() => ({}));

    if (!resposta.ok) {
      showMessage(adminMessage, corpo.error || 'Não foi possível atualizar o usuário.', true);
      return false;
    }

    await sincronizarUsuariosDoServidor();
    cancelEditUser();
    renderAdminUsers();
    showMessage(adminMessage, 'Usuário atualizado com sucesso.', false);
    return true;
  } catch (error) {
    console.error('Falha ao atualizar usuario:', error);
    showMessage(adminMessage, 'Não foi possível falar com o servidor.', true);
    return false;
  }
}

// O usuario e criado no servidor, que guarda a senha com hash. A lista local
// so espelha o que voltou de la.
async function criarUsuarioNoServidor(dados) {
  try {
    const resposta = await apiAutenticada('/api/auth/usuarios', {
      method: 'POST',
      body: JSON.stringify(dados)
    });

    const corpo = await resposta.json().catch(() => ({}));

    if (!resposta.ok) {
      showMessage(adminMessage, corpo.error || 'Não foi possível cadastrar o usuário.', true);
      return false;
    }

    await sincronizarUsuariosDoServidor();
    if (adminUserForm) adminUserForm.reset();
    updateAdminRoleUi();
    renderUserCategoryAccessOptions();
    renderAdminUsers();
    showMessage(adminMessage, 'Usuário administrador cadastrado com sucesso.', false);
    return true;
  } catch (error) {
    console.error('Falha ao cadastrar usuario:', error);
    showMessage(adminMessage, 'Não foi possível falar com o servidor.', true);
    return false;
  }
}

// Traz do servidor a lista de administradores (sem senhas) para a tela.
async function sincronizarUsuariosDoServidor() {
  try {
    const resposta = await apiAutenticada('/api/auth/usuarios');
    if (!resposta.ok) return false;

    const corpo = await resposta.json();
    if (!Array.isArray(corpo.usuarios)) return false;

    localStorage.setItem(ADMIN_USERS_KEY, JSON.stringify(corpo.usuarios));
    return true;
  } catch (error) {
    console.warn('[auth] Nao foi possivel obter os usuarios:', error);
    return false;
  }
}

async function removeAdminUser(userId) {
  if (!ensureSystemAdminAction()) return;

  try {
    const resposta = await apiAutenticada(`/api/auth/usuarios/${encodeURIComponent(userId)}`, {
      method: 'DELETE'
    });
    const corpo = await resposta.json().catch(() => ({}));

    if (!resposta.ok) {
      showMessage(adminMessage, corpo.error || 'Não foi possível remover o usuário.', true);
      return;
    }

    await sincronizarUsuariosDoServidor();
    renderAdminUsers();
    showMessage(adminMessage, 'Usuário removido com sucesso.', false);
  } catch (error) {
    console.error('Falha ao remover usuario:', error);
    showMessage(adminMessage, 'Não foi possível falar com o servidor.', true);
  }
}

function startEditUser(userId) {
  if (!ensureSystemAdminAction()) return;
  const users = getAdminUsers();
  const user = users.find((u) => u.id === userId);
  if (!user) return;

  editingUserId = userId;

  if (newAdminUsernameInput) newAdminUsernameInput.value = user.username;
  if (newAdminPasswordInput) {
    newAdminPasswordInput.value = '';
    newAdminPasswordInput.removeAttribute('required');
    newAdminPasswordInput.placeholder = 'Deixe vazio para manter a senha atual';
  }
  if (newAdminRoleSelect) newAdminRoleSelect.value = user.role;

  updateAdminRoleUi();
  renderUserCategoryAccessOptions();

  if (user.role === CATEGORY_ADMIN_ROLE && user.allowedCategories) {
    const normalizedAllowed = new Set(user.allowedCategories.map(normalizePermissionValue));
    document.querySelectorAll('input[name="access-category"]').forEach((checkbox) => {
      checkbox.checked = normalizedAllowed.has(normalizePermissionValue(checkbox.value));
    });
  }

  const createBtn = document.getElementById('create-admin-user-btn');
  const cancelBtn = document.getElementById('cancel-edit-user-btn');
  if (createBtn) createBtn.textContent = 'Salvar alterações';
  if (cancelBtn) cancelBtn.style.display = '';
}

function cancelEditUser() {
  editingUserId = null;

  if (adminUserForm) adminUserForm.reset();
  if (newAdminPasswordInput) {
    newAdminPasswordInput.setAttribute('required', '');
    newAdminPasswordInput.placeholder = 'Defina uma senha';
  }
  updateAdminRoleUi();
  renderUserCategoryAccessOptions();

  const createBtn = document.getElementById('create-admin-user-btn');
  const cancelBtn = document.getElementById('cancel-edit-user-btn');
  if (createBtn) createBtn.textContent = 'Cadastrar usuário';
  if (cancelBtn) cancelBtn.style.display = 'none';
}

async function showAdminDashboard(user) {
  currentAdminUser = user;
  persistAdminSession(user);

  if (adminDashboard && adminLogin) {
    adminLogin.classList.add('hidden');
    adminDashboard.classList.remove('hidden');
  }

  updateTabVisibilityByRole();
  const sbUser = document.getElementById('sidebar-user');
  const sbRole = document.getElementById('sidebar-role');
  const sbAvatar = document.getElementById('sidebar-avatar');
  if (sbUser) sbUser.textContent = user?.username || '—';
  if (sbRole) sbRole.textContent = isSystemAdmin(user) ? 'Gabinete · administrador do sistema' : 'Secretaria · ' + ((user?.allowedCategories || []).join(', ') || 'sem categorias');
  if (sbAvatar) sbAvatar.textContent = (user?.username || '?').slice(0, 2).toUpperCase();
  // O prefeito abre na Visao do Prefeito; a secretaria, nas suas ocorrencias.
  switchTab(isSystemAdmin(user) ? 'executive' : 'occurrences');
  await carregarIncidentesDoServidor();
  refreshDashboard();
  if (isSystemAdmin()) {
    renderAdminConfig();
    renderUserCategoryAccessOptions();
    renderAdminUsers();
  }
}

function hideAdminDashboard() {
  currentAdminUser = null;
  persistAdminSession(null);
  definirIncidentes([]);

  if (adminLogin && adminDashboard) {
    adminLogin.classList.remove('hidden');
    adminDashboard.classList.add('hidden');
  }
}

// `permitirVazio` so e usado pela acao de limpar tudo do painel. Qualquer outra
// gravacao que zeraria a base e recusada: e sempre sintoma de bug, nunca intencao.
// Ocorrencias que ficaram gravadas no navegador pela versao anterior, quando
// ainda nao existia armazenamento no servidor.
function lerIncidentesLocaisAntigos() {
  try {
    const bruto = localStorage.getItem(STORAGE_KEY);
    if (!bruto) return [];
    const lista = JSON.parse(bruto);
    return Array.isArray(lista) ? lista : [];
  } catch (error) {
    return [];
  }
}

// Ferramentas para uso no console do navegador.
window.smartgovIncidentes = {
  // Copia em memoria do que o servidor devolveu para este usuario.
  listar: () => getIncidents(),

  // O que a versao antiga deixou gravado neste navegador.
  listarLocaisAntigos: () => lerIncidentesLocaisAntigos(),

  // JSON para guardar fora do navegador.
  exportar: () => JSON.stringify(getIncidents(), null, 2),

  // Envia ao servidor as ocorrencias antigas deste navegador (uma unica vez).
  async migrarLocaisParaServidor() {
    const locais = lerIncidentesLocaisAntigos();
    if (!locais.length) {
      console.warn('Nao ha ocorrencias antigas neste navegador.');
      return 0;
    }
    let enviadas = 0;
    for (const item of locais) {
      const resposta = await fetch('/api/incidentes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...item, consentimento: { aceito: true, em: item.createdAt || new Date().toISOString(), versao: 'migracao' } })
      });
      if (resposta.ok) enviadas += 1;
      else console.warn('Falhou:', item.id, await resposta.text());
    }
    if (enviadas === locais.length) {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STORAGE_BACKUP_KEY);
    }
    console.log('Migradas', enviadas, 'de', locais.length, 'ocorrencia(s). Recarregue a pagina.');
    return enviadas;
  }
};

const TERMOS_CATEGORIA_GENERICA = ['outros', 'outras', 'diversos', 'geral', 'nao classificado'];
const CATEGORIA_GENERICA_PADRAO = 'outros';

function textoComparavel(valor) {
  return (valor || '').toString().trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Toda ocorrencia precisa de uma categoria que exista na lista — e ela que
// popula as permissoes por administrador. Por isso a lista sempre oferece um
// destino para o que nao se encaixa em nenhuma categoria especifica.
function garantirCategoriaGenerica(lista) {
  const temGenerica = lista.some((item) => TERMOS_CATEGORIA_GENERICA.includes(textoComparavel(item)));
  return temGenerica ? lista : [...lista, CATEGORIA_GENERICA_PADRAO];
}

// A categoria usada quando a classificacao nao retorna nada aproveitavel.
function categoriaGenerica() {
  const lista = getCategoryConfig();
  return lista.find((item) => TERMOS_CATEGORIA_GENERICA.includes(textoComparavel(item)))
    || CATEGORIA_GENERICA_PADRAO;
}

function getCategoryConfig() {
  const saved = localStorage.getItem(CATEGORY_CONFIG_KEY);
  if (!saved) return garantirCategoriaGenerica(DEFAULT_CATEGORIES.slice());

  try {
    const parsed = JSON.parse(saved);
    const lista = Array.isArray(parsed) && parsed.length ? parsed : DEFAULT_CATEGORIES.slice();
    return garantirCategoriaGenerica(lista);
  } catch (error) {
    return garantirCategoriaGenerica(DEFAULT_CATEGORIES.slice());
  }
}

function getPriorityConfig() {
  const saved = localStorage.getItem(PRIORITY_CONFIG_KEY);
  if (!saved) return DEFAULT_PRIORITIES.slice();

  try {
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) && parsed.length ? parsed : DEFAULT_PRIORITIES.slice();
  } catch (error) {
    return DEFAULT_PRIORITIES.slice();
  }
}

// O localStorage e apenas um cache local para leitura sincrona. A lista que
// vale para todos — inclusive para o cidadao, que usa outro navegador — fica
// no servidor, e toda alteracao e enviada para la.
function saveCategoryConfig(list) {
  localStorage.setItem(CATEGORY_CONFIG_KEY, JSON.stringify(list));
  enviarConfiguracaoAoServidor({ categories: list });
}

function savePriorityConfig(list) {
  localStorage.setItem(PRIORITY_CONFIG_KEY, JSON.stringify(list));
  enviarConfiguracaoAoServidor({ priorities: list });
}

async function enviarConfiguracaoAoServidor(config) {
  try {
    const resposta = await apiAutenticada('/api/config', {
      method: 'PUT',
      body: JSON.stringify(config)
    });

    if (!resposta.ok) {
      console.error('[config] O servidor recusou a alteracao:', resposta.status);
      if (adminMessage) {
        const motivo = resposta.status === 401 || resposta.status === 403
          ? 'Sua sessão não tem permissão para alterar as categorias.'
          : 'A alteração foi salva neste navegador, mas o servidor recusou. A classificação por IA pode não refletir a mudança.';
        showMessage(adminMessage, motivo, true);
      }
      return false;
    }

    // Reaproveita a lista normalizada que o servidor devolve.
    const salvo = await resposta.json();
    if (Array.isArray(salvo.categories) && salvo.categories.length) {
      localStorage.setItem(CATEGORY_CONFIG_KEY, JSON.stringify(salvo.categories));
    }
    if (Array.isArray(salvo.priorities) && salvo.priorities.length) {
      localStorage.setItem(PRIORITY_CONFIG_KEY, JSON.stringify(salvo.priorities));
    }
    return true;
  } catch (error) {
    console.error('[config] Falha ao enviar a configuracao:', error);
    if (adminMessage) {
      showMessage(adminMessage, 'A alteração foi salva neste navegador, mas não chegou ao servidor. Verifique a conexão.', true);
    }
    return false;
  }
}

// Ao abrir o site, alinha o cache local com a lista em vigor no servidor.
// E o que faz uma categoria adicionada ou removida no painel valer para
// a classificacao de qualquer visitante.
async function carregarConfiguracaoDoServidor() {
  try {
    const resposta = await fetch('/api/config');
    if (!resposta.ok) return false;

    const config = await resposta.json();
    let mudou = false;

    if (Array.isArray(config.categories) && config.categories.length) {
      const atual = localStorage.getItem(CATEGORY_CONFIG_KEY);
      const novo = JSON.stringify(config.categories);
      if (atual !== novo) {
        localStorage.setItem(CATEGORY_CONFIG_KEY, novo);
        mudou = true;
      }
    }

    if (Array.isArray(config.priorities) && config.priorities.length) {
      const atual = localStorage.getItem(PRIORITY_CONFIG_KEY);
      const novo = JSON.stringify(config.priorities);
      if (atual !== novo) {
        localStorage.setItem(PRIORITY_CONFIG_KEY, novo);
        mudou = true;
      }
    }

    // Redesenha o que ja estiver na tela com a lista atualizada.
    if (mudou) {
      if (typeof renderCategoryConfig === 'function') renderCategoryConfig();
      if (typeof renderPriorityConfig === 'function') renderPriorityConfig();
      if (typeof renderUserCategoryAccessOptions === 'function') renderUserCategoryAccessOptions();
    }

    return true;
  } catch (error) {
    // Sem servidor, segue com o cache local.
    console.warn('[config] Nao foi possivel obter a configuracao do servidor:', error);
    return false;
  }
}

carregarConfiguracaoDoServidor();

function renderCategoryConfig() {
  if (!categoryList) return;
  const categories = getCategoryConfig();
  categoryList.innerHTML = categories
    .map((item, index) => `
      <li class="admin-list-item" data-index="${index}" data-type="category">
        <span class="item-label">${item}</span>
        <div class="item-actions">
          <button type="button" class="btn btn-secondary edit-btn" data-action="edit" data-index="${index}" data-type="category">Editar</button>
          <button type="button" class="btn remove-btn" data-action="remove" data-index="${index}" data-type="category">✕</button>
        </div>
      </li>
    `)
    .join('');
}

function renderPriorityConfig() {
  if (!priorityList) return;
  const priorities = getPriorityConfig();
  priorityList.innerHTML = priorities
    .map((item, index) => `
      <li class="admin-list-item" data-index="${index}" data-type="priority">
        <span class="item-label">${item}</span>
        <div class="item-actions">
          <button type="button" class="btn btn-secondary edit-btn" data-action="edit" data-index="${index}" data-type="priority">Editar</button>
          <button type="button" class="btn remove-btn" data-action="remove" data-index="${index}" data-type="priority">✕</button>
        </div>
      </li>
    `)
    .join('');
}

let editingCategoryIndex = -1;
let editingPriorityIndex = -1;
let editingUserId = null;

function startEditItem(index, type) {
  if (type === 'category') {
    editingCategoryIndex = index;
    const list = getCategoryConfig();
    const li = categoryList.querySelector(`li[data-index="${index}"]`);
    if (!li) return;
    li.innerHTML = `<input class="edit-input" value="${list[index]}" /> <button class="btn btn-primary save-btn" data-action="save" data-type="category" data-index="${index}">Salvar</button> <button class="btn" data-action="cancel" data-type="category">Cancelar</button>`;
  }
  if (type === 'priority') {
    editingPriorityIndex = index;
    const list = getPriorityConfig();
    const li = priorityList.querySelector(`li[data-index="${index}"]`);
    if (!li) return;
    li.innerHTML = `<input class="edit-input" value="${list[index]}" /> <button class="btn btn-primary save-btn" data-action="save" data-type="priority" data-index="${index}">Salvar</button> <button class="btn" data-action="cancel" data-type="priority">Cancelar</button>`;
  }
}

function saveEditItem(index, type) {
  if (type === 'category') {
    const li = categoryList.querySelector(`li[data-index="${index}"]`);
    if (!li) return;
    const input = li.querySelector('.edit-input');
    if (!input) return;
    const val = input.value.trim();
    if (!val) return;
    const list = getCategoryConfig();
    list[index] = val;
    saveCategoryConfig(list);
    syncUsersWithCurrentCategories();
    editingCategoryIndex = -1;
    renderCategoryConfig();
    renderAdminUsers();
    renderUserCategoryAccessOptions();
  }
  if (type === 'priority') {
    const li = priorityList.querySelector(`li[data-index="${index}"]`);
    if (!li) return;
    const input = li.querySelector('.edit-input');
    if (!input) return;
    const val = input.value.trim();
    if (!val) return;
    const list = getPriorityConfig();
    list[index] = val;
    savePriorityConfig(list);
    editingPriorityIndex = -1;
    renderPriorityConfig();
  }
}

function cancelEdit(type) {
  if (type === 'category') {
    editingCategoryIndex = -1;
    renderCategoryConfig();
  }
  if (type === 'priority') {
    editingPriorityIndex = -1;
    renderPriorityConfig();
  }
}

function renderAdminConfig() {
  renderCategoryConfig();
  renderPriorityConfig();
  renderUserCategoryAccessOptions();
}

function addCategory() {
  if (!newCategoryInput) return;
  const value = newCategoryInput.value.trim();
  if (!value) return;
  const categories = getCategoryConfig();
  if (!categories.includes(value)) {
    categories.push(value);
    saveCategoryConfig(categories);
    renderCategoryConfig();
    newCategoryInput.value = '';
  }
}

function buildIncidentAddress(incident) {
  if (incident.address) return incident.address;
  const fields = [incident.street, incident.number, incident.neighborhood, incident.city, incident.state].filter(Boolean);
  return fields.join(', ');
}

function geocodeAddress(address) {
  if (!window.google || !window.google.maps) return Promise.resolve(null);
  const geocoder = new google.maps.Geocoder();
  return new Promise((resolve) => {
    geocoder.geocode({ address }, (results, status) => {
      if (status === 'OK' && results[0]) {
        const location = results[0].geometry.location;
        resolve({ latitude: location.lat(), longitude: location.lng() });
      } else {
        resolve(null);
      }
    });
  });
}

// Coordenada vazia nao e coordenada: Number('') vale 0, e o marcador iria parar
// no ponto 0,0 do mapa em vez de ser localizado pelo endereco.
function temCoordenadas(incident) {
  const valida = (valor) => valor !== '' && valor !== null && valor !== undefined && Number.isFinite(Number(valor));
  return Boolean(incident) && valida(incident.latitude) && valida(incident.longitude);
}

async function resolveIncidentCoordinates(incident) {
  if (temCoordenadas(incident)) {
    return incident;
  }

  const address = buildIncidentAddress(incident);
  if (!address) {
    return incident;
  }

  const coords = await geocodeAddress(address);
  if (coords) {
    incident.latitude = coords.latitude;
    incident.longitude = coords.longitude;
  }

  return incident;
}

async function ensureIncidentCoordinates(incidents) {
  if (!googleMapsLoaded) return incidents;

  const updated = [];
  for (const incident of incidents) {
    const tinhaCoordenadas = temCoordenadas(incident);
    const resolvido = await resolveIncidentCoordinates({ ...incident });
    updated.push(resolvido);

    // Coordenada recem-geocodificada: persiste so esse campo, nesta ocorrencia.
    // Nunca se grava a lista inteira (que pode ser um subconjunto filtrado).
    if (!tinhaCoordenadas && resolvido.latitude && resolvido.longitude) {
      atualizarIncidenteNoServidor(incident.id, { latitude: resolvido.latitude, longitude: resolvido.longitude });
    }
  }

  return updated;
}

async function getUserLocation() {
  if (!navigator.geolocation) return null;

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude });
      },
      () => resolve(null),
      {
        enableHighAccuracy: true,
        timeout: 10000
      }
    );
  });
}

function addMapMarker(position, title, label, map) {
  if (!window.google || !window.google.maps) return null;
  return new google.maps.Marker({
    position,
    map,
    title,
    label: label || null
  });
}

async function initMap(incidents) {
  const mapElement = document.getElementById('map');
  if (!mapElement || !googleMapsLoaded || !window.google || !window.google.maps) {
    return;
  }

  const readyIncidents = await ensureIncidentCoordinates(incidents);
  const validPoints = readyIncidents.filter((incident) => temCoordenadas(incident));

  if (!validPoints.length) {
    mapElement.innerHTML = '<p style="padding:1rem; color: var(--muted);">Nenhuma ocorrência com endereço válido para exibir no mapa.</p>';
    return;
  }

  if (adminMap) {
    adminMarkers.forEach((marker) => marker.setMap(null));
    adminMarkers = [];
    if (userLocationMarker) {
      userLocationMarker.setMap(null);
      userLocationMarker = null;
    }
  } else {
    mapElement.innerHTML = '';
    adminMap = new google.maps.Map(mapElement, {
      zoom: 12,
      center: { lat: Number(validPoints[0].latitude), lng: Number(validPoints[0].longitude) },
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false
    });
  }

  const bounds = new google.maps.LatLngBounds();
  validPoints.forEach((incident, index) => {
    const position = { lat: Number(incident.latitude), lng: Number(incident.longitude) };
    const marker = addMapMarker(position, incident.title || 'Ocorrência', String(index + 1), adminMap);
    adminMarkers.push(marker);
    bounds.extend(position);

    const infoWindow = new google.maps.InfoWindow({
      content: `
        <div style="max-width:220px;">
          <strong>${incident.title || 'Ocorrência'}</strong><br />
          <span>${incident.category || ''}</span><br />
          <span>${incident.priority || ''}</span><br />
          <small>${incident.address || buildIncidentAddress(incident) || ''}</small>
        </div>
      `
    });

    marker.addListener('click', () => infoWindow.open(adminMap, marker));
  });

  const userLocation = await getUserLocation();
  if (userLocation) {
    const userPos = { lat: userLocation.latitude, lng: userLocation.longitude };
    userLocationMarker = new google.maps.Marker({
      position: userPos,
      map: adminMap,
      title: 'Sua localização',
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 8,
        fillColor: '#2e9e62',
        fillOpacity: 0.9,
        strokeColor: '#ffffff',
        strokeWeight: 2
      }
    });
    bounds.extend(userPos);
  }

  adminMap.fitBounds(bounds, 80);
  setTimeout(() => {
    if (adminMap) {
      google.maps.event.trigger(adminMap, 'resize');
    }
  }, 0);
}

function refreshDashboard() {
  const incidents = getVisibleIncidents(getIncidents());
  renderStats(incidents);
  renderIncidents(incidents);
  if (adminDashboard && !adminDashboard.classList.contains('hidden') && tabOccurrences?.classList.contains('active')) {
    initMap(incidents);
  }
}

function showMessage(element, message, isError = false) {
  if (!element) return;
  element.textContent = message;
  element.classList.toggle('error', isError);
}

async function notifyIncidentStatusChange(incident, previousStatus, newStatus) {
  try {
    const response = await fetch('/api/notify-user', {
      method: 'POST',
      // O servidor ja limita cada envio; este e o teto do lado do painel.
      signal: AbortSignal.timeout(25000),
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        eventType: 'status_changed',
        actor: currentAdminUser?.username || 'admin',
        previousStatus,
        newStatus,
        incident
      })
    });

    return response.ok;
  } catch (error) {
    console.warn('Falha ao enviar notificação de status:', error);
    return false;
  }
}

function addPriority() {
  if (!newPriorityInput) return;
  const value = newPriorityInput.value.trim();
  if (!value) return;
  const priorities = getPriorityConfig();
  if (!priorities.includes(value)) {
    priorities.push(value);
    savePriorityConfig(priorities);
    renderPriorityConfig();
    newPriorityInput.value = '';
  }
}

function removeConfigItem(index, type) {
  if (typeof index !== 'number') return;
  if (type === 'category') {
    const list = getCategoryConfig();
    list.splice(index, 1);
    saveCategoryConfig(list);
    syncUsersWithCurrentCategories();
    renderCategoryConfig();
    renderAdminUsers();
    renderUserCategoryAccessOptions();
  }
  if (type === 'priority') {
    const list = getPriorityConfig();
    list.splice(index, 1);
    savePriorityConfig(list);
    renderPriorityConfig();
  }
}

function normalizePriority(value) {
  if (!value) return 'Média';
  const normalized = value.toString().toLowerCase();
  if (normalized.includes('urgente')) return 'Urgente';
  if (normalized.includes('alta')) return 'Alta';
  if (normalized.includes('baixa')) return 'Baixa';
  return 'Média';
}

function buildPromptLists(categories, priorities) {
  const categoryText = categories.map((item) => `• ${item}`).join('; ');
  const priorityText = priorities.join(', ');
  return { categoryText, priorityText };
}

function buildClassificationPrompt(description, categories, priorities) {
  const { categoryText, priorityText } = buildPromptLists(categories, priorities);
  return `Esta chamada trata-se de um aplicativo de zeladoria pública. Quero que identifique esta descrição e a classifique entre ${categoryText}. Classifique a prioridade entre: ${priorityText} E que envie uma descrição do problema. Descrição: ${description}`;
}

function buildImageClassificationPrompt(categories, priorities) {
  const { categoryText, priorityText } = buildPromptLists(categories, priorities);
  return `Esta chamada trata-se de um aplicativo de zeladoria pública. Quero que identifique esta imagem e gere e a classifique entre ${categoryText}. Classifique a prioridade entre: ${priorityText} E que envie uma descrição do problema`;
}

function renderStats(incidents) {
  const totalCount = document.getElementById('total-count');
  const pendingCount = document.getElementById('pending-count');
  const progressCount = document.getElementById('progress-count');
  const resolvedCount = document.getElementById('resolved-count');

  if (!totalCount || !pendingCount || !progressCount || !resolvedCount) {
    return;
  }

  totalCount.textContent = incidents.length;
  pendingCount.textContent = incidents.filter((item) => item.status === 'Recebido').length;
  progressCount.textContent = incidents.filter((item) => item.status === 'Em andamento').length;
  resolvedCount.textContent = incidents.filter((item) => item.status === 'Concluído').length;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function saveIncidentWorkUpdate(id, workUpdate) {
  const item = getVisibleIncidents(getIncidents()).find((it) => it.id === id);
  if (!item) {
    showMessage(adminMessage, 'Você não tem permissão para atualizar esta ocorrência.', true);
    return;
  }

  const now = new Date().toISOString();
  const noteText = workUpdate || 'Atualização removida pelo administrador.';
  const resultado = await atualizarIncidenteNoServidor(id, {
    workUpdate: workUpdate || '',
    workUpdatedBy: currentAdminUser?.username || '',
    workUpdatedAt: now,
    history: [
      ...(Array.isArray(item.history) ? item.history : []),
      {
        id: crypto.randomUUID(),
        type: 'work',
        text: noteText,
        by: currentAdminUser?.username || '',
        at: now
      }
    ]
  });

  if (!resultado.ok) {
    showMessage(adminMessage, resultado.erro, true);
    return;
  }
  refreshDashboard();
  showMessage(adminMessage, 'Atualização da ocorrência salva com sucesso.', false);
}

const ITENS_POR_PAGINA = 10;
let paginaAtual = 1;
const incidentPager = document.getElementById('incident-pager');

function renderPager(total) {
  if (!incidentPager) return;
  const paginas = Math.max(1, Math.ceil(total / ITENS_POR_PAGINA));
  if (paginas <= 1) {
    incidentPager.innerHTML = '';
    return;
  }
  const inicio = (paginaAtual - 1) * ITENS_POR_PAGINA + 1;
  const fim = Math.min(total, paginaAtual * ITENS_POR_PAGINA);
  const botoes = [];
  for (let p = 1; p <= paginas; p++) {
    // Mostra a primeira, a ultima e duas em volta da atual; o resto vira reticencias.
    if (p === 1 || p === paginas || Math.abs(p - paginaAtual) <= 2) {
      botoes.push(`<button type="button" class="pager-btn${p === paginaAtual ? ' active' : ''}" data-page="${p}" ${p === paginaAtual ? 'aria-current="page"' : ''}>${p}</button>`);
    } else if (botoes[botoes.length - 1] !== '<span class="pager-gap">…</span>') {
      botoes.push('<span class="pager-gap">…</span>');
    }
  }
  incidentPager.innerHTML = `
    <span class="pager-info">${inicio}–${fim} de ${total}</span>
    <button type="button" class="pager-btn" data-page="${paginaAtual - 1}" ${paginaAtual === 1 ? 'disabled' : ''} aria-label="Página anterior">‹</button>
    ${botoes.join('')}
    <button type="button" class="pager-btn" data-page="${paginaAtual + 1}" ${paginaAtual === paginas ? 'disabled' : ''} aria-label="Próxima página">›</button>`;
}

if (incidentPager) {
  incidentPager.addEventListener('click', (event) => {
    const btn = event.target.closest('button[data-page]');
    if (!btn || btn.disabled) return;
    paginaAtual = Number(btn.dataset.page) || 1;
    refreshDashboard();
    document.querySelector('#panel-occurrences .table-wrap')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  });
}

function renderIncidents(incidents) {
  if (!incidentList) {
    return;
  }

  if (!incidents.length) {
    incidentList.innerHTML = '<tr><td colspan="6">Nenhuma ocorrência cadastrada até o momento.</td></tr>';
    renderPager(0);
    return;
  }

  const paginas = Math.max(1, Math.ceil(incidents.length / ITENS_POR_PAGINA));
  if (paginaAtual > paginas) paginaAtual = paginas;
  if (paginaAtual < 1) paginaAtual = 1;
  const pagina = incidents.slice((paginaAtual - 1) * ITENS_POR_PAGINA, paginaAtual * ITENS_POR_PAGINA);
  renderPager(incidents.length);

  incidentList.innerHTML = pagina
    .map((item) => `
      <tr data-id="${item.id}">
        <td>
          ${Number.isInteger(item.protocolo) ? `<small class="protocolo-tag">#${item.protocolo}</small> ` : ''}<strong>${item.title}</strong><br />
          <small>${item.description}</small>
        </td>
        <td>${item.category}</td>
        <td>${item.priority}</td>
        <td>
          <span class="status-badge" data-status="${escapeHtml(item.status)}">${escapeHtml(item.status)}</span>
        </td>
        <td>
          <textarea class="work-update-input" data-id="${item.id}" rows="3" placeholder="Descreva o que está sendo feito...">${escapeHtml(item.workUpdate || '')}</textarea>
          <button type="button" class="btn btn-secondary save-work-update-btn" data-id="${item.id}">Salvar atualização</button>
        </td>
        <td>
          <select class="status-select" data-id="${item.id}">
            <option value="Recebido" ${item.status === 'Recebido' ? 'selected' : ''}>Recebido</option>
            <option value="Em andamento" ${item.status === 'Em andamento' ? 'selected' : ''}>Em andamento</option>
            <option value="Concluído" ${item.status === 'Concluído' ? 'selected' : ''}>Concluído</option>
          </select>
        </td>
      </tr>
    `)
    .join('');
}

const detailPanel = document.getElementById('incident-detail-panel');
const detailTitle = document.getElementById('detail-title');
const detailImage = document.getElementById('detail-image');
const detailCategory = document.getElementById('detail-category');
const detailPriority = document.getElementById('detail-priority');
const detailName = document.getElementById('detail-name');
const detailEmail = document.getElementById('detail-email');
const detailAddress = document.getElementById('detail-address');
const detailPhone = document.getElementById('detail-phone');
const detailDescription = document.getElementById('detail-description');
const detailWorkUpdate = document.getElementById('detail-work-update');
const detailWorkMeta = document.getElementById('detail-work-meta');
const detailWorkHistory = document.getElementById('detail-work-history');
const detailClose = document.getElementById('detail-close');

function renderIncidentHistory(incident) {
  if (!detailWorkHistory) return;

  const history = Array.isArray(incident?.history) ? incident.history.slice() : [];
  if (!history.length) {
    detailWorkHistory.innerHTML = '<li>Nenhum histórico registrado.</li>';
    return;
  }

  history.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  detailWorkHistory.innerHTML = history
    .map((entry) => {
      const typeLabel = entry.type === 'status' ? 'Status' : 'Atualização';
      const byLabel = entry.by || 'Sistema';
      const dateLabel = entry.at ? new Date(entry.at).toLocaleString('pt-BR') : '-';

      return `
        <li>
          <strong>${escapeHtml(typeLabel)}:</strong> ${escapeHtml(entry.text || '-')}<br />
          <small>Por ${escapeHtml(byLabel)} em ${escapeHtml(dateLabel)}</small>
        </li>
      `;
    })
    .join('');
}

function showIncidentDetail(id) {
  const incidents = getVisibleIncidents(getIncidents());
  const incident = incidents.find((it) => it.id === id);
  if (!incident) return;
  if (detailTitle) detailTitle.textContent = (Number.isInteger(incident.protocolo) ? '#' + incident.protocolo + ' · ' : '') + (incident.title || 'Ocorrência');
  if (detailCategory) detailCategory.textContent = incident.category || '';
  if (detailPriority) detailPriority.textContent = incident.priority || '';
  if (detailName) detailName.textContent = incident.name || '';
  if (detailEmail) detailEmail.textContent = incident.email || '';
  if (detailAddress) detailAddress.textContent = incident.address || `${incident.street || ''} ${incident.number || ''}`;
  if (detailPhone) detailPhone.textContent = incident.phone || '';
  if (detailDescription) detailDescription.textContent = incident.description || '';
  if (detailWorkUpdate) detailWorkUpdate.textContent = incident.workUpdate || 'Sem atualização registrada.';
  if (detailWorkMeta) {
    detailWorkMeta.textContent = incident.workUpdatedBy
      ? `${incident.workUpdatedBy}${incident.workUpdatedAt ? ` em ${new Date(incident.workUpdatedAt).toLocaleString('pt-BR')}` : ''}`
      : 'Sem registro';
  }
  const detailConclusion = document.getElementById('detail-conclusion');
  const detailConclusionWrap = document.getElementById('detail-conclusion-wrap');
  if (detailConclusion && detailConclusionWrap) {
    detailConclusionWrap.hidden = incident.status !== 'Concluído';
    detailConclusion.textContent = incident.respostaConclusao || 'Sem resposta registrada na conclusão.';
  }
  const detailRating = document.getElementById('detail-rating');
  if (detailRating) {
    if (incident.avaliacao) {
      const nota = Number(incident.avaliacao.nota) || 0;
      detailRating.innerHTML = `<span class="stars" aria-label="${nota} de 5">${'★'.repeat(nota)}${'☆'.repeat(5 - nota)}</span> ${nota}/5${incident.avaliacao.comentario ? ' — ' + escapeHtml(incident.avaliacao.comentario) : ''}<br /><small>em ${new Date(incident.avaliacao.em).toLocaleString('pt-BR')}</small>`;
    } else {
      detailRating.textContent = incident.status === 'Concluído' ? 'O cidadão ainda não avaliou.' : 'Disponível após a conclusão.';
    }
  }
  renderIncidentHistory(incident);
  if (detailImage) {
    if (incident.photoDataUrl) {
      detailImage.src = incident.photoDataUrl;
      detailImage.style.display = '';
    } else {
      detailImage.src = '';
      detailImage.style.display = 'none';
    }
  }
  if (detailPanel) {
    detailPanel.classList.remove('hidden');
    detailPanel.setAttribute('aria-hidden', 'false');
  }
}

function closeIncidentDetail() {
  if (detailPanel) {
    detailPanel.classList.add('hidden');
    detailPanel.setAttribute('aria-hidden', 'true');
  }
}

if (detailClose) {
  detailClose.addEventListener('click', closeIncidentDetail);
}

if (incidentList) {
  incidentList.addEventListener('click', (event) => {
    const saveBtn = event.target.closest('.save-work-update-btn');
    if (saveBtn) {
      const id = saveBtn.dataset.id;
      if (!id) return;
      const row = saveBtn.closest('tr[data-id]');
      const field = row?.querySelector('.work-update-input');
      const workUpdate = field ? field.value.trim() : '';
      saveIncidentWorkUpdate(id, workUpdate);
      return;
    }

    if (event.target.closest('.work-update-input') || event.target.closest('.status-select')) {
      return;
    }

    const tr = event.target.closest('tr[data-id]');
    if (!tr) return;
    const id = tr.dataset.id;
    if (id) showIncidentDetail(id);
  });
}


async function classifyIncident(description, cep, street, number, neighborhood, city, state) {
  const categories = getCategoryConfig();
  const priorities = getPriorityConfig();
  const payload = { description, cep, street, number, neighborhood, city, state, categories, priorities };
  console.debug('POST /api/classify payload:', payload);
  try {
    const response = await fetch('/api/classify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ description, cep, street, number, neighborhood, city, state, categories, priorities })
    });

    if (!response.ok) {
      return { category: categoriaGenerica(), priority: 'Média', title: '', description: '' };
    }

    const data = await response.json();
    console.debug('Response from /api/classify:', data);
    return {
      category: data.category || categoriaGenerica(),
      priority: data.priority || 'Média',
      title: data.title || '',
      description: data.description || '',
      raw_model_text: data.raw_model_text || data.raw_text || ''
    };
  } catch (error) {
    console.error('Falha ao classificar a ocorrência:', error);
    return { category: categoriaGenerica(), priority: 'Média', title: '', description: '' };
  }
}

async function classifyImage(file) {
  const form = new FormData();
  form.append('photo', file);
  form.append('categories', JSON.stringify(getCategoryConfig()));
  form.append('priorities', JSON.stringify(getPriorityConfig()));
  const payloadLog = { name: file.name, size: file.size, type: file.type, categories: getCategoryConfig(), priorities: getPriorityConfig() };
  console.debug('POST /api/classify-image payload (summary):', payloadLog);

  try {
    const resp = await fetch('/api/classify-image', {
      method: 'POST',
      body: form
    });

    if (resp.status === 422) {
      const corpo = await resp.json().catch(() => ({}));
      return { rejeitada: true, motivo: corpo.error || 'A foto não foi aceita.' };
    }
    if (!resp.ok) {
      return null;
    }

    const data = await resp.json();
    return data;
  } catch (error) {
    return null;
  }
}

// ---------- Foto: anexo de arquivo ou captura pela câmera ----------
let cameraStream = null;
let cameraFacingMode = 'environment';
let cameraCapturedBlob = null;
let photoPreviewUrl = null;

function getSelectedPhotoFile() {
  return photoInput?.files?.[0] || capturedPhotoFile || null;
}

function showPhotoPreview(file) {
  if (!photoPreview || !photoPreviewImg) return;
  if (photoPreviewUrl) {
    URL.revokeObjectURL(photoPreviewUrl);
    photoPreviewUrl = null;
  }
  if (!file) {
    photoPreview.hidden = true;
    photoPreviewImg.removeAttribute('src');
    return;
  }
  photoPreviewUrl = URL.createObjectURL(file);
  photoPreviewImg.src = photoPreviewUrl;
  if (photoPreviewName) photoPreviewName.textContent = file.name || 'foto';
  photoPreview.hidden = false;
}

// Coloca o arquivo capturado no input principal para que o envio e a validação
// "required" continuem funcionando sem mudanças. Se o navegador não permitir,
// guarda em memória e relaxa o required.
function setPhotoFile(file) {
  capturedPhotoFile = null;
  let assigned = false;
  if (photoInput && typeof DataTransfer !== 'undefined') {
    try {
      const transfer = new DataTransfer();
      transfer.items.add(file);
      photoInput.files = transfer.files;
      assigned = photoInput.files?.length === 1;
    } catch (error) {
      assigned = false;
    }
  }
  if (!assigned) {
    capturedPhotoFile = file;
    if (photoInput) photoInput.required = false;
  } else if (photoInput) {
    photoInput.required = true;
  }
  showPhotoPreview(file);
  showMessage(photoMessage, '', false);
  document.dispatchEvent(new CustomEvent('foto-selecionada', { detail: { file } }));
}

function clearPhotoFile() {
  capturedPhotoFile = null;
  if (photoInput) {
    photoInput.value = '';
    photoInput.required = true;
  }
  if (photoCameraFallback) photoCameraFallback.value = '';
  showPhotoPreview(null);
  document.dispatchEvent(new CustomEvent('foto-removida'));
}

function stopCameraStream() {
  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
  }
  if (cameraVideo) cameraVideo.srcObject = null;
}

function setCameraMode(mode) {
  const captured = mode === 'captured';
  if (cameraVideo) cameraVideo.hidden = captured;
  if (cameraCanvas) cameraCanvas.hidden = !captured;
  if (cameraCaptureBtn) cameraCaptureBtn.hidden = captured;
  if (cameraRetakeBtn) cameraRetakeBtn.hidden = !captured;
  if (cameraUseBtn) cameraUseBtn.hidden = !captured;
  if (cameraSwitchBtn) cameraSwitchBtn.hidden = captured || cameraSwitchBtn.dataset.available !== 'true';
}

function cameraSupported() {
  return Boolean(
    navigator.mediaDevices &&
      navigator.mediaDevices.getUserMedia &&
      cameraModal &&
      typeof cameraModal.showModal === 'function'
  );
}

async function updateCameraSwitchAvailability() {
  if (!cameraSwitchBtn) return;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices.filter((device) => device.kind === 'videoinput');
    cameraSwitchBtn.dataset.available = cameras.length > 1 ? 'true' : 'false';
  } catch (error) {
    cameraSwitchBtn.dataset.available = 'false';
  }
  cameraSwitchBtn.hidden = cameraSwitchBtn.dataset.available !== 'true';
}

async function startCameraStream() {
  stopCameraStream();
  if (cameraMessage) cameraMessage.textContent = 'Abrindo a câmera...';
  const attempts = [
    {
      video: { facingMode: { ideal: cameraFacingMode }, width: { ideal: 1600 }, height: { ideal: 1200 } },
      audio: false,
    },
    { video: true, audio: false },
  ];
  let lastError = null;
  for (const constraints of attempts) {
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
      break;
    } catch (error) {
      lastError = error;
    }
  }
  if (!cameraStream) throw lastError || new Error('Câmera indisponível');
  if (cameraVideo) {
    cameraVideo.srcObject = cameraStream;
    try {
      await cameraVideo.play();
    } catch (error) {
      // autoplay pode ser bloqueado; o vídeo ainda renderiza o primeiro frame
    }
  }
  if (cameraMessage) cameraMessage.textContent = '';
  await updateCameraSwitchAvailability();
}

function openNativeCamera() {
  if (photoCameraFallback) {
    photoCameraFallback.click();
  } else if (photoInput) {
    photoInput.click();
  }
}

function describeCameraError(error) {
  const name = error?.name || '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return 'Permissão de câmera negada. Libere o acesso nas configurações do navegador ou anexe um arquivo.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') {
    return 'Nenhuma câmera foi encontrada neste dispositivo. Anexe um arquivo de imagem.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'A câmera está em uso por outro aplicativo. Feche-o e tente novamente.';
  }
  return 'Não foi possível acessar a câmera. Anexe um arquivo de imagem.';
}

async function openCameraModal() {
  if (!cameraSupported()) {
    openNativeCamera();
    return;
  }
  cameraCapturedBlob = null;
  setCameraMode('live');
  if (!cameraModal.open) cameraModal.showModal();
  try {
    await startCameraStream();
  } catch (error) {
    stopCameraStream();
    if (cameraModal.open) cameraModal.close();
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isMobile && photoCameraFallback) {
      // No celular a câmera nativa pode funcionar mesmo com getUserMedia bloqueado.
      openNativeCamera();
      return;
    }
    showMessage(photoMessage, describeCameraError(error), true);
  }
}

function capturePhotoFrame() {
  if (!cameraVideo || !cameraCanvas) return;
  const width = cameraVideo.videoWidth;
  const height = cameraVideo.videoHeight;
  if (!width || !height) {
    if (cameraMessage) cameraMessage.textContent = 'Aguarde a câmera carregar e tente novamente.';
    return;
  }
  // Limita a captura ao tamanho usado no envio: economiza memoria no celular.
  const escala = Math.min(1, FOTO_LADO_MAXIMO / Math.max(width, height));
  cameraCanvas.width = Math.round(width * escala);
  cameraCanvas.height = Math.round(height * escala);
  const ctx = cameraCanvas.getContext('2d');
  ctx.drawImage(cameraVideo, 0, 0, cameraCanvas.width, cameraCanvas.height);
  setCameraMode('captured');
  if (cameraMessage) cameraMessage.textContent = '';
  cameraCanvas.toBlob(
    (blob) => {
      cameraCapturedBlob = blob;
      if (!blob && cameraMessage) {
        cameraMessage.textContent = 'Falha ao processar a imagem. Tente capturar novamente.';
      }
    },
    'image/jpeg',
    FOTO_QUALIDADE
  );
}

function useCapturedPhoto() {
  if (!cameraCapturedBlob) {
    if (cameraMessage) cameraMessage.textContent = 'Processando a imagem, aguarde um instante...';
    setTimeout(useCapturedPhoto, 150);
    return;
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = new File([cameraCapturedBlob], `foto-${stamp}.jpg`, { type: 'image/jpeg' });
  setPhotoFile(file);
  stopCameraStream();
  if (cameraModal?.open) cameraModal.close();
}

if (cameraOpenBtn) {
  cameraOpenBtn.addEventListener('click', openCameraModal);
}

if (cameraCaptureBtn) cameraCaptureBtn.addEventListener('click', capturePhotoFrame);
if (cameraRetakeBtn) {
  cameraRetakeBtn.addEventListener('click', () => {
    cameraCapturedBlob = null;
    setCameraMode('live');
  });
}
if (cameraUseBtn) cameraUseBtn.addEventListener('click', useCapturedPhoto);
if (cameraSwitchBtn) {
  cameraSwitchBtn.addEventListener('click', async () => {
    cameraFacingMode = cameraFacingMode === 'environment' ? 'user' : 'environment';
    try {
      await startCameraStream();
    } catch (error) {
      if (cameraMessage) cameraMessage.textContent = describeCameraError(error);
    }
  });
}
if (cameraCancelBtn) {
  cameraCancelBtn.addEventListener('click', () => {
    stopCameraStream();
    if (cameraModal?.open) cameraModal.close();
  });
}
if (cameraModal) {
  // Fecha com Esc: garante que a câmera seja desligada.
  cameraModal.addEventListener('close', stopCameraStream);
  cameraModal.addEventListener('cancel', stopCameraStream);
}

if (photoCameraFallback) {
  photoCameraFallback.addEventListener('change', () => {
    const file = photoCameraFallback.files?.[0];
    if (file) setPhotoFile(file);
  });
}

if (photoInput) {
  photoInput.addEventListener('change', () => {
    const file = photoInput.files?.[0];
    capturedPhotoFile = null;
    photoInput.required = true;
    showPhotoPreview(file || null);
    if (file) showMessage(photoMessage, '', false);
    document.dispatchEvent(new CustomEvent(file ? 'foto-selecionada' : 'foto-removida', { detail: { file } }));
  });
}

if (photoRemoveBtn) {
  photoRemoveBtn.addEventListener('click', clearPhotoFile);
}

// Reduz a foto antes de enviar e guardar. A ocorrencia e gravada no
// armazenamento do navegador (limite de ~5 MB por site) com a foto em
// base64: uma foto de celular de 4-8 MB estoura o limite e a gravacao falha.
// Ate 1024 px no maior lado e JPEG 0.75 costuma ficar em 80-200 KB.
const FOTO_LADO_MAXIMO = 1024;
const FOTO_QUALIDADE = 0.75;

function carregarImagem(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Imagem inválida'));
    };
    img.src = url;
  });
}

async function reduzirFoto(file, { ladoMaximo = FOTO_LADO_MAXIMO, qualidade = FOTO_QUALIDADE } = {}) {
  if (!file || !file.type?.startsWith('image/')) return file;

  try {
    const img = await carregarImagem(file);
    const largura = img.naturalWidth || img.width;
    const altura = img.naturalHeight || img.height;
    if (!largura || !altura) return file;

    const escala = Math.min(1, ladoMaximo / Math.max(largura, altura));
    const jaPequena = escala === 1 && file.type === 'image/jpeg' && file.size <= 400 * 1024;
    if (jaPequena) return file;

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(largura * escala);
    canvas.height = Math.round(altura * escala);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', qualidade));
    if (!blob) return file;

    const nome = (file.name || 'foto').replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], nome, { type: 'image/jpeg', lastModified: Date.now() });
  } catch (error) {
    console.warn('[foto] Nao foi possivel reduzir a imagem, usando o original:', error);
    return file;
  }
}

function erroDeEspaco(error) {
  return Boolean(
    error &&
      (error.name === 'QuotaExceededError' ||
        error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
        error.code === 22 ||
        error.code === 1014)
  );
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

if (occurrenceForm) {
  occurrenceForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const formData = new FormData(occurrenceForm);
    let description = formData.get('description');
    let title = formData.get('title');
    const locationMode = formData.get('location-mode');

    // A localização é resolvida antes do "Aguarde, carregando...": se o navegador
    // estiver bloqueando, o popup de desbloqueio aparece sem a tela em estado de envio.
    if (locationMode === 'geolocation' && !temCoordenadasNaSessao()) {
      showMessage(formMessage, '', false);
      const geoOk = await requestGeolocationPermission();
      if (!geoOk) {
        showMessage(
          formMessage,
          'Não foi possível usar sua localização. Preencha o endereço manualmente e envie novamente.',
          true
        );
        return;
      }
    }

    // LGPD: sem o aceite, nada e enviado.
    const consentCheckbox = document.getElementById('lgpd-consent');
    if (consentCheckbox && !consentCheckbox.checked) {
      showMessage(formMessage, 'Para enviar, é preciso aceitar o termo de consentimento para o uso dos seus dados.', true);
      consentCheckbox.focus();
      consentCheckbox.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }

    // Nos dois modos a ocorrencia sai com logradouro, numero e cidade: a
    // localizacao automatica nem sempre traz o numero, e ai o cidadao completa.
    {
      const faltando = validarEnderecoManual();
      if (faltando) {
        if (addressFields) addressFields.style.display = 'grid';
        showMessage(formMessage, faltando.mensagem, true);
        faltando.campo.focus();
        faltando.campo.scrollIntoView({ block: 'center', behavior: 'smooth' });
        return;
      }
    }

    if (submitButton) submitButton.disabled = true;
    if (submitLoading) submitLoading.classList.remove('hidden');
    showMessage(formMessage, 'Classificando a ocorrência...', false);

    try {
      let classification = { category: categoriaGenerica(), priority: 'Média', title, description };

      let updatedFormData = new FormData(occurrenceForm);
      const cep = updatedFormData.get('cep');
      const street = updatedFormData.get('street');
      const number = updatedFormData.get('number');
      const neighborhood = updatedFormData.get('neighborhood');
      const city = updatedFormData.get('city');
      const state = updatedFormData.get('state');
      description = updatedFormData.get('description');
      title = updatedFormData.get('title');

      const fotoOriginal = getSelectedPhotoFile();
      // Se a foto ja foi analisada no passo 1 (e nao mudou), reaproveita o
      // resultado e a assinatura em vez de chamar a IA de novo.
      const analisePronta = fotoOriginal && analiseDaFoto && analiseDaFoto.assinatura === assinaturaDoArquivo(fotoOriginal) ? analiseDaFoto : null;
      const photoFile = analisePronta ? fotoOriginal : (fotoOriginal ? await reduzirFoto(fotoOriginal) : null);
      let imgResult = analisePronta ? analisePronta.resultado : null;
      if (photoFile && !analisePronta) {
        imgResult = await classifyImage(photoFile);
      }

      // Foto recusada pelo filtro (conteudo improprio ou sem relacao com um
      // problema urbano): a ocorrencia nao segue.
      if (imgResult?.rejeitada) {
        showMessage(formMessage, imgResult.motivo, true);
        photoInput?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        return;
      }

      const categoriaEscolhida = (categoryInput?.value || '').trim();
      if (imgResult) {
        classification.category = categoriaEscolhida || imgResult.category || classification.category;
        classification.priority = imgResult.priority || classification.priority;
        // O que o cidadao escreveu prevalece; a IA so completa o que ficou vazio.
        if (!title && imgResult.title) title = imgResult.title;
        if (!description && imgResult.description) description = imgResult.description;
      } else {
        const textResult = await classifyIncident(description, cep, street, number, neighborhood, city, state);
        classification = { ...classification, ...textResult };
        if (categoriaEscolhida) classification.category = categoriaEscolhida;
        if (!title && textResult.title) title = textResult.title;
        if (!description && textResult.description) description = textResult.description;
      }

      if (priorityInput) priorityInput.value = classification.priority || '';
      const titleField = document.getElementById('title');
      const descField = document.getElementById('description');
      if (titleField) titleField.value = title;
      if (descField) descField.value = description;

      let photoDataUrl = '';
      if (photoFile) {
        photoDataUrl = await readFileAsDataUrl(photoFile);
      }

      const updatedFormData2 = new FormData(occurrenceForm);
      const name = updatedFormData2.get('name');
      const email = updatedFormData2.get('email');
      const phone = updatedFormData2.get('phone');

      const incident = {
        id: crypto.randomUUID(),
        name,
        email,
        title,
        category: classification.category,
        priority: classification.priority,
        description,
        cep,
        street,
        number,
        neighborhood,
        city,
        state,
        phone,
        photoDataUrl,
        fotoToken: imgResult?.fotoToken || '',
        consentimento: { aceito: true, em: new Date().toISOString(), versao: '2026-10' },
        workUpdate: '',
        workUpdatedBy: '',
        workUpdatedAt: '',
        // Endereco digitado nao herda as coordenadas de uma geolocalizacao
        // anterior: o painel localiza o ponto pelo proprio endereco, com numero.
        latitude: locationMode === 'manual' ? '' : sessionStorage.getItem('smartgov360-last-latitude') || '',
        longitude: locationMode === 'manual' ? '' : sessionStorage.getItem('smartgov360-last-longitude') || '',
        status: 'Recebido',
        createdAt: new Date().toISOString()
      };

      showMessage(formMessage, 'Registrando a ocorrência...', false);
      const resposta = await fetch('/api/incidentes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(incident)
      });
      const corpo = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        showMessage(formMessage, corpo.error || 'Não foi possível registrar a ocorrência. Tente novamente.', true);
        return;
      }
      showMessage(formMessage, '', false);
      mostrarSucessoDoWizard(corpo.incidente);
    } catch (error) {
      console.error('Erro ao enviar a ocorrência:', error);
      showMessage(
        formMessage,
        'Erro ao enviar a ocorrência. Verifique sua conexão e tente novamente.',
        true
      );
    } finally {
      resetSubmitState();
    }
  });
}

function resetSubmitState() {
  if (submitButton) submitButton.disabled = false;
  if (submitLoading) submitLoading.classList.add('hidden');
}

if (loginForm) {
  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const formData = new FormData(loginForm);
    const username = (formData.get('username') || '').toString().trim();
    const password = (formData.get('password') || '').toString();

    showMessage(loginMessage, 'Entrando...', false);

    try {
      const resposta = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const dados = await resposta.json().catch(() => ({}));

      if (!resposta.ok) {
        setToken('');
        showMessage(loginMessage, dados.error || 'Usuário ou senha inválidos.', true);
        return;
      }

      setToken(dados.token);
      const user = dados.usuario;
      await sincronizarUsuariosDoServidor();
      await showAdminDashboard(user);

      const perfil = isSystemAdmin(user) ? 'Administrador do sistema' : 'Administrador por categoria';
      const aviso = user.senhaPadrao
        ? ' Você ainda usa a senha padrão — troque-a em "Alterar senha".'
        : '';
      showMessage(loginMessage, `Login realizado com sucesso. Perfil: ${perfil}.${aviso}`, false);
    } catch (error) {
      console.error('Falha ao autenticar:', error);
      showMessage(loginMessage, 'Não foi possível falar com o servidor. Verifique a conexão.', true);
    }
  });
}

const senhaForm = document.getElementById('senha-form');
const senhaMessage = document.getElementById('senha-message');

if (senhaForm) {
  senhaForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const dados = new FormData(senhaForm);
    const senhaAtual = (dados.get('senha-atual') || '').toString();
    const senhaNova = (dados.get('senha-nova') || '').toString();
    const confirma = (dados.get('senha-confirma') || '').toString();

    if (senhaNova !== confirma) {
      showMessage(senhaMessage, 'A confirmação não confere com a nova senha.', true);
      return;
    }

    try {
      const resposta = await apiAutenticada('/api/auth/senha', {
        method: 'POST',
        body: JSON.stringify({ senhaAtual, senhaNova })
      });
      const corpo = await resposta.json().catch(() => ({}));

      if (!resposta.ok) {
        showMessage(senhaMessage, corpo.error || 'Não foi possível alterar a senha.', true);
        return;
      }

      senhaForm.reset();
      showMessage(senhaMessage, 'Senha alterada com sucesso.', false);
    } catch (error) {
      console.error('Falha ao alterar a senha:', error);
      showMessage(senhaMessage, 'Não foi possível falar com o servidor.', true);
    }
  });
}

// ---------- Conclusao: resposta ao cidadao ----------
const concludeModal = document.getElementById('conclude-modal');
const concludeText = document.getElementById('conclude-text');
const concludeTitle = document.getElementById('conclude-incident-title');
const concludeConfirm = document.getElementById('conclude-confirm');
const concludeCancel = document.getElementById('conclude-cancel');
const concludeMessage = document.getElementById('conclude-message');

// Abre o dialogo e resolve com o texto digitado, ou null se cancelado.
function pedirRespostaDeConclusao(incident) {
  if (!concludeModal || typeof concludeModal.showModal !== 'function') {
    const texto = window.prompt('Descreva ao cidadão o que foi feito (vai no e-mail de conclusão):', incident.workUpdate || '');
    return Promise.resolve(texto === null ? null : texto.trim());
  }
  return new Promise((resolve) => {
    if (concludeTitle) concludeTitle.textContent = incident.title || 'Ocorrência';
    if (concludeText) concludeText.value = incident.workUpdate || '';
    if (concludeMessage) concludeMessage.textContent = '';

    const fechar = (valor) => {
      concludeConfirm?.removeEventListener('click', onConfirm);
      concludeCancel?.removeEventListener('click', onCancel);
      concludeModal.removeEventListener('cancel', onCancelEvent);
      if (concludeModal.open) concludeModal.close();
      resolve(valor);
    };
    const onConfirm = () => {
      const texto = (concludeText?.value || '').trim();
      if (texto.length < 10) {
        if (concludeMessage) concludeMessage.textContent = 'Escreva ao menos uma frase sobre o que foi feito.';
        concludeText?.focus();
        return;
      }
      fechar(texto);
    };
    const onCancel = () => fechar(null);
    const onCancelEvent = (event) => { event.preventDefault(); fechar(null); };

    concludeConfirm?.addEventListener('click', onConfirm);
    concludeCancel?.addEventListener('click', onCancel);
    concludeModal.addEventListener('cancel', onCancelEvent);
    concludeModal.showModal();
    concludeText?.focus();
  });
}

// ---------- Visao executiva (prefeito) ----------
const execPeriod = document.getElementById('exec-period');
const execTiles = document.getElementById('exec-tiles');
const execCategories = document.getElementById('exec-categories');
const execNeighborhoods = document.getElementById('exec-neighborhoods');
const execSecretariats = document.getElementById('exec-secretariats');
const execDelayed = document.getElementById('exec-delayed');
const execQuestion = document.getElementById('exec-question');
const execAskBtn = document.getElementById('exec-ask');
const execSummary = document.getElementById('exec-summary');
const execMessage = document.getElementById('exec-message');

function linkOcorrencia(id, texto) {
  return `<a href="#" class="incident-link" data-open-incident="${escapeHtml(id)}">${escapeHtml(texto)}</a>`;
}

// Linhas de recebidas e concluidas por dia (uma serie por cor, legenda e valores finais).
function renderEvolucao(serie) {
  const el = document.getElementById('exec-evolution');
  if (!el) return;
  if (!serie || serie.length < 2 || !serie.some((p) => p.recebidas || p.concluidas)) {
    el.innerHTML = '<p class="exec-vazio">Sem ocorrências no período para traçar a evolução.</p>';
    return;
  }
  const W = Math.max(320, Math.round(el.clientWidth || 600));
  const H = 200;
  const m = { top: 12, right: 16, bottom: 28, left: 34 };
  const maxY = Math.max(1, ...serie.map((p) => Math.max(p.recebidas, p.concluidas)));
  const passoY = maxY <= 5 ? 1 : Math.ceil(maxY / 4);
  const topoY = Math.ceil(maxY / passoY) * passoY;
  const x = (i) => m.left + (i / (serie.length - 1)) * (W - m.left - m.right);
  const y = (v) => m.top + (1 - v / topoY) * (H - m.top - m.bottom);
  const caminho = (k) => serie.map((p, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(p[k]).toFixed(1)).join(' ');
  const area = caminho('recebidas') + ` L${x(serie.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`;
  const grade = [];
  for (let v = 0; v <= topoY; v += passoY) {
    grade.push(`<line class="grade" x1="${m.left}" x2="${W - m.right}" y1="${y(v)}" y2="${y(v)}" /><text class="eixo-texto" x="${m.left - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`);
  }
  const rotulos = [];
  const passoX = Math.max(1, Math.round(serie.length / 6));
  serie.forEach((p, i) => {
    if (i % passoX === 0 || i === serie.length - 1) {
      const [, mes, dia] = p.dia.split('-');
      rotulos.push(`<text class="eixo-texto" x="${x(i)}" y="${H - 8}" text-anchor="middle">${dia}/${mes}</text>`);
    }
  });
  const ultimo = serie[serie.length - 1];
  const pontos = `<circle class="ponto ponto-recebidas" r="4" cx="${x(serie.length - 1)}" cy="${y(ultimo.recebidas)}"><title>Recebidas em ${ultimo.dia}: ${ultimo.recebidas}</title></circle>
    <circle class="ponto ponto-concluidas" r="4" cx="${x(serie.length - 1)}" cy="${y(ultimo.concluidas)}"><title>Concluídas em ${ultimo.dia}: ${ultimo.concluidas}</title></circle>`;
  const hits = serie.map((p, i) => `<rect x="${x(i) - (W - m.left - m.right) / serie.length / 2}" y="${m.top}" width="${(W - m.left - m.right) / serie.length}" height="${H - m.top - m.bottom}" fill="transparent"><title>${p.dia.split('-').reverse().join('/')}: ${p.recebidas} recebida(s), ${p.concluidas} concluída(s)</title></rect>`).join('');
  el.innerHTML = `
    <div class="exec-legenda"><span><i style="background:var(--azul)"></i>Recebidas</span><span><i style="background:var(--verde-ok)"></i>Concluídas</span></div>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolução diária de ocorrências recebidas e concluídas">
      ${grade.join('')}
      <path class="area-recebidas" d="${area}" />
      <path class="linha-recebidas" d="${caminho('recebidas')}" />
      <path class="linha-concluidas" d="${caminho('concluidas')}" />
      ${pontos}${rotulos.join('')}${hits}
    </svg>`;
}

// Rosca de status: cores de estado (nunca reutilizadas como serie) + legenda com valores.
function renderDonutStatus(t) {
  const el = document.getElementById('exec-status');
  if (!el) return;
  const fatias = [
    ['Concluídas', t.concluidas || 0, '#1f9d55'],
    ['Em andamento', t.emAndamento || 0, '#f0a92c'],
    ['Recebidas (aguardando ação)', t.recebidas || 0, '#e3342f']
  ];
  const total = fatias.reduce((a, f) => a + f[1], 0);
  if (!total) {
    el.innerHTML = '<p class="exec-vazio">Nenhuma ocorrência registrada.</p>';
    return;
  }
  const R = 60;
  const C = 2 * Math.PI * R;
  let acumulado = 0;
  const arcos = fatias.filter((f) => f[1] > 0).map(([nome, valor, cor]) => {
    const frac = valor / total;
    const dash = `${(frac * C - 3).toFixed(2)} ${(C - frac * C + 3).toFixed(2)}`;
    const rot = (acumulado / total) * 360 - 90;
    acumulado += valor;
    return `<circle r="${R}" cx="75" cy="75" fill="none" stroke="${cor}" stroke-width="18" stroke-dasharray="${dash}" transform="rotate(${rot} 75 75)"><title>${nome}: ${valor} (${Math.round(frac * 100)}%)</title></circle>`;
  }).join('');
  el.innerHTML = `
    <svg viewBox="0 0 150 150" role="img" aria-label="Ocorrências por status">
      ${arcos}
      <text class="donut-centro" x="75" y="72" text-anchor="middle">${total}</text>
      <text class="donut-sub" x="75" y="88" text-anchor="middle">ocorrências</text>
    </svg>
    <ul>${fatias.map(([nome, valor, cor]) => `<li><span><i class="legenda-ponto" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${cor};margin-right:.4rem"></i>${nome}</span><b>${valor}</b></li>`).join('')}</ul>`;
}

function renderDesempenho(secretarias) {
  const el = document.getElementById('exec-performance');
  if (!el) return;
  const lista = (secretarias || []).filter((s) => s.total > 0).sort((a, b) => (b.taxaConclusao || 0) - (a.taxaConclusao || 0));
  if (!lista.length) {
    el.innerHTML = '<li class="vazio">Nenhuma secretaria com ocorrências.</li>';
    return;
  }
  el.innerHTML = lista.map((s) => {
    const taxa = s.taxaConclusao || 0;
    const cor = taxa >= 80 ? 'var(--verde-ok)' : taxa >= 60 ? 'var(--amarelo)' : '#e3342f';
    return `<li><span class="rank-nome"><strong>${escapeHtml(s.username)}</strong><small>${escapeHtml(s.categorias.join(', ') || '—')}</small></span><span class="rank-barra"><i style="width:${taxa}%;background:${cor}"></i></span><span class="rank-num">${taxa}%<small> · ${s.total - s.abertas}/${s.total}</small></span></li>`;
  }).join('');
}

// Meias-roscas de meta: taxa de conclusao, tempo medio e nota do cidadao.
function renderMetas(t) {
  const el = document.getElementById('exec-goals');
  if (!el) return;
  const metas = [
    { valor: t.taxaConclusao, texto: t.taxaConclusao !== null ? t.taxaConclusao + '%' : '—', frac: (t.taxaConclusao || 0) / 100, nome: 'Taxa de conclusão no período', meta: 'Meta: 80%', bom: (t.taxaConclusao || 0) >= 80 },
    { valor: t.horasMediasConclusao, texto: t.horasMediasConclusao !== null ? (t.horasMediasConclusao / 24).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : '—', frac: t.horasMediasConclusao !== null ? Math.max(0, 1 - (t.horasMediasConclusao / 24) / 10) : 0, nome: 'Tempo médio de atendimento (dias)', meta: 'Meta: 5 dias', bom: t.horasMediasConclusao !== null && t.horasMediasConclusao / 24 <= 5 },
    { valor: t.notaMedia, texto: t.notaMedia !== null ? t.notaMedia.toLocaleString('pt-BR') : '—', frac: (t.notaMedia || 0) / 5, nome: 'Nota do cidadão (satisfação)', meta: 'Meta: 4,0', bom: (t.notaMedia || 0) >= 4 }
  ];
  const L = Math.PI * 60;
  el.innerHTML = metas.map((m) => `
    <div class="exec-goal">
      <svg viewBox="0 0 150 90" role="img" aria-label="${m.nome}: ${m.texto}">
        <path class="arco-fundo" d="M15,80 A60,60 0 0 1 135,80" />
        <path class="arco" d="M15,80 A60,60 0 0 1 135,80" stroke="${m.valor === null ? '#e6ebf2' : m.bom ? 'var(--verde-ok)' : 'var(--amarelo)'}" stroke-dasharray="${(Math.min(1, Math.max(0, m.frac)) * L).toFixed(1)} ${L.toFixed(1)}" />
        <text class="arco-valor" x="75" y="78" text-anchor="middle">${m.texto}</text>
      </svg>
      <strong>${m.nome}</strong><small>${m.meta}</small>
    </div>`).join('');
}

function renderExecutivo(d) {
  const t = d.totais;
  renderEvolucao(d.serie);
  renderDonutStatus(t);
  renderDesempenho(d.secretarias);
  renderMetas(t);
  if (execTiles) {
    const tiles = [
      [t.noPeriodo, 'ocorrências no período'],
      [t.abertas, 'abertas hoje'],
      [t.taxaConclusao !== null ? t.taxaConclusao + '%' : '—', 'concluídas no período'],
      [formatarHoras(t.horasMediasConclusao), 'tempo médio de conclusão'],
      [t.atrasadas, `abertas há mais de ${d.limiteAtrasoDias} dias`],
      [t.notaMedia !== null ? t.notaMedia.toLocaleString('pt-BR') + ' / 5' : '—', `nota do cidadão (${t.avaliacoes})`]
    ];
    execTiles.innerHTML = tiles.map(([v, r]) => `<div class="prod-tile"><span class="valor">${escapeHtml(String(v))}</span><span class="rotulo">${r}</span></div>`).join('');
  }
  const lista = (el, itens, render) => {
    if (!el) return;
    el.innerHTML = itens.length ? itens.map(render).join('') : '<li class="vazio">Sem dados no período.</li>';
  };
  const max = (arr, k) => Math.max(1, ...arr.map((i) => i[k] || 0));
  const mc = max(d.porCategoria, 'total');
  lista(execCategories, d.porCategoria.slice(0, 5), (c) => `<li><span class="rank-nome">${escapeHtml(c.nome)}</span><span class="rank-barra"><i style="width:${Math.round((c.total / mc) * 100)}%"></i></span><span class="rank-num">${c.total}<small> · ${c.abertas} abertas</small></span></li>`);
  const mb = max(d.porBairro, 'total');
  lista(execNeighborhoods, d.porBairro.slice(0, 5), (b) => `<li><span class="rank-nome">${escapeHtml(b.nome)}</span><span class="rank-barra"><i style="width:${Math.round((b.total / mb) * 100)}%"></i></span><span class="rank-num">${b.total}</span></li>`);
  lista(execSecretariats, d.secretarias, (s) => `<li class="${s.atrasadas ? 'alerta' : ''}"><span class="rank-nome"><strong>${escapeHtml(s.username)}</strong><small>${escapeHtml(s.categorias.join(', ') || '—')} · ${s.abertas} abertas · ${s.concluidasNoPeriodo} concluídas${s.maisAntigaDias ? ' · mais antiga há ' + s.maisAntigaDias + ' dias' : ''}</small></span><span class="rank-num">${s.atrasadas} atrasada${s.atrasadas === 1 ? '' : 's'}</span></li>`);
  lista(execDelayed, d.atrasadas.slice(0, 10), (i) => `<li><span class="rank-nome">${linkOcorrencia(i.id, i.title || 'Ocorrência')}<small>${escapeHtml(i.category)}${i.bairro ? ' · ' + escapeHtml(i.bairro) : ''} · ${escapeHtml(i.status)}</small></span><span class="rank-num badge-dias">${i.diasAberta} dias</span></li>`);
}

async function carregarExecutivo() {
  if (!execTiles || !isSystemAdmin()) return;
  const dias = execPeriod ? execPeriod.value : '30';
  showMessage(execMessage, 'Carregando...', false);
  try {
    const resposta = await apiAutenticada(`/api/incidentes/executivo?dias=${encodeURIComponent(dias)}`);
    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok) {
      showMessage(execMessage, dados.error || 'Não foi possível carregar a visão executiva.', true);
      return;
    }
    ultimoExecutivo = dados;
    renderExecutivo(dados);
    showMessage(execMessage, '', false);
  } catch (error) {
    showMessage(execMessage, 'Não foi possível falar com o servidor.', true);
  }
}

if (execPeriod) execPeriod.addEventListener('change', carregarExecutivo);

document.querySelectorAll('[data-exec-question]').forEach((chip) => {
  chip.addEventListener('click', () => {
    if (execQuestion) execQuestion.value = chip.dataset.execQuestion;
    execAskBtn?.click();
  });
});

if (execAskBtn) {
  execAskBtn.addEventListener('click', async () => {
    if (!ensureSystemAdminAction()) return;
    const pergunta = execQuestion?.value?.trim() || '';
    execAskBtn.disabled = true;
    if (execSummary) execSummary.innerHTML = '<p class="muted">Analisando as ocorrências reais do período... (até 1 minuto)</p>';
    try {
      const resposta = await apiAutenticada('/api/incidentes/executivo/resumo', {
        method: 'POST',
        body: JSON.stringify({ dias: execPeriod ? execPeriod.value : '30', pergunta })
      });
      const r = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        if (execSummary) execSummary.innerHTML = `<p class="form-message error">${escapeHtml(r.error || 'A IA não respondeu.')}</p>`;
        return;
      }
      const porId = new Map(getIncidents().map((i) => [i.id, i]));
      const refs = (ids) => ids.length
        ? `<p class="exec-refs">Baseado em: ${ids.map((id) => linkOcorrencia(id, (porId.get(id)?.title || 'ocorrência ' + id.slice(0, 8)))).join(', ')}</p>`
        : '';
      if (execSummary) {
        execSummary.innerHTML = `
          <p class="exec-pergunta"><strong>Pergunta:</strong> ${escapeHtml(r.pergunta)}</p>
          <p class="exec-resumo">${escapeHtml(r.resumo)}</p>
          ${(r.conclusoes || []).map((c) => `<section class="exec-conclusao"><h4>${escapeHtml(c.titulo)}</h4><p>${escapeHtml(c.texto)}</p>${refs(c.ocorrencias || [])}</section>`).join('')}
          ${(r.recomendacoes || []).length ? `<section class="exec-conclusao"><h4>Recomendações</h4><ul>${r.recomendacoes.map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ul></section>` : ''}
          <p class="muted"><small>Resumo gerado por IA a partir das ocorrências registradas (${r.dias > 0 ? 'últimos ' + r.dias + ' dias' : 'todo o histórico'}), em ${new Date(r.geradoEm).toLocaleString('pt-BR')}. Confira os registros antes de decidir.</small></p>`;
      }
    } catch (error) {
      if (execSummary) execSummary.innerHTML = '<p class="form-message error">Não foi possível falar com o servidor.</p>';
    } finally {
      execAskBtn.disabled = false;
    }
  });
}

// Links "ver ocorrência" em qualquer painel abrem o detalhe na aba Ocorrencias.
document.addEventListener('click', (event) => {
  const link = event.target.closest('a[data-open-incident]');
  if (!link) return;
  event.preventDefault();
  const id = link.dataset.openIncident;
  switchTab('occurrences');
  showIncidentDetail(id);
  document.getElementById('incident-detail-panel')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
});

// ---------- Produtividade dos administradores de categoria ----------
const prodPeriod = document.getElementById('prod-period');
const prodTiles = document.getElementById('prod-tiles');
const prodChart = document.getElementById('prod-chart');
const prodTableBody = document.getElementById('prod-table-body');
const prodMessage = document.getElementById('prod-message');

function formatarHoras(horas) {
  if (horas === null || horas === undefined) return '—';
  if (horas < 1) return `${Math.round(horas * 60)} min`;
  if (horas < 48) return `${horas.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`;
  return `${(horas / 24).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} dias`;
}

function formatarDataHora(iso) {
  if (!iso) return '—';
  const data = new Date(iso);
  return Number.isNaN(data.getTime()) ? '—' : data.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function renderProdTiles(resumo) {
  if (!prodTiles) return;
  const tiles = [
    [resumo.resolvidas, 'ocorrências resolvidas'],
    [resumo.acoes, 'ações registradas'],
    [`${resumo.ativos}/${resumo.usuarios}`, 'usuários ativos'],
    [formatarHoras(resumo.horasMediasResolucao), 'tempo médio para concluir'],
    [resumo.notaMedia !== null && resumo.notaMedia !== undefined ? resumo.notaMedia.toLocaleString('pt-BR') + ' / 5' : '—', `nota do cidadão (${resumo.avaliacoes || 0} avaliações)`]
  ];
  prodTiles.innerHTML = tiles.map(([valor, rotulo]) => `
    <div class="prod-tile"><span class="valor">${escapeHtml(String(valor))}</span><span class="rotulo">${rotulo}</span></div>`).join('');
}

// Barras horizontais em SVG: uma serie (sem legenda), valor na ponta, tooltip
// nativo por barra e a tabela abaixo como leitura alternativa.
function renderProdChart(usuarios) {
  if (!prodChart) return;
  const dados = usuarios.filter((u) => u.resolvidas > 0 || u.acoes > 0);
  if (!dados.length) {
    prodChart.innerHTML = '<p class="prod-chart-vazio">Nenhuma ação registrada no período.</p>';
    return;
  }

  // Desenha na largura real do contêiner: o SVG não é escalado, então o texto
  // mantém o tamanho de leitura também no celular.
  const largura = Math.max(320, Math.round(prodChart.clientWidth || 720));
  const maiorNome = Math.max(...dados.map((u) => u.username.length));
  const margemEsq = Math.min(Math.round(largura * 0.35), Math.max(90, maiorNome * 8 + 16));
  const margemDir = 48;
  const alturaLinha = 34;
  const espessura = 20;
  const altura = dados.length * alturaLinha + 12;
  const maximo = Math.max(1, ...dados.map((u) => u.resolvidas));
  const escala = (largura - margemEsq - margemDir) / maximo;

  const barras = dados.map((u, i) => {
    const y = 6 + i * alturaLinha;
    const w = Math.max(0, u.resolvidas * escala);
    const nome = escapeHtml(u.username);
    const titulo = `${u.username}: ${u.resolvidas} resolvida(s), ${u.acoes} ação(ões)`;
    // ponta arredondada (4px) so no lado do dado; base reta no eixo
    const r = w > 4 ? 4 : 0;
    const caminho = `M${margemEsq},${y} h${Math.max(0, w - r)} a${r},${r} 0 0 1 ${r},${r} v${espessura - 2 * r} a${r},${r} 0 0 1 -${r},${r} h-${Math.max(0, w - r)} z`;
    return `
      <text class="rotulo-y" x="${margemEsq - 10}" y="${y + espessura / 2}" text-anchor="end" dominant-baseline="middle">${nome}</text>
      <rect class="barra-hit" x="${margemEsq}" y="${y - 6}" width="${largura - margemEsq}" height="${alturaLinha}" tabindex="0"><title>${escapeHtml(titulo)}</title></rect>
      <path class="barra" d="${caminho}"><title>${escapeHtml(titulo)}</title></path>
      <text class="valor-barra" x="${margemEsq + w + 8}" y="${y + espessura / 2}" dominant-baseline="middle">${u.resolvidas}</text>`;
  }).join('');

  prodChart.innerHTML = `
    <svg viewBox="0 0 ${largura} ${altura}" width="${largura}" height="${altura}" role="img" aria-label="Ocorrências resolvidas por usuário">
      <line class="eixo" x1="${margemEsq}" y1="0" x2="${margemEsq}" y2="${altura}" />
      ${barras}
    </svg>`;
}

function renderProdTable(usuarios) {
  if (!prodTableBody) return;
  if (!usuarios.length) {
    prodTableBody.innerHTML = '<tr><td colspan="9">Nenhum administrador de categoria cadastrado.</td></tr>';
    return;
  }
  prodTableBody.innerHTML = usuarios.map((u) => `
    <tr>
      <td><strong>${escapeHtml(u.username)}</strong></td>
      <td class="categorias">${escapeHtml(u.categorias.join(', ') || '—')}</td>
      <td class="num">${u.resolvidas}</td>
      <td class="num">${u.mudancasStatus}</td>
      <td class="num">${u.atualizacoes}</td>
      <td class="num">${u.ocorrenciasTocadas}</td>
      <td class="num">${formatarHoras(u.horasMediasResolucao)}</td>
      <td class="num">${u.abertasNaCategoria}</td>
      <td class="num">${u.notaMedia !== null && u.notaMedia !== undefined ? u.notaMedia.toLocaleString('pt-BR') + ' (' + u.avaliacoes + ')' : '—'}</td>
      <td>${formatarDataHora(u.ultimaAtividade)}</td>
    </tr>`).join('');
}

let ultimaProdutividade = null;
let prodResizeTimer = null;
let ultimoExecutivo = null;
window.addEventListener('resize', () => {
  if (ultimoExecutivo && panelExecutive && !panelExecutive.classList.contains('hidden')) renderEvolucao(ultimoExecutivo.serie);
  if (!ultimaProdutividade || !panelProductivity || panelProductivity.classList.contains('hidden')) return;
  clearTimeout(prodResizeTimer);
  prodResizeTimer = setTimeout(() => renderProdChart(ultimaProdutividade.usuarios), 150);
});

const prodExportUser = document.getElementById('prod-export-user');
const prodTitle = document.getElementById('prod-title');
const prodSubtitle = document.getElementById('prod-subtitle');

function atualizarOpcoesDeExportacao(usuarios) {
  if (!prodExportUser) return;
  const atual = prodExportUser.value;
  prodExportUser.innerHTML = '<option value="">Relatório geral (todos)</option>'
    + usuarios.map((u) => `<option value="${escapeHtml(u.id)}">Individual: ${escapeHtml(u.username)}</option>`).join('');
  if ([...prodExportUser.options].some((o) => o.value === atual)) prodExportUser.value = atual;
  const wrapper = prodExportUser.closest('label') || prodExportUser;
  wrapper.hidden = !isSystemAdmin();
}

async function carregarProdutividade() {
  if (!panelProductivity || !currentAdminUser) return;
  if (prodTitle) prodTitle.textContent = isSystemAdmin() ? 'Produtividade por administrador de categoria' : 'Minha secretaria';
  if (prodSubtitle) {
    prodSubtitle.textContent = isSystemAdmin()
      ? 'Ações registradas no histórico das ocorrências: mudanças de status e atualizações de atendimento.'
      : 'Seu desempenho nas categorias sob sua responsabilidade: ações registradas, conclusões e avaliação dos cidadãos.';
  }
  const dias = prodPeriod ? prodPeriod.value : '30';
  showMessage(prodMessage, 'Carregando...', false);
  try {
    const resposta = await apiAutenticada(`/api/incidentes/produtividade?dias=${encodeURIComponent(dias)}`);
    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok) {
      showMessage(prodMessage, dados.error || 'Não foi possível carregar a produtividade.', true);
      return;
    }
    ultimaProdutividade = dados;
    renderProdTiles(dados.resumo);
    renderProdChart(dados.usuarios);
    renderProdTable(dados.usuarios);
    atualizarOpcoesDeExportacao(dados.usuarios);
    showMessage(prodMessage, '', false);
  } catch (error) {
    showMessage(prodMessage, 'Não foi possível falar com o servidor.', true);
  }
}

if (prodPeriod) prodPeriod.addEventListener('change', carregarProdutividade);

// Baixa o relatorio em PDF gerado no servidor para o periodo selecionado.
const prodExportBtn = document.getElementById('prod-export-pdf');
if (prodExportBtn) {
  prodExportBtn.addEventListener('click', async () => {
    if (!currentAdminUser) return;
    const dias = prodPeriod ? prodPeriod.value : '30';
    const usuario = isSystemAdmin() && prodExportUser ? prodExportUser.value : '';
    prodExportBtn.disabled = true;
    showMessage(prodMessage, 'Gerando o PDF...', false);
    try {
      const resposta = await apiAutenticada(`/api/incidentes/produtividade/pdf?dias=${encodeURIComponent(dias)}${usuario ? '&usuario=' + encodeURIComponent(usuario) : ''}`);
      if (!resposta.ok) {
        const corpo = await resposta.json().catch(() => ({}));
        showMessage(prodMessage, corpo.error || 'Não foi possível gerar o PDF.', true);
        return;
      }
      const blob = await resposta.blob();
      const nome = (resposta.headers.get('Content-Disposition') || '').match(/filename="([^"]+)"/)?.[1]
        || `produtividade-${new Date().toISOString().slice(0, 10)}.pdf`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = nome;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      showMessage(prodMessage, `PDF gerado: ${nome}`, false);
    } catch (error) {
      showMessage(prodMessage, 'Não foi possível falar com o servidor.', true);
    } finally {
      prodExportBtn.disabled = false;
    }
  });
}

// ---------- Notificacoes: diagnostico e teste de e-mail ----------
const emailStatus = document.getElementById('email-status');
const emailChecks = document.getElementById('email-checks');
const emailDiagnoseBtn = document.getElementById('email-diagnose-btn');
const emailTestForm = document.getElementById('email-test-form');
const emailTestTo = document.getElementById('email-test-to');
const emailMessage = document.getElementById('email-message');

const NOMES_PROVEDOR = { gmail: 'Gmail SMTP', resend: 'Resend', brevo: 'Brevo', nenhum: 'nenhum' };

async function diagnosticarEmail() {
  if (!ensureSystemAdminAction()) return;
  if (emailDiagnoseBtn) emailDiagnoseBtn.disabled = true;
  if (emailStatus) {
    emailStatus.className = 'email-status';
    emailStatus.textContent = 'Consultando o servidor...';
  }
  if (emailChecks) emailChecks.innerHTML = '';

  try {
    const resposta = await apiAutenticada('/api/auth/email/diagnostico');
    const d = await resposta.json().catch(() => ({}));
    if (!resposta.ok) {
      if (emailStatus) {
        emailStatus.className = 'email-status erro';
        emailStatus.textContent = d.error || 'Não foi possível consultar o servidor.';
      }
      return;
    }

    const nome = NOMES_PROVEDOR[d.provedor] || d.provedor;
    const conexaoDoProvedor = d.conexoes.find((c) =>
      (d.provedor === 'gmail' && c.host === 'smtp.gmail.com' && c.ok) ||
      (d.provedor === 'brevo' && c.host === 'api.brevo.com' && c.ok) ||
      (d.provedor === 'resend' && c.host === 'api.resend.com' && c.ok));

    if (emailStatus) {
      if (!d.configurado) {
        emailStatus.className = 'email-status erro';
        emailStatus.textContent = 'Nenhum provedor de e-mail configurado no servidor (arquivo .env).';
      } else if (!conexaoDoProvedor) {
        emailStatus.className = 'email-status erro';
        emailStatus.textContent = `Provedor configurado: ${nome} (remetente ${d.remetente}). O servidor não consegue se conectar a ele — veja as checagens abaixo.`;
      } else {
        emailStatus.className = 'email-status ok';
        emailStatus.textContent = `Provedor configurado: ${nome} (remetente ${d.remetente}). Conexão de saída disponível. Faça um envio de teste para confirmar as credenciais.`;
      }
    }

    if (emailChecks) {
      emailChecks.innerHTML = d.conexoes.map((c) => `
        <li class="${c.ok ? 'ok' : 'erro'}">
          <strong>${escapeHtml(c.nome)}</strong>
          <span>${escapeHtml(c.host)}:${c.port} — ${escapeHtml(c.detalhe)} (${c.ms} ms)</span>
        </li>`).join('')
        + `<li class="${d.whatsapp ? 'ok' : ''}"><strong>WhatsApp (Twilio)</strong><span>${d.whatsapp ? 'configurado' : 'não configurado'}</span></li>`;
    }
  } catch (error) {
    if (emailStatus) {
      emailStatus.className = 'email-status erro';
      emailStatus.textContent = 'Não foi possível falar com o servidor.';
    }
  } finally {
    if (emailDiagnoseBtn) emailDiagnoseBtn.disabled = false;
  }
}

if (emailDiagnoseBtn) emailDiagnoseBtn.addEventListener('click', diagnosticarEmail);

const whatsappTestForm = document.getElementById('whatsapp-test-form');
const whatsappTestTo = document.getElementById('whatsapp-test-to');
const whatsappMessage = document.getElementById('whatsapp-message');
const whatsappChecks = document.getElementById('whatsapp-checks');

const STATUS_WHATSAPP = {
  queued: 'na fila do Twilio',
  accepted: 'aceita pelo Twilio',
  sending: 'sendo enviada',
  sent: 'enviada ao WhatsApp (ainda sem confirmação de entrega)',
  delivered: 'entregue no aparelho',
  read: 'lida pelo destinatário',
  undelivered: 'não entregue',
  failed: 'falhou'
};

const whatsappTemplatesStatus = document.getElementById('whatsapp-templates-status');
const whatsappTemplatesList = document.getElementById('whatsapp-templates');
const whatsappTemplatesRefresh = document.getElementById('whatsapp-templates-refresh');
const whatsappTemplatesCreate = document.getElementById('whatsapp-templates-create');

const STATUS_TEMPLATE = {
  nao_criado: ['ainda não criado', ''],
  pending: ['aguardando aprovação da Meta', ''],
  received: ['recebido pela Meta, em análise', ''],
  submitted: ['enviado para aprovação', ''],
  approved: ['aprovado', 'ok'],
  rejected: ['rejeitado', 'erro'],
  paused: ['pausado pela Meta', 'erro'],
  disabled: ['desativado pela Meta', 'erro'],
  desconhecido: ['status desconhecido', 'erro']
};

function renderTemplatesWhatsApp(dados) {
  const lista = dados.templates || [];
  if (whatsappTemplatesList) {
    whatsappTemplatesList.innerHTML = lista.map((t) => {
      const [texto, classe] = STATUS_TEMPLATE[t.status] || STATUS_TEMPLATE.desconhecido;
      return `<li class="${classe}"><strong>${escapeHtml(t.titulo)}</strong><span>${texto}${t.nome ? ' — ' + escapeHtml(t.nome) : ''}${t.motivo ? ' — ' + escapeHtml(t.motivo) : ''}</span></li>`;
    }).join('');
  }
  if (whatsappTemplatesStatus) {
    const aprovados = lista.filter((t) => t.status === 'approved').length;
    if (!dados.configurado) {
      whatsappTemplatesStatus.className = 'email-status erro';
      whatsappTemplatesStatus.textContent = 'WhatsApp (Twilio) não configurado no servidor.';
    } else if (aprovados === lista.length && lista.length) {
      whatsappTemplatesStatus.className = 'email-status ok';
      whatsappTemplatesStatus.textContent = 'Os três templates estão aprovados: as notificações ao cidadão vão por template e chegam mesmo sem conversa aberta.';
    } else if (lista.every((t) => t.status === 'nao_criado')) {
      whatsappTemplatesStatus.className = 'email-status erro';
      whatsappTemplatesStatus.textContent = 'Sem templates aprovados, a prefeitura não consegue iniciar uma conversa no WhatsApp: só pode responder em até 24 h a quem escreveu primeiro. Clique em "Criar templates e pedir aprovação".';
    } else {
      whatsappTemplatesStatus.className = 'email-status';
      whatsappTemplatesStatus.textContent = `${aprovados} de ${lista.length} templates aprovados. A Meta costuma responder em minutos, às vezes em até 24 h. Clique em "Atualizar" para consultar.`;
    }
  }
}

async function carregarTemplatesWhatsApp(consultar = true) {
  if (!ensureSystemAdminAction()) return;
  if (whatsappTemplatesRefresh) whatsappTemplatesRefresh.disabled = true;
  try {
    const resposta = await apiAutenticada(`/api/auth/whatsapp/templates?consultar=${consultar ? '1' : '0'}`);
    const dados = await resposta.json().catch(() => ({}));
    if (resposta.ok) renderTemplatesWhatsApp(dados);
  } catch (error) {
    if (whatsappTemplatesStatus) whatsappTemplatesStatus.textContent = 'Não foi possível falar com o servidor.';
  } finally {
    if (whatsappTemplatesRefresh) whatsappTemplatesRefresh.disabled = false;
  }
}

if (whatsappTemplatesRefresh) whatsappTemplatesRefresh.addEventListener('click', () => carregarTemplatesWhatsApp(true));

if (whatsappTemplatesCreate) {
  whatsappTemplatesCreate.addEventListener('click', async () => {
    if (!ensureSystemAdminAction()) return;
    whatsappTemplatesCreate.disabled = true;
    if (whatsappTemplatesStatus) {
      whatsappTemplatesStatus.className = 'email-status';
      whatsappTemplatesStatus.textContent = 'Criando os templates no Twilio e pedindo a aprovação da Meta...';
    }
    try {
      const resposta = await apiAutenticada('/api/auth/whatsapp/templates/criar', { method: 'POST', body: JSON.stringify({}) });
      const dados = await resposta.json().catch(() => ({}));
      if (dados.templates) renderTemplatesWhatsApp({ templates: dados.templates, configurado: true });
      if (!dados.ok && whatsappTemplatesStatus) {
        whatsappTemplatesStatus.className = 'email-status erro';
        whatsappTemplatesStatus.textContent = dados.reason || 'Não foi possível criar os templates.';
      }
    } catch (error) {
      if (whatsappTemplatesStatus) whatsappTemplatesStatus.textContent = 'Não foi possível falar com o servidor.';
    } finally {
      whatsappTemplatesCreate.disabled = false;
    }
  });
}

if (whatsappTestForm) {
  whatsappTestForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!ensureSystemAdminAction()) return;
    const para = whatsappTestTo?.value?.trim() || '';
    const botao = whatsappTestForm.querySelector('button[type="submit"]');
    if (botao) botao.disabled = true;
    if (whatsappChecks) whatsappChecks.innerHTML = '';
    showMessage(whatsappMessage, 'Enviando e acompanhando o status (até 10 s)...', false);

    try {
      const resposta = await apiAutenticada('/api/auth/whatsapp/teste', {
        method: 'POST',
        body: JSON.stringify({ para })
      });
      const r = await resposta.json().catch(() => ({}));
      if (r.error) {
        showMessage(whatsappMessage, r.error, true);
        return;
      }

      const statusTexto = STATUS_WHATSAPP[r.status] || r.status || 'desconhecido';
      if (resposta.status === 200 && r.sent) {
        showMessage(whatsappMessage, `Mensagem ${statusTexto}${r.para ? ' para ' + r.para : ''}${r.usouTemplate ? ', enviada por template aprovado' : ', enviada como texto livre (só chega se o destinatário escreveu nas últimas 24 h)'}.${['queued', 'sent', 'accepted', 'sending'].includes(r.status) ? ' Se não chegar em alguns minutos, veja os logs em Monitor > Messaging no console do Twilio.' : ''}`, false);
      } else {
        showMessage(whatsappMessage, `Não entregue (${statusTexto}): ${r.reason || 'motivo não informado'}`, true);
      }

      if (whatsappChecks) {
        const itens = [];
        if (r.remetente) itens.push(`<li class="${r.sandbox ? '' : 'ok'}"><strong>Remetente</strong><span>${escapeHtml(r.remetente)}${r.sandbox ? ' — número do sandbox do Twilio: cada destinatário precisa enviar "join <palavra-chave>" para ele antes de receber mensagens, e isso expira em 72 h.' : ''}</span></li>`);
        if (r.sid) itens.push(`<li class="ok"><strong>Mensagem</strong><span>${escapeHtml(r.sid)}</span></li>`);
        if (r.codigo) itens.push(`<li class="erro"><strong>Erro Twilio ${escapeHtml(String(r.codigo))}</strong><span>${escapeHtml(r.reason || '')}</span></li>`);
        whatsappChecks.innerHTML = itens.join('');
      }
    } catch (error) {
      showMessage(whatsappMessage, 'Não foi possível falar com o servidor.', true);
    } finally {
      if (botao) botao.disabled = false;
    }
  });
}

if (emailTestForm) {
  emailTestForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!ensureSystemAdminAction()) return;
    const para = emailTestTo?.value?.trim() || '';
    const botao = emailTestForm.querySelector('button[type="submit"]');
    if (botao) botao.disabled = true;
    showMessage(emailMessage, 'Enviando e-mail de teste...', false);

    try {
      const resposta = await apiAutenticada('/api/auth/email/teste', {
        method: 'POST',
        body: JSON.stringify({ para })
      });
      const r = await resposta.json().catch(() => ({}));
      if (resposta.status === 200 && r.sent) {
        showMessage(emailMessage, `E-mail de teste enviado para ${para} via ${NOMES_PROVEDOR[r.provedor] || r.provedor}. Confira a caixa de entrada (e o spam).`, false);
      } else {
        showMessage(emailMessage, r.error || `Falha no envio${r.provedor ? ' via ' + (NOMES_PROVEDOR[r.provedor] || r.provedor) : ''}: ${r.reason || 'motivo desconhecido'}`, true);
      }
    } catch (error) {
      showMessage(emailMessage, 'Não foi possível falar com o servidor.', true);
    } finally {
      if (botao) botao.disabled = false;
    }
  });
}

if (logoutBtn) {
  logoutBtn.addEventListener('click', () => {
    // Encerra a sessao no servidor descartando o token.
    setToken('');
    hideAdminDashboard();
    if (loginForm) {
      loginForm.reset();
    }
    showMessage(loginMessage, '', false);
  });
}

const clearIncidentsBtn = document.getElementById('clear-incidents-btn');
const adminMessage = document.getElementById('admin-message');

if (clearIncidentsBtn) {
  clearIncidentsBtn.addEventListener('click', async () => {
    if (!ensureSystemAdminAction()) return;
    const confirmed = window.confirm('Tem certeza que deseja limpar todas as ocorrências cadastradas?');
    if (!confirmed) return;
    try {
      const resposta = await apiAutenticada('/api/incidentes', { method: 'DELETE' });
      const corpo = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        showMessage(adminMessage, corpo.error || 'Não foi possível limpar as ocorrências.', true);
        return;
      }
    } catch (error) {
      showMessage(adminMessage, 'Não foi possível falar com o servidor.', true);
      return;
    }
    definirIncidentes([]);
    await refreshDashboard();
    showMessage(adminMessage, 'Todas as ocorrências foram removidas.', false);
  });
}

// debug helper removed

if (incidentList) {
  incidentList.addEventListener('change', async (event) => {
    const select = event.target.closest('.status-select');
    if (!select) return;

    const item = getVisibleIncidents(getIncidents()).find((it) => it.id === select.dataset.id);
    if (!item || item.status === select.value) return;

    // Concluir exige a resposta ao cidadao: e ela que vai no e-mail/WhatsApp
    // de conclusao, em vez de uma atualizacao antiga de andamento.
    let respostaConclusao;
    if (select.value === 'Concluído') {
      respostaConclusao = await pedirRespostaDeConclusao(item);
      if (respostaConclusao === null) {
        refreshDashboard();   // devolve o select ao status anterior
        return;
      }
    }

    const now = new Date().toISOString();
    const previousStatus = item.status;
    const resultado = await atualizarIncidenteNoServidor(item.id, {
      status: select.value,
      ...(respostaConclusao !== undefined ? { respostaConclusao } : {}),
      history: [
        ...(Array.isArray(item.history) ? item.history : []),
        {
          id: crypto.randomUUID(),
          type: 'status',
          text: `Status alterado de ${item.status} para ${select.value}`,
          by: currentAdminUser?.username || '',
          at: now
        }
      ]
    });

    if (!resultado.ok) {
      showMessage(adminMessage, resultado.erro, true);
      refreshDashboard();
      return;
    }
    const changedIncident = normalizeIncident(resultado.incidente);
    refreshDashboard();

    if (changedIncident) {
      const notified = await notifyIncidentStatusChange(changedIncident, previousStatus, changedIncident.status);
      if (!notified) {
        showMessage(adminMessage, 'Status atualizado, mas a notificação ao cidadão falhou.', true);
      } else {
        showMessage(adminMessage, 'Status atualizado e cidadão notificado.', false);
      }
    }
  });
}

if (addCategoryBtn) {
  addCategoryBtn.addEventListener('click', () => {
    if (!ensureSystemAdminAction()) return;
    addCategory();
    renderUserCategoryAccessOptions();
  });
}

if (addPriorityBtn) {
  addPriorityBtn.addEventListener('click', () => {
    if (!ensureSystemAdminAction()) return;
    addPriority();
  });
}

if (categoryList) {
  categoryList.addEventListener('click', (event) => {
    if (!ensureSystemAdminAction()) return;
    const actionBtn = event.target.closest('button');
    if (!actionBtn) return;
    const action = actionBtn.dataset.action;
    const index = Number(actionBtn.dataset.index);
    const type = actionBtn.dataset.type || 'category';
    if (action === 'remove') return removeConfigItem(index, type);
    if (action === 'edit') return startEditItem(index, type);
    if (action === 'save') return saveEditItem(index, type);
    if (action === 'cancel') return cancelEdit(type);
  });
}

if (priorityList) {
  priorityList.addEventListener('click', (event) => {
    if (!ensureSystemAdminAction()) return;
    const actionBtn = event.target.closest('button');
    if (!actionBtn) return;
    const action = actionBtn.dataset.action;
    const index = Number(actionBtn.dataset.index);
    const type = actionBtn.dataset.type || 'priority';
    if (action === 'remove') return removeConfigItem(index, type);
    if (action === 'edit') return startEditItem(index, type);
    if (action === 'save') return saveEditItem(index, type);
    if (action === 'cancel') return cancelEdit(type);
  });
}

// Tab switching
const tabOccurrences = document.getElementById('tab-occurrences');
const tabCategories = document.getElementById('tab-categories');
const tabPriorities = document.getElementById('tab-priorities');
const tabUsers = document.getElementById('tab-users');
const tabPassword = document.getElementById('tab-password');
const tabNotifications = document.getElementById('tab-notifications');
const tabProductivity = document.getElementById('tab-productivity');
const tabExecutive = document.getElementById('tab-executive');
const panelOccurrences = document.getElementById('panel-occurrences');
const panelCategories = document.getElementById('panel-categories');
const panelPriorities = document.getElementById('panel-priorities');
const panelUsers = document.getElementById('panel-users');
const panelPassword = document.getElementById('panel-password');
const panelNotifications = document.getElementById('panel-notifications');
const panelProductivity = document.getElementById('panel-productivity');
const panelExecutive = document.getElementById('panel-executive');

function switchTab(tab) {
  // reset active
  [tabOccurrences, tabCategories, tabPriorities, tabUsers, tabPassword, tabNotifications, tabProductivity, tabExecutive].forEach((b) => b && b.classList.remove('active'));
  [panelOccurrences, panelCategories, panelPriorities, panelUsers, panelPassword, panelNotifications, panelProductivity, panelExecutive].forEach((p) => p && p.classList.add('hidden'));

  if (!isSystemAdmin() && (tab === 'categories' || tab === 'priorities' || tab === 'users' || tab === 'notifications' || tab === 'executive')) {
    tab = 'occurrences';
  }

  if (tab === 'occurrences') {
    tabOccurrences.classList.add('active');
    panelOccurrences.classList.remove('hidden');
    carregarIncidentesDoServidor().then((ok) => {
      if (ok) refreshDashboard();
    });
    if (adminMap) {
      setTimeout(() => {
        if (window.google?.maps) {
          google.maps.event.trigger(adminMap, 'resize');
        }
      }, 0);
    } else {
      initMap(getIncidents());
    }
  }
  if (tab === 'categories') {
    tabCategories.classList.add('active');
    panelCategories.classList.remove('hidden');
  }
  if (tab === 'priorities') {
    tabPriorities.classList.add('active');
    panelPriorities.classList.remove('hidden');
  }
  if (tab === 'users') {
    tabUsers.classList.add('active');
    panelUsers.classList.remove('hidden');
    sincronizarUsuariosDoServidor().then((ok) => {
      if (ok) renderAdminUsers();
    });
  }
  if (tab === 'password') {
    tabPassword.classList.add('active');
    panelPassword.classList.remove('hidden');
  }
  if (tab === 'notifications') {
    tabNotifications.classList.add('active');
    panelNotifications.classList.remove('hidden');
    carregarTemplatesWhatsApp(false);
  }
  if (tab === 'productivity') {
    tabProductivity.classList.add('active');
    panelProductivity.classList.remove('hidden');
    carregarProdutividade();
  }
  if (tab === 'executive') {
    tabExecutive.classList.add('active');
    panelExecutive.classList.remove('hidden');
    carregarExecutivo();
  }
}

if (tabOccurrences) tabOccurrences.addEventListener('click', () => switchTab('occurrences'));
if (tabCategories) tabCategories.addEventListener('click', () => switchTab('categories'));
if (tabPriorities) tabPriorities.addEventListener('click', () => switchTab('priorities'));
if (tabUsers) tabUsers.addEventListener('click', () => switchTab('users'));
if (tabPassword) tabPassword.addEventListener('click', () => switchTab('password'));
if (tabNotifications) tabNotifications.addEventListener('click', () => switchTab('notifications'));
if (tabProductivity) tabProductivity.addEventListener('click', () => switchTab('productivity'));
if (tabExecutive) tabExecutive.addEventListener('click', () => switchTab('executive'));

// Titulo e subtitulo do conteudo acompanham a aba ativa (painel com barra lateral).
const TITULOS_PAINEL = {
  executive: ['Visão do Prefeito', 'Gestão inteligente para uma cidade melhor.'],
  occurrences: ['Ocorrências', 'Acompanhe, atualize e conclua as solicitações dos cidadãos.'],
  productivity: ['Produtividade', 'Desempenho das secretarias nas ocorrências.'],
  categories: ['Categorias', 'Tipos de problema que o cidadão pode registrar.'],
  priorities: ['Prioridades', 'Níveis de prioridade usados na classificação.'],
  users: ['Usuários', 'Secretarias e administradores com acesso ao painel.'],
  notifications: ['Notificações', 'E-mail e WhatsApp enviados ao cidadão.'],
  password: ['Minha senha', 'Troque a senha de acesso ao painel.']
};
const switchTabOriginal = switchTab;
switchTab = function (tab) {
  switchTabOriginal(tab);
  const ativo = document.querySelector('.sidebar-nav .tab-button.active');
  const chave = ativo ? ativo.id.replace('tab-', '') : tab;
  const [titulo, sub] = TITULOS_PAINEL[chave] || TITULOS_PAINEL.occurrences;
  const h1 = document.getElementById('painel-titulo');
  const p = document.getElementById('painel-subtitulo');
  if (h1) h1.textContent = titulo;
  if (p) p.textContent = sub;
};

if (newAdminRoleSelect) {
  newAdminRoleSelect.addEventListener('change', updateAdminRoleUi);
}

if (adminUserForm) {
  adminUserForm.addEventListener('submit', createAdminUser);
}

if (adminUsersList) {
  adminUsersList.addEventListener('click', (event) => {
    const actionBtn = event.target.closest('button[data-action]');
    if (!actionBtn) return;
    const action = actionBtn.dataset.action;
    if (action === 'remove-admin-user') {
      removeAdminUser(actionBtn.dataset.userId);
    } else if (action === 'edit-admin-user') {
      startEditUser(actionBtn.dataset.userId);
    }
  });
}

const cancelEditUserBtn = document.getElementById('cancel-edit-user-btn');
if (cancelEditUserBtn) {
  cancelEditUserBtn.addEventListener('click', cancelEditUser);
}

function initAdminConfig() {
  renderAdminConfig();
}

async function lookupCep(cep) {
  if (!cepMessage) return;
  cepMessage.textContent = 'Consultando CEP...';

  try {
    const cleanedCep = cep.replace(/\D/g, '');
    if (cleanedCep.length !== 8) {
      cepMessage.textContent = 'CEP inválido. Use 8 dígitos.';
      return;
    }

    const response = await fetch(`https://viacep.com.br/ws/${cleanedCep}/json/`);
    const data = await response.json();

    if (data.erro) {
      cepMessage.textContent = 'CEP não encontrado.';
      return;
    }

    if (streetInput) streetInput.value = data.logradouro || '';
    if (neighborhoodInput) neighborhoodInput.value = data.bairro || '';
    if (cityInput) cityInput.value = data.localidade || '';
    if (stateInput) stateInput.value = data.uf || '';
    // O CEP nao traz o numero do imovel: o foco vai direto para ele.
    const faltaNumero = numberInput && !numberInput.value.trim();
    cepMessage.textContent = faltaNumero
      ? 'Endereço preenchido automaticamente. Informe o número.'
      : 'Endereço preenchido automaticamente.';
    if (faltaNumero && manualRadio?.checked) numberInput.focus();
  } catch (error) {
    cepMessage.textContent = 'Erro ao buscar CEP. Tente novamente.';
  }
}

if (cepInput) {
  cepInput.addEventListener('blur', () => {
    const cep = cepInput.value;
    if (cep) {
      lookupCep(cep);
    }
  });
}

// "Sem numero" grava S/N no campo e o trava; desmarcar devolve o campo vazio.
function definirSemNumero(semNumero) {
  if (!numberInput) return;
  if (noNumberCheckbox) noNumberCheckbox.checked = semNumero;
  numberInput.readOnly = semNumero;
  if (semNumero) {
    numberInput.value = 'S/N';
    numberInput.classList.remove('campo-invalido');
  } else if (numberInput.value === 'S/N') {
    numberInput.value = '';
  }
}

if (noNumberCheckbox) {
  noNumberCheckbox.addEventListener('change', () => {
    definirSemNumero(noNumberCheckbox.checked);
    if (!noNumberCheckbox.checked) numberInput?.focus();
  });
}

// No modo manual, logradouro, numero e cidade sao obrigatorios. Devolve o
// primeiro campo que falta (para receber o foco) ou null se estiver completo.
function validarEnderecoManual() {
  const obrigatorios = [
    [streetInput, 'Informe o logradouro.'],
    [numberInput, 'Informe o número do endereço ou marque "Sem número".'],
    [cityInput, 'Informe a cidade.']
  ];

  let primeiro = null;
  for (const [campo, mensagem] of obrigatorios) {
    if (!campo) continue;
    const vazio = !campo.value.trim();
    campo.classList.toggle('campo-invalido', vazio);
    if (vazio && !primeiro) primeiro = { campo, mensagem };
  }
  return primeiro;
}

[streetInput, numberInput, cityInput].forEach((campo) => {
  if (campo) campo.addEventListener('input', () => campo.classList.remove('campo-invalido'));
});

let enderecoLocalizado = false;

function updateAddressMode() {
  if (manualRadio?.checked || enderecoLocalizado) {
    if (addressFields) addressFields.style.display = 'grid';
  } else {
    if (addressFields) addressFields.style.display = 'none';
  }

  // Keep model-generated fields hidden on the initial registration step.
  if (detailsFields) detailsFields.style.display = 'none';
}

if (geoRadio) {
  geoRadio.addEventListener('change', async () => {
    updateAddressMode();
    if (geoRadio.checked) {
      await obterLocalizacaoDoWizard(true);
    }
  });
  // A opcao ja vem marcada: clicar nela de novo nao dispara "change", mas o
  // cidadao espera que a localizacao seja buscada. O clique forca a busca.
  geoRadio.addEventListener('click', () => {
    if (geoRadio.checked) obterLocalizacaoDoWizard(true);
  });
}
if (manualRadio) {
  manualRadio.addEventListener('change', updateAddressMode);
}

updateAddressMode();
watchGeolocationPermission();

// Diagnóstico: confirma no console se o popup de desbloqueio está disponível
// e permite testá-lo manualmente com smartgovGeo.abrirPopup().
if (occurrenceForm) {
  console.log('[geo] versao 2026-09-02 | popup no DOM:', Boolean(geoModal), '| suporta <dialog>:', Boolean(geoModal?.showModal));
  window.smartgovGeo = {
    abrirPopup: () => openGeoPermissionModal(),
    estadoPermissao: () => getGeolocationPermissionState(),
    tentarLocalizacao: () => requestGeolocationPermission()
  };
}

// Renderiza a mensagem de geolocalizacao, opcionalmente com um botao de nova tentativa.
function showGeoMessage(text, options = {}) {
  if (!geoMessage) return;
  geoMessage.textContent = '';
  geoMessage.classList.toggle('error', Boolean(options.isError));

  const label = document.createElement('span');
  label.textContent = text;
  geoMessage.appendChild(label);

  if (options.retryLabel) {
    const retryButton = document.createElement('button');
    retryButton.type = 'button';
    retryButton.className = 'geo-retry-button';
    retryButton.textContent = options.retryLabel;
    retryButton.addEventListener('click', async () => {
      retryButton.disabled = true;
      const result = await getGeolocationAddress();
      if (result.ok) {
        useGeolocationMode();
      } else if (result.denied) {
        openGeoPermissionModal();
      } else {
        retryButton.disabled = false;
      }
    });
    geoMessage.appendChild(retryButton);
  }
}

// Volta o formulario para o modo "usar minha localizacao".
function useGeolocationMode() {
  if (geoRadio) geoRadio.checked = true;
  updateAddressMode();
}

// Pede a permissao ao usuario. Se o navegador ja tiver bloqueado o site,
// explica como reabilitar em vez de falhar silenciosamente.
async function requestGeolocationPermission() {
  const state = await getGeolocationPermissionState();
  console.log('[geo] estado da permissao:', state);

  if (state === 'denied') {
    return openGeoPermissionModal();
  }

  const result = await getGeolocationAddress();
  if (result.ok) return true;

  // Cobre o caso em que a Permissions API ainda reporta 'prompt' (usuário
  // dispensou o balão) mas a chamada foi recusada mesmo assim.
  if (result.denied) return openGeoPermissionModal();

  return false;
}

// Passos de desbloqueio conforme o navegador em uso.
function getGeoUnblockSteps() {
  const ua = navigator.userAgent;
  const isEdge = /Edg\//.test(ua);
  const isFirefox = /Firefox\//.test(ua);
  const isSafari = /Safari\//.test(ua) && !/Chrome|Chromium|Edg\//.test(ua);

  if (isFirefox) {
    return [
      'Clique no ícone de cadeado à esquerda do endereço do site.',
      'Localize a linha "Acessar sua localização" e clique no "x" para remover o bloqueio.',
      'Recarregue a página se necessário e permita o acesso quando o Firefox perguntar.'
    ];
  }

  if (isSafari) {
    return [
      'No menu superior, abra Safari › Configurações (ou Preferências).',
      'Vá até a aba "Sites" e selecione "Localização" na lista lateral.',
      'Encontre este site e troque a opção para "Perguntar" ou "Permitir".'
    ];
  }

  const menuName = isEdge ? 'Permissões para este site' : 'Configurações do site';
  return [
    'Clique no ícone de cadeado (ou de ajustes) à esquerda do endereço do site.',
    `Abra "${menuName}" e encontre a opção "Localização".`,
    'Troque de "Bloquear" para "Permitir".'
  ];
}

// Mostra o popup explicando como desbloquear a localização.
// Resolve true somente se a localização for obtida; false se o usuário optar pelo modo manual.
function openGeoPermissionModal() {
  console.log('[geo] abrindo popup de desbloqueio');

  // Sem suporte a <dialog>: mantém o aviso inline como alternativa.
  if (!geoModal?.showModal) {
    showGeoMessage(
      'A localização está bloqueada para este site. Libere o acesso nas configurações do navegador '
        + 'ou preencha o endereço manualmente.',
      { isError: true, retryLabel: 'Já liberei, tentar novamente' }
    );
    switchToManualAddress();
    return Promise.resolve(false);
  }

  if (geoModalSteps) {
    geoModalSteps.textContent = '';
    getGeoUnblockSteps().forEach((step) => {
      const item = document.createElement('li');
      item.textContent = step;
      geoModalSteps.appendChild(item);
    });
  }

  setGeoModalMessage('');
  if (geoModalRetry) geoModalRetry.disabled = false;
  geoModal.showModal();

  return new Promise((resolve) => {
    const finish = (result) => {
      geoModalRetry?.removeEventListener('click', onRetry);
      geoModalManual?.removeEventListener('click', onManual);
      geoModal.removeEventListener('cancel', onCancel);
      if (geoModal.open) geoModal.close();
      resolve(result);
    };

    const onRetry = async () => {
      if (geoModalRetry) geoModalRetry.disabled = true;
      setGeoModalMessage('Verificando a permissão...');

      const state = await getGeolocationPermissionState();
      if (state === 'denied') {
        setGeoModalMessage(
          'A localização ainda está bloqueada. Conclua os passos acima e tente de novo.',
          true
        );
        if (geoModalRetry) geoModalRetry.disabled = false;
        return;
      }

      const result = await getGeolocationAddress();
      if (result.ok) {
        useGeolocationMode();
        finish(true);
        return;
      }

      setGeoModalMessage(
        result.denied
          ? 'A localização ainda está bloqueada. Conclua os passos acima e tente de novo.'
          : 'Ainda não foi possível obter sua localização. Tente novamente ou preencha o endereço manualmente.',
        true
      );
      if (geoModalRetry) geoModalRetry.disabled = false;
    };

    const onManual = () => {
      switchToManualAddress();
      showGeoMessage('Preencha o endereço manualmente abaixo.');
      finish(false);
    };

    // Fechar pelo Esc equivale a escolher o preenchimento manual.
    const onCancel = () => {
      switchToManualAddress();
      showGeoMessage('Preencha o endereço manualmente abaixo.');
      finish(false);
    };

    geoModalRetry?.addEventListener('click', onRetry);
    geoModalManual?.addEventListener('click', onManual);
    geoModal.addEventListener('cancel', onCancel);
  });
}

function setGeoModalMessage(text, isError = false) {
  if (!geoModalMessage) return;
  geoModalMessage.textContent = text;
  geoModalMessage.classList.toggle('error', isError);
}

// Alterna o formulário para o preenchimento manual do endereço.
function switchToManualAddress() {
  if (manualRadio) manualRadio.checked = true;
  updateAddressMode();
}

// Consulta o estado da permissao. Retorna 'unknown' se a Permissions API nao existir.
async function getGeolocationPermissionState() {
  if (!navigator.permissions?.query) return 'unknown';
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' });
    return status.state;
  } catch (error) {
    return 'unknown';
  }
}

// Se o usuario liberar a localizacao nas configuracoes do navegador, o formulario
// passa a usa-la na hora, sem precisar recarregar a pagina.
async function watchGeolocationPermission() {
  if (!navigator.permissions?.query) return;

  let status;
  try {
    status = await navigator.permissions.query({ name: 'geolocation' });
  } catch (error) {
    return;
  }

  status.addEventListener('change', async () => {
    if (status.state === 'granted') {
      const result = await getGeolocationAddress();
      if (result.ok) useGeolocationMode();
    } else if (status.state === 'prompt') {
      showGeoMessage('Você pode usar sua localização novamente.', {
        retryLabel: 'Usar minha localização'
      });
    } else {
      showGeoMessage(
        'A localização foi bloqueada para este site. Preencha o endereço manualmente ou libere o acesso no navegador.',
        { isError: true, retryLabel: 'Já habilitei, usar minha localização' }
      );
      switchToManualAddress();
    }
  });
}

// Retorna { ok, denied }: `denied` indica que a falha foi de permissão,
// o que dispara o popup com as instruções de desbloqueio.
async function getGeolocationAddress() {
  if (!navigator.geolocation) {
    showGeoMessage('Geolocalização não disponível neste navegador.', { isError: true });
    return { ok: false, denied: false };
  }

  showGeoMessage('Obtendo localização...');

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude, longitude } = pos.coords;
      const result = await reverseGeocode(latitude, longitude);
      if (!result) {
        showGeoMessage('Não foi possível obter o endereço a partir da localização.', {
          isError: true,
          retryLabel: 'Tentar novamente'
        });
        return resolve({ ok: false, denied: false });
      }

      if (cepInput) cepInput.value = result.cep;
      if (streetInput) streetInput.value = result.street;
      if (neighborhoodInput) neighborhoodInput.value = result.neighborhood;
      if (cityInput) cityInput.value = result.city;
      if (stateInput) stateInput.value = result.state;

      // O numero digitado pelo cidadao prevalece sobre o da geocodificacao,
      // que pode ser aproximado; so se preenche quando o campo esta vazio.
      if (numberInput) {
        const digitado = numberInput.readOnly ? numberInput.value : numberInput.value.trim();
        if (!digitado) {
          definirSemNumero(false);
          numberInput.value = result.number;
        }
      }

      sessionStorage.setItem('smartgov360-last-latitude', String(latitude));
      sessionStorage.setItem('smartgov360-last-longitude', String(longitude));

      // Mostra o endereco localizado para conferencia, com o numero editavel.
      enderecoLocalizado = true;
      updateAddressMode();
      const semNumero = numberInput && !numberInput.value.trim();
      showGeoMessage(semNumero
        ? 'Localização obtida. Confira o endereço e informe o número.'
        : 'Endereço preenchido pela sua localização. Confira os dados antes de enviar.');
      if (semNumero && numberInput) numberInput.focus();
      resolve({ ok: true, denied: false });
    }, (err) => {
      console.log('[geo] falha:', err.code, err.message);

      if (err.code === err.PERMISSION_DENIED) {
        // A mensagem detalhada fica a cargo do popup de desbloqueio.
        showGeoMessage('Permissão de localização negada.', { isError: true });
        resolve({ ok: false, denied: true });
        return;
      }

      if (err.code === err.TIMEOUT) {
        showGeoMessage('Tempo esgotado ao obter a localização.', {
          isError: true,
          retryLabel: 'Tentar novamente'
        });
      } else {
        showGeoMessage('Não foi possível obter sua localização. Preencha o endereço manualmente.', {
          isError: true,
          retryLabel: 'Tentar novamente'
        });
      }
      resolve({ ok: false, denied: false });
    }, { enableHighAccuracy: true, timeout: 10000 });
  });
}

async function reverseGeocodeNominatim(lat, lon) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = await resp.json();
    const addr = data.address || {};

    return {
      cep: addr.postcode || '',
      street: addr.road || addr.pedestrian || addr.cycleway || '',
      number: addr.house_number || '',
      neighborhood: addr.suburb || addr.neighbourhood || addr.village || '',
      city: addr.city || addr.town || addr.village || addr.county || '',
      state: addr.state || ''
    };
  } catch (error) {
    return null;
  }
}

// O geocoder do Google costuma trazer o numero do imovel (street_number),
// que o Nominatim quase nunca tem no Brasil. Exige a API carregada na pagina.
function reverseGeocodeGoogle(lat, lon) {
  if (!window.google?.maps?.Geocoder) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      new google.maps.Geocoder().geocode({ location: { lat, lng: lon } }, (results, status) => {
        if (status !== 'OK' || !results?.length) return resolve(null);
        const temNumero = (r) => (r.address_components || []).some((c) => c.types.includes('street_number'));
        const melhor = results.find((r) => (r.types || []).includes('street_address') && temNumero(r))
          || results.find(temNumero)
          || results[0];
        const comp = (tipo, curto = false) => {
          const c = (melhor.address_components || []).find((x) => x.types.includes(tipo));
          return c ? (curto ? c.short_name : c.long_name) : '';
        };
        resolve({
          cep: comp('postal_code'),
          street: comp('route'),
          number: comp('street_number'),
          neighborhood: comp('sublocality_level_1') || comp('sublocality') || comp('neighborhood'),
          city: comp('administrative_area_level_2') || comp('locality'),
          state: comp('administrative_area_level_1', true)
        });
      });
    } catch (error) {
      resolve(null);
    }
  });
}

// Combina as duas fontes: cada campo vem da primeira que o tiver.
async function reverseGeocode(lat, lon) {
  const [doGoogle, doNominatim] = await Promise.all([reverseGeocodeGoogle(lat, lon), reverseGeocodeNominatim(lat, lon)]);
  if (!doGoogle && !doNominatim) return null;
  const principal = doGoogle || {};
  const reserva = doNominatim || {};
  const campo = (nome) => (principal[nome] || '').toString().trim() || (reserva[nome] || '').toString().trim();
  return {
    cep: campo('cep'),
    street: campo('street'),
    number: campo('number'),
    neighborhood: campo('neighborhood'),
    city: campo('city'),
    state: campo('state')
  };
}

if (year) {
  year.textContent = new Date().getFullYear();
}

getAdminUsers();

// Ao recarregar a pagina, a sessao e validada no servidor e a lista de
// usuarios e ressincronizada antes de abrir o painel. Antes disso o painel
// era restaurado so com o espelho local, que podia estar desatualizado e
// mostrar apenas o admin.
async function restaurarSessaoDoServidor() {
  if (!adminDashboard || !adminLogin || !getToken()) return false;

  try {
    const resposta = await apiAutenticada('/api/auth/me');
    if (!resposta.ok) return false;

    const corpo = await resposta.json().catch(() => ({}));
    if (!corpo.usuario) return false;

    await sincronizarUsuariosDoServidor();
    await showAdminDashboard(corpo.usuario);
    showMessage(loginMessage, `Sessão restaurada para ${corpo.usuario.username}.`, false);
    return true;
  } catch (error) {
    console.warn('[auth] Nao foi possivel restaurar a sessao:', error);
    return false;
  }
}

restaurarSessaoDoServidor().then((restaurada) => {
  if (restaurada) return;
  // Sem sessao valida no servidor, garante o estado de login.
  const sessaoLocal = restoreAdminSession();
  if (sessaoLocal) {
    persistAdminSession(null);
    setToken('');
  }
});

refreshDashboard();


// =====================================================================
// Formulario do cidadao em quatro passos (index.html)
// =====================================================================
// Pede a localizacao uma vez por vez: chamadas simultaneas (clique na opcao
// + "Proximo") compartilham o mesmo pedido. Fora do formulario em passos,
// cai no pedido direto.
let pedidoDeLocalizacao = null;
function obterLocalizacaoDoWizard(forcar = false) {
  if (!geoRadio?.checked) return Promise.resolve(true);
  if (!forcar && temCoordenadasNaSessao() && (streetInput?.value || '').trim()) return Promise.resolve(true);
  if (pedidoDeLocalizacao) return pedidoDeLocalizacao;
  pedidoDeLocalizacao = requestGeolocationPermission().finally(() => { pedidoDeLocalizacao = null; });
  return pedidoDeLocalizacao;
}

function temCoordenadasNaSessao() {
  const lat = sessionStorage.getItem('smartgov360-last-latitude');
  const lng = sessionStorage.getItem('smartgov360-last-longitude');
  return Boolean(lat && lng && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)));
}

// Icones por palavra-chave da categoria (cadastrada pelo administrador).
const ICONES_CATEGORIA = [
  [/buraco|asfalto|pavimento|via|rua/, '<svg viewBox="0 0 24 24"><path d="M8 4h8l4 16H4z"/><path d="M12 6v3M12 12v3M12 18v2"/></svg>'],
  [/ilumina|poste|l[aâ]mpada|luz/, '<svg viewBox="0 0 24 24"><path d="M9 18h6M10 21h4"/><path d="M8 13a5 5 0 1 1 8 0c-1 1-1.5 2-1.5 3h-5c0-1-.5-2-1.5-3z"/><path d="M12 2v1M4 10h1M19 10h1M6 4l.7.7M18 4l-.7.7"/></svg>'],
  [/lixo|coleta|entulho|res[ií]duo/, '<svg viewBox="0 0 24 24"><path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13"/><path d="M10 11v6M14 11v6"/></svg>'],
  [/limpeza|varri|capina|mato/, '<svg viewBox="0 0 24 24"><path d="M14 3l-5 9"/><path d="M9 12l-5 2 2 6 6-2 2-6z"/><path d="M6 14l2 6"/></svg>'],
  [/[aá]rvore|poda|verde|pra[çc]a|parque/, '<svg viewBox="0 0 24 24"><path d="M12 22v-6"/><path d="M8 16h8l-2-4h1l-3-5h1l-3-5-3 5h1l-3 5h1z"/></svg>'],
  [/cal[çc]ada|passeio|acessib/, '<svg viewBox="0 0 24 24"><circle cx="13" cy="4" r="1.6"/><path d="M11 20l1-6 3 2v4M8 12l3-4 3 1 2 3"/><path d="M3 21h18"/></svg>'],
  [/drenag|bueiro|esgoto|[aá]gua|alag|enchente/, '<svg viewBox="0 0 24 24"><path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/></svg>'],
  [/sinaliza|placa|sem[aá]foro|tr[aâ]nsito/, '<svg viewBox="0 0 24 24"><path d="M12 3l9 16H3z"/><path d="M12 10v4M12 17v.5"/></svg>'],
  [/anim|cachorro|c[aã]o|zoonose/, '<svg viewBox="0 0 24 24"><circle cx="8" cy="8" r="2"/><circle cx="16" cy="8" r="2"/><circle cx="5" cy="13" r="1.8"/><circle cx="19" cy="13" r="1.8"/><path d="M12 12c3 0 5 2.5 5 5s-2 3-5 3-5-.5-5-3 2-5 5-5z"/></svg>'],
  [/sa[uú]de|posto|ubs/, '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/></svg>'],
  [/escola|educa/, '<svg viewBox="0 0 24 24"><path d="M3 9l9-4 9 4-9 4z"/><path d="M7 11v5c0 1.5 2.5 3 5 3s5-1.5 5-3v-5"/><path d="M21 9v5"/></svg>']
];
const ICONE_OUTROS = '<svg viewBox="0 0 24 24"><circle cx="6" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="18" cy="12" r="1.5"/></svg>';

function iconeDaCategoria(nome) {
  const chave = (nome || '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const achado = ICONES_CATEGORIA.find(([re]) => re.test(chave));
  return achado ? achado[1] : ICONE_OUTROS;
}

function classeDoStatus(status) {
  const s = (status || '').toLowerCase();
  if (s.startsWith('conclu')) return 'concluido';
  if (s.startsWith('em and')) return 'andamento';
  return 'recebido';
}

function dataCurta(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR') + ' - ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

const TOTAL_PASSOS = 5;
const wizardStepper = document.getElementById('wizard-stepper');
const wizardSteps = Array.from(document.querySelectorAll('.wizard-step'));
const wizardSuccess = document.getElementById('wizard-success');
const categoryGrid = document.getElementById('category-grid');
let passoAtual = 1;

function irParaPasso(n) {
  passoAtual = Math.max(1, Math.min(TOTAL_PASSOS, n));
  wizardSteps.forEach((sec) => { sec.hidden = Number(sec.dataset.step) !== passoAtual; });
  if (wizardStepper) {
    wizardStepper.querySelectorAll('li').forEach((li) => {
      const s = Number(li.dataset.step);
      li.classList.toggle('ativo', s === passoAtual);
      li.classList.toggle('feito', s < passoAtual);
    });
  }
  const contador = document.getElementById('passo-contador');
  if (contador) contador.textContent = `Passo ${passoAtual} de ${TOTAL_PASSOS}`;
  showMessage(formMessage, '', false);
  if (passoAtual === 2) marcarCategoriaSugerida();
  if (passoAtual === 3) obterLocalizacaoDoWizard();
  if (passoAtual === 4) preencherDetalhesSugeridos();
  if (passoAtual === 5) preencherResumoDoWizard();
  document.getElementById('registrar')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

function renderCategoriasDoWizard() {
  if (!categoryGrid) return;
  const categorias = getCategoryConfig();
  const atual = categoryInput?.value || '';
  categoryGrid.innerHTML = categorias.map((nome) => `
    <button type="button" class="categoria-opcao" role="radio" aria-checked="${nome === atual ? 'true' : 'false'}" data-categoria="${escapeHtml(nome)}">
      ${iconeDaCategoria(nome)}<span>${escapeHtml(nome.charAt(0).toUpperCase() + nome.slice(1))}</span>
    </button>`).join('');
}

if (categoryGrid) {
  categoryGrid.addEventListener('click', (event) => {
    const btn = event.target.closest('.categoria-opcao');
    if (!btn) return;
    categoryGrid.querySelectorAll('.categoria-opcao').forEach((b) => b.setAttribute('aria-checked', 'false'));
    btn.setAttribute('aria-checked', 'true');
    if (categoryInput) categoryInput.value = btn.dataset.categoria;
    showMessage(formMessage, '', false);
  });
  renderCategoriasDoWizard();
  // As categorias vem do servidor; redesenha quando a lista chegar.
  carregarConfiguracaoDoServidor().then(() => renderCategoriasDoWizard());
}

// Validacao de cada passo antes de avancar. Devolve a mensagem de erro ou null.
function validarPassoDoWizard(n) {
  if (n === 1) {
    if (!getSelectedPhotoFile()) return { mensagem: 'Envie uma foto do problema: anexe um arquivo ou tire uma foto com a câmera.', campo: photoInput };
    if (analiseEmAndamento) return { mensagem: 'Aguarde a análise da foto terminar.' };
    if (analiseDaFoto?.rejeitada) return { mensagem: analiseDaFoto.motivo || 'A foto não foi aceita. Envie outra foto do problema.' };
    return null;
  }
  if (n === 2) {
    if (!categoryInput?.value) return { mensagem: 'Escolha a categoria do problema.' };
    return null;
  }
  if (n === 3) {
    if (geoRadio?.checked && !temCoordenadasNaSessao()) {
      return { mensagem: 'Clique em "Usar minha localização" e autorize o acesso, ou escolha "Informar o endereço".' };
    }
    const faltando = validarEnderecoManual();
    if (faltando) {
      if (addressFields) addressFields.style.display = 'grid';
      return faltando;
    }
    return null;
  }
  if (n === 4) {
    const desc = document.getElementById('description');
    if (desc && desc.value.trim().length < 10) return { mensagem: 'Descreva o problema com pelo menos 10 caracteres.', campo: desc };
    return null;
  }
  return null;
}

// ---------- analise da foto no passo 1 ----------
let analiseDaFoto = null;       // { assinatura, resultado, rejeitada, motivo }
let analiseEmAndamento = false;
const photoAnalysis = document.getElementById('photo-analysis');
const ICONE_ANALISE = {
  analisando: '<svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 0 9 9"/></svg>',
  ok: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4 4 10-10"/></svg>',
  erro: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16v.5"/></svg>',
  info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.5"/></svg>'
};

function assinaturaDoArquivo(file) {
  return file ? [file.size, file.name, file.lastModified, file.type].join(':') : '';
}

function mostrarAnalise(estado, titulo, texto, sugestao) {
  if (!photoAnalysis) return;
  photoAnalysis.hidden = false;
  photoAnalysis.className = 'analise-foto ' + estado;
  photoAnalysis.innerHTML = `<span class="analise-icone">${ICONE_ANALISE[estado] || ICONE_ANALISE.info}</span><div><strong>${escapeHtml(titulo)}</strong>${texto ? escapeHtml(texto) : ''}${sugestao || ''}</div>`;
}

async function analisarFotoDoWizard() {
  if (!photoAnalysis) return;
  const file = getSelectedPhotoFile();
  if (!file) return;
  const assinaturaOriginal = assinaturaDoArquivo(file);
  analiseEmAndamento = true;
  analiseDaFoto = null;
  mostrarAnalise('analisando', 'Analisando a foto...', 'Verificamos se a imagem mostra um problema urbano e preparamos as sugestões. Leva alguns segundos.');
  const botaoProximo = document.querySelector('[data-step="1"] [data-next]');
  if (botaoProximo) botaoProximo.disabled = true;

  try {
    const reduzida = await reduzirFoto(file);
    // A foto que fica no formulario e a reduzida: a assinatura do filtro vale
    // para estes bytes, e o envio nao precisa reduzir nem analisar de novo.
    if (reduzida !== file) setPhotoFileSemAviso(reduzida);
    const atual = getSelectedPhotoFile();
    const resultado = await classifyImage(atual);
    // O cidadao pode ter trocado a foto durante a analise.
    if (assinaturaDoArquivo(getSelectedPhotoFile()) !== assinaturaDoArquivo(atual)) return;

    if (resultado?.rejeitada) {
      analiseDaFoto = { assinatura: assinaturaDoArquivo(atual), rejeitada: true, motivo: resultado.motivo };
      mostrarAnalise('erro', 'Foto não aceita', resultado.motivo + ' Envie outra foto do local.');
      return;
    }
    if (!resultado) {
      analiseDaFoto = { assinatura: assinaturaDoArquivo(atual), resultado: null };
      mostrarAnalise('info', 'Foto recebida', 'A análise automática não está disponível agora. Você pode continuar e preencher a categoria e a descrição manualmente.');
      return;
    }
    analiseDaFoto = { assinatura: assinaturaDoArquivo(atual), resultado };
    const partes = [];
    if (resultado.category) partes.push(`Categoria: <b>${escapeHtml(resultado.category)}</b>`);
    if (resultado.title) partes.push(`Título: <b>${escapeHtml(resultado.title)}</b>`);
    mostrarAnalise('ok', 'Foto verificada', 'Ela mostra um problema urbano. Nos próximos passos você confere as sugestões e pode alterá-las.', partes.length ? `<p class="sugestao">${partes.join(' · ')}</p>` : '');
    // Sugestoes entram agora; o cidadao ajusta nos passos seguintes.
    if (categoryInput && resultado.category) categoryInput.value = resultado.category;
    if (priorityInput && resultado.priority) priorityInput.value = resultado.priority;
    preencherDetalhesSugeridos();
  } catch (error) {
    console.warn('[foto] analise falhou:', error);
    analiseDaFoto = { assinatura: assinaturaOriginal, resultado: null };
    mostrarAnalise('info', 'Foto recebida', 'Não foi possível analisar a imagem agora. Você pode continuar normalmente.');
  } finally {
    analiseEmAndamento = false;
    if (botaoProximo) botaoProximo.disabled = false;
  }
}

// Troca a foto do input sem disparar nova analise.
function setPhotoFileSemAviso(file) {
  const original = document.dispatchEvent;
  document.dispatchEvent = () => true;
  try {
    setPhotoFile(file);
  } finally {
    document.dispatchEvent = original;
  }
}

document.addEventListener('foto-selecionada', () => { analisarFotoDoWizard(); });
document.addEventListener('foto-removida', () => {
  analiseDaFoto = null;
  analiseEmAndamento = false;
  if (photoAnalysis) { photoAnalysis.hidden = true; photoAnalysis.innerHTML = ''; }
  const botaoProximo = document.querySelector('[data-step="1"] [data-next]');
  if (botaoProximo) botaoProximo.disabled = false;
});

// Marca no grid a categoria sugerida pela IA (ou a ja escolhida).
function marcarCategoriaSugerida() {
  if (!categoryGrid) return;
  const alvo = (categoryInput?.value || '').toLowerCase();
  let marcou = false;
  categoryGrid.querySelectorAll('.categoria-opcao').forEach((b) => {
    const igual = alvo && b.dataset.categoria.toLowerCase() === alvo;
    b.setAttribute('aria-checked', igual ? 'true' : 'false');
    if (igual) marcou = true;
  });
  if (!marcou && categoryInput) categoryInput.value = '';
  const ajuda = document.getElementById('categoria-ajuda');
  if (ajuda) {
    ajuda.textContent = marcou && analiseDaFoto?.resultado?.category
      ? 'Sugerimos a categoria com base na foto. Se não for essa, escolha outra.'
      : 'Selecione a categoria que melhor descreve a sua ocorrência.';
  }
}

// Preenche titulo e descricao com as sugestoes, sem apagar o que o cidadao
// ja escreveu por conta propria.
let sugestaoTitulo = '';
let sugestaoDescricao = '';
function preencherDetalhesSugeridos() {
  const r = analiseDaFoto?.resultado;
  const titulo = document.getElementById('title');
  const desc = document.getElementById('description');
  const ajuda = document.getElementById('detalhes-ajuda');
  if (!r) {
    if (ajuda) ajuda.textContent = 'Dê um título e descreva o problema.';
    return;
  }
  if (titulo && r.title && (!titulo.value.trim() || titulo.value === sugestaoTitulo)) {
    titulo.value = r.title;
    sugestaoTitulo = r.title;
  }
  if (desc && r.description && (!desc.value.trim() || desc.value === sugestaoDescricao)) {
    desc.value = r.description;
    sugestaoDescricao = r.description;
    desc.dispatchEvent(new Event('input'));
  }
  if (ajuda) ajuda.textContent = 'Título e descrição foram preenchidos a partir da foto. Ajuste como quiser.';
}

document.querySelectorAll('[data-next]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    // No passo 2 com localizacao automatica, "Proximo" busca a localizacao
    // (se ainda nao veio) antes de validar o endereco.
    if (passoAtual === 3 && geoRadio?.checked && !(temCoordenadasNaSessao() && (streetInput?.value || '').trim())) {
      btn.disabled = true;
      showMessage(formMessage, 'Obtendo sua localização... autorize o acesso se o navegador perguntar.', false);
      const ok = await obterLocalizacaoDoWizard();
      btn.disabled = false;
      if (!ok) {
        showMessage(formMessage, 'Não foi possível obter sua localização. Autorize o acesso ou escolha "Informar o endereço".', true);
        return;
      }
    }
    const erro = validarPassoDoWizard(passoAtual);
    if (erro) {
      showMessage(formMessage, erro.mensagem, true);
      erro.campo?.focus?.();
      return;
    }
    irParaPasso(passoAtual + 1);
  });
});
document.querySelectorAll('[data-prev]').forEach((btn) => {
  btn.addEventListener('click', () => irParaPasso(passoAtual - 1));
});

const descricaoCampo = document.getElementById('description');
const descricaoContador = document.getElementById('description-count');
if (descricaoCampo && descricaoContador) {
  descricaoCampo.addEventListener('input', () => { descricaoContador.textContent = `${descricaoCampo.value.length}/500`; });
}

function preencherResumoDoWizard() {
  const set = (id, valor) => { const el = document.getElementById(id); if (el) el.textContent = valor || '—'; };
  set('summary-category', categoryInput?.value);
  const partes = [streetInput?.value, numberInput?.value, neighborhoodInput?.value, [cityInput?.value, stateInput?.value].filter(Boolean).join(' - ')].filter((v) => v && v.trim());
  set('summary-address', partes.join(', '));
  set('summary-title', document.getElementById('title')?.value);
  set('summary-description', document.getElementById('description')?.value);
  const foto = getSelectedPhotoFile();
  const img = document.getElementById('summary-photo');
  const semFoto = document.getElementById('summary-photo-none');
  if (img && semFoto) {
    if (foto) {
      img.src = URL.createObjectURL(foto);
      img.hidden = false;
      semFoto.hidden = true;
    } else {
      img.hidden = true;
      semFoto.hidden = false;
    }
  }
}

// Mapa do passo 2: aparece quando a localizacao e obtida; o marcador pode ser
// arrastado para o ponto exato, e o endereco e refeito a partir dele.
let mapaWizard = null;
let marcadorWizard = null;

function mostrarMapaDoWizard() {
  const el = document.getElementById('wizard-map');
  const dica = document.getElementById('mapa-dica');
  if (!el || !window.google?.maps || !temCoordenadasNaSessao()) return;
  const lat = Number(sessionStorage.getItem('smartgov360-last-latitude'));
  const lng = Number(sessionStorage.getItem('smartgov360-last-longitude'));
  el.hidden = false;
  if (dica) dica.hidden = false;
  if (!mapaWizard) {
    mapaWizard = new google.maps.Map(el, { center: { lat, lng }, zoom: 17, mapTypeControl: false, streetViewControl: false, fullscreenControl: false });
    marcadorWizard = new google.maps.Marker({ position: { lat, lng }, map: mapaWizard, draggable: true, title: 'Arraste para ajustar' });
    marcadorWizard.addListener('dragend', async () => {
      const pos = marcadorWizard.getPosition();
      const nlat = pos.lat();
      const nlng = pos.lng();
      sessionStorage.setItem('smartgov360-last-latitude', String(nlat));
      sessionStorage.setItem('smartgov360-last-longitude', String(nlng));
      showGeoMessage('Atualizando o endereço do ponto marcado...');
      const result = await reverseGeocode(nlat, nlng);
      if (!result) {
        showGeoMessage('Não foi possível obter o endereço deste ponto. Confira os campos abaixo.', { isError: true });
        return;
      }
      if (cepInput) cepInput.value = result.cep;
      if (streetInput) streetInput.value = result.street;
      if (neighborhoodInput) neighborhoodInput.value = result.neighborhood;
      if (cityInput) cityInput.value = result.city;
      if (stateInput) stateInput.value = result.state;
      if (numberInput) {
        definirSemNumero(false);
        numberInput.value = result.number;
      }
      showGeoMessage(result.number ? 'Endereço atualizado pelo ponto marcado. Confira os dados.' : 'Endereço atualizado. Informe o número.');
    });
  } else {
    mapaWizard.setCenter({ lat, lng });
    marcadorWizard.setPosition({ lat, lng });
  }
}

// Sempre que a localizacao automatica preencher o endereco, o mapa aparece.
if (document.getElementById('wizard-map')) {
  const observador = new MutationObserver(() => {
    if (enderecoLocalizado && geoRadio?.checked) mostrarMapaDoWizard();
  });
  if (addressFields) observador.observe(addressFields, { attributes: true, attributeFilter: ['style'] });
}

// Sucesso: esconde o formulario e mostra o protocolo.
function mostrarSucessoDoWizard(incidente) {
  if (!wizardSuccess) return;
  if (occurrenceForm) occurrenceForm.hidden = true;
  if (wizardStepper) wizardStepper.hidden = true;
  const contador = document.getElementById('passo-contador');
  if (contador) contador.hidden = true;
  const numero = Number.isInteger(incidente?.protocolo) ? incidente.protocolo : null;
  const alvo = document.getElementById('success-protocol');
  if (alvo) alvo.textContent = numero ? '#' + numero : 'registrado';
  wizardSuccess.hidden = false;
  wizardSuccess.dataset.protocolo = numero || '';
  document.getElementById('registrar')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

document.getElementById('copy-protocol')?.addEventListener('click', async () => {
  const numero = wizardSuccess?.dataset.protocolo;
  if (!numero) return;
  try {
    await navigator.clipboard.writeText(numero);
    showMessage(formMessage, 'Número copiado.', false);
  } catch (error) {
    showMessage(formMessage, 'Não foi possível copiar. Anote o número: ' + numero, true);
  }
});
document.getElementById('success-new')?.addEventListener('click', () => { window.location.href = 'index.html#registrar'; window.location.reload(); });
document.getElementById('success-track')?.addEventListener('click', () => {
  const numero = wizardSuccess?.dataset.protocolo;
  const input = document.getElementById('track-input');
  if (input && numero) {
    input.value = numero;
    document.getElementById('track-form')?.requestSubmit();
  }
  document.getElementById('acompanhar')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
});

// ---------- acompanhamento por protocolo ----------
const trackForm = document.getElementById('track-form');
const trackInput = document.getElementById('track-input');
const trackResult = document.getElementById('track-result');

function renderAcompanhamento(o) {
  const etapa = (status) => o.etapas.find((e) => e.status === status);
  const emAndamento = etapa('Em andamento');
  const concluido = o.status === 'Concluído' ? (etapa('Concluído') || { at: o.concluidoEm }) : null;
  const classeDe = (feito, atual) => (feito ? 'feito' : atual ? 'atual' : 'pendente');
  const itens = [
    ['Recebido', dataCurta(o.createdAt), 'Sua ocorrência foi recebida pela prefeitura.', 'feito'],
    ['Em andamento', emAndamento ? dataCurta(emAndamento.at) : '', emAndamento ? 'A equipe responsável foi designada.' : 'Aguardando o encaminhamento ao setor responsável.', classeDe(Boolean(emAndamento) && Boolean(concluido), Boolean(emAndamento) && !concluido)],
    ['Concluído', concluido ? dataCurta(concluido.at) : '', concluido ? (o.respostaConclusao || 'Atendimento concluído.') : 'Você será avisado quando o serviço for concluído.', concluido ? 'feito' : 'pendente'],
    ['Avalie o atendimento', '', o.avaliada ? 'Obrigado pela sua avaliação' + (o.nota ? ' (' + o.nota + '/5).' : '.') : (concluido ? 'Use o link enviado para o seu e-mail.' : 'Disponível após a conclusão.'), o.avaliada ? 'feito' : 'pendente']
  ];
  const local = [o.street, o.neighborhood, [o.city, o.state].filter(Boolean).join(' - ')].filter(Boolean).join(', ');
  return `
    <div class="track-card">
      <div class="track-head">
        <span class="cat-icone">${iconeDaCategoria(o.category)}</span>
        <div>
          <strong>#${o.protocolo}</strong>
          <span>${escapeHtml(o.title || 'Ocorrência')}</span><br />
          <small>${dataCurta(o.createdAt)}</small><br />
          <span class="chip-status ${classeDoStatus(o.status)}">${escapeHtml(o.status)}</span>
        </div>
      </div>
      <ol class="timeline">
        ${itens.map(([titulo, data, texto, classe]) => `<li class="${classe}"><span class="ponto"></span><strong>${titulo}</strong>${data ? `<small>${data}</small>` : ''}<small>${escapeHtml(texto)}</small></li>`).join('')}
      </ol>
      <details class="track-detalhes">
        <summary>Ver detalhes da ocorrência</summary>
        <p><strong>Categoria:</strong> ${escapeHtml(o.category || '—')}</p>
        <p><strong>Endereço:</strong> ${escapeHtml(local || '—')}</p>
        <p><strong>Descrição:</strong> ${escapeHtml(o.description || '—')}</p>
        ${o.respostaConclusao ? `<p><strong>Resposta da Prefeitura:</strong> ${escapeHtml(o.respostaConclusao)}</p>` : ''}
      </details>
    </div>`;
}

async function buscarProtocolo(numero) {
  if (!trackResult) return;
  const limpo = (numero || '').toString().replace(/\D/g, '');
  if (!limpo) {
    trackResult.innerHTML = '<p class="form-message error">Digite o número do protocolo.</p>';
    return;
  }
  trackResult.innerHTML = '<p class="muted">Consultando...</p>';
  try {
    const resposta = await fetch(`/api/protocolo/${encodeURIComponent(limpo)}`);
    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok) {
      trackResult.innerHTML = `<p class="form-message error">${escapeHtml(dados.error || 'Protocolo não encontrado.')}</p>`;
      return;
    }
    trackResult.innerHTML = renderAcompanhamento(dados.ocorrencia);
  } catch (error) {
    trackResult.innerHTML = '<p class="form-message error">Não foi possível consultar. Tente novamente.</p>';
  }
}

if (trackForm) {
  trackForm.addEventListener('submit', (event) => {
    event.preventDefault();
    buscarProtocolo(trackInput?.value);
  });
  const daUrl = new URLSearchParams(window.location.search).get('protocolo');
  if (daUrl && trackInput) {
    trackInput.value = daUrl;
    buscarProtocolo(daUrl);
    document.getElementById('acompanhar')?.scrollIntoView({ block: 'start' });
  }
}

// ---------- ocorrencias recentes ----------
const recentList = document.getElementById('recent-list');
async function carregarRecentes() {
  if (!recentList) return;
  try {
    const resposta = await fetch('/api/incidentes/recentes');
    const dados = await resposta.json().catch(() => ({}));
    const lista = dados.incidentes || [];
    if (!lista.length) {
      recentList.innerHTML = '<li class="muted">Ainda não há ocorrências registradas.</li>';
      return;
    }
    recentList.innerHTML = lista.map((i) => `
      <li>
        <span class="cat-icone">${iconeDaCategoria(i.category)}</span>
        <div><strong>${escapeHtml(i.title || 'Ocorrência')}</strong><small>#${i.protocolo} · ${escapeHtml(i.neighborhood || i.city || '')} · ${dataCurta(i.createdAt)}</small></div>
        <span class="chip-status ${classeDoStatus(i.status)}">${escapeHtml(i.status)}</span>
      </li>`).join('');
  } catch (error) {
    recentList.innerHTML = '<li class="muted">Não foi possível carregar.</li>';
  }
}
carregarRecentes();
