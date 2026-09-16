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

function getIncidents() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    const initial = [
      {
        id: crypto.randomUUID(),
        name: 'Maria Souza',
        email: 'maria@email.com',
        title: 'Lâmpada pública apagada',
        category: 'Iluminação pública',
        priority: 'Alta',
        description: 'Poste na Avenida Central com duas lâmpadas sem funcionamento.',
        address: 'Avenida Central, 1000',
        phone: '(11) 98888-7777',
        latitude: -23.55052,
        longitude: -46.633308,
        workUpdate: '',
        workUpdatedBy: '',
        workUpdatedAt: '',
        history: [],
        status: 'Em análise',
        createdAt: new Date().toISOString()
      },
      {
        id: crypto.randomUUID(),
        name: 'João Pereira',
        email: 'joao@email.com',
        title: 'Buraco na calçada',
        category: 'Buraco',
        priority: 'Urgente',
        description: 'Buraco na frente da escola municipal com risco de acidente.',
        address: 'Rua das Flores, 520',
        phone: '(11) 97777-6666',
        latitude: -23.551674,
        longitude: -46.634467,
        workUpdate: '',
        workUpdatedBy: '',
        workUpdatedAt: '',
        history: [],
        status: 'Em andamento',
        createdAt: new Date().toISOString()
      }
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
    return initial;
  }

  try {
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [];

    const normalized = parsed.map(normalizeIncident).filter(Boolean);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
  } catch (error) {
    return [];
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
  const restrictedTabs = [tabCategories, tabPriorities, tabUsers];
  const restrictedPanels = [panelCategories, panelPriorities, panelUsers];

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
    const index = users.findIndex((user) => user.id === editingUserId);
    if (index === -1) {
      showMessage(adminMessage, 'Usuário não encontrado.', true);
      cancelEditUser();
      return;
    }

    users[index] = {
      ...users[index],
      username,
      role,
      allowedCategories
    };
    saveAdminUsers(users);
    cancelEditUser();
    renderAdminUsers();
    showMessage(adminMessage, 'Usuário atualizado com sucesso.', false);
  } else {
    criarUsuarioNoServidor({ username, senha: password, role, allowedCategories });
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

function showAdminDashboard(user) {
  currentAdminUser = user;
  persistAdminSession(user);

  if (adminDashboard && adminLogin) {
    adminLogin.classList.add('hidden');
    adminDashboard.classList.remove('hidden');
  }

  updateTabVisibilityByRole();
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

  if (adminLogin && adminDashboard) {
    adminLogin.classList.remove('hidden');
    adminDashboard.classList.add('hidden');
  }
}

// `permitirVazio` so e usado pela acao de limpar tudo do painel. Qualquer outra
// gravacao que zeraria a base e recusada: e sempre sintoma de bug, nunca intencao.
function saveIncidents(incidents, { permitirVazio = false } = {}) {
  const normalized = Array.isArray(incidents)
    ? incidents.map(normalizeIncident).filter(Boolean)
    : [];

  if (!normalized.length && !permitirVazio) {
    const existentes = lerIncidentesSalvos();
    if (existentes.length) {
      console.error(
        '[incidentes] Gravacao vazia bloqueada: havia',
        existentes.length,
        'ocorrencia(s) salvas. Nada foi apagado.'
      );
      return false;
    }
  }

  // Guarda a versao anterior antes de reduzir a base, para permitir restauracao.
  const anteriores = lerIncidentesSalvos();
  if (anteriores.length > normalized.length) {
    try {
      localStorage.setItem(STORAGE_BACKUP_KEY, JSON.stringify(anteriores));
    } catch (error) {
      console.warn('[incidentes] Nao foi possivel guardar o backup:', error);
    }
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  return true;
}

// Le o que esta gravado sem recorrer ao seed inicial de getIncidents().
function lerIncidentesSalvos() {
  try {
    const bruto = localStorage.getItem(STORAGE_KEY);
    if (!bruto) return [];
    const lista = JSON.parse(bruto);
    return Array.isArray(lista) ? lista : [];
  } catch (error) {
    return [];
  }
}

// Ferramentas de recuperacao, para uso no console do navegador.
window.smartgovIncidentes = {
  // Quantas ocorrencias estao salvas agora.
  listar: () => lerIncidentesSalvos(),

  // Copia guardada automaticamente antes da ultima reducao da base.
  verBackup() {
    try {
      const bruto = localStorage.getItem(STORAGE_BACKUP_KEY);
      return bruto ? JSON.parse(bruto) : [];
    } catch (error) {
      return [];
    }
  },

  // Devolve o backup para a base ativa.
  restaurarBackup() {
    const backup = this.verBackup();
    if (!backup.length) {
      console.warn('Nao ha backup guardado.');
      return false;
    }
    saveIncidents(backup);
    console.log('Restauradas', backup.length, 'ocorrencia(s). Recarregue a pagina.');
    return true;
  },

  // JSON para guardar fora do navegador.
  exportar: () => JSON.stringify(lerIncidentesSalvos(), null, 2),

  // Repoe a partir de um JSON exportado antes.
  importar(json) {
    const lista = typeof json === 'string' ? JSON.parse(json) : json;
    if (!Array.isArray(lista)) {
      console.error('Esperado um array de ocorrencias.');
      return false;
    }
    saveIncidents(lista);
    console.log('Importadas', lista.length, 'ocorrencia(s). Recarregue a pagina.');
    return true;
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

async function resolveIncidentCoordinates(incident) {
  if (Number.isFinite(Number(incident.latitude)) && Number.isFinite(Number(incident.longitude))) {
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
  const updated = await Promise.all(incidents.map(resolveIncidentCoordinates));

  // `incidents` pode ser um subconjunto filtrado por permissao (um admin de
  // categoria so enxerga a sua). Gravar esse subconjunto direto apagaria as
  // ocorrencias das demais categorias, entao as coordenadas sao mescladas
  // sobre a base completa.
  const porId = new Map(updated.filter((item) => item && item.id).map((item) => [item.id, item]));
  const base = getIncidents();
  const mesclado = base.map((item) => porId.get(item.id) || item);
  saveIncidents(mesclado);

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
  const validPoints = readyIncidents.filter((incident) => Number.isFinite(Number(incident.latitude)) && Number.isFinite(Number(incident.longitude)));

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
  pendingCount.textContent = incidents.filter((item) => item.status === 'Em análise').length;
  progressCount.textContent = incidents.filter((item) => item.status === 'Em andamento').length;
  resolvedCount.textContent = incidents.filter((item) => item.status === 'Resolvido').length;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function saveIncidentWorkUpdate(id, workUpdate) {
  const visibleIds = new Set(getVisibleIncidents(getIncidents()).map((item) => item.id));
  if (!visibleIds.has(id)) {
    showMessage(adminMessage, 'Você não tem permissão para atualizar esta ocorrência.', true);
    return;
  }

  const incidents = getIncidents();
  const now = new Date().toISOString();
  const noteText = workUpdate || 'Atualização removida pelo administrador.';
  const updatedIncidents = incidents.map((item) => {
    if (item.id !== id) return item;

    return {
      ...item,
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
    };
  });

  saveIncidents(updatedIncidents);
  refreshDashboard();
  showMessage(adminMessage, 'Atualização da ocorrência salva com sucesso.', false);
}

function renderIncidents(incidents) {
  if (!incidentList) {
    return;
  }

  if (!incidents.length) {
    incidentList.innerHTML = '<tr><td colspan="6">Nenhuma ocorrência cadastrada até o momento.</td></tr>';
    return;
  }

  incidentList.innerHTML = incidents
    .map((item) => `
      <tr data-id="${item.id}">
        <td>
          <strong>${item.title}</strong><br />
          <small>${item.description}</small>
        </td>
        <td>${item.category}</td>
        <td>${item.priority}</td>
        <td>
          <span class="status-badge">${item.status}</span>
        </td>
        <td>
          <textarea class="work-update-input" data-id="${item.id}" rows="3" placeholder="Descreva o que está sendo feito...">${escapeHtml(item.workUpdate || '')}</textarea>
          <button type="button" class="btn btn-secondary save-work-update-btn" data-id="${item.id}">Salvar atualização</button>
        </td>
        <td>
          <select class="status-select" data-id="${item.id}">
            <option value="Em análise" ${item.status === 'Em análise' ? 'selected' : ''}>Em análise</option>
            <option value="Em andamento" ${item.status === 'Em andamento' ? 'selected' : ''}>Em andamento</option>
            <option value="Resolvido" ${item.status === 'Resolvido' ? 'selected' : ''}>Resolvido</option>
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
  if (detailTitle) detailTitle.textContent = incident.title || 'Ocorrência';
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

    if (!resp.ok) {
      return null;
    }

    const data = await resp.json();
    console.debug('Response from /api/classify-image:', data);
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
}

function clearPhotoFile() {
  capturedPhotoFile = null;
  if (photoInput) {
    photoInput.value = '';
    photoInput.required = true;
  }
  if (photoCameraFallback) photoCameraFallback.value = '';
  showPhotoPreview(null);
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
  cameraCanvas.width = width;
  cameraCanvas.height = height;
  const ctx = cameraCanvas.getContext('2d');
  ctx.drawImage(cameraVideo, 0, 0, width, height);
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
    0.9
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
  });
}

if (photoRemoveBtn) {
  photoRemoveBtn.addEventListener('click', clearPhotoFile);
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
    if (locationMode === 'geolocation') {
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

      const photoFile = getSelectedPhotoFile();
      let imgResult = null;
      if (photoFile) {
        imgResult = await classifyImage(photoFile);
      }

      if (imgResult) {
        classification.category = imgResult.category || classification.category;
        classification.priority = imgResult.priority || classification.priority;
        if (imgResult.title) {
          title = imgResult.title;
        }
        if (imgResult.description) {
          description = imgResult.description;
        }
      } else {
        const textResult = await classifyIncident(description, cep, street, number, neighborhood, city, state);
        classification = { ...classification, ...textResult };
        if (textResult.title) {
          title = textResult.title;
        }
        if (textResult.description) {
          description = textResult.description;
        }
      }

      // clear hidden classification fields on form submit
      if (categoryInput) categoryInput.value = '';
      if (priorityInput) priorityInput.value = '';
      if (categorySelect) categorySelect.value = '';
      if (prioritySelect) prioritySelect.value = '';

      // update title/description fields if the model provided new values
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
        workUpdate: '',
        workUpdatedBy: '',
        workUpdatedAt: '',
        latitude: sessionStorage.getItem('smartgov360-last-latitude') || '',
        longitude: sessionStorage.getItem('smartgov360-last-longitude') || '',
        status: 'Em análise',
        createdAt: new Date().toISOString()
      };

      sessionStorage.setItem('smartgov360-preview-incident', JSON.stringify(incident));
      window.location.href = 'preview.html';
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
      showAdminDashboard(user);

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
    saveIncidents([], { permitirVazio: true });
    await refreshDashboard();
    showMessage(adminMessage, 'Todas as ocorrências foram removidas.', false);
  });
}

// debug helper removed

if (incidentList) {
  incidentList.addEventListener('change', async (event) => {
    const select = event.target.closest('.status-select');
    if (!select) return;

    const visibleIds = new Set(getVisibleIncidents(getIncidents()).map((item) => item.id));
    if (!visibleIds.has(select.dataset.id)) return;

    const incidents = getIncidents();
    const now = new Date().toISOString();
    let changedIncident = null;
    let previousStatus = '';
    const updated = incidents.map((item) => {
      if (item.id !== select.dataset.id) return item;
      if (item.status === select.value) return item;

      previousStatus = item.status;
      changedIncident = {
        ...item,
        status: select.value,
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
      };

      return changedIncident;
    });
    saveIncidents(updated);
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
const panelOccurrences = document.getElementById('panel-occurrences');
const panelCategories = document.getElementById('panel-categories');
const panelPriorities = document.getElementById('panel-priorities');
const panelUsers = document.getElementById('panel-users');
const panelPassword = document.getElementById('panel-password');

function switchTab(tab) {
  // reset active
  [tabOccurrences, tabCategories, tabPriorities, tabUsers, tabPassword].forEach((b) => b && b.classList.remove('active'));
  [panelOccurrences, panelCategories, panelPriorities, panelUsers, panelPassword].forEach((p) => p && p.classList.add('hidden'));

  if (!isSystemAdmin() && (tab === 'categories' || tab === 'priorities' || tab === 'users')) {
    tab = 'occurrences';
  }

  if (tab === 'occurrences') {
    tabOccurrences.classList.add('active');
    panelOccurrences.classList.remove('hidden');
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
  }
  if (tab === 'password') {
    tabPassword.classList.add('active');
    panelPassword.classList.remove('hidden');
  }
}

if (tabOccurrences) tabOccurrences.addEventListener('click', () => switchTab('occurrences'));
if (tabCategories) tabCategories.addEventListener('click', () => switchTab('categories'));
if (tabPriorities) tabPriorities.addEventListener('click', () => switchTab('priorities'));
if (tabUsers) tabUsers.addEventListener('click', () => switchTab('users'));
if (tabPassword) tabPassword.addEventListener('click', () => switchTab('password'));

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
    cepMessage.textContent = 'Endereço preenchido automaticamente.';
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

function updateAddressMode() {
  if (manualRadio?.checked) {
    if (addressFields) addressFields.style.display = 'block';
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
      await requestGeolocationPermission();
    }
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
      if (numberInput) numberInput.value = result.number;
      if (neighborhoodInput) neighborhoodInput.value = result.neighborhood;
      if (cityInput) cityInput.value = result.city;
      if (stateInput) stateInput.value = result.state;

      sessionStorage.setItem('smartgov360-last-latitude', String(latitude));
      sessionStorage.setItem('smartgov360-last-longitude', String(longitude));

      showGeoMessage('Endereço preenchido pela sua localização.');
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

async function reverseGeocode(lat, lon) {
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

if (year) {
  year.textContent = new Date().getFullYear();
}

getAdminUsers();

const restoredUser = restoreAdminSession();
if (restoredUser && adminDashboard && adminLogin) {
  showAdminDashboard(restoredUser);
  showMessage(loginMessage, `Sessão restaurada para ${restoredUser.username}.`, false);
}

refreshDashboard();
