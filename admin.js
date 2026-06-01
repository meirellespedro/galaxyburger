(function adminPanelBootstrap() {
  const STORE_CONFIG = window.GALAXY_STORE_CONFIG || {};
  const BRAND_NAME = normalizeText(STORE_CONFIG.brand?.name) || "Galaxy Burger";
  const ADMIN_LOGIN_API_URL = "/api/admin-login";
  const ADMIN_INVENTORY_API_URL = "/api/admin-inventory";
  const ADMIN_DELIVERY_AREAS_API_URL = "/api/admin-delivery-areas";
  const ADMIN_STORE_STATUS_API_URL = "/api/admin-store-status";
  const ADMIN_REFRESH_INTERVAL_MS = 15000;
  const INVENTORY_BROADCAST_STORAGE_KEY = "galaxy_burguer_inventory_broadcast_v1";
  const INVENTORY_SYNC_CHANNEL_NAME = "galaxy_burguer_inventory_sync_v1";
  const DELIVERY_AREAS_BROADCAST_STORAGE_KEY = "galaxy_burguer_delivery_areas_broadcast_v1";
  const STORE_STATUS_BROADCAST_STORAGE_KEY = "galaxy_burguer_store_status_broadcast_v1";
  const CATEGORY_LABELS = Object.freeze({
    burger: "Burgers",
    combo: "Combos",
    side: "Acompanhamentos",
    drink: "Bebidas",
    extra: "Adicionais"
  });
  const DELIVERY_STATUS_META = Object.freeze({
    active: {
      label: "Entrega ativa",
      description: "Entrega liberada com taxa fixa de R$ 5,00 ou R$ 10,00.",
      badgeClass: "is-active"
    },
    pickup_only: {
      label: "Somente retirada",
      description: "Atendimento apenas com retirada no local.",
      badgeClass: "is-pickup"
    },
    blocked: {
      label: "Bloqueado",
      description: "No momento sem entrega para esta região.",
      badgeClass: "is-blocked"
    }
  });
  const DELIVERY_ZONE_META = Object.freeze({
    zone_5: {
      label: "Até 2,9 km",
      description: "Entrega ativa com taxa fixa de R$ 5,00.",
      helper: "Use esta zona para endereços próximos da hamburgueria, até 2,9 km.",
      fee: 5,
      status: "active",
      badgeClass: "is-active"
    },
    zone_10: {
      label: "De 3 km até 5 km",
      description: "Entrega ativa com taxa fixa de R$ 10,00.",
      helper: "Use esta zona para regiões entre 3 km e 5 km da hamburgueria.",
      fee: 10,
      status: "active",
      badgeClass: "is-active"
    },
    pickup_only: {
      label: "Somente retirada",
      description: "Atendimento apenas com retirada no local.",
      helper: "Acima de 5 km, mantenha a região como somente retirada.",
      fee: 0,
      status: "pickup_only",
      badgeClass: "is-pickup"
    },
    blocked: {
      label: "Bloqueado",
      description: "No momento sem entrega para esta região.",
      helper: "Use bloqueado quando a região não puder receber pedido temporariamente.",
      fee: 0,
      status: "blocked",
      badgeClass: "is-blocked"
    }
  });
  const STORE_STATUS_MODE_META = Object.freeze({
    auto: {
      label: "Horário automático",
      description: "O site segue o horário padrão configurado para liberar ou bloquear pedidos.",
      badgeClass: "is-auto"
    },
    force_open: {
      label: "Pedidos abertos manualmente",
      description: "Os pedidos foram liberados manualmente pelo painel, mesmo fora do horário automático.",
      badgeClass: "is-active"
    },
    force_closed: {
      label: "Pedidos fechados manualmente",
      description: "",
      badgeClass: "is-blocked"
    }
  });

  let dashboardState = createDashboardState();
  let inventoryRealtimeChannel = null;

  document.addEventListener("DOMContentLoaded", () => {
    inventoryRealtimeChannel = createInventoryRealtimeChannel();
    syncBrandCopy();
    bindAdminEvents();
    syncDeliveryAreaZoneField();
    bindRealtimeSync();
    restoreAdminSession();

    window.setInterval(() => {
      if (!dashboardState.authenticated) {
        return;
      }

      loadDashboardData({
        showMessage: false,
        background: true
      });
    }, ADMIN_REFRESH_INTERVAL_MS);
  });

  function createDashboardState() {
    return {
      authenticated: false,
      inventory: {
        products: [],
        counts: {
          total: 0,
          available: 0,
          unavailable: 0
        },
        updatedAt: "",
        storageLabel: "",
        persistenceConfigured: true
      },
      deliveryAreas: {
        zones: [],
        areas: [],
        counts: {
          total: 0,
          active: 0,
          pickupOnly: 0,
          blocked: 0
        },
        updatedAt: "",
        storageLabel: "",
        persistenceConfigured: true
      },
      storeStatus: {
        overrideMode: "auto",
        updatedAt: "",
        storageLabel: "",
        persistenceConfigured: true
      },
      filters: {
        inventorySearch: "",
        deliverySearch: "",
        deliveryStatus: "all"
      },
      editingDeliveryAreaId: ""
    };
  }

  function normalizeText(value) {
    return String(value || "").trim().replace(/\s+/g, " ");
  }

  function normalizeCompareText(value) {
    return normalizeText(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  function formatCurrency(value) {
    return Number(value || 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL"
    });
  }

  function getStoreStatusModeMeta(overrideMode) {
    return STORE_STATUS_MODE_META[normalizeText(overrideMode)] || STORE_STATUS_MODE_META.auto;
  }

  function getDeliveryZoneMeta(zoneId) {
    return DELIVERY_ZONE_META[normalizeText(zoneId)] || DELIVERY_ZONE_META.zone_5;
  }

  function syncDeliveryAreaZoneField() {
    const fields = getDeliveryAreaFormFields();
    const zoneMeta = getDeliveryZoneMeta(fields.zone?.value);

    if (!fields.zone) {
      return;
    }

    const zoneHelper = document.getElementById("admin-delivery-zone-helper");
    if (zoneHelper) {
      zoneHelper.textContent = zoneMeta.helper;
    }
  }

  function formatDateTime(value) {
    const timestamp = Number(new Date(value || "").getTime());
    if (!Number.isFinite(timestamp) || !timestamp) {
      return "sem atualização registrada";
    }

    const date = new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short"
    }).format(new Date(timestamp));
    const time = new Intl.DateTimeFormat("pt-BR", {
      timeStyle: "short"
    }).format(new Date(timestamp));

    return `${date} - ${time}`;
  }

  function syncBrandCopy() {
    const title = document.getElementById("admin-brand-title");
    if (title) {
      title.textContent = `Controle operacional da ${BRAND_NAME}`;
    }

    document.title = `Painel Administrativo | ${BRAND_NAME}`;
  }

  function bindAdminEvents() {
    const loginForm = document.getElementById("admin-login-form");
    const logoutButton = document.getElementById("admin-logout-button");
    const refreshButton = document.getElementById("admin-refresh-button");
    const inventorySearchInput = document.getElementById("admin-search-input");
    const deliverySearchInput = document.getElementById("admin-delivery-search-input");
    const deliveryFilter = document.getElementById("admin-delivery-filter");
    const inventoryGroups = document.getElementById("admin-inventory-groups");
    const deliveryAreaList = document.getElementById("admin-delivery-areas-list");
    const storeStatusActions = document.getElementById("admin-store-status-actions");
    const deliveryForm = document.getElementById("admin-delivery-form");
    const deliveryCancelButton = document.getElementById("admin-delivery-cancel-button");

    loginForm?.addEventListener("submit", handleLoginSubmit);
    logoutButton?.addEventListener("click", logoutAdminSession);
    refreshButton?.addEventListener("click", () => loadDashboardData({ showMessage: true }));
    inventorySearchInput?.addEventListener("input", () => {
      dashboardState.filters.inventorySearch = normalizeText(inventorySearchInput.value);
      renderInventoryGroups();
    });
    deliverySearchInput?.addEventListener("input", () => {
      dashboardState.filters.deliverySearch = normalizeText(deliverySearchInput.value);
      renderDeliveryAreaList();
    });
    deliveryFilter?.addEventListener("change", () => {
      dashboardState.filters.deliveryStatus = normalizeText(deliveryFilter.value) || "all";
      renderDeliveryAreaList();
    });
    inventoryGroups?.addEventListener("click", handleInventoryActionClick);
    deliveryAreaList?.addEventListener("click", handleDeliveryAreaActionClick);
    storeStatusActions?.addEventListener("click", handleStoreStatusActionClick);
    deliveryForm?.addEventListener("submit", handleDeliveryAreaSubmit);
    deliveryCancelButton?.addEventListener("click", resetDeliveryAreaForm);
    getDeliveryAreaFormFields().zone?.addEventListener("change", syncDeliveryAreaZoneField);
  }

  function bindRealtimeSync() {
    window.addEventListener("storage", event => {
      if (!dashboardState.authenticated || !event.newValue) {
        return;
      }

      if (event.key === INVENTORY_BROADCAST_STORAGE_KEY) {
        const payload = parseInventoryRealtimePayload(event.newValue);
        if (payload) {
          handleRealtimeInventoryUpdate(payload);
        }
        return;
      }

      if (event.key === DELIVERY_AREAS_BROADCAST_STORAGE_KEY) {
        loadDeliveryAreas({
          background: true,
          showMessage: false
        }).catch(() => null);
        return;
      }

      if (event.key === STORE_STATUS_BROADCAST_STORAGE_KEY) {
        loadStoreStatus({
          background: true,
          showMessage: false
        }).catch(() => null);
      }
    });

    if (inventoryRealtimeChannel) {
      inventoryRealtimeChannel.addEventListener("message", event => {
        const payload = normalizeInventoryRealtimePayload(event.data);
        if (!payload) {
          return;
        }

        handleRealtimeInventoryUpdate(payload);
      });
    }
  }

  async function restoreAdminSession() {
    setLoginMessage("");
    setDashboardMessage("");

    try {
      const response = await fetch(ADMIN_LOGIN_API_URL, {
        method: "GET",
        credentials: "same-origin",
        headers: {
          Accept: "application/json"
        }
      });
      const payload = await safeReadJson(response);

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.message || "Não foi possível validar a sessão do painel.");
      }

      dashboardState.authenticated = Boolean(payload.authenticated);
      updateAdminPanels();

      if (dashboardState.authenticated) {
        await loadDashboardData({
          showMessage: false,
          background: true
        });
      }
    } catch (error) {
      dashboardState.authenticated = false;
      updateAdminPanels();
      setLoginMessage(error.message || "Não foi possível abrir o painel agora.", true);
    }
  }

  async function handleLoginSubmit(event) {
    event.preventDefault();

    const passwordInput = document.getElementById("admin-password");
    const loginButton = document.getElementById("admin-login-button");
    const password = passwordInput?.value || "";

    setLoginBusy(true, "Entrando...");
    setLoginMessage("");

    try {
      const response = await fetch(ADMIN_LOGIN_API_URL, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({ password })
      });
      const payload = await safeReadJson(response);

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.message || "Não foi possível entrar no painel.");
      }

      dashboardState.authenticated = true;
      updateAdminPanels();
      if (passwordInput) {
        passwordInput.value = "";
      }

      setDashboardMessage("Sessão iniciada. Painel sincronizado com sucesso.");
      await loadDashboardData({
        showMessage: false,
        background: true
      });
    } catch (error) {
      dashboardState.authenticated = false;
      updateAdminPanels();
      setLoginMessage(error.message || "Não foi possível entrar no painel.", true);
    } finally {
      setLoginBusy(false, loginButton?.dataset.defaultLabel || "Entrar no painel");
    }
  }

  async function logoutAdminSession() {
    setDashboardMessage("");

    try {
      await fetch(ADMIN_LOGIN_API_URL, {
        method: "DELETE",
        credentials: "same-origin",
        headers: {
          Accept: "application/json"
        }
      });
    } catch {
      // A prioridade aqui é limpar a UI local.
    }

    dashboardState = createDashboardState();
    updateAdminPanels();
    renderDashboard();
    resetDeliveryAreaForm();
    setLoginMessage("Sessão encerrada.");
  }

  async function loadDashboardData({ showMessage = false, background = false } = {}) {
    const refreshButton = document.getElementById("admin-refresh-button");
    if (!background) {
      setToolbarBusy(refreshButton, true, "Atualizando...");
    }

    try {
      const [storeStatusLoaded, deliveryLoaded, inventoryLoaded] = await Promise.all([
        loadStoreStatus({
          showMessage: false,
          background: true
        }),
        loadDeliveryAreas({
          showMessage: false,
          background: true
        }),
        loadInventory({
          showMessage: false,
          background: true
        })
      ]);

      if (showMessage && storeStatusLoaded && deliveryLoaded && inventoryLoaded) {
        setDashboardMessage("Painel atualizado com sucesso.");
      }
    } catch (error) {
      setDashboardMessage(error.message || "Não foi possível atualizar o painel agora.", true);
    } finally {
      if (!background) {
        setToolbarBusy(refreshButton, false, refreshButton?.dataset.defaultLabel || "Atualizar tudo");
      }
    }
  }

  async function loadInventory({ showMessage = false, background = false } = {}) {
    try {
      const response = await fetch(ADMIN_INVENTORY_API_URL, {
        method: "GET",
        credentials: "same-origin",
        headers: {
          Accept: "application/json"
        }
      });
      const payload = await safeReadJson(response);

      if (response.status === 401) {
        handleSessionExpired();
        return false;
      }

      if (!response.ok || !payload?.ok || !payload.inventory) {
        throw new Error(payload?.message || "Não foi possível carregar o estoque agora.");
      }

      applyInventoryPayload(payload.inventory);
      if (showMessage) {
        setInventoryMessage("Estoque atualizado com sucesso.");
      }
      return true;
    } catch (error) {
      if (!background) {
        setInventoryMessage(error.message || "Não foi possível carregar o estoque agora.", true);
      }
      throw error;
    }
  }

  async function loadStoreStatus({ showMessage = false, background = false } = {}) {
    try {
      const response = await fetch(ADMIN_STORE_STATUS_API_URL, {
        method: "GET",
        credentials: "same-origin",
        headers: {
          Accept: "application/json"
        }
      });
      const payload = await safeReadJson(response);

      if (response.status === 401) {
        handleSessionExpired();
        return false;
      }

      if (!response.ok || !payload?.ok || !payload.storeStatus) {
        throw new Error(payload?.message || "Não foi possível carregar o status da loja agora.");
      }

      applyStoreStatusPayload(payload.storeStatus);
      if (showMessage) {
        setStoreStatusMessage("Status da loja atualizado com sucesso.");
      }
      return true;
    } catch (error) {
      if (!background) {
        setStoreStatusMessage(error.message || "Não foi possível carregar o status da loja agora.", true);
      }
      throw error;
    }
  }

  async function loadDeliveryAreas({ showMessage = false, background = false } = {}) {
    try {
      const response = await fetch(ADMIN_DELIVERY_AREAS_API_URL, {
        method: "GET",
        credentials: "same-origin",
        headers: {
          Accept: "application/json"
        }
      });
      const payload = await safeReadJson(response);

      if (response.status === 401) {
        handleSessionExpired();
        return false;
      }

      if (!response.ok || !payload?.ok || !payload.deliveryAreas) {
        throw new Error(payload?.message || "Não foi possível carregar as regiões agora.");
      }

      applyDeliveryAreasPayload(payload.deliveryAreas);
      if (showMessage) {
        setDeliveryMessage("Regiões atualizadas com sucesso.");
      }
      return true;
    } catch (error) {
      if (!background) {
        setDeliveryMessage(error.message || "Não foi possível carregar as regiões agora.", true);
      }
      throw error;
    }
  }

  function handleSessionExpired() {
    dashboardState.authenticated = false;
    updateAdminPanels();
    setLoginMessage("Sua sessão expirou. Entre novamente para continuar.", true);
  }

  function applyInventoryPayload(inventory) {
    dashboardState.inventory = {
      products: Array.isArray(inventory.products) ? inventory.products.slice() : [],
      counts: inventory.counts || {
        total: 0,
        available: 0,
        unavailable: 0
      },
      updatedAt: normalizeText(inventory.updatedAt),
      storageLabel: normalizeText(inventory.storageLabel),
      persistenceConfigured: inventory.persistenceConfigured !== false
    };
    renderDashboard();
  }

  function applyStoreStatusPayload(storeStatus) {
    dashboardState.storeStatus = {
      overrideMode: normalizeText(storeStatus.overrideMode) || "auto",
      updatedAt: normalizeText(storeStatus.updatedAt),
      storageLabel: normalizeText(storeStatus.storageLabel),
      persistenceConfigured: storeStatus.persistenceConfigured !== false
    };
    renderDashboard();
  }

  function applyDeliveryAreasPayload(deliveryAreas) {
    dashboardState.deliveryAreas = {
      zones: Array.isArray(deliveryAreas.zones) ? deliveryAreas.zones.slice() : [],
      areas: Array.isArray(deliveryAreas.areas) ? deliveryAreas.areas.slice() : [],
      counts: deliveryAreas.counts || {
        total: 0,
        active: 0,
        pickupOnly: 0,
        blocked: 0
      },
      updatedAt: normalizeText(deliveryAreas.updatedAt),
      storageLabel: normalizeText(deliveryAreas.storageLabel),
      persistenceConfigured: deliveryAreas.persistenceConfigured !== false
    };
    renderDashboard();
  }

  function updateAdminPanels() {
    const loginPanel = document.getElementById("admin-login-panel");
    const dashboard = document.getElementById("admin-dashboard");

    if (loginPanel) {
      loginPanel.hidden = dashboardState.authenticated;
    }

    if (dashboard) {
      dashboard.hidden = !dashboardState.authenticated;
    }
  }

  function renderDashboard() {
    renderLastUpdated();
    renderStorageNotes();
    renderStoreStatusSection();
    renderInventoryStats();
    renderDeliveryAreaStats();
    renderInventoryGroups();
    renderDeliveryAreaList();
    syncDeliveryAreaFormLabels();
    syncDeliveryAreaZoneField();
  }

  function renderLastUpdated() {
    const lastUpdated = document.getElementById("admin-last-updated");
    if (!lastUpdated) {
      return;
    }

    lastUpdated.hidden = true;
    lastUpdated.textContent = "";
  }

  function renderStorageNotes() {
    const storeStatusNote = document.getElementById("admin-store-status-storage-note");
    const deliveryNote = document.getElementById("admin-delivery-storage-note");
    const inventoryNote = document.getElementById("admin-inventory-storage-note");

    if (storeStatusNote) {
      storeStatusNote.textContent = buildStorageNote(
        "pedidos",
        dashboardState.storeStatus.storageLabel,
        dashboardState.storeStatus.persistenceConfigured
      );
      storeStatusNote.classList.toggle("is-warning", dashboardState.storeStatus.persistenceConfigured === false);
    }

    if (deliveryNote) {
      deliveryNote.textContent = buildStorageNote(
        "regiões",
        dashboardState.deliveryAreas.storageLabel,
        dashboardState.deliveryAreas.persistenceConfigured
      );
      deliveryNote.classList.toggle("is-warning", dashboardState.deliveryAreas.persistenceConfigured === false);
    }

    if (inventoryNote) {
      inventoryNote.textContent = buildStorageNote(
        "estoque",
        dashboardState.inventory.storageLabel,
        dashboardState.inventory.persistenceConfigured
      );
      inventoryNote.classList.toggle("is-warning", dashboardState.inventory.persistenceConfigured === false);
    }
  }

  function buildStorageNote(scopeLabel, storageLabel, persistenceConfigured) {
    const label = normalizeText(storageLabel) || "armazenamento não identificado";
    if (persistenceConfigured === false) {
      return `Armazenamento dos ${scopeLabel}: ${label}. Publique com persistência configurada para salvar em produção.`;
    }

    return `Armazenamento dos ${scopeLabel}: ${label}.`;
  }

  function renderInventoryStats() {
    const total = document.getElementById("admin-stat-total");
    const available = document.getElementById("admin-stat-available");
    const unavailable = document.getElementById("admin-stat-unavailable");

    if (total) total.textContent = String(dashboardState.inventory.counts.total || 0);
    if (available) available.textContent = String(dashboardState.inventory.counts.available || 0);
    if (unavailable) unavailable.textContent = String(dashboardState.inventory.counts.unavailable || 0);
  }

  function renderStoreStatusSection() {
    const meta = getStoreStatusModeMeta(dashboardState.storeStatus.overrideMode);
    const badge = document.getElementById("admin-store-status-badge");
    const title = document.getElementById("admin-store-status-title");
    const copy = document.getElementById("admin-store-status-copy");
    const updated = document.getElementById("admin-store-status-updated");
    const buttons = document.querySelectorAll("[data-store-status-mode]");

    if (badge) {
      badge.textContent = meta.label;
      badge.className = `admin-status-badge ${meta.badgeClass}`;
    }

    if (title) {
      title.textContent = meta.label;
    }

    if (copy) {
      copy.hidden = !meta.description;
      copy.textContent = meta.description || "";
    }

    if (updated) {
      updated.textContent = dashboardState.storeStatus.updatedAt
        ? `Última alteração: ${formatDateTime(dashboardState.storeStatus.updatedAt)}`
        : "Sem atualização registrada.";
    }

    buttons.forEach(button => {
      const buttonMode = normalizeText(button.dataset.storeStatusMode);
      button.classList.toggle("is-selected", buttonMode === dashboardState.storeStatus.overrideMode);
    });
  }

  function renderDeliveryAreaStats() {
    const counts = dashboardState.deliveryAreas.counts || {};
    const total = document.getElementById("admin-delivery-stat-total");
    const active = document.getElementById("admin-delivery-stat-active");
    const pickup = document.getElementById("admin-delivery-stat-pickup");
    const blocked = document.getElementById("admin-delivery-stat-blocked");

    if (total) total.textContent = String(counts.total || 0);
    if (active) active.textContent = String(counts.active || 0);
    if (pickup) pickup.textContent = String(counts.pickupOnly || 0);
    if (blocked) blocked.textContent = String(counts.blocked || 0);
  }

  function renderInventoryGroups() {
    const container = document.getElementById("admin-inventory-groups");
    if (!container) {
      return;
    }

    const searchTerm = normalizeCompareText(dashboardState.filters.inventorySearch);
    const filteredProducts = dashboardState.inventory.products.filter(product => {
      if (!searchTerm) {
        return true;
      }

      const haystack = [
        product?.name,
        CATEGORY_LABELS[product?.category] || product?.category,
        product?.id
      ].map(normalizeCompareText).join(" ");

      return haystack.includes(searchTerm);
    });

    if (!filteredProducts.length) {
      container.innerHTML = `
        <div class="admin-empty-state">
          <strong>Nenhum produto encontrado</strong>
          <p>Altere a busca ou revise o cadastro do cardapio.</p>
        </div>
      `;
      return;
    }

    const groups = filteredProducts.reduce((allGroups, product) => {
      const category = normalizeText(product?.category) || "outros";
      if (!allGroups.has(category)) {
        allGroups.set(category, []);
      }

      allGroups.get(category).push(product);
      return allGroups;
    }, new Map());

    container.innerHTML = Array.from(groups.entries())
      .map(([category, products]) => `
        <section class="admin-category-group">
          <div class="admin-category-head">
            <h4>${escapeHtml(CATEGORY_LABELS[category] || category)}</h4>
          </div>

          <div class="admin-product-list">
            ${products.map(product => renderProductCard(product)).join("")}
          </div>
        </section>
      `)
      .join("");
  }

  function renderProductCard(product) {
    const isAvailable = Boolean(product.available);
    const statusLabel = isAvailable ? "Disponível" : "Esgotado";

    return `
      <article class="admin-product-card" data-admin-product-row="${escapeHtml(product.id)}">
        <div class="admin-product-copy">
          <strong>${escapeHtml(product.name || product.id)}</strong>
          <span>${escapeHtml(CATEGORY_LABELS[product.category] || product.category || "Produto")}</span>
          <small>Status atual: ${statusLabel}</small>
        </div>

        <div class="admin-stock-actions">
          <button
            type="button"
            class="admin-stock-chip ${isAvailable ? "is-active" : ""}"
            data-admin-product-id="${escapeHtml(product.id)}"
            data-admin-available="true"
          >
            Disponível
          </button>
          <button
            type="button"
            class="admin-stock-chip ${!isAvailable ? "is-active is-danger" : "is-danger"}"
            data-admin-product-id="${escapeHtml(product.id)}"
            data-admin-available="false"
          >
            Esgotado
          </button>
        </div>
      </article>
    `;
  }

  function getFilteredDeliveryAreas() {
    const searchTerm = normalizeCompareText(dashboardState.filters.deliverySearch);
    const statusFilter = normalizeText(dashboardState.filters.deliveryStatus) || "all";

    return dashboardState.deliveryAreas.areas.filter(area => {
      if (statusFilter !== "all" && normalizeText(area?.status) !== statusFilter) {
        return false;
      }

      if (!searchTerm) {
        return true;
      }

      const haystack = [
        area?.name,
        area?.note,
        DELIVERY_STATUS_META[area?.status]?.label,
        area?.zoneLabel,
        area?.zoneName
      ].map(normalizeCompareText).join(" ");

      return haystack.includes(searchTerm);
    });
  }

  function renderDeliveryAreaList() {
    const container = document.getElementById("admin-delivery-areas-list");
    if (!container) {
      return;
    }

    const areas = getFilteredDeliveryAreas();
    if (!areas.length) {
      container.innerHTML = `
        <div class="admin-empty-state">
          <strong>Nenhuma região encontrada</strong>
          <p>Ajuste a busca, troque o filtro ou cadastre uma nova região.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = areas
      .map(area => renderDeliveryAreaCard(area))
      .join("");
  }

  function renderDeliveryAreaCard(area) {
    const status = normalizeText(area?.status) || "active";
    const statusMeta = DELIVERY_STATUS_META[status] || DELIVERY_STATUS_META.active;
    const note = normalizeText(area?.note) || statusMeta.description;

    return `
      <article class="admin-delivery-card" data-admin-delivery-row="${escapeHtml(area.id)}">
        <div class="admin-delivery-copy">
          <div class="admin-delivery-status-row">
            <strong>${escapeHtml(area.name)}</strong>
            <span class="admin-status-badge ${statusMeta.badgeClass}">${escapeHtml(statusMeta.label)}</span>
          </div>
          <p>${escapeHtml(note)}</p>
        </div>

        <div class="admin-delivery-actions">
          <button type="button" class="admin-delivery-chip" data-delivery-action="edit" data-delivery-id="${escapeHtml(area.id)}">Editar</button>
          <button type="button" class="admin-delivery-chip is-active ${normalizeText(area?.zoneId) === "zone_5" ? "is-selected" : ""}" data-delivery-action="zone" data-delivery-id="${escapeHtml(area.id)}" data-delivery-zone="zone_5">R$ 5</button>
          <button type="button" class="admin-delivery-chip is-active ${normalizeText(area?.zoneId) === "zone_10" ? "is-selected" : ""}" data-delivery-action="zone" data-delivery-id="${escapeHtml(area.id)}" data-delivery-zone="zone_10">R$ 10</button>
          <button type="button" class="admin-delivery-chip is-pickup ${normalizeText(area?.zoneId) === "pickup_only" ? "is-selected" : ""}" data-delivery-action="zone" data-delivery-id="${escapeHtml(area.id)}" data-delivery-zone="pickup_only">Retirada</button>
          <button type="button" class="admin-delivery-chip is-blocked ${normalizeText(area?.zoneId) === "blocked" ? "is-selected" : ""}" data-delivery-action="zone" data-delivery-id="${escapeHtml(area.id)}" data-delivery-zone="blocked">Bloquear</button>
          <button type="button" class="admin-delivery-chip is-danger" data-delivery-action="delete" data-delivery-id="${escapeHtml(area.id)}">Excluir</button>
        </div>
      </article>
    `;
  }

  function syncDeliveryAreaFormLabels() {
    const title = document.getElementById("admin-delivery-form-title");
    const saveButton = document.getElementById("admin-delivery-save-button");
    const isEditing = Boolean(dashboardState.editingDeliveryAreaId);

    if (title) {
      title.textContent = isEditing ? "Editar região" : "Nova região";
    }

    if (saveButton) {
      saveButton.textContent = isEditing ? "Salvar alterações" : "Salvar região";
    }
  }

  function getDeliveryAreaFormFields() {
    return {
      form: document.getElementById("admin-delivery-form"),
      id: document.getElementById("admin-delivery-id"),
      name: document.getElementById("admin-delivery-name"),
      zone: document.getElementById("admin-delivery-zone"),
      note: document.getElementById("admin-delivery-note"),
      saveButton: document.getElementById("admin-delivery-save-button"),
      cancelButton: document.getElementById("admin-delivery-cancel-button")
    };
  }

  function populateDeliveryAreaForm(area) {
    const fields = getDeliveryAreaFormFields();
    if (!area || !fields.form) {
      return;
    }

    dashboardState.editingDeliveryAreaId = normalizeText(area.id);
    if (fields.id) fields.id.value = normalizeText(area.id);
    if (fields.name) fields.name.value = normalizeText(area.name);
    if (fields.zone) fields.zone.value = normalizeText(area.zoneId) || "zone_5";
    if (fields.note) fields.note.value = normalizeText(area.note);
    syncDeliveryAreaZoneField();
    syncDeliveryAreaFormLabels();
    setDeliveryMessage(`Editando a região ${area.name}.`);
    fields.name?.focus();
    fields.form.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  function resetDeliveryAreaForm() {
    const fields = getDeliveryAreaFormFields();

    dashboardState.editingDeliveryAreaId = "";
    if (fields.form) {
      fields.form.reset();
    }
    if (fields.id) fields.id.value = "";
    if (fields.zone) fields.zone.value = "zone_5";
    syncDeliveryAreaZoneField();
    syncDeliveryAreaFormLabels();
    clearDeliveryMessageIfEditingNotice();
  }

  function clearDeliveryMessageIfEditingNotice() {
    const messageEl = document.getElementById("admin-delivery-message");
    if (messageEl && /^Editando a região /i.test(normalizeText(messageEl.textContent))) {
      setDeliveryMessage("");
    }
  }

  async function handleDeliveryAreaSubmit(event) {
    event.preventDefault();

    const fields = getDeliveryAreaFormFields();
    const name = normalizeText(fields.name?.value);
    const zoneId = normalizeText(fields.zone?.value) || "zone_5";
    const note = normalizeText(fields.note?.value);
    const areaId = normalizeText(fields.id?.value || dashboardState.editingDeliveryAreaId);

    if (!name) {
      setDeliveryMessage("Informe o nome da região.", true);
      fields.name?.focus();
      return;
    }

    if (!normalizeText(zoneId)) {
      setDeliveryMessage("Escolha uma zona válida para esta região.", true);
      fields.zone?.focus();
      return;
    }

    setDeliveryAreaFormBusy(true, areaId ? "Salvando..." : "Criando...");
    setDeliveryMessage("");

    try {
      const response = await fetch(ADMIN_DELIVERY_AREAS_API_URL, {
        method: areaId ? "PUT" : "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({
          id: areaId,
          name,
          zoneId,
          note
        })
      });
      const payload = await safeReadJson(response);

      if (response.status === 401) {
        handleSessionExpired();
        return;
      }

      if (!response.ok || !payload?.ok || !payload.deliveryAreas) {
        throw new Error(payload?.message || "Não foi possível salvar a região agora.");
      }

      applyDeliveryAreasPayload(payload.deliveryAreas);
      resetDeliveryAreaForm();
      broadcastDeliveryAreasUpdate({
        areaId: payload.area?.id || areaId,
        status: payload.status || "saved",
        updatedAt: payload.deliveryAreas.updatedAt || new Date().toISOString()
      });

      if (payload.deliveryAreas.persistenceConfigured === false) {
        setDeliveryMessage("A região foi atualizada visualmente, mas a hospedagem ainda precisa de persistência para salvar em produção.");
      } else {
        setDeliveryMessage(areaId ? "Região atualizada com sucesso." : "Região criada com sucesso.");
      }
    } catch (error) {
      setDeliveryMessage(error.message || "Não foi possível salvar a região agora.", true);
    } finally {
      setDeliveryAreaFormBusy(false);
    }
  }

  async function handleDeliveryAreaActionClick(event) {
    const button = event.target.closest("[data-delivery-action][data-delivery-id]");
    if (!button) {
      return;
    }

    const areaId = normalizeText(button.dataset.deliveryId);
    const action = normalizeText(button.dataset.deliveryAction);
    const area = dashboardState.deliveryAreas.areas.find(candidate => normalizeText(candidate?.id) === areaId);
    if (!areaId || !action || !area) {
      return;
    }

    if (action === "edit") {
      populateDeliveryAreaForm(area);
      return;
    }

    if (action === "delete") {
      const confirmed = window.confirm(`Excluir a região "${area.name}"?`);
      if (!confirmed) {
        return;
      }

      await deleteDeliveryArea(areaId, area.name);
      return;
    }

    if (action === "zone") {
      await updateDeliveryAreaZone(areaId, normalizeText(button.dataset.deliveryZone) || "zone_5", area.name);
    }
  }

  async function updateDeliveryAreaZone(areaId, zoneId, areaName) {
    setDeliveryAreaRowBusy(areaId, true);
    setDeliveryMessage("");

    try {
      const response = await fetch(ADMIN_DELIVERY_AREAS_API_URL, {
        method: "PUT",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({
          id: areaId,
          zoneId
        })
      });
      const payload = await safeReadJson(response);

      if (response.status === 401) {
        handleSessionExpired();
        return;
      }

      if (!response.ok || !payload?.ok || !payload.deliveryAreas) {
        throw new Error(payload?.message || "Não foi possível atualizar o status da região.");
      }

      applyDeliveryAreasPayload(payload.deliveryAreas);
      broadcastDeliveryAreasUpdate({
        areaId,
        status: zoneId,
        updatedAt: payload.deliveryAreas.updatedAt || new Date().toISOString()
      });
      setDeliveryMessage(`Zona da região ${areaName} atualizada para ${getDeliveryZoneMeta(zoneId).label}.`);
    } catch (error) {
      setDeliveryMessage(error.message || "Não foi possível atualizar a zona da região.", true);
    } finally {
      setDeliveryAreaRowBusy(areaId, false);
    }
  }

  async function deleteDeliveryArea(areaId, areaName) {
    setDeliveryAreaRowBusy(areaId, true);
    setDeliveryMessage("");

    try {
      const response = await fetch(ADMIN_DELIVERY_AREAS_API_URL, {
        method: "DELETE",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({
          id: areaId
        })
      });
      const payload = await safeReadJson(response);

      if (response.status === 401) {
        handleSessionExpired();
        return;
      }

      if (!response.ok || !payload?.ok || !payload.deliveryAreas) {
        throw new Error(payload?.message || "Não foi possível excluir a região.");
      }

      applyDeliveryAreasPayload(payload.deliveryAreas);
      if (dashboardState.editingDeliveryAreaId === areaId) {
        resetDeliveryAreaForm();
      }
      broadcastDeliveryAreasUpdate({
        areaId,
        status: "deleted",
        updatedAt: payload.deliveryAreas.updatedAt || new Date().toISOString()
      });
      setDeliveryMessage(`Região ${areaName} excluída com sucesso.`);
    } catch (error) {
      setDeliveryMessage(error.message || "Não foi possível excluir a região.", true);
    } finally {
      setDeliveryAreaRowBusy(areaId, false);
    }
  }

  async function handleStoreStatusActionClick(event) {
    const button = event.target.closest("[data-store-status-mode]");
    if (!button) {
      return;
    }

    const overrideMode = normalizeText(button.dataset.storeStatusMode);
    if (!overrideMode || overrideMode === dashboardState.storeStatus.overrideMode) {
      return;
    }

    setStoreStatusActionsBusy(true, overrideMode);
    setStoreStatusMessage("");

    try {
      const response = await fetch(ADMIN_STORE_STATUS_API_URL, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({
          overrideMode
        })
      });
      const payload = await safeReadJson(response);

      if (response.status === 401) {
        handleSessionExpired();
        return;
      }

      if (!response.ok || !payload?.ok || !payload.storeStatus) {
        throw new Error(payload?.message || "Não foi possível atualizar o status da loja.");
      }

      applyStoreStatusPayload(payload.storeStatus);
      broadcastStoreStatusUpdate({
        overrideMode,
        updatedAt: payload.storeStatus.updatedAt || new Date().toISOString()
      });

      if (payload.storeStatus.persistenceConfigured === false) {
        setStoreStatusMessage("O status visual foi atualizado, mas a hospedagem ainda precisa de armazenamento persistente para salvar isso em produção.");
      } else {
        setStoreStatusMessage(`Status da loja atualizado para ${getStoreStatusModeMeta(overrideMode).label.toLowerCase()}.`);
      }
    } catch (error) {
      setStoreStatusMessage(error.message || "Não foi possível atualizar o status da loja agora.", true);
    } finally {
      setStoreStatusActionsBusy(false);
    }
  }

  async function handleInventoryActionClick(event) {
    const button = event.target.closest("[data-admin-product-id][data-admin-available]");
    if (!button) {
      return;
    }

    const productId = normalizeText(button.dataset.adminProductId);
    const available = button.dataset.adminAvailable === "true";
    if (!productId) {
      return;
    }

    setInventoryRowBusy(productId, true);
    setInventoryMessage("");

    try {
      const response = await fetch(ADMIN_INVENTORY_API_URL, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({
          productId,
          available
        })
      });
      const payload = await safeReadJson(response);

      if (response.status === 401) {
        handleSessionExpired();
        return;
      }

      if (!response.ok || !payload?.ok || !payload.inventory) {
        throw new Error(payload?.message || "Não foi possível salvar o novo status do produto.");
      }

      applyInventoryPayload(payload.inventory);
      broadcastInventoryUpdate({
        productId,
        available,
        updatedAt: payload.inventory.updatedAt || new Date().toISOString()
      });
      if (payload.inventory.persistenceConfigured === false) {
        setInventoryMessage("O status visual foi atualizado, mas a hospedagem ainda precisa de armazenamento persistente para salvar o estoque em produção.");
      } else {
        setInventoryMessage(`Status salvo. O produto agora está marcado como ${available ? "disponível" : "esgotado"}.`);
      }
    } catch (error) {
      setInventoryMessage(error.message || "Não foi possível salvar a alteração agora.", true);
    } finally {
      setInventoryRowBusy(productId, false);
    }
  }

  function setLoginBusy(isBusy, label) {
    const loginButton = document.getElementById("admin-login-button");
    if (!loginButton) {
      return;
    }

    if (!loginButton.dataset.defaultLabel) {
      loginButton.dataset.defaultLabel = loginButton.textContent.trim() || "Entrar no painel";
    }

    loginButton.disabled = Boolean(isBusy);
    loginButton.textContent = isBusy ? label : loginButton.dataset.defaultLabel;
  }

  function setToolbarBusy(button, isBusy, label) {
    if (!button) {
      return;
    }

    if (!button.dataset.defaultLabel) {
      button.dataset.defaultLabel = button.textContent.trim();
    }

    button.disabled = Boolean(isBusy);
    button.textContent = isBusy ? label : button.dataset.defaultLabel;
  }

  function setStoreStatusActionsBusy(isBusy, overrideMode = "") {
    document.querySelectorAll("[data-store-status-mode]").forEach(button => {
      if (!button.dataset.defaultLabel) {
        button.dataset.defaultLabel = button.textContent.trim();
      }

      button.disabled = Boolean(isBusy);
      if (isBusy && normalizeText(button.dataset.storeStatusMode) === normalizeText(overrideMode)) {
        button.textContent = "Salvando...";
      } else {
        button.textContent = button.dataset.defaultLabel;
      }
    });
  }

  function setDeliveryAreaFormBusy(isBusy, label = "") {
    const fields = getDeliveryAreaFormFields();
    const saveButton = fields.saveButton;
    const cancelButton = fields.cancelButton;

    [fields.name, fields.zone, fields.note, cancelButton].forEach(field => {
      if (field) {
        field.disabled = Boolean(isBusy);
      }
    });

    if (saveButton) {
      if (!saveButton.dataset.defaultLabel) {
        saveButton.dataset.defaultLabel = saveButton.textContent.trim() || "Salvar região";
      }

      saveButton.disabled = Boolean(isBusy);
      saveButton.textContent = isBusy ? label : saveButton.dataset.defaultLabel;
    }
  }

  function setInventoryRowBusy(productId, isBusy) {
    const row = document.querySelector(`[data-admin-product-row="${escapeAttributeSelector(productId)}"]`);
    if (!row) {
      return;
    }

    row.classList.toggle("is-saving", Boolean(isBusy));
    row.querySelectorAll("[data-admin-product-id]").forEach(button => {
      button.disabled = Boolean(isBusy);
    });
  }

  function setDeliveryAreaRowBusy(areaId, isBusy) {
    const row = document.querySelector(`[data-admin-delivery-row="${escapeAttributeSelector(areaId)}"]`);
    if (!row) {
      return;
    }

    row.classList.toggle("is-saving", Boolean(isBusy));
    row.querySelectorAll("[data-delivery-action]").forEach(button => {
      button.disabled = Boolean(isBusy);
    });
  }

  function setLoginMessage(message, isError = false) {
    applyInlineMessage("admin-login-message", message, isError);
  }

  function setDashboardMessage(message, isError = false) {
    applyInlineMessage("admin-dashboard-message", message, isError);
  }

  function setStoreStatusMessage(message, isError = false) {
    applyInlineMessage("admin-store-status-message", message, isError);
  }

  function setInventoryMessage(message, isError = false) {
    applyInlineMessage("admin-inventory-message", message, isError);
  }

  function setDeliveryMessage(message, isError = false) {
    applyInlineMessage("admin-delivery-message", message, isError);
  }

  function applyInlineMessage(elementId, message, isError = false) {
    const messageEl = document.getElementById(elementId);
    if (!messageEl) {
      return;
    }

    messageEl.textContent = normalizeText(message);
    messageEl.classList.toggle("is-error", Boolean(isError));
    messageEl.classList.toggle("is-success", Boolean(message && !isError));
  }

  async function safeReadJson(response) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function broadcastInventoryUpdate(payload) {
    const normalizedPayload = normalizeInventoryRealtimePayload(payload);
    if (!normalizedPayload) {
      return;
    }

    try {
      localStorage.setItem(INVENTORY_BROADCAST_STORAGE_KEY, JSON.stringify({
        ...normalizedPayload,
        ts: Date.now()
      }));
    } catch {
      // O painel continua funcionando mesmo sem localStorage.
    }

    try {
      inventoryRealtimeChannel?.postMessage({
        ...normalizedPayload,
        ts: Date.now()
      });
    } catch {
      // O painel continua funcionando mesmo sem BroadcastChannel.
    }
  }

  function broadcastStoreStatusUpdate(payload) {
    try {
      localStorage.setItem(STORE_STATUS_BROADCAST_STORAGE_KEY, JSON.stringify({
        overrideMode: normalizeText(payload?.overrideMode) || "auto",
        updatedAt: normalizeText(payload?.updatedAt) || new Date().toISOString(),
        ts: Date.now()
      }));
    } catch {
      // O painel continua funcionando mesmo sem localStorage.
    }
  }

  function broadcastDeliveryAreasUpdate(payload) {
    try {
      localStorage.setItem(DELIVERY_AREAS_BROADCAST_STORAGE_KEY, JSON.stringify({
        areaId: normalizeText(payload?.areaId),
        status: normalizeText(payload?.status),
        updatedAt: normalizeText(payload?.updatedAt) || new Date().toISOString(),
        ts: Date.now()
      }));
    } catch {
      // O painel continua funcionando mesmo sem localStorage.
    }
  }

  function handleRealtimeInventoryUpdate(payload) {
    if (!dashboardState.authenticated) {
      return;
    }

    const wasApplied = applyRealtimeInventoryPatch(payload);
    if (!wasApplied) {
      window.setTimeout(() => {
        loadInventory({
          showMessage: false,
          background: true
        }).catch(() => null);
      }, 0);
    }
  }

  function applyRealtimeInventoryPatch(payload) {
    const normalizedPayload = normalizeInventoryRealtimePayload(payload);
    if (!normalizedPayload) {
      return false;
    }

    const inventoryIndex = dashboardState.inventory.products.findIndex(product =>
      normalizeText(product?.id) === normalizedPayload.productId
    );

    if (inventoryIndex < 0) {
      return false;
    }

    const nextInventory = dashboardState.inventory.products.slice();
    nextInventory[inventoryIndex] = {
      ...nextInventory[inventoryIndex],
      available: normalizedPayload.available,
      stockUpdatedAt: normalizedPayload.updatedAt
    };

    dashboardState.inventory.products = nextInventory;
    dashboardState.inventory.updatedAt = normalizedPayload.updatedAt;
    dashboardState.inventory.counts = {
      total: nextInventory.length,
      available: nextInventory.filter(product => product.available).length,
      unavailable: nextInventory.filter(product => !product.available).length
    };
    renderDashboard();
    return true;
  }

  function parseInventoryRealtimePayload(rawValue) {
    try {
      return normalizeInventoryRealtimePayload(JSON.parse(rawValue));
    } catch {
      return null;
    }
  }

  function normalizeInventoryRealtimePayload(payload) {
    const productId = normalizeText(payload?.productId);
    if (!productId) {
      return null;
    }

    return {
      productId,
      available: Boolean(payload?.available),
      updatedAt: normalizeText(payload?.updatedAt) || new Date().toISOString()
    };
  }

  function createInventoryRealtimeChannel() {
    try {
      return typeof window.BroadcastChannel === "function"
        ? new window.BroadcastChannel(INVENTORY_SYNC_CHANNEL_NAME)
        : null;
    } catch {
      return null;
    }
  }

  function escapeAttributeSelector(value) {
    if (window.CSS?.escape) {
      return window.CSS.escape(value);
    }

    return String(value || "").replace(/["\\]/g, "\\$&");
  }
})();
