const STORAGE_KEY = 'smartgov360-incidents-v1';
const PREVIEW_KEY = 'smartgov360-preview-incident';
const previewTitle = document.getElementById('preview-title');
const previewImage = document.getElementById('preview-image');
const previewForm = document.getElementById('preview-form');
const previewTitleInput = document.getElementById('preview-title-input');
const previewCategoryInput = document.getElementById('preview-category-input');
const previewPriorityInput = document.getElementById('preview-priority-input');
const previewNameInput = document.getElementById('preview-name-input');
const previewEmailInput = document.getElementById('preview-email-input');
const previewAddressInput = document.getElementById('preview-address-input');
const previewPhoneInput = document.getElementById('preview-phone-input');
const previewDescriptionInput = document.getElementById('preview-description-input');
const confirmSend = document.getElementById('confirm-send');
const editSend = document.getElementById('edit-send');
const cancelSend = document.getElementById('cancel-send');
const previewMessage = document.getElementById('preview-message');

function getIncidents() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    return [];
  }

  try {
    return JSON.parse(saved);
  } catch (error) {
    return [];
  }
}

function saveIncidents(incidents) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(incidents));
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

// Ultimo recurso quando o armazenamento esta cheio: encolhe a foto desta
// ocorrencia e tenta gravar de novo, em vez de perder o registro.
function encolherFotoDataUrl(dataUrl, ladoMaximo = 800, qualidade = 0.7) {
  return new Promise((resolve) => {
    if (!dataUrl) return resolve('');
    const img = new Image();
    img.onload = () => {
      const escala = Math.min(1, ladoMaximo / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * escala);
      canvas.height = Math.round(img.height * escala);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', qualidade));
    };
    img.onerror = () => resolve('');
    img.src = dataUrl;
  });
}

function formatPreviewAddress(data) {
  const parts = [];
  if (data.street) parts.push(data.street);
  if (data.number) parts.push(data.number);
  if (data.neighborhood) parts.push(data.neighborhood);
  if (data.city) parts.push(data.city);
  if (data.state) parts.push(data.state);
  if (!parts.length && data.cep) {
    parts.push(data.cep);
  }
  return parts.join(', ');
}

function renderPreview(incident) {
  const title = incident.title || incident.summary || 'Ocorrência sem título';
  const category = incident.category || incident.cat || 'Outros';
  const priority = incident.priority || incident.prio || 'Média';
  const name = incident.name || '-';
  const email = incident.email || '-';
  const phone = incident.phone || incident.telefone || '-';
  const description = incident.description || incident.details || '-';
  const addressText = formatPreviewAddress(incident) || incident.address || 'Endereço não informado';
  const photo = incident.photoDataUrl || incident.photo || '';

  if (previewTitle) previewTitle.textContent = title;
  if (previewTitleInput) previewTitleInput.value = title;
  if (previewCategoryInput) previewCategoryInput.value = category;
  if (previewPriorityInput) previewPriorityInput.value = priority;
  if (previewNameInput) previewNameInput.value = name;
  if (previewEmailInput) previewEmailInput.value = email;
  if (previewPhoneInput) previewPhoneInput.value = phone;
  if (previewDescriptionInput) previewDescriptionInput.value = description;
  if (previewAddressInput) previewAddressInput.value = addressText;
  if (previewImage) {
    if (photo) {
      previewImage.src = photo;
      previewImage.alt = title;
      previewImage.style.display = '';
    } else {
      previewImage.src = '';
      previewImage.alt = 'Sem imagem';
      previewImage.style.display = 'none';
    }
  }
}

function loadPreviewData() {
  const raw = sessionStorage.getItem(PREVIEW_KEY);
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch (error) {
      console.error('Erro ao parsear preview from sessionStorage:', error, raw);
      if (previewMessage) previewMessage.textContent = 'Dados da pré-visualização inválidos. Voltando ao formulário.';
      setTimeout(() => (window.location.href = 'index.html'), 1500);
      return null;
    }
  }

  // Fallback: se não existe sessionStorage (por exemplo em testes), tente pegar o primeiro incidente do localStorage
  try {
    const all = localStorage.getItem(STORAGE_KEY);
    if (all) {
      const parsed = JSON.parse(all);
      if (Array.isArray(parsed) && parsed.length) {
        console.debug('Using fallback incident from localStorage for preview');
        return parsed[0];
      }
    }
  } catch (error) {
    console.warn('Erro ao tentar fallback para localStorage:', error);
  }

  // Nenhum dado disponível: retornar ao formulário
  if (previewMessage) previewMessage.textContent = 'Nenhuma pré-visualização encontrada. Você será redirecionado.';
  setTimeout(() => (window.location.href = 'index.html'), 900);
  return null;
}

function showPreviewMessage(message, isError = false) {
  if (!previewMessage) return;
  previewMessage.textContent = message;
  previewMessage.classList.toggle('error', isError);
}

function setEditMode(enabled) {
  if (!previewForm) return;
  const inputs = previewForm.querySelectorAll('input, textarea');
  inputs.forEach((field) => {
    field.disabled = !enabled;
  });
  previewForm.classList.toggle('editing', enabled);
  if (enabled) {
    showPreviewMessage('Edição habilitada. Faça as alterações e clique em Confirmar envio.', false);
    if (previewTitleInput) previewTitleInput.focus();
  } else {
    showPreviewMessage('', false);
  }
}

function collectPreviewData() {
  if (!currentPreviewData) return null;
  return {
    ...currentPreviewData,
    title: previewTitleInput ? previewTitleInput.value.trim() : currentPreviewData.title,
    category: previewCategoryInput ? previewCategoryInput.value.trim() : currentPreviewData.category,
    priority: previewPriorityInput ? previewPriorityInput.value.trim() : currentPreviewData.priority,
    name: previewNameInput ? previewNameInput.value.trim() : currentPreviewData.name,
    email: previewEmailInput ? previewEmailInput.value.trim() : currentPreviewData.email,
    phone: previewPhoneInput ? previewPhoneInput.value.trim() : currentPreviewData.phone,
    address: previewAddressInput ? previewAddressInput.value.trim() : currentPreviewData.address || formatPreviewAddress(currentPreviewData),
    description: previewDescriptionInput ? previewDescriptionInput.value.trim() : currentPreviewData.description,
  };
}

async function notifyIncidentOpened(incident) {
  try {
    const response = await fetch('/api/notify-user', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        eventType: 'incident_created',
        incident
      })
    });

    return response.ok;
  } catch (error) {
    console.warn('Falha ao notificar abertura da ocorrência:', error);
    return false;
  }
}

async function confirmPreview() {
  const updatedData = collectPreviewData();
  if (!updatedData) return;

  const incidents = getIncidents();
  incidents.unshift(updatedData);

  try {
    saveIncidents(incidents);
  } catch (error) {
    if (!erroDeEspaco(error)) {
      console.error('Erro ao gravar a ocorrência:', error);
      showPreviewMessage('Não foi possível gravar a ocorrência. Tente novamente.', true);
      return;
    }

    console.warn('[incidentes] Sem espaco: tentando gravar com a foto menor.');
    const menor = { ...updatedData, photoDataUrl: await encolherFotoDataUrl(updatedData.photoDataUrl) };
    incidents[0] = menor;
    try {
      saveIncidents(incidents);
    } catch (segundoErro) {
      console.error('[incidentes] Sem espaco mesmo com a foto menor:', segundoErro);
      showPreviewMessage(
        'O armazenamento do navegador está cheio. Não foi possível gravar a ocorrência.',
        true
      );
      return;
    }
  }

  await notifyIncidentOpened(updatedData);
  sessionStorage.removeItem(PREVIEW_KEY);
  window.location.href = 'index.html';
}

function cancelPreview() {
  sessionStorage.removeItem(PREVIEW_KEY);
  window.location.href = 'index.html';
}

function setupPreviewPage() {
  currentPreviewData = loadPreviewData();
  if (!currentPreviewData) return;
  console.debug('Preview data loaded:', currentPreviewData);
  if (previewMessage) previewMessage.textContent = '';
  renderPreview(currentPreviewData);
  setEditMode(false);

  if (confirmSend) {
    confirmSend.addEventListener('click', async () => {
      showPreviewMessage('Salvando ocorrência...', false);
      confirmSend.disabled = true;
      await confirmPreview();
      confirmSend.disabled = false;
    });
  }

  if (editSend) {
    editSend.addEventListener('click', () => {
      setEditMode(true);
    });
  }

  if (cancelSend) {
    cancelSend.addEventListener('click', () => {
      showPreviewMessage('Ocorrência cancelada. Redirecionando...', false);
      cancelPreview();
    });
  }
}

window.addEventListener('DOMContentLoaded', setupPreviewPage);
