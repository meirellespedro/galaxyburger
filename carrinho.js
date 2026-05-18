let cart = JSON.parse(localStorage.getItem("cart")) || [];

const PIX_KEY = "66.219.861/0001-73";
const PIX_BENEFICIARY_NAME = "Sulen Ferreira de Carvalho de Souza";
const STORE_WHATSAPP = "5521995578652";
const WHATSAPP_ORDER_BASE_URL = "https://api.whatsapp.com/send";
const IFOOD_STORE_URL = "https://www.ifood.com.br/delivery/rio-de-janeiro-rj/galaxy-burger-199-campo-grande/fe3716f9-fab7-4b6b-9e7a-09f0ccff22d1";
// Quando o site estiver publicado, coloque aqui a URL final da loja.
// Exemplo: "https://galaxy-burger.vercel.app"
const PUBLIC_ORDER_TICKET_BASE_URL = "https://galaxyburger.vercel.app/";

const STORE_ADDRESS = "Rua Embaixador Muniz Gordilho, 199 - Campo Grande, Rio de Janeiro/RJ - CEP 23070-010";
const STORE_ADDRESS_LINES = Object.freeze([
  "Rua Embaixador Muniz Gordilho, 199",
  "Campo Grande - Rio de Janeiro/RJ",
  "CEP 23070-010"
]);
const ORDER_TICKET_WIDTH = 30;
const ORDER_TICKET_DIVIDER = "-".repeat(ORDER_TICKET_WIDTH);
const STORE_TIME_ZONE = "America/Sao_Paulo";
// Use "live" para respeitar o horário real da loja. Troque para "preview" apenas em testes.
const STORE_SCHEDULE_MODE = "live";
const STORE_WEEKDAY_TOKENS = Object.freeze({
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6
});
const STORE_WEEKDAY_LABELS = Object.freeze([
  "domingo",
  "segunda",
  "ter\u00e7a",
  "quarta",
  "quinta",
  "sexta",
  "s\u00e1bado"
]);
const STORE_HOURS = Object.freeze({
  0: Object.freeze({ openMinutes: 19 * 60, closeMinutes: 23 * 60 + 59 }),
  1: Object.freeze({ openMinutes: 19 * 60, closeMinutes: 23 * 60 + 59 }),
  2: Object.freeze({ openMinutes: 19 * 60, closeMinutes: 23 * 60 + 59 }),
  3: Object.freeze({ openMinutes: 19 * 60, closeMinutes: 23 * 60 + 59 }),
  4: Object.freeze({ openMinutes: 19 * 60, closeMinutes: 23 * 60 + 59 }),
  5: Object.freeze({ openMinutes: 19 * 60, closeMinutes: 23 * 60 + 59 }),
  6: Object.freeze({ openMinutes: 19 * 60, closeMinutes: 23 * 60 + 59 })
});

const VIA_CEP_BASE_URL = "https://viacep.com.br/ws";
const DELIVERY_QUOTE_API_URL = "/api/delivery-quote";
const DELIVERY_FEE_LOCAL = 5;
const DELIVERY_FEE_EXTENDED = 10;
const MIN_ORDER_AMOUNT = 20;
const MAX_WHATSAPP_URL_LENGTH = 1800;
const WHATSAPP_FALLBACK_DELAY_MS = 700;
const WHATSAPP_OPEN_CHECK_DELAY_MS = 1800;
const DELIVERY_QUOTE_EXPIRY_BUFFER_MS = 30 * 1000;
const DELIVERY_IDLE_MESSAGE = "Informe o CEP, complete o endere\u00e7o e valide a entrega para calcular a taxa.";
const CHECKOUT_LOG_PREFIX = "[Galaxy Burger checkout]";

const DELIVERY_STORAGE_KEY = "galaxy_burguer_delivery_v11";
const LEGACY_DELIVERY_STORAGE_KEYS = [
  "galaxy_burguer_delivery",
  "galaxy_burguer_delivery_v3",
  "galaxy_burguer_delivery_v4",
  "galaxy_burguer_delivery_v5",
  "galaxy_burguer_delivery_v6",
  "galaxy_burguer_delivery_v7",
  "galaxy_burguer_delivery_v8",
  "galaxy_burguer_delivery_v9",
  "galaxy_burguer_delivery_v10",
  "galaxy_burguer_store_coords_v1"
];

let deliveryState = {
  status: "idle",
  fee: 0,
  distanceLabel: "",
  distanceRange: "",
  address: "",
  message: DELIVERY_IDLE_MESSAGE,
  quoteCode: "",
  quoteToken: "",
  addressKey: "",
  expiresAt: "",
  distanceKm: 0,
  locationPrecision: "",
  geocoderSource: "",
  validatedAddress: null
};

const viaCepCache = new Map();
const DELIVERY_ZONE_LABELS = Object.freeze({
  local: `At\u00e9 3 km da base - ${formatCurrency(DELIVERY_FEE_LOCAL)}`,
  extended: `De 3 km at\u00e9 5 km da base - ${formatCurrency(DELIVERY_FEE_EXTENDED)}`,
  out_of_range: "Acima de 5 km - apenas retirada"
});
const DEFAULT_COMBO_DRINK_OPTIONS = Object.freeze([
  "Coca-Cola Comum 350ML",
  "Coca-Cola Zero 350 ml",
  "Pepsi lata 350ml",
  "Pepsi Black lata 350ml",
  "Fanta Laranja",
  "Guaran\u00e1 lata 350ml",
  "Fanta uva",
  "Guaracamp copo 285ml"
]);
let activeComboSelection = null;
let pendingOrderPreview = null;
let orderTicketModalMode = "checkout";
let cartModalHiddenForOrderTicket = false;
let activeWhatsAppAttempt = null;

function formatCurrency(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function normalizeCep(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 8);
}

function formatCep(value) {
  const digits = normalizeCep(value);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
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

function isCampoGrandeNeighborhood(value) {
  return normalizeCompareText(value) === "campo grande";
}

function formatDistanceKm(value) {
  const distance = Number(value || 0);
  if (!Number.isFinite(distance) || distance <= 0) return "";
  return `${distance.toFixed(1).replace(".", ",")} km`;
}

function formatGeocoderSourceLabel(value) {
  const normalized = normalizeCompareText(value);

  if (normalized === "photon") return "Photon";
  if (normalized === "nominatim") return "Nominatim";
  return "mapa";
}

function getDeliveryLocationMethodCopy({ precision = "", source = "", includeProvider = true } = {}) {
  const normalizedPrecision = normalizeCompareText(precision);
  const sourceLabel = includeProvider && source
    ? ` (${formatGeocoderSourceLabel(source)})`
    : "";

  if (normalizedPrecision === "exact") {
    return `Localiza\u00e7\u00e3o precisa: n\u00famero do endere\u00e7o confirmado${sourceLabel}.`;
  }

  if (normalizedPrecision === "street") {
    return `Localiza\u00e7\u00e3o aproximada: ponto da rua confirmado${sourceLabel}. A taxa j\u00e1 considera margem de seguran\u00e7a.`;
  }

  if (normalizedPrecision === "postcode") {
    return `Localiza\u00e7\u00e3o aproximada por CEP${sourceLabel}. A taxa j\u00e1 considera uma margem de seguran\u00e7a maior.`;
  }

  if (normalizedPrecision) {
    return `Localiza\u00e7\u00e3o validada pelo servidor${sourceLabel}.`;
  }

  return "";
}

function buildDeliveryAddressKey(values = {}) {
  return [
    normalizeCep(values.cep),
    normalizeCompareText(values.street),
    normalizeCompareText(values.number),
    normalizeCompareText(values.neighborhood),
    normalizeCompareText(values.city),
    normalizeText(values.state).toUpperCase()
  ].join("|");
}

function isDeliveryQuoteFresh(state = deliveryState) {
  if (!state || state.status !== "ready" || !state.quoteToken || !state.expiresAt) {
    return false;
  }

  const expiresAt = Date.parse(state.expiresAt);
  if (!Number.isFinite(expiresAt)) {
    return false;
  }

  return expiresAt - DELIVERY_QUOTE_EXPIRY_BUFFER_MS > Date.now();
}

function resolveDeliveryQuoteApiUrl() {
  const currentHref = String(window?.location?.href || "").trim();
  const currentOrigin = String(window?.location?.origin || "").trim();
  const isHttpPage = /^https?:\/\//i.test(currentHref);
  const isLocalPage = !isHttpPage || /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?$/i.test(currentOrigin);

  if (isLocalPage) {
    const baseUrl = resolveOrderTicketBaseUrl();
    if (baseUrl) {
      return new URL(DELIVERY_QUOTE_API_URL, baseUrl).toString();
    }
  }

  return DELIVERY_QUOTE_API_URL;
}

function formatStoreTimeLabel(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return minutes ? `${hours}h${String(minutes).padStart(2, "0")}` : `${hours}h`;
}

function getStoreClockParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: STORE_TIME_ZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(now);

  const weekdayToken = parts.find(part => part.type === "weekday")?.value || "Mon";
  const hour = Number(parts.find(part => part.type === "hour")?.value || 0);
  const minute = Number(parts.find(part => part.type === "minute")?.value || 0);

  return {
    dayIndex: STORE_WEEKDAY_TOKENS[weekdayToken] ?? 1,
    hour,
    minute,
    currentMinutes: hour * 60 + minute
  };
}

function getNextStoreOpening(dayIndex, currentMinutes) {
  for (let offset = 0; offset < 8; offset += 1) {
    const targetDayIndex = (dayIndex + offset) % 7;
    const schedule = STORE_HOURS[targetDayIndex];
    if (!schedule) continue;

    if (offset === 0 && currentMinutes < schedule.openMinutes) {
      return {
        dayIndex: targetDayIndex,
        openMinutes: schedule.openMinutes,
        offset
      };
    }

    if (offset > 0) {
      return {
        dayIndex: targetDayIndex,
        openMinutes: schedule.openMinutes,
        offset
      };
    }
  }

  return null;
}

function getStoreAvailability(now = new Date()) {
  const clock = getStoreClockParts(now);
  const todaySchedule = STORE_HOURS[clock.dayIndex] || null;
  const scheduleEnforced = STORE_SCHEDULE_MODE === "live";
  const isScheduledOpen = Boolean(todaySchedule)
    && clock.currentMinutes >= todaySchedule.openMinutes
    && clock.currentMinutes <= todaySchedule.closeMinutes;
  const isOpen = !scheduleEnforced || isScheduledOpen;

  return {
    ...clock,
    todaySchedule,
    scheduleEnforced,
    isScheduledOpen,
    isOpen,
    nextOpen: getNextStoreOpening(clock.dayIndex, clock.currentMinutes)
  };
}

function formatNextOpeningMessage(nextOpen) {
  if (!nextOpen) {
    return "Consulte a loja para o pr\u00f3ximo hor\u00e1rio.";
  }

  const timeLabel = formatStoreTimeLabel(nextOpen.openMinutes);

  if (nextOpen.offset === 0) {
    return `A pr\u00f3xima abertura \u00e9 hoje, \u00e0s ${timeLabel}.`;
  }

  if (nextOpen.offset === 1) {
    return `A pr\u00f3xima abertura \u00e9 amanh\u00e3, \u00e0s ${timeLabel}.`;
  }

  return `A pr\u00f3xima abertura \u00e9 ${STORE_WEEKDAY_LABELS[nextOpen.dayIndex]}, \u00e0s ${timeLabel}.`;
}

function getStoreClosedOrderMessage(availability = getStoreAvailability()) {
  return `A Galaxy Burger est\u00e1 fechada agora. ${formatNextOpeningMessage(availability.nextOpen)}`;
}

function ensureStoreIsOpen(showMessage = true) {
  const availability = getStoreAvailability();
  updateStoreStatusUI(availability);

  if (availability.isOpen) {
    return true;
  }

  if (showMessage) {
    showToast(getStoreClosedOrderMessage(availability));
  }

  return false;
}

function getDeliveryFields() {
  return {
    cep: document.getElementById("customer-cep"),
    street: document.getElementById("customer-street"),
    number: document.getElementById("customer-number"),
    neighborhood: document.getElementById("customer-neighborhood"),
    complement: document.getElementById("customer-complement"),
    reference: document.getElementById("customer-reference"),
    city: document.getElementById("customer-city"),
    state: document.getElementById("customer-state"),
    address: document.getElementById("customer-address"),
    distanceRange: document.getElementById("delivery-distance-range"),
    quoteSummary: document.getElementById("delivery-quote-summary"),
    feeFeedback: document.getElementById("delivery-fee-feedback"),
    feeLine: document.getElementById("modal-delivery-fee-line"),
    totalNote: document.getElementById("delivery-total-note"),
    totalLabel: document.getElementById("modal-cart-total-label"),
    estimateAck: document.getElementById("delivery-estimate-ack"),
    estimateTerms: document.getElementById("delivery-estimate-terms"),
    searchCepButton: document.getElementById("search-cep-btn"),
    calculateDeliveryButton: document.getElementById("calculate-delivery-btn")
  };
}

function getCurrentFulfillmentMode() {
  return document.getElementById("order-fulfillment")?.value || "delivery";
}

function getPaymentFields() {
  return {
    field: document.getElementById("payment-method"),
    grid: document.querySelector(".payment-grid"),
    buttons: Array.from(document.querySelectorAll(".payment-btn"))
  };
}

function logCheckoutInfo(message, details) {
  if (details !== undefined) {
    console.info(`${CHECKOUT_LOG_PREFIX} ${message}`, details);
    return;
  }

  console.info(`${CHECKOUT_LOG_PREFIX} ${message}`);
}

function logCheckoutWarn(message, details) {
  if (details !== undefined) {
    console.warn(`${CHECKOUT_LOG_PREFIX} ${message}`, details);
    return;
  }

  console.warn(`${CHECKOUT_LOG_PREFIX} ${message}`);
}

function logCheckoutError(message, error) {
  if (error !== undefined) {
    console.error(`${CHECKOUT_LOG_PREFIX} ${message}`, error);
    return;
  }

  console.error(`${CHECKOUT_LOG_PREFIX} ${message}`);
}

function setFieldInvalid(field) {
  if (!field) return;
  field.classList.add("is-invalid");
  field.setAttribute("aria-invalid", "true");
}

function clearFieldInvalid(field) {
  if (!field) return;
  field.classList.remove("is-invalid");
  field.removeAttribute("aria-invalid");
}

function setEstimateTermsInvalid(container, checkbox) {
  if (container) container.classList.add("is-invalid");
  if (checkbox) checkbox.setAttribute("aria-invalid", "true");
}

function clearEstimateTermsInvalid(container, checkbox) {
  if (container) container.classList.remove("is-invalid");
  if (checkbox) checkbox.removeAttribute("aria-invalid");
}

function setPaymentInvalid() {
  const payment = getPaymentFields();
  if (payment.grid) payment.grid.classList.add("is-invalid");
  payment.buttons.forEach(button => button.setAttribute("aria-invalid", "true"));
}

function clearPaymentInvalid() {
  const payment = getPaymentFields();
  if (payment.grid) payment.grid.classList.remove("is-invalid");
  payment.buttons.forEach(button => button.removeAttribute("aria-invalid"));
}

function showToast(message) {
  let toast = document.getElementById("toast-message");

  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast-message";
    toast.className = "toast-message";
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.classList.add("show");

  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    toast.classList.remove("show");
  }, 2800);
}

function getCashChangeFields() {
  return {
    panel: document.getElementById("cash-change-panel"),
    typeInputs: Array.from(document.querySelectorAll('input[name="cash-change-type"]')),
    valueWrap: document.getElementById("cash-change-value-wrap"),
    valueInput: document.getElementById("cash-change-value")
  };
}

function getSelectedCashChangeType() {
  const { typeInputs } = getCashChangeFields();
  return typeInputs.find(input => input.checked)?.value || "no-change";
}

function normalizeCurrencyInput(value) {
  const cleaned = String(value || "").replace(/[^\d,]/g, "");
  const firstCommaIndex = cleaned.indexOf(",");

  if (firstCommaIndex === -1) {
    return cleaned;
  }

  const integerPart = cleaned.slice(0, firstCommaIndex);
  const decimalPart = cleaned.slice(firstCommaIndex + 1).replace(/,/g, "").slice(0, 2);
  return `${integerPart},${decimalPart}`;
}

function parseCurrencyInput(value) {
  const cleaned = normalizeCurrencyInput(value).replace(/\./g, "").replace(",", ".");
  const amount = Number(cleaned);
  return Number.isFinite(amount) ? amount : 0;
}

function formatCurrencyInputValue(value) {
  const amount = typeof value === "number" ? value : parseCurrencyInput(value);
  if (!amount) return "";

  return amount.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function updateCashChangeUI() {
  const payment = document.getElementById("payment-method")?.value || "";
  const fields = getCashChangeFields();
  const isCash = payment === "dinheiro";
  const needsChange = isCash && getSelectedCashChangeType() === "need-change";

  if (fields.panel) {
    fields.panel.hidden = !isCash;
  }

  if (fields.valueWrap) {
    fields.valueWrap.hidden = !needsChange;
  }

  if (!needsChange) {
    clearFieldInvalid(fields.valueInput);
  }
}

function getCashChangeSummary(orderTotal, showMessage = true) {
  const payment = document.getElementById("payment-method")?.value || "";
  const fields = getCashChangeFields();

  clearFieldInvalid(fields.valueInput);

  if (payment !== "dinheiro") {
    return {
      paymentLabel: formatPaymentLabel(payment),
      cashChangeText: ""
    };
  }

  const changeType = getSelectedCashChangeType();

  if (changeType !== "need-change") {
    return {
      paymentLabel: "Dinheiro",
      cashChangeText: "N\u00e3o precisa de troco."
    };
  }

  const changeAmount = parseCurrencyInput(fields.valueInput?.value);

  if (!changeAmount) {
    if (showMessage) {
      setFieldInvalid(fields.valueInput);
      fields.valueInput?.focus();
      showToast("Informe o valor para troco.");
    }
    return null;
  }

  if (changeAmount < orderTotal) {
    if (showMessage) {
      setFieldInvalid(fields.valueInput);
      fields.valueInput?.focus();
      showToast(`O troco precisa ser para um valor igual ou maior que ${formatCurrency(orderTotal)}.`);
    }
    return null;
  }

  if (fields.valueInput) {
    fields.valueInput.value = formatCurrencyInputValue(changeAmount);
  }

  return {
    paymentLabel: "Dinheiro",
    cashChangeText: `Troco para ${formatCurrency(changeAmount)}`
  };
}

function buildFullAddress() {
  const fields = getDeliveryFields();

  const cep = formatCep(fields.cep?.value || "");
  const street = normalizeText(fields.street?.value);
  const number = normalizeText(fields.number?.value);
  const neighborhood = normalizeText(fields.neighborhood?.value);
  const complement = normalizeText(fields.complement?.value);
  const reference = normalizeText(fields.reference?.value);
  const city = normalizeText(fields.city?.value);
  const state = normalizeText(fields.state?.value).toUpperCase();

  const parts = [];

  if (street) parts.push(number ? `${street}, ${number}` : street);
  if (complement) parts.push(complement);
  if (reference) parts.push(`Ref.: ${reference}`);
  if (neighborhood) parts.push(neighborhood);
  if (city || state) parts.push([city, state].filter(Boolean).join(" - "));
  if (cep) parts.push(`CEP ${cep}`);

  return parts.join(" | ");
}

function syncDeliveryAddressField() {
  const fields = getDeliveryFields();
  const address = buildFullAddress();

  if (fields.address) {
    fields.address.value = address;
  }

  return address;
}

function getDeliveryValues() {
  const fields = getDeliveryFields();

  return {
    cep: normalizeCep(fields.cep?.value),
    street: normalizeText(fields.street?.value),
    number: normalizeText(fields.number?.value),
    neighborhood: normalizeText(fields.neighborhood?.value),
    complement: normalizeText(fields.complement?.value),
    reference: normalizeText(fields.reference?.value),
    city: normalizeText(fields.city?.value),
    state: normalizeText(fields.state?.value).toUpperCase(),
    distanceRange: normalizeText(fields.distanceRange?.value),
    estimateAccepted: Boolean(fields.estimateAck?.checked)
  };
}

function validateAddressFields(showMessage = true) {
  const fields = getDeliveryFields();
  const values = getDeliveryValues();

  const required = [
    { field: fields.cep, value: values.cep, message: "Informe um CEP v\u00e1lido." },
    { field: fields.street, value: values.street, message: "Informe a rua." },
    { field: fields.number, value: values.number, message: "Informe o n\u00famero." },
    { field: fields.neighborhood, value: values.neighborhood, message: "Informe o bairro." },
    { field: fields.city, value: values.city, message: "Informe a cidade." },
    { field: fields.state, value: values.state, message: "Informe o estado." }
  ];

  const missing = required.find(item => !item.value);

  required.forEach(item => clearFieldInvalid(item.field));

  if (missing) {
    setFieldInvalid(missing.field);
    missing.field?.focus();

    if (showMessage) {
      logCheckoutWarn("Checkout bloqueado: endere\u00e7o incompleto.", { missingField: missing.field?.id || "unknown" });
      showToast(missing.message);
      setDeliveryState({
        status: "idle",
        fee: 0,
        distanceLabel: "",
        distanceRange: values.distanceRange || "",
        message: missing.message,
        quoteCode: "",
        quoteToken: "",
        addressKey: "",
        expiresAt: "",
        distanceKm: 0,
        locationPrecision: "",
        geocoderSource: "",
        validatedAddress: null
      });
    }

    return false;
  }

  return true;
}

function clearDeliveryQuote(reasonMessage = DELIVERY_IDLE_MESSAGE) {
  const fields = getDeliveryFields();

  if (fields.distanceRange) {
    fields.distanceRange.value = "";
    clearFieldInvalid(fields.distanceRange);
  }

  if (fields.estimateAck) {
    fields.estimateAck.checked = false;
    clearEstimateTermsInvalid(fields.estimateTerms, fields.estimateAck);
  }

  setDeliveryState({
    status: "idle",
    fee: 0,
    distanceLabel: "",
    distanceRange: "",
    address: syncDeliveryAddressField(),
    message: reasonMessage,
    quoteCode: "",
    quoteToken: "",
    addressKey: "",
    expiresAt: "",
    distanceKm: 0,
    locationPrecision: "",
    geocoderSource: "",
    validatedAddress: null
  });

  updateCartTotals();
}

function applyValidatedAddressToFields(address = {}) {
  const fields = getDeliveryFields();

  if (fields.cep && address.cep) fields.cep.value = formatCep(address.cep);
  if (fields.street && address.street) fields.street.value = address.street;
  if (fields.neighborhood && address.neighborhood) fields.neighborhood.value = address.neighborhood;
  if (fields.city && address.city) fields.city.value = address.city;
  if (fields.state && address.state) fields.state.value = address.state;
}

async function fetchDeliveryQuote(values) {
  const response = await fetch(resolveDeliveryQuoteApiUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      cep: normalizeCep(values.cep),
      street: normalizeText(values.street),
      number: normalizeText(values.number),
      neighborhood: normalizeText(values.neighborhood),
      city: normalizeText(values.city),
      state: normalizeText(values.state).toUpperCase()
    })
  });

  let payload = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok || !payload?.ok) {
    let message = payload?.message || "N\u00e3o foi poss\u00edvel validar a entrega agora.";
    let code = payload?.code || "delivery_quote_failed";

    if (response.status === 404) {
      message = "A API de entrega ainda n\u00e3o est\u00e1 publicada neste ambiente. Fa\u00e7a um novo deploy na Vercel para liberar a valida\u00e7\u00e3o.";
      code = "delivery_quote_route_missing";
    }

    const error = new Error(message);
    error.code = code;
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

async function verifyDeliveryQuoteToken(token, addressKey = "") {
  const url = new URL(resolveDeliveryQuoteApiUrl(), window.location.origin);
  url.searchParams.set("token", token);
  if (addressKey) {
    url.searchParams.set("addressKey", addressKey);
  }

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json"
    }
  });

  let payload = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok || !payload?.ok || !payload?.valid) {
    let message = payload?.message || "N\u00e3o foi poss\u00edvel confirmar a cota\u00e7\u00e3o da entrega.";
    let code = payload?.code || "delivery_quote_verify_failed";

    if (response.status === 404) {
      message = "A API de entrega ainda n\u00e3o est\u00e1 publicada neste ambiente. Fa\u00e7a um novo deploy na Vercel para liberar a valida\u00e7\u00e3o.";
      code = "delivery_quote_route_missing";
    }

    const error = new Error(message);
    error.code = code;
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

async function requestDeliveryQuote({ showMessage = true, quietSuccess = false, reason = "manual" } = {}) {
  if (getCurrentFulfillmentMode() === "pickup") {
    return deliveryState;
  }

  if (!validateAddressFields(showMessage)) {
    return null;
  }

  const fields = getDeliveryFields();
  const values = getDeliveryValues();

  setDeliveryState({
    status: "loading",
    fee: 0,
    distanceLabel: "",
    distanceRange: "",
    address: syncDeliveryAddressField(),
    message: reason === "finalize"
      ? "Validando o endere\u00e7o final para fechar a entrega..."
      : "Validando o endere\u00e7o e calculando a taxa...",
    quoteCode: "",
    quoteToken: "",
    addressKey: "",
    expiresAt: "",
    distanceKm: 0,
    locationPrecision: "",
    geocoderSource: "",
    validatedAddress: null
  });

  try {
    const payload = await fetchDeliveryQuote(values);
    const isOutOfRange = payload.status === "out_of_range";
    const validatedAddress = {
      ...values,
      ...(payload.address || {})
    };

    validatedAddress.complement = values.complement;
    validatedAddress.reference = values.reference;

    applyValidatedAddressToFields(validatedAddress);
    syncDeliveryAddressField();

    if (fields.distanceRange) {
      fields.distanceRange.value = payload.zone || "";
    }

    if (fields.estimateAck) {
      fields.estimateAck.checked = !isOutOfRange;
      clearEstimateTermsInvalid(fields.estimateTerms, fields.estimateAck);
    }

    const nextState = {
      status: payload.status || (isOutOfRange ? "out_of_range" : "ready"),
      fee: isOutOfRange ? 0 : Number(payload.fee || 0),
      distanceLabel: payload.distanceLabel || DELIVERY_ZONE_LABELS[payload.zone] || "",
      distanceRange: payload.zone || "",
      address: syncDeliveryAddressField(),
      message: payload.message || DELIVERY_IDLE_MESSAGE,
      quoteCode: isOutOfRange ? "" : payload.quote?.code || "",
      quoteToken: isOutOfRange ? "" : payload.quote?.token || "",
      addressKey: buildDeliveryAddressKey(validatedAddress),
      expiresAt: isOutOfRange ? "" : payload.quote?.expiresAt || "",
      distanceKm: Number(payload.distanceKm || 0),
      locationPrecision: normalizeText(payload.locationPrecision),
      geocoderSource: normalizeText(payload.geocoderSource),
      validatedAddress
    };

    setDeliveryState(nextState);
    updateCartTotals();

    if (!quietSuccess && showMessage) {
      showToast(payload.message || "Endere\u00e7o validado com sucesso.");
    }

    return nextState;
  } catch (error) {
    const payload = error.payload || {};
    const message = payload.message
      || (error.code === "delivery_quote_route_missing"
        ? "A API de entrega ainda n\u00e3o est\u00e1 publicada neste ambiente. Fa\u00e7a um novo deploy na Vercel para liberar a valida\u00e7\u00e3o."
        : "")
      || (!/^https?:\/\//i.test(String(window?.location?.href || "").trim())
        ? "Este teste local precisa do deploy da Vercel ou de um servidor com a API /api/delivery-quote ativa."
        : "")
      || (error.name === "TypeError" ? "N\u00e3o foi poss\u00edvel validar a entrega agora." : error.message)
      || "N\u00e3o foi poss\u00edvel validar a entrega agora.";

    if (payload.officialAddress) {
      applyValidatedAddressToFields(payload.officialAddress);
      syncDeliveryAddressField();
    }

    if (fields.estimateAck) {
      fields.estimateAck.checked = false;
      clearEstimateTermsInvalid(fields.estimateTerms, fields.estimateAck);
    }

    setDeliveryState({
      status: payload.status === "out_of_range" ? "out_of_range" : "error",
      fee: 0,
      distanceLabel: "",
      distanceRange: "",
      address: syncDeliveryAddressField(),
      message,
      quoteCode: "",
      quoteToken: "",
      addressKey: "",
      expiresAt: "",
      distanceKm: 0,
      locationPrecision: "",
      geocoderSource: "",
      validatedAddress: null
    });
    updateCartTotals();

    if (showMessage) {
      showToast(message);
    }

    return null;
  }
}

function validateDeliveryEstimateAcceptance(showMessage = true) {
  const fields = getDeliveryFields();

  clearEstimateTermsInvalid(fields.estimateTerms, fields.estimateAck);

  if (getCurrentFulfillmentMode() === "pickup" || fields.estimateAck?.checked) {
    return true;
  }

  if (showMessage) {
    setEstimateTermsInvalid(fields.estimateTerms, fields.estimateAck);
    fields.estimateAck?.focus();
    logCheckoutWarn("Checkout bloqueado: aceite da taxa validada n\u00e3o confirmado.");
    showToast("Confirme que entendeu a taxa validada antes de enviar o pedido.");
  }

  return false;
}

async function fetchViaCepData(cep) {
  const cleanCep = normalizeCep(cep);

  if (viaCepCache.has(cleanCep)) {
    return viaCepCache.get(cleanCep);
  }

  const response = await fetch(`${VIA_CEP_BASE_URL}/${cleanCep}/json/`);

  if (!response.ok) {
    throw new Error("via_cep_failed");
  }

  const data = await response.json();

  if (data.erro) {
    throw new Error("cep_not_found");
  }

  viaCepCache.set(cleanCep, data);
  return data;
}

async function lookupCep(isManual = false) {
  const fields = getDeliveryFields();
  const cep = normalizeCep(fields.cep?.value);

  if (!fields.cep) return;

  fields.cep.value = formatCep(cep);

  if (cep.length !== 8) {
    clearDeliveryQuote("Digite um CEP v\u00e1lido com 8 n\u00fameros.");

    if (isManual) showToast("Digite um CEP v\u00e1lido com 8 n\u00fameros.");
    return;
  }

  if (fields.searchCepButton) {
    fields.searchCepButton.disabled = true;
    fields.searchCepButton.textContent = "Buscando...";
  }

  try {
    const data = await fetchViaCepData(cep);

    if (fields.street) fields.street.value = data.logradouro || "";
    if (fields.neighborhood) fields.neighborhood.value = data.bairro || "";
    if (fields.city) fields.city.value = data.localidade || "";
    if (fields.state) fields.state.value = data.uf || "";

    syncDeliveryAddressField();
    clearDeliveryQuote("CEP localizado. Revise o endere\u00e7o e valide a entrega.");

    saveDeliveryData();
  } catch (error) {
    setDeliveryState({
      status: "error",
      fee: 0,
      address: syncDeliveryAddressField(),
      message: error.message === "cep_not_found"
        ? "CEP n\u00e3o encontrado."
        : "N\u00e3o foi poss\u00edvel buscar o CEP agora.",
      quoteCode: "",
      quoteToken: "",
      addressKey: "",
      expiresAt: "",
      distanceKm: 0,
      locationPrecision: "",
      geocoderSource: "",
      validatedAddress: null
    });

    showToast(deliveryState.message);
  } finally {
    if (fields.searchCepButton) {
      fields.searchCepButton.disabled = false;
      fields.searchCepButton.textContent = "Buscar CEP";
    }
  }
}

async function handleCalculateDelivery() {
  if (getCurrentFulfillmentMode() === "pickup") {
    setDeliveryState({
      status: "pickup",
      fee: 0,
      distanceLabel: "",
      distanceRange: "",
      address: STORE_ADDRESS,
      message: "Retirada no balc\u00e3o, sem taxa de entrega.",
      quoteCode: "",
      quoteToken: "",
      addressKey: "",
      expiresAt: "",
      distanceKm: 0,
      locationPrecision: "",
      geocoderSource: "",
      validatedAddress: null
    });
    updateCartTotals();
    return;
  }

  await requestDeliveryQuote({ showMessage: true, quietSuccess: false, reason: "manual" });
}

function setDeliveryState(nextState) {
  deliveryState = {
    ...deliveryState,
    ...nextState
  };

  updateDeliveryUI();
  saveDeliveryData();
}

function updateDeliveryUI() {
  const fields = getDeliveryFields();
  const isPickup = getCurrentFulfillmentMode() === "pickup";
  const hasAcceptedEstimate = Boolean(fields.estimateAck?.checked);
  let feedbackMessage = deliveryState.message || "";
  let feedbackTone = deliveryState.status;

  if (!isPickup && deliveryState.status === "ready" && !hasAcceptedEstimate) {
    feedbackMessage = "Taxa validada. Confirme o aceite abaixo para liberar o envio do pedido para a hamburgueria.";
    feedbackTone = "warning";
  }

  if (fields.feeFeedback) {
    fields.feeFeedback.classList.remove("fee-ok", "fee-warning", "fee-error");
    fields.feeFeedback.textContent = feedbackMessage;
  }

  if (fields.calculateDeliveryButton) {
    fields.calculateDeliveryButton.disabled = deliveryState.status === "loading";
    fields.calculateDeliveryButton.textContent =
      deliveryState.status === "loading"
        ? "Validando..."
        : deliveryState.status === "ready"
          ? "Taxa validada"
          : deliveryState.status === "out_of_range"
            ? "Entrega indispon\u00edvel"
          : "Validar endere\u00e7o e calcular taxa";

    fields.calculateDeliveryButton.classList.toggle("is-success", deliveryState.status === "ready");
  }

  if (fields.quoteSummary) {
    if (isPickup) {
      fields.quoteSummary.textContent = "Retirada no balc\u00e3o, sem taxa de entrega.";
    } else if (deliveryState.status === "ready") {
      const locationMethodCopy = getDeliveryLocationMethodCopy({
        precision: deliveryState.locationPrecision,
        source: deliveryState.geocoderSource
      });
      const summaryParts = [
        "Endere\u00e7o validado pelo servidor.",
        deliveryState.distanceLabel || "",
        deliveryState.distanceKm ? `Dist\u00e2ncia estimada: ${formatDistanceKm(deliveryState.distanceKm)}.` : "",
        locationMethodCopy,
        deliveryState.quoteCode ? `C\u00f3digo da cota\u00e7\u00e3o: ${deliveryState.quoteCode}.` : ""
      ].filter(Boolean);
      fields.quoteSummary.textContent = summaryParts.join(" ");
    } else if (deliveryState.status === "out_of_range") {
      const locationMethodCopy = getDeliveryLocationMethodCopy({
        precision: deliveryState.locationPrecision,
        source: deliveryState.geocoderSource
      });
      fields.quoteSummary.textContent = [
        "Esse endere\u00e7o ficou fora da rota autom\u00e1tica de at\u00e9 5 km. Para seguir, escolha retirada.",
        locationMethodCopy
      ].filter(Boolean).join(" ");
    } else if (deliveryState.status === "loading") {
      fields.quoteSummary.textContent = "A loja est\u00e1 validando o CEP e calculando a rota deste endere\u00e7o...";
    } else {
      fields.quoteSummary.textContent = "Informe o CEP, complete o endere\u00e7o e valide a entrega para calcular a taxa.";
    }
  }

  if (fields.feeLine) {
    if (isPickup) {
      fields.feeLine.textContent = "Entrega: R$ 0,00";
    } else if (deliveryState.status === "ready") {
      fields.feeLine.textContent = `Entrega validada: ${formatCurrency(deliveryState.fee)}`;
    } else if (deliveryState.status === "out_of_range") {
      fields.feeLine.textContent = "Entrega: indispon\u00edvel";
    } else if (deliveryState.status === "loading") {
      fields.feeLine.textContent = "Entrega validada: calculando...";
    } else {
      fields.feeLine.textContent = "Entrega validada: aguardando valida\u00e7\u00e3o";
    }
  }

  if (fields.totalNote) {
    if (isPickup) {
      fields.totalNote.textContent = "Total final para retirada no local";
    } else if (deliveryState.status === "ready") {
      const precisionNote = getDeliveryLocationMethodCopy({
        precision: deliveryState.locationPrecision,
        source: deliveryState.geocoderSource,
        includeProvider: false
      });
      fields.totalNote.textContent = `Taxa validada para este endere\u00e7o: ${deliveryState.distanceLabel}. ${precisionNote} Se o local mudar, a Galaxy Burger exige nova valida\u00e7\u00e3o.`;
    } else if (deliveryState.status === "out_of_range") {
      fields.totalNote.textContent = "Endere\u00e7o fora da \u00e1rea de entrega. Selecione retirada para continuar.";
    } else if (deliveryState.status === "loading") {
      fields.totalNote.textContent = "Validando a entrega...";
    } else {
      fields.totalNote.textContent = "Valide a entrega para atualizar o total";
    }
  }

  if (fields.totalLabel) {
    if (isPickup) {
      fields.totalLabel.textContent = "Total do pedido";
    } else if (deliveryState.status === "out_of_range") {
      fields.totalLabel.textContent = "Subtotal do pedido";
    } else {
      fields.totalLabel.textContent = "Total validado do pedido";
    }
  }

  if (fields.feeFeedback) {
    if (feedbackTone === "ready") fields.feeFeedback.classList.add("fee-ok");
    if (feedbackTone === "out_of_range" || feedbackTone === "warning") fields.feeFeedback.classList.add("fee-warning");
    if (feedbackTone === "error") fields.feeFeedback.classList.add("fee-error");
  }
}

function saveDeliveryData() {
  const values = getDeliveryValues();

  localStorage.setItem(DELIVERY_STORAGE_KEY, JSON.stringify({
    ...values,
    address: syncDeliveryAddressField(),
    deliveryState
  }));
}

function loadDeliveryData() {
  const raw = localStorage.getItem(DELIVERY_STORAGE_KEY);
  if (!raw) return;

  try {
    const saved = JSON.parse(raw);
    const fields = getDeliveryFields();

    if (fields.cep) fields.cep.value = formatCep(saved.cep || "");
    if (fields.street) fields.street.value = saved.street || "";
    if (fields.number) fields.number.value = saved.number || "";
    if (fields.neighborhood) fields.neighborhood.value = saved.neighborhood || "";
    if (fields.complement) fields.complement.value = saved.complement || "";
    if (fields.reference) fields.reference.value = saved.reference || "";
    if (fields.city) fields.city.value = saved.city || "";
    if (fields.state) fields.state.value = saved.state || "";
    if (fields.distanceRange) fields.distanceRange.value = saved.distanceRange || "";
    if (fields.estimateAck) fields.estimateAck.checked = Boolean(saved.estimateAccepted);

    syncDeliveryAddressField();

    if (saved.deliveryState) {
      deliveryState = {
        ...deliveryState,
        ...saved.deliveryState
      };
    }

    if (!isDeliveryQuoteFresh(deliveryState)) {
      deliveryState = {
        ...deliveryState,
        status: "idle",
        fee: 0,
        distanceLabel: "",
        distanceRange: "",
        message: DELIVERY_IDLE_MESSAGE,
        quoteCode: "",
        quoteToken: "",
        addressKey: "",
        expiresAt: "",
        distanceKm: 0,
        locationPrecision: "",
        geocoderSource: "",
        validatedAddress: null
      };
    }

    updateDeliveryUI();
  } catch {
    localStorage.removeItem(DELIVERY_STORAGE_KEY);
  }
}

function clearDeliveryData() {
  localStorage.removeItem(DELIVERY_STORAGE_KEY);
  LEGACY_DELIVERY_STORAGE_KEYS.forEach(storageKey => {
    localStorage.removeItem(storageKey);
  });

  const fields = getDeliveryFields();
  if (fields.estimateAck) fields.estimateAck.checked = false;
  clearEstimateTermsInvalid(fields.estimateTerms, fields.estimateAck);

  deliveryState = {
    status: "idle",
    fee: 0,
    distanceLabel: "",
    distanceRange: "",
    address: "",
    message: DELIVERY_IDLE_MESSAGE,
    quoteCode: "",
    quoteToken: "",
    addressKey: "",
    expiresAt: "",
    distanceKm: 0,
    locationPrecision: "",
    geocoderSource: "",
    validatedAddress: null
  };
}

function getCartTotal() {
  return cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

function hasReachedMinimumOrder(subtotal = getCartTotal()) {
  return subtotal >= MIN_ORDER_AMOUNT;
}

function getMinimumOrderShortfall(subtotal = getCartTotal()) {
  return Math.max(0, MIN_ORDER_AMOUNT - subtotal);
}

function updateMinimumOrderNote(subtotal = getCartTotal()) {
  const note = document.getElementById("minimum-order-note");
  if (!note) return;

  if (!cart.length) {
    note.dataset.status = "idle";
    note.textContent = `Pedido m\u00ednimo da Galaxy Burger: ${formatCurrency(MIN_ORDER_AMOUNT)} em produtos.`;
    return;
  }

  if (hasReachedMinimumOrder(subtotal)) {
    note.dataset.status = "ready";
    note.textContent = `Pedido m\u00ednimo atingido. Subtotal dos produtos: ${formatCurrency(subtotal)}.`;
    return;
  }

  note.dataset.status = "warning";
  note.textContent = `Pedido m\u00ednimo de ${formatCurrency(MIN_ORDER_AMOUNT)} em produtos. Faltam ${formatCurrency(getMinimumOrderShortfall(subtotal))} para liberar o envio.`;
}

function updatePixPanelSummary({ subtotal = getCartTotal(), total = subtotal } = {}) {
  const totalDisplay = document.getElementById("pix-total-display");
  const totalCaption = document.getElementById("pix-total-caption");
  const proofNote = document.getElementById("pix-proof-note");
  const isPickup = getCurrentFulfillmentMode() === "pickup";
  const hasItems = cart.length > 0;
  const meetsMinimumOrder = hasReachedMinimumOrder(subtotal);

  if (totalDisplay) {
    totalDisplay.textContent = formatCurrency(total);
  }

  if (totalCaption) {
    if (!hasItems) {
      totalCaption.textContent = "O valor final do Pix aparece aqui assim que voc\u00ea adicionar itens ao pedido.";
    } else if (!meetsMinimumOrder) {
      totalCaption.textContent = `Faltam ${formatCurrency(getMinimumOrderShortfall(subtotal))} em produtos para liberar o pedido.`;
    } else if (!isPickup && !(deliveryState.status === "ready" && deliveryState.quoteToken)) {
      totalCaption.textContent = "Valide o endere\u00e7o e a taxa de entrega para fechar o valor final do Pix.";
    } else if (isPickup) {
      totalCaption.textContent = "Pague o valor exato da retirada para agilizar a confer\u00eancia da loja.";
    } else {
      totalCaption.textContent = "Pague o valor exato exibido aqui para acelerar a confer\u00eancia do pagamento.";
    }
  }

  if (proofNote) {
    proofNote.textContent = hasItems
      ? "A Galaxy Burger confere o comprovante antes de preparar o pedido. Envie o comprovante na mesma conversa do pedido no WhatsApp oficial."
      : "A Galaxy Burger confere o comprovante antes de preparar o pedido. Assim que voc\u00ea montar o carrinho, o valor final do Pix aparecer\u00e1 aqui.";
  }
}

function getFinalizeButtonLabel() {
  return getCurrentFulfillmentMode() === "pickup"
    ? "Enviar retirada no WhatsApp"
    : "Enviar pedido no WhatsApp";
}

function getFinalizeButton() {
  return document.getElementById("finalize-order-btn") || document.querySelector(".finalize-order-btn");
}

function isFinalizeButtonBusy(button = getFinalizeButton()) {
  return button?.dataset.busy === "true";
}

function setFinalizeButtonBusy(isBusy, label = "Abrindo WhatsApp...") {
  const finalizeButton = getFinalizeButton();
  if (!finalizeButton) return;

  finalizeButton.dataset.busy = isBusy ? "true" : "false";
  finalizeButton.disabled = Boolean(isBusy);

  if (isBusy) {
    finalizeButton.textContent = label;
  }
}

function setOrderTicketConfirmButtonBusy(isBusy, label = "Abrindo WhatsApp...") {
  const confirmButton = document.getElementById("order-ticket-confirm-button");
  if (!confirmButton) return;

  if (!confirmButton.dataset.defaultLabel) {
    confirmButton.dataset.defaultLabel = confirmButton.textContent.trim() || "Enviar no WhatsApp";
  }

  confirmButton.dataset.busy = isBusy ? "true" : "false";
  confirmButton.disabled = Boolean(isBusy);
  confirmButton.textContent = isBusy ? label : confirmButton.dataset.defaultLabel;
}

function resetOrderSubmissionButtons() {
  setFinalizeButtonBusy(false);
  setOrderTicketConfirmButtonBusy(false);
  updateCartTotals();
}

function updateCartTotals() {
  const subtotal = getCartTotal();
  const subtotalEl = document.getElementById("modal-cart-subtotal");
  const totalEl = document.getElementById("modal-cart-total");
  const finalizeButton = getFinalizeButton();
  const storeOpen = getStoreAvailability().isOpen;

  const isPickup = getCurrentFulfillmentMode() === "pickup";
  const hasItems = cart.length > 0;
  const meetsMinimumOrder = hasReachedMinimumOrder(subtotal);
  const hasAcceptedEstimate = Boolean(getDeliveryFields().estimateAck?.checked);
  const hasValidatedDelivery = !isPickup && deliveryState.status === "ready" && Boolean(deliveryState.quoteToken);
  const fee = hasItems && hasValidatedDelivery
    ? deliveryState.fee
    : 0;

  const total = hasItems ? subtotal + fee : 0;

  if (subtotalEl) subtotalEl.textContent = formatCurrency(subtotal);
  if (totalEl) totalEl.textContent = formatCurrency(total);
  updateMinimumOrderNote(subtotal);
  updatePixPanelSummary({ subtotal, total });

  if (finalizeButton) {
    const busy = isFinalizeButtonBusy(finalizeButton);

    finalizeButton.disabled = busy;

    if (!busy) {
      finalizeButton.textContent = !storeOpen
        ? "Loja fechada no momento"
        : hasItems && !meetsMinimumOrder
          ? `Faltam ${formatCurrency(getMinimumOrderShortfall(subtotal))} para o m\u00ednimo`
          : !hasItems
            ? getFinalizeButtonLabel()
            : !isPickup && !hasValidatedDelivery
              ? "Valide o endere\u00e7o para enviar"
              : !isPickup && !hasAcceptedEstimate
                ? "Confirme a entrega para enviar"
                : getFinalizeButtonLabel();
    }
  }

  return {
    subtotal,
    fee,
    total
  };
}

function saveCart() {
  localStorage.setItem("cart", JSON.stringify(cart));
}

function updateUI() {
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

  ["header-cart-count", "mobile-cart-count", "mobile-dock-cart-count"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = totalItems;
  });

  updateModalCart();
  updateOrderAvailabilityUI(getStoreAvailability());
}

function updateModalCart() {
  const container = document.getElementById("modal-cart-items");
  if (!container) return;

  container.innerHTML = "";

  if (!cart.length) {
    container.innerHTML = `<p class="empty-cart">Seu pedido est\u00e1 vazio.</p>`;
    updateCartTotals();
    return;
  }

  cart.forEach((item, index) => {
    const div = document.createElement("div");
    div.className = "cart-item";

    div.innerHTML = `
      <div class="item-info">
        <strong>${item.name}</strong>
        ${item.variantLabel ? `<small>${item.variantLabel}</small>` : ""}
        <span>${formatCurrency(item.price)} por unidade</span>
      </div>

      <div class="item-controls">
        <button type="button" onclick="changeItemQuantity(${index}, -1)">-</button>
        <span>${item.quantity}</span>
        <button type="button" onclick="changeItemQuantity(${index}, 1)">+</button>
      </div>

      <button type="button" class="remove-btn" onclick="removeItem(${index})">Remover</button>
    `;

    container.appendChild(div);
  });

  updateCartTotals();
}

function addItemToCart({ name, price, quantity = 1, variantLabel = "" }) {
  const normalizedVariantLabel = normalizeText(variantLabel);
  const existing = cart.find(item =>
    item.name === name && normalizeText(item.variantLabel) === normalizedVariantLabel
  );

  if (existing) {
    existing.quantity += quantity;
    return;
  }

  cart.push({
    name,
    price,
    quantity,
    ...(normalizedVariantLabel ? { variantLabel: normalizedVariantLabel } : {})
  });
}

function showAddedButtonState(button, temporaryLabel = "Adicionado") {
  if (!button) return;

  const original = button.textContent;
  button.textContent = temporaryLabel;
  button.disabled = true;

  setTimeout(() => {
    button.textContent = button.dataset.label || original;
    button.disabled = false;
  }, 900);
}

function getComboDrinkOptions(card) {
  const customOptions = String(card?.dataset.comboDrinkOptions || "")
    .split("|")
    .map(option => normalizeText(option))
    .filter(Boolean);

  if (customOptions.length) {
    return customOptions;
  }

  return [...DEFAULT_COMBO_DRINK_OPTIONS];
}

function buildComboVariantLabel(selectedDrinks) {
  const drinks = selectedDrinks.map(drink => normalizeText(drink)).filter(Boolean);
  if (!drinks.length) return "";

  return `${drinks.length === 1 ? "Bebida" : "Bebidas"}: ${drinks.join(", ")}`;
}

function getComboDrinkModalElements() {
  return {
    modal: document.getElementById("combo-drink-modal"),
    title: document.getElementById("combo-drink-modal-title"),
    copy: document.getElementById("combo-drink-modal-copy"),
    fields: document.getElementById("combo-drink-fields")
  };
}

function syncBodyModalState() {
  const hasVisibleModal = ["cart-modal", "combo-drink-modal", "order-ticket-modal"].some(id => {
    const modal = document.getElementById(id);
    return modal && !modal.hidden;
  });

  document.body.classList.toggle("modal-open", hasVisibleModal);
}

function closeComboDrinkModal() {
  const { modal, fields } = getComboDrinkModalElements();
  if (!modal) return;

  modal.classList.remove("is-visible");

  setTimeout(() => {
    modal.hidden = true;
    if (fields) fields.innerHTML = "";
    syncBodyModalState();
  }, 220);

  activeComboSelection = null;
}

function openComboDrinkModal(config) {
  const { modal, title, copy, fields } = getComboDrinkModalElements();
  if (!modal || !fields) return;

  activeComboSelection = config;
  modal.hidden = false;
  document.body.classList.add("modal-open");

  if (title) {
    title.textContent = config.drinksCount > 1 ? "Escolha as bebidas" : "Escolha sua bebida";
  }

  if (copy) {
    copy.textContent = config.drinksCount > 1
      ? `Selecione as ${config.drinksCount} bebidas que acompanham o ${config.name}.`
      : `Selecione a bebida que acompanha o ${config.name}.`;
  }

  fields.innerHTML = "";

  for (let index = 0; index < config.drinksCount; index += 1) {
    const wrapper = document.createElement("div");
    wrapper.className = "combo-drink-field";

    const label = document.createElement("label");
    label.className = "field-label";
    label.htmlFor = `combo-drink-select-${index}`;
    label.textContent = config.drinksCount > 1 ? `Bebida ${index + 1}` : "Bebida do combo";

    const select = document.createElement("select");
    select.id = `combo-drink-select-${index}`;
    select.className = "combo-drink-select";
    select.innerHTML = '<option value="">Selecione uma bebida</option>';

    config.options.forEach(option => {
      const optionElement = document.createElement("option");
      optionElement.value = option;
      optionElement.textContent = option;
      select.appendChild(optionElement);
    });

    select.addEventListener("change", () => {
      select.classList.remove("is-invalid");
      select.removeAttribute("aria-invalid");
    });

    wrapper.append(label, select);
    fields.appendChild(wrapper);
  }

  requestAnimationFrame(() => {
    modal.classList.add("is-visible");
  });
}

function addConfiguredComboToCart(config, selectedDrinks) {
  addItemToCart({
    name: config.name,
    price: config.price,
    quantity: 1,
    variantLabel: buildComboVariantLabel(selectedDrinks)
  });

  saveCart();
  updateUI();
  showAddedButtonState(config.button, "Combo adicionado");

  const drinksLabel = selectedDrinks.length
    ? ` com ${selectedDrinks.join(", ")}`
    : "";
  showToast(`${config.name} adicionado${drinksLabel}.`);
}

function confirmComboDrinkSelection() {
  if (!activeComboSelection) return;

  const selects = Array.from(document.querySelectorAll(".combo-drink-select"));
  const selectedDrinks = [];
  let firstInvalidField = null;

  selects.forEach(select => {
    select.classList.remove("is-invalid");
    select.removeAttribute("aria-invalid");

    if (!select.value) {
      select.classList.add("is-invalid");
      select.setAttribute("aria-invalid", "true");
      if (!firstInvalidField) firstInvalidField = select;
      return;
    }

    selectedDrinks.push(select.value);
  });

  if (firstInvalidField) {
    firstInvalidField.focus();
    showToast(
      activeComboSelection.drinksCount > 1
        ? "Selecione todas as bebidas do combo."
        : "Selecione a bebida do combo."
    );
    return;
  }

  addConfiguredComboToCart(activeComboSelection, selectedDrinks);
  closeComboDrinkModal();
}

function addToCart(button) {
  const card = button.closest(".card");
  if (!card) return;

  const name = card.querySelector("h3")?.textContent?.trim();
  const priceText = card.querySelector(".price")?.textContent || "0";
  const price = Number(priceText.replace("R$", "").replace(/\./g, "").replace(",", "."));

  if (!name || Number.isNaN(price)) return;

  if (card.classList.contains("combo-card")) {
    const drinksCount = Number(card.dataset.comboDrinks || 0);
    const drinkOptions = getComboDrinkOptions(card);

    if (drinksCount > 0) {
      if (drinksCount === 1 && drinkOptions.length === 1) {
        addConfiguredComboToCart({
          name,
          price,
          drinksCount,
          options: drinkOptions,
          button
        }, drinkOptions);
        return;
      }

      openComboDrinkModal({
        name,
        price,
        drinksCount,
        options: drinkOptions,
        button
      });
      return;
    }
  }

  addItemToCart({
    name,
    price,
    quantity: 1
  });

  saveCart();
  updateUI();
  showAddedButtonState(button);
  showToast(`${name} adicionado ao pedido.`);
}

function removeItem(index) {
  cart.splice(index, 1);
  saveCart();
  updateUI();
}

function changeItemQuantity(index, delta) {
  if (!cart[index]) return;

  cart[index].quantity += delta;

  if (cart[index].quantity <= 0) {
    removeItem(index);
    return;
  }

  saveCart();
  updateUI();
}

function selectPayment(button) {
  clearPaymentInvalid();
  document.querySelectorAll(".payment-btn").forEach(btn => btn.classList.remove("selected"));
  button.classList.add("selected");

  const paymentField = document.getElementById("payment-method");
  if (paymentField) paymentField.value = button.dataset.payment || "";

  const pixInfo = document.getElementById("pix-info");
  if (pixInfo) {
    pixInfo.hidden = button.dataset.payment !== "pix";
  }

  const cashPanel = document.getElementById("cash-change-panel");
  if (cashPanel) {
    cashPanel.hidden = button.dataset.payment !== "dinheiro";
  }

  updateCashChangeUI();
  updatePixPanelSummary(updateCartTotals());
}

function selectFulfillment(button) {
  document.querySelectorAll(".fulfillment-btn").forEach(btn => btn.classList.remove("selected"));
  button.classList.add("selected");

  const mode = button.dataset.fulfillment || "delivery";
  const field = document.getElementById("order-fulfillment");
  if (field) field.value = mode;

  const deliveryFields = getDeliveryFields();
  const deliveryGroup = document.getElementById("delivery-address-group");
  const pickupPanel = document.getElementById("pickup-panel");

  if (deliveryGroup) deliveryGroup.hidden = mode === "pickup";
  if (pickupPanel) pickupPanel.hidden = mode !== "pickup";
  clearEstimateTermsInvalid(deliveryFields.estimateTerms, deliveryFields.estimateAck);

  if (mode === "pickup") {
    setDeliveryState({
      status: "pickup",
      fee: 0,
      distanceLabel: "",
      distanceRange: "",
      address: STORE_ADDRESS,
      message: "Retirada no balc\u00e3o, sem taxa de entrega.",
      quoteCode: "",
      quoteToken: "",
      addressKey: "",
      expiresAt: "",
      distanceKm: 0,
      locationPrecision: "",
      geocoderSource: "",
      validatedAddress: null
    });
  } else {
    clearDeliveryQuote(DELIVERY_IDLE_MESSAGE);
  }

  updateCartTotals();
}

function copyPixKey() {
  navigator.clipboard?.writeText(PIX_KEY)
    .then(() => showToast(`Chave Pix oficial copiada. No banco, confira se o favorecido \u00e9 ${PIX_BENEFICIARY_NAME}.`))
    .catch(() => showToast(`Chave Pix oficial: ${PIX_KEY}`));
}

function openIfoodStore(event) {
  if (event) event.preventDefault();
  if (!ensureStoreIsOpen(true)) return false;

  if (window.matchMedia("(max-width: 860px)").matches) {
    window.location.href = IFOOD_STORE_URL;
  } else {
    window.open(IFOOD_STORE_URL, "_blank", "noopener");
  }

  return false;
}

function updateOrderAvailabilityUI(availability = getStoreAvailability()) {
  const footerStatus = document.getElementById("footer-store-status");
  const cartStatusStrip = document.getElementById("cart-order-status-strip");
  const cartStatusLabel = document.getElementById("cart-order-status-label");
  const cartStatusMessage = document.getElementById("cart-order-status-message");
  const checkoutHelper = document.getElementById("checkout-helper");
  const subtotal = getCartTotal();
  const minimumOrderCopy = `Pedido m\u00ednimo: ${formatCurrency(MIN_ORDER_AMOUNT)} em produtos.`;
  const orderLinks = document.querySelectorAll('a[onclick*="openIfoodStore"]');

  orderLinks.forEach(link => {
    if (!link.dataset.defaultLabel) {
      link.dataset.defaultLabel = link.textContent.trim();
    }

    link.classList.toggle("is-disabled", !availability.isOpen);
    link.setAttribute("aria-disabled", String(!availability.isOpen));
    link.textContent = availability.isOpen ? link.dataset.defaultLabel : "Loja fechada";
  });

  if (cartStatusStrip) {
    cartStatusStrip.dataset.open = String(availability.isOpen);
  }

  if (cartStatusLabel) {
    cartStatusLabel.textContent = !availability.scheduleEnforced
      ? "Pedidos liberados para teste"
      : availability.isOpen
      ? "Loja aberta no momento"
      : "Loja fechada no momento";
  }

  if (cartStatusMessage) {
    cartStatusMessage.textContent = !availability.scheduleEnforced
      ? "Modo de valida\u00e7\u00e3o ativo. O bloqueio por hor\u00e1rio foi desativado temporariamente para voc\u00ea testar o checkout, inclusive o envio do pedido para a hamburgueria."
      : availability.isOpen
      ? "Valide o endere\u00e7o, escolha o pagamento e toque no bot\u00e3o vermelho para abrir o WhatsApp oficial."
      : `${getStoreClosedOrderMessage(availability)} Voc\u00ea pode montar o carrinho normalmente, mas o envio do pedido fica liberado apenas no hor\u00e1rio de funcionamento.`;
  }

  if (checkoutHelper) {
    checkoutHelper.textContent = !availability.scheduleEnforced
      ? `Modo de testes ativo: o envio para a hamburgueria est\u00e1 liberado temporariamente para validar o fluxo completo do pedido. ${minimumOrderCopy}`
      : availability.isOpen
      ? `Para entrega, o bot\u00e3o vermelho abre o WhatsApp oficial da Galaxy Burger com o pedido preenchido. ${minimumOrderCopy}`
      : `${getStoreClosedOrderMessage(availability)} Monte seu carrinho normalmente; o envio pelo WhatsApp fica bloqueado at\u00e9 a reabertura. ${minimumOrderCopy}`;
  }

  if (availability.isOpen && cart.length && cartStatusLabel && cartStatusMessage && !hasReachedMinimumOrder(subtotal)) {
    cartStatusLabel.textContent = "Pedido m\u00ednimo n\u00e3o atingido";
    cartStatusMessage.textContent = `Adicione mais ${formatCurrency(getMinimumOrderShortfall(subtotal))} em produtos para liberar o envio do pedido para a hamburgueria.`;
  }

  if (footerStatus) {
    footerStatus.textContent = !availability.scheduleEnforced
      ? "Status atual: modo de testes ativo, com pedidos liberados temporariamente."
      : availability.isOpen
      ? `Status atual: aberta at\u00e9 ${formatStoreTimeLabel(availability.todaySchedule?.closeMinutes || 0)}.`
      : `Status atual: fechada. ${formatNextOpeningMessage(availability.nextOpen)}`;
  }
}

function openCartModal() {
  const modal = document.getElementById("cart-modal");
  if (!modal) return;

  logCheckoutInfo("Abrindo carrinho.", {
    items: getCartItemsCount(),
    subtotal: getCartTotal()
  });
  cartModalHiddenForOrderTicket = false;
  modal.hidden = false;
  document.body.classList.add("modal-open");
  updateModalCart();

  requestAnimationFrame(() => {
    modal.classList.add("is-visible");
    modal.querySelector(".cart-modal-content")?.focus();
  });
}

function closeCartModal() {
  const modal = document.getElementById("cart-modal");
  if (!modal) return;

  logCheckoutInfo("Fechando carrinho.");
  cartModalHiddenForOrderTicket = false;
  modal.classList.remove("is-visible");

  setTimeout(() => {
    modal.hidden = true;
    syncBodyModalState();
  }, 220);
}

function toggleMobileNav() {
  const nav = document.getElementById("mobile-nav");
  const toggle = document.querySelector(".menu-toggle");
  if (!nav || !toggle) return;

  const isOpen = !nav.hidden;

  if (isOpen) {
    closeMobileNav();
    return;
  }

  nav.hidden = false;
  document.body.classList.add("menu-open");
  toggle.setAttribute("aria-expanded", "true");
}

function closeMobileNav() {
  const nav = document.getElementById("mobile-nav");
  const toggle = document.querySelector(".menu-toggle");
  if (!nav || !toggle) return;

  nav.hidden = true;
  document.body.classList.remove("menu-open");
  toggle.setAttribute("aria-expanded", "false");
}

function formatPaymentLabel(payment) {
  const labels = {
    pix: "Pix",
    dinheiro: "Dinheiro",
    "cartao de credito": "Cart\u00E3o de cr\u00E9dito",
    "cartao de debito": "Cart\u00E3o de d\u00E9bito"
  };

  return labels[payment] || payment;
}

function formatTicketPaymentLabel(payment) {
  const labels = {
    pix: "Pix",
    dinheiro: "Dinheiro",
    "cartao de credito": "Cart\u00e3o de cr\u00e9dito",
    "cartao de debito": "Cart\u00e3o de d\u00e9bito",
    "Cart\u00E3o de cr\u00E9dito": "Cart\u00e3o de cr\u00e9dito",
    "Cart\u00E3o de d\u00E9bito": "Cart\u00e3o de d\u00e9bito"
  };

  return labels[payment] || payment;
}

const TICKET_EMOJI_PATTERN = (() => {
  try {
    return new RegExp("[\\p{Extended_Pictographic}\\p{Regional_Indicator}\\u200D\\uFE0F]", "gu");
  } catch {
    return /[\u200D\uFE0F]/g;
  }
})();

function sanitizeTicketText(value) {
  return String(value ?? "")
    .replace(/[#*`_~]/g, "")
    .replace(TICKET_EMOJI_PATTERN, "")
    .trim();
}

function hideCartModalForOrderTicket() {
  const cartModal = document.getElementById("cart-modal");
  if (!cartModal || cartModal.hidden) {
    cartModalHiddenForOrderTicket = false;
    return;
  }

  cartModal.classList.remove("is-visible");
  cartModal.hidden = true;
  cartModalHiddenForOrderTicket = true;
}

function restoreCartModalAfterOrderTicket() {
  if (!cartModalHiddenForOrderTicket) {
    return;
  }

  const cartModal = document.getElementById("cart-modal");
  if (!cartModal) {
    cartModalHiddenForOrderTicket = false;
    return;
  }

  cartModal.hidden = false;

  requestAnimationFrame(() => {
    cartModal.classList.add("is-visible");
    syncBodyModalState();
  });

  cartModalHiddenForOrderTicket = false;
}

function chunkTicketWord(word, maxWidth = ORDER_TICKET_WIDTH) {
  const text = String(word || "");
  const chunks = [];

  for (let index = 0; index < text.length; index += maxWidth) {
    chunks.push(text.slice(index, index + maxWidth));
  }

  return chunks.length ? chunks : [""];
}

function wrapTicketLine(line, maxWidth = ORDER_TICKET_WIDTH) {
  const originalText = String(line ?? "");
  const text = /^https?:\/\//i.test(originalText)
    ? originalText
    : sanitizeTicketText(originalText);

  if (!text) {
    return [""];
  }

  if (text === ORDER_TICKET_DIVIDER) {
    return [text];
  }

  if (/^https?:\/\//i.test(text)) {
    return [text];
  }

  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) {
    return [""];
  }

  const wrapped = [];
  let currentLine = "";

  words.forEach(word => {
    const parts = word.length > maxWidth ? chunkTicketWord(word, maxWidth) : [word];

    parts.forEach(part => {
      if (!currentLine) {
        currentLine = part;
        return;
      }

      const candidate = `${currentLine} ${part}`;
      if (candidate.length <= maxWidth) {
        currentLine = candidate;
        return;
      }

      wrapped.push(currentLine);
      currentLine = part;
    });
  });

  if (currentLine) {
    wrapped.push(currentLine);
  }

  return wrapped;
}

function formatTicketLines(lines) {
  const wrappedLines = [];

  lines.forEach(line => {
    wrapTicketLine(line).forEach(wrappedLine => {
      wrappedLines.push(wrappedLine);
    });
  });

  return wrappedLines.join("\n").trim();
}

function generateMapsLink(address) {
  const query = encodeURIComponent(sanitizeTicketText(address));
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

function buildDeliveryAddressData({ isPickup, deliveryValues = {}, address = "" }) {
  if (isPickup) {
    return {
      ticketAddressLines: [...STORE_ADDRESS_LINES],
      compactAddressLine: STORE_ADDRESS,
      courierAddressLine: STORE_ADDRESS,
      complementText: "",
      referenceText: "Retirada no local",
      mapsQueryAddress: STORE_ADDRESS
    };
  }

  const street = normalizeText(deliveryValues.street);
  const number = normalizeText(deliveryValues.number);
  const neighborhood = normalizeText(deliveryValues.neighborhood);
  const city = normalizeText(deliveryValues.city);
  const state = normalizeText(deliveryValues.state).toUpperCase();
  const complement = normalizeText(deliveryValues.complement);
  const reference = normalizeText(deliveryValues.reference);
  const cep = formatCep(deliveryValues.cep || "");
  const streetLine = street ? (number ? `${street}, ${number}` : street) : address;
  const cityState = [city, state].filter(Boolean).join("/");
  const locationLine = [neighborhood, cityState].filter(Boolean).join(" - ");
  const ticketAddressLines = [streetLine, locationLine].filter(Boolean);
  const compactAddressLine = [streetLine, complement, neighborhood, cityState]
    .filter(Boolean)
    .join(" - ");

  if (complement) {
    ticketAddressLines.push(`Complemento: ${complement}`);
  }

  if (cep) {
    ticketAddressLines.push(`CEP: ${cep}`);
  }

  const courierAddressLine = [streetLine, locationLine].filter(Boolean).join(" - ") || address;
  const mapsQueryAddress = [streetLine, neighborhood, city, state, cep, "Brasil"]
    .filter(Boolean)
    .join(", ");

  return {
    ticketAddressLines,
    compactAddressLine,
    courierAddressLine,
    complementText: complement,
    referenceText: reference || "N\u00e3o informado",
    mapsQueryAddress: mapsQueryAddress || address
  };
}

function getOrderCreatedAtLabel(date = new Date()) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: STORE_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date).replace(",", "");
}

function getOrderLineItems() {
  return cart.map(item => {
    const lineTotal = item.price * item.quantity;

    return {
      name: item.name,
      quantity: item.quantity,
      variantLabel: normalizeText(item.variantLabel),
      unitPrice: item.price,
      lineTotal,
      unitPriceLabel: formatCurrency(item.price),
      lineTotalLabel: formatCurrency(lineTotal)
    };
  });
}

function buildTicketItemsLines({ detailed = false } = {}) {
  const orderItems = getOrderLineItems();
  const lines = [];

  orderItems.forEach((item, index) => {
    lines.push(`${item.quantity}x ${item.name}`);

    if (item.variantLabel) {
      lines.push(`Obs item: ${item.variantLabel}`);
    }

    if (detailed) {
      lines.push(`Unit\u00e1rio: ${item.unitPriceLabel}`);
      lines.push(`Total item: ${item.lineTotalLabel}`);
    }

    if (index < orderItems.length - 1) {
      lines.push("");
    }
  });

  return lines;
}

function buildOrderPaymentLines({ paymentMethod, paymentLabel, cashChangeText }) {
  const normalizedPaymentMethod = String(paymentMethod || "").toLowerCase();
  const resolvedPaymentLabel = paymentLabel || formatPaymentLabel(paymentMethod);
  const paymentLines = [];

  if (normalizedPaymentMethod === "pix") {
    paymentLines.push("Pix - aguardando comprovante");
  } else {
    paymentLines.push(resolvedPaymentLabel);
  }

  if (normalizedPaymentMethod === "dinheiro") {
    paymentLines.push(`Troco: ${cashChangeText || "N\u00e3o precisa de troco."}`);
  }

  return paymentLines;
}

function buildOrderAddressPreviewLines({ isPickup, address, deliveryValues }) {
  const addressData = buildDeliveryAddressData({ isPickup, deliveryValues, address });
  const addressLines = [...addressData.ticketAddressLines];

  if (!isPickup) {
    addressLines.push(`Refer\u00eancia: ${addressData.referenceText}`);
  }

  return {
    addressData,
    addressLines
  };
}

function getDeliveryQuoteStatusCopy(quote) {
  const status = quote?.validationStatus || "";

  if (status === "loading") return "Verificando cota\u00e7\u00e3o no servidor";
  if (status === "invalid") return "Cota\u00e7\u00e3o inv\u00e1lida ou comanda alterada";
  if (status === "expired") return "Cota\u00e7\u00e3o expirada";

  return "Taxa validada pelo servidor";
}

function getDeliveryQuotePrecisionCopy(quote, options = {}) {
  return getDeliveryLocationMethodCopy({
    precision: quote?.locationPrecision,
    source: quote?.geocoderSource,
    includeProvider: options.includeProvider !== false
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function encodeBase64UrlText(value) {
  const text = String(value || "");
  let binary = "";

  if (typeof TextEncoder === "function") {
    const bytes = new TextEncoder().encode(text);

    for (let index = 0; index < bytes.length; index += 1) {
      binary += String.fromCharCode(bytes[index]);
    }
  } else {
    binary = encodeURIComponent(text).replace(/%([0-9A-F]{2})/gi, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    );
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeBase64UrlText(value) {
  const normalized = String(value || "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  const binary = atob(`${normalized}${padding}`);

  if (typeof TextDecoder === "function") {
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return new TextDecoder().decode(bytes);
  }

  let encodedText = "";

  for (let index = 0; index < binary.length; index += 1) {
    encodedText += `%${binary.charCodeAt(index).toString(16).padStart(2, "0")}`;
  }

  return decodeURIComponent(encodedText);
}

function resolveOrderTicketBaseUrl() {
  const configuredBaseUrl = normalizeText(PUBLIC_ORDER_TICKET_BASE_URL);
  if (configuredBaseUrl) {
    try {
      return new URL(configuredBaseUrl);
    } catch {
      return null;
    }
  }

  const currentHref = String(window?.location?.href || "").trim();
  const isHttpPage = /^https?:\/\//i.test(currentHref);
  if (!isHttpPage) {
    return null;
  }

  try {
    const currentUrl = new URL(currentHref);
    const isLocalHost = /^(localhost|127\.0\.0\.1)$/i.test(currentUrl.hostname);
    if (isLocalHost) {
      return null;
    }

    return currentUrl;
  } catch {
    return null;
  }
}

function buildSharedOrderTicketUrl(orderDetails) {
  const baseUrl = resolveOrderTicketBaseUrl();

  if (!orderDetails || !baseUrl) {
    return "";
  }

  const sharedPayload = {
    d: orderDetails.createdAt,
    n: orderDetails.name,
    o: orderDetails.notes,
    p: orderDetails.isPickup ? 1 : 0,
    m: orderDetails.mapsLink || "",
    y: Array.isArray(orderDetails.paymentLines) ? orderDetails.paymentLines : [],
    f: Number(orderDetails.deliveryFeeValue || 0),
    s: Number(orderDetails.subtotalValue || 0),
    t: Number(orderDetails.totalValue || 0),
    v: orderDetails.isPickup ? [] : [
      orderDetails.deliveryValues?.cep || "",
      orderDetails.deliveryValues?.street || "",
      orderDetails.deliveryValues?.number || "",
      orderDetails.deliveryValues?.neighborhood || "",
      orderDetails.deliveryValues?.city || "",
      orderDetails.deliveryValues?.state || "",
      orderDetails.deliveryValues?.complement || "",
      orderDetails.deliveryValues?.reference || ""
    ],
    q: orderDetails.deliveryQuote
      ? [
          orderDetails.deliveryQuote.token || "",
          orderDetails.deliveryQuote.code || "",
          orderDetails.deliveryQuote.expiresAt || "",
          Number(orderDetails.deliveryQuote.distanceKm || 0),
          orderDetails.deliveryQuote.zone || "",
          orderDetails.deliveryQuote.zoneLabel || "",
          orderDetails.deliveryQuote.addressKey || "",
          orderDetails.deliveryQuote.locationPrecision || "",
          orderDetails.deliveryQuote.geocoderSource || ""
        ]
      : [],
    i: Array.isArray(orderDetails.items)
      ? orderDetails.items.map(item => [
          Number(item.quantity || 0),
          item.name || "",
          item.variantLabel || "",
          Number(item.unitPrice || 0)
        ])
      : []
  };
  const url = new URL(baseUrl.toString());

  url.search = "";
  url.hash = "";
  url.searchParams.set("t", encodeBase64UrlText(JSON.stringify(sharedPayload)));
  return url.toString();
}

function decodeSharedOrderTicketPayload(encodedTicket) {
  if (!encodedTicket) {
    return null;
  }

  try {
    const rawPayload = JSON.parse(decodeBase64UrlText(encodedTicket));
    const isPickup = Boolean(rawPayload.p);
    const rawDeliveryValues = Array.isArray(rawPayload.v) ? rawPayload.v : [];
    const deliveryValues = isPickup ? {} : {
      cep: normalizeCep(rawDeliveryValues[0]),
      street: normalizeText(rawDeliveryValues[1]),
      number: normalizeText(rawDeliveryValues[2]),
      neighborhood: normalizeText(rawDeliveryValues[3]),
      city: normalizeText(rawDeliveryValues[4]),
      state: normalizeText(rawDeliveryValues[5]).toUpperCase(),
      complement: normalizeText(rawDeliveryValues[6]),
      reference: normalizeText(rawDeliveryValues[7])
    };
    const addressData = buildDeliveryAddressData({
      isPickup,
      deliveryValues,
      address: Array.isArray(rawPayload.a)
        ? rawPayload.a.map(line => normalizeText(line)).filter(Boolean).join(" - ")
        : ""
    });
    const items = Array.isArray(rawPayload.i)
      ? rawPayload.i.map(item => {
          const quantity = Number(item?.[0] || 0);
          const name = normalizeText(item?.[1]);
          const variantLabel = normalizeText(item?.[2]);
          const unitPrice = Number(item?.[3] || 0);
          const lineTotal = quantity * unitPrice;

          return {
            name,
            quantity,
            variantLabel,
            unitPrice,
            lineTotal,
            unitPriceLabel: formatCurrency(unitPrice),
            lineTotalLabel: formatCurrency(lineTotal)
          };
        }).filter(item => item.name && item.quantity > 0)
      : [];
    const subtotalValue = Number(rawPayload.s || 0);
    const totalValue = Number(rawPayload.t || 0);
    const deliveryFeeValue = Number(rawPayload.f || 0);
    const rawQuote = Array.isArray(rawPayload.q) ? rawPayload.q : [];
    const deliveryQuote = !isPickup && rawQuote.length
      ? {
          token: String(rawQuote[0] || "").trim(),
          code: normalizeText(rawQuote[1]),
          expiresAt: String(rawQuote[2] || "").trim(),
          distanceKm: Number(rawQuote[3] || 0),
          zone: normalizeText(rawQuote[4]),
          zoneLabel: normalizeText(rawQuote[5]),
          addressKey: normalizeText(rawQuote[6]),
          locationPrecision: normalizeText(rawQuote[7]),
          geocoderSource: normalizeText(rawQuote[8]),
          validationStatus: "loading"
        }
      : null;

    return {
      createdAt: normalizeText(rawPayload.d) || getOrderCreatedAtLabel(),
      name: normalizeText(rawPayload.n),
      notes: normalizeText(rawPayload.o),
      isPickup,
      fulfillmentLabel: isPickup ? "Retirada" : "Entrega",
      items,
      itemsCount: items.reduce((sum, item) => sum + item.quantity, 0),
      addressLines: [...addressData.ticketAddressLines, ...(isPickup ? [] : [`Refer\u00eancia: ${addressData.referenceText}`])],
      mapsLink: String(rawPayload.m || "").trim(),
      paymentSummary: Array.isArray(rawPayload.y)
        ? rawPayload.y.map(line => normalizeText(line)).filter(Boolean).join(" | ")
        : "",
      paymentLines: Array.isArray(rawPayload.y)
        ? rawPayload.y.map(line => normalizeText(line)).filter(Boolean)
        : [],
      addressData,
      deliveryValues,
      deliveryQuote,
      deliveryFeeValue,
      deliveryFeeLabel: isPickup ? "Sem taxa de entrega" : formatCurrency(deliveryFeeValue),
      feeLabelTitle: isPickup ? "Retirada" : "Entrega validada",
      subtotalValue,
      subtotalLabel: formatCurrency(subtotalValue),
      totalValue,
      totalLabel: formatCurrency(totalValue)
    };
  } catch {
    return null;
  }
}

function buildOrderTicketPreviewMarkup(orderDetails) {
  if (!orderDetails) {
    return `<p class="empty-cart">Nenhuma comanda pronta no momento.</p>`;
  }

  const addressMarkup = orderDetails.addressLines
    .map(line => `<p>${escapeHtml(line)}</p>`)
    .join("");
  const paymentMarkup = orderDetails.paymentLines
    .map(line => `<p>${escapeHtml(line)}</p>`)
    .join("");
  const itemsMarkup = orderDetails.items
    .map(item => `
      <article class="order-ticket-item">
        <div class="order-ticket-item-copy">
          <strong>${escapeHtml(`${item.quantity}x ${item.name}`)}</strong>
          ${item.variantLabel ? `<span>${escapeHtml(item.variantLabel)}</span>` : ""}
          <small>${escapeHtml(`${item.unitPriceLabel} por unidade`)}</small>
        </div>
        <strong class="order-ticket-item-total">${escapeHtml(item.lineTotalLabel)}</strong>
      </article>
    `)
    .join("");
  const notesMarkup = orderDetails.notes
    ? `<p>${escapeHtml(orderDetails.notes)}</p>`
    : `<p>Sem observa\u00e7\u00f5es adicionais.</p>`;
  const mapsLinkMarkup = !orderDetails.isPickup && orderDetails.mapsLink
    ? `<a class="order-ticket-link" href="${escapeHtml(orderDetails.mapsLink)}" target="_blank" rel="noopener noreferrer">Abrir no mapa</a>`
    : "";
  const deliveryQuoteMarkup = !orderDetails.isPickup && orderDetails.deliveryQuote?.code
    ? `
      <section class="order-ticket-section">
        <span class="order-ticket-section-label">Valida\u00e7\u00e3o da entrega</span>
        <div class="order-ticket-note">
          <p>${escapeHtml(getDeliveryQuoteStatusCopy(orderDetails.deliveryQuote))}</p>
          <p>${escapeHtml(`C\u00f3digo: ${orderDetails.deliveryQuote.code}`)}</p>
          ${orderDetails.deliveryQuote.zoneLabel ? `<p>${escapeHtml(orderDetails.deliveryQuote.zoneLabel)}</p>` : ""}
          ${orderDetails.deliveryQuote.distanceKm ? `<p>${escapeHtml(`Dist\u00e2ncia estimada: ${formatDistanceKm(orderDetails.deliveryQuote.distanceKm)}`)}</p>` : ""}
          ${getDeliveryQuotePrecisionCopy(orderDetails.deliveryQuote) ? `<p>${escapeHtml(getDeliveryQuotePrecisionCopy(orderDetails.deliveryQuote))}</p>` : ""}
        </div>
      </section>
    `
    : "";

  return `
    <div class="order-ticket-sheet">
      <div class="order-ticket-sheet-header">
        <div>
          <span class="order-ticket-brand">Galaxy Burger</span>
          <strong>Comanda detalhada</strong>
          <span>Gerada em ${escapeHtml(orderDetails.createdAt)}</span>
        </div>
        <div>
          <span>${escapeHtml(orderDetails.fulfillmentLabel)}</span>
          <strong>${escapeHtml(orderDetails.totalLabel)}</strong>
          <span>${escapeHtml(`${orderDetails.itemsCount} item(ns) no pedido`)}</span>
        </div>
      </div>

      <div class="order-ticket-meta-grid">
        <div class="order-ticket-meta-card">
          <span>Cliente</span>
          <strong>${escapeHtml(orderDetails.name)}</strong>
        </div>
        <div class="order-ticket-meta-card">
          <span>Pagamento</span>
          <strong>${escapeHtml(orderDetails.paymentSummary)}</strong>
        </div>
        <div class="order-ticket-meta-card">
          <span>Status</span>
          <strong>${escapeHtml(orderDetails.statusLabel || "Pronto para enviar")}</strong>
        </div>
      </div>

      <section class="order-ticket-section">
        <span class="order-ticket-section-label">${escapeHtml(orderDetails.fulfillmentLabel)}</span>
        <div class="order-ticket-address">${addressMarkup}</div>
        ${mapsLinkMarkup}
      </section>

      <section class="order-ticket-section">
        <span class="order-ticket-section-label">Itens</span>
        <div class="order-ticket-items">${itemsMarkup}</div>
      </section>

      <section class="order-ticket-section">
        <span class="order-ticket-section-label">Observa\u00e7\u00f5es</span>
        <div class="order-ticket-note">${notesMarkup}</div>
      </section>

      ${deliveryQuoteMarkup}

      <section class="order-ticket-section">
        <span class="order-ticket-section-label">Pagamento</span>
        <div class="order-ticket-payment">${paymentMarkup}</div>
        <div class="order-ticket-totals">
          <div class="order-ticket-total-row">
            <span>Subtotal dos produtos</span>
            <strong>${escapeHtml(orderDetails.subtotalLabel)}</strong>
          </div>
          <div class="order-ticket-total-row">
            <span>${escapeHtml(orderDetails.feeLabelTitle)}</span>
            <strong>${escapeHtml(orderDetails.deliveryFeeLabel)}</strong>
          </div>
          <div class="order-ticket-total-row is-total">
            <span>Total do pedido</span>
            <strong>${escapeHtml(orderDetails.totalLabel)}</strong>
          </div>
        </div>
      </section>
    </div>
  `;
}

function buildOrderTicketPrintDocument(orderDetails) {
  const previewMarkup = buildOrderTicketPreviewMarkup(orderDetails);

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Comanda Galaxy Burger</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 16px;
      font-family: Arial, sans-serif;
      background: #f3f3f3;
      color: #111111;
    }
    .print-shell {
      width: min(100%, 420px);
      margin: 0 auto;
      padding: 18px;
      border: 1px solid #d6d6d6;
      background: #ffffff;
    }
    .order-ticket-sheet { display: grid; gap: 16px; }
    .order-ticket-sheet-header {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding-bottom: 12px;
      border-bottom: 1px solid #d9d9d9;
    }
    .order-ticket-sheet-header p { margin: 0; }
    .order-ticket-sheet-header strong {
      display: block;
      margin-top: 4px;
      font-size: 1.35rem;
    }
    .order-ticket-sheet-header span,
    .order-ticket-section-label,
    .order-ticket-meta-card span,
    .order-ticket-total-row span,
    .order-ticket-item-copy small {
      color: #5a5a5a;
      font-size: 0.84rem;
    }
    .order-ticket-brand {
      text-transform: uppercase;
      font-weight: 700;
      letter-spacing: 0.06em;
      color: #1b5d3f;
    }
    .order-ticket-meta-grid,
    .order-ticket-actions {
      display: grid;
      gap: 10px;
      grid-template-columns: 1fr;
    }
    .order-ticket-meta-card,
    .order-ticket-section {
      padding: 12px;
      border: 1px solid #d9d9d9;
      border-radius: 12px;
      background: #ffffff;
    }
    .order-ticket-meta-card strong,
    .order-ticket-total-row strong,
    .order-ticket-item-total {
      color: #111111;
    }
    .order-ticket-address,
    .order-ticket-payment,
    .order-ticket-note {
      display: grid;
      gap: 6px;
      margin-top: 10px;
    }
    .order-ticket-address p,
    .order-ticket-payment p,
    .order-ticket-note p {
      margin: 0;
    }
    .order-ticket-link,
    .order-ticket-actions {
      display: none !important;
    }
    .order-ticket-items {
      display: grid;
      gap: 10px;
      margin-top: 12px;
    }
    .order-ticket-item {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding-top: 10px;
      border-top: 1px solid #e5e5e5;
    }
    .order-ticket-item:first-child {
      padding-top: 0;
      border-top: 0;
    }
    .order-ticket-item-copy strong,
    .order-ticket-item-copy span,
    .order-ticket-item-copy small {
      display: block;
    }
    .order-ticket-item-copy span {
      margin-top: 5px;
      font-size: 0.88rem;
    }
    .order-ticket-totals {
      display: grid;
      gap: 8px;
      margin-top: 12px;
    }
    .order-ticket-total-row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
    }
    .order-ticket-total-row.is-total {
      padding-top: 10px;
      border-top: 1px dashed #bdbdbd;
    }
    .order-ticket-total-row.is-total span,
    .order-ticket-total-row.is-total strong {
      color: #000000;
      font-size: 1rem;
      font-weight: 700;
    }
    @page {
      margin: 8mm;
    }
    @media print {
      body {
        padding: 0;
        background: #ffffff;
      }
      .print-shell {
        width: auto;
        margin: 0;
        padding: 0;
        border: 0;
      }
    }
  </style>
</head>
<body>
  <div class="print-shell">${previewMarkup}</div>
  <script>
    window.addEventListener("load", () => {
      window.setTimeout(() => window.print(), 120);
    });
  </script>
</body>
</html>`;
}

function getCartItemsCount() {
  return cart.reduce((sum, item) => sum + item.quantity, 0);
}

function buildWhatsAppOrderMessage({
  name,
  isPickup,
  address,
  deliveryValues,
  deliveryQuote,
  deliveryFee,
  subtotal,
  total,
  paymentMethod,
  paymentLabel,
  cashChangeText,
  notes,
  createdAt,
  ticketUrl
}) {
  const addressData = buildDeliveryAddressData({ isPickup, deliveryValues, address });
  const itemsCount = getCartItemsCount();
  const paymentLines = buildOrderPaymentLines({
    paymentMethod,
    paymentLabel: formatTicketPaymentLabel(paymentMethod || paymentLabel),
    cashChangeText
  }).map(line => line === "Pix - aguardando comprovante" ? "Pix - AGUARDANDO COMPROVANTE" : line);

  const lines = [
    "NOTA - GALAXY BURGER",
    ORDER_TICKET_DIVIDER,
    "NOVO PEDIDO",
    `Data: ${createdAt || getOrderCreatedAtLabel()}`,
    ""
  ];

  if (isPickup) {
    lines.push(
      "RETIRADA:",
      addressData.compactAddressLine || STORE_ADDRESS
    );
  } else {
    lines.push(
      "ENTREGA:",
      addressData.compactAddressLine || address,
      `Refer\u00eancia: ${addressData.referenceText}`
    );
  }

  lines.push(
    "",
    `Nome: ${name}`,
    `Pedido: ${itemsCount}`,
    "",
    "Itens:",
    ...buildTicketItemsLines({ detailed: false })
  );

  if (notes) {
    lines.push(
      "",
      "Observa\u00e7\u00f5es:",
      notes
    );
  }

  lines.push(
    "",
    "Pagamento:",
    ...paymentLines,
    "",
    `Subtotal: ${subtotal}`
  );

  lines.push(`Entrega: ${deliveryFee}`);

  if (!isPickup && deliveryQuote?.code) {
    lines.push(
      "",
      "Validacao da entrega:",
      `${deliveryQuote.code}${deliveryQuote.zoneLabel ? ` | ${deliveryQuote.zoneLabel}` : ""}${deliveryQuote.distanceKm ? ` | ${formatDistanceKm(deliveryQuote.distanceKm)}` : ""}`
    );

    const precisionLine = getDeliveryQuotePrecisionCopy(deliveryQuote, { includeProvider: false });
    if (precisionLine) {
      lines.push(precisionLine);
    }
  }

  lines.push(
    `Total: ${total}`,
    "",
    ORDER_TICKET_DIVIDER,
    "Pedido sujeito a confirma\u00e7\u00e3o."
  );

  if (ticketUrl) {
    lines.push(
      "",
      "Comanda para impress\u00e3o:",
      ticketUrl
    );
  }

  return formatTicketLines(lines);
}

function encodeWhatsAppMessage(message) {
  return encodeURIComponent(String(message || "").replace(/\r\n/g, "\n").trim());
}

function buildWhatsAppUrl(message) {
  const normalizedMessage = String(message || "").replace(/\r\n/g, "\n").trim();
  const encodedMessage = encodeWhatsAppMessage(normalizedMessage);
  return `${WHATSAPP_ORDER_BASE_URL}?phone=${encodeURIComponent(STORE_WHATSAPP)}&text=${encodedMessage}&type=phone_number&app_absent=0`;
}

function buildWhatsAppDeepLink(message) {
  const normalizedMessage = String(message || "").replace(/\r\n/g, "\n").trim();
  const encodedMessage = encodeWhatsAppMessage(normalizedMessage);
  return `whatsapp://send?phone=${encodeURIComponent(STORE_WHATSAPP)}&text=${encodedMessage}`;
}

function isProbablyMobileCheckoutClient() {
  const userAgent = String(window.navigator?.userAgent || "");
  const matchesMobileViewport = typeof window.matchMedia === "function"
    && window.matchMedia("(max-width: 860px)").matches;

  return matchesMobileViewport
    || /Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(userAgent)
    || Number(window.navigator?.maxTouchPoints || 0) > 1;
}

function clearActiveWhatsAppAttempt(attempt = activeWhatsAppAttempt) {
  if (!attempt) return;

  if (attempt.fallbackTimer) {
    window.clearTimeout(attempt.fallbackTimer);
  }

  if (attempt.failureTimer) {
    window.clearTimeout(attempt.failureTimer);
  }

  if (attempt.visibilityHandler) {
    document.removeEventListener("visibilitychange", attempt.visibilityHandler);
  }

  if (attempt.pageHideHandler) {
    window.removeEventListener("pagehide", attempt.pageHideHandler);
  }

  if (activeWhatsAppAttempt === attempt) {
    activeWhatsAppAttempt = null;
  }
}

function finalizeSuccessfulOrderSubmission(attempt, trigger) {
  if (!attempt || attempt.completed) return;

  attempt.completed = true;
  clearActiveWhatsAppAttempt(attempt);

  logCheckoutInfo("Pedido encaminhado para o WhatsApp.", {
    trigger,
    source: attempt.source,
    urlLength: attempt.browserUrl.length
  });

  cart = [];
  saveCart();
  clearDeliveryData();
  pendingOrderPreview = null;
  updateUI();

  if (attempt.closeReviewModal) {
    closeOrderTicketModal({ restoreCart: false });
  }

  closeCartModal();
  resetOrderSubmissionButtons();
}

function handleWhatsAppOpenFailure(attempt) {
  if (!attempt || attempt.completed || activeWhatsAppAttempt !== attempt) return;

  clearActiveWhatsAppAttempt(attempt);
  resetOrderSubmissionButtons();
  logCheckoutWarn("Falha ao abrir o WhatsApp automaticamente.", {
    source: attempt.source,
    urlLength: attempt.browserUrl.length
  });
  showToast("N\u00e3o foi poss\u00edvel abrir o WhatsApp agora. Verifique o bloqueio do navegador e toque novamente.");
}

function openWhatsAppOrder(message, options = {}) {
  const normalizedMessage = String(message || "").replace(/\r\n/g, "\n").trim();

  if (!normalizedMessage) {
    throw new Error("Mensagem do pedido vazia.");
  }

  const browserUrl = buildWhatsAppUrl(normalizedMessage);
  const deepLinkUrl = buildWhatsAppDeepLink(normalizedMessage);
  const source = options.source || "checkout";
  const shouldPreferDeepLink = options.preferDeepLink ?? isProbablyMobileCheckoutClient();

  clearActiveWhatsAppAttempt();

  const attempt = {
    source,
    closeReviewModal: Boolean(options.closeReviewModal),
    browserUrl,
    deepLinkUrl,
    completed: false,
    fallbackTimer: 0,
    failureTimer: 0,
    visibilityHandler: null,
    pageHideHandler: null
  };

  attempt.visibilityHandler = () => {
    if (document.visibilityState === "hidden") {
      finalizeSuccessfulOrderSubmission(attempt, "visibilitychange");
    }
  };

  attempt.pageHideHandler = () => {
    finalizeSuccessfulOrderSubmission(attempt, "pagehide");
  };

  document.addEventListener("visibilitychange", attempt.visibilityHandler);
  window.addEventListener("pagehide", attempt.pageHideHandler);

  activeWhatsAppAttempt = attempt;

  logCheckoutInfo("Tentando abrir o WhatsApp.", {
    source,
    preferDeepLink: shouldPreferDeepLink,
    urlLength: browserUrl.length
  });

  if (shouldPreferDeepLink) {
    attempt.fallbackTimer = window.setTimeout(() => {
      if (activeWhatsAppAttempt !== attempt || attempt.completed || document.visibilityState === "hidden") {
        return;
      }

      logCheckoutWarn("WhatsApp app n\u00e3o respondeu; usando fallback web.", { source });
      window.location.href = browserUrl;
    }, WHATSAPP_FALLBACK_DELAY_MS);

    window.location.href = deepLinkUrl;
  } else {
    window.location.href = browserUrl;
  }

  attempt.failureTimer = window.setTimeout(() => {
    if (activeWhatsAppAttempt !== attempt || attempt.completed || document.visibilityState === "hidden") {
      return;
    }

    handleWhatsAppOpenFailure(attempt);
  }, WHATSAPP_OPEN_CHECK_DELAY_MS);

  return browserUrl;
}

function submitPendingOrder(preview, options = {}) {
  const orderPreview = preview || pendingOrderPreview;
  const shouldCloseReviewModal = Boolean(options.closeReviewModal);
  const source = options.source || "checkout";

  if (!orderPreview) {
    logCheckoutWarn("Tentativa de envio sem comanda preparada.");
    showToast("Monte o pedido novamente antes de enviar.");
    return false;
  }

  openWhatsAppOrder(orderPreview.whatsAppMessage, {
    source,
    closeReviewModal: shouldCloseReviewModal
  });

  return true;
}

function renderOrderTicketPreview() {
  const preview = document.getElementById("order-ticket-preview");
  if (!preview) return;

  preview.innerHTML = buildOrderTicketPreviewMarkup(pendingOrderPreview);
}

function updateOrderTicketModalMode() {
  const title = document.getElementById("order-ticket-modal-title");
  const label = document.getElementById("order-ticket-mode-label");
  const message = document.getElementById("order-ticket-mode-message");
  const actions = document.getElementById("order-ticket-actions");
  const backButton = document.getElementById("order-ticket-back-button");
  const printButton = document.getElementById("order-ticket-print-button");
  const confirmButton = document.getElementById("order-ticket-confirm-button");

  if (orderTicketModalMode === "shared") {
    if (actions) actions.dataset.mode = "shared";
    if (title) title.textContent = "Comanda da loja";
    if (label) label.textContent = "Comanda recebida no WhatsApp";
    if (message) message.textContent = "Abra esta comanda no PC da loja e imprima direto na impressora de fita do balc\u00e3o.";
    if (backButton) backButton.textContent = "Voltar ao site";
    if (printButton) printButton.hidden = false;
    if (printButton) printButton.textContent = "Imprimir na fita";
    if (confirmButton) confirmButton.hidden = true;
    return;
  }

  if (actions) actions.dataset.mode = "checkout";
  if (title) title.textContent = "Revise seu pedido";
  if (label) label.textContent = "Revis\u00e3o final do pedido";
  if (message) message.textContent = "Confira os detalhes e envie o pedido. A impress\u00e3o da comanda ser\u00e1 feita pela loja quando abrirem o link recebido no WhatsApp.";
  if (backButton) backButton.textContent = "Voltar ao checkout";
  if (printButton) printButton.hidden = true;
  if (confirmButton) confirmButton.hidden = false;
}

function openOrderTicketModal(mode = "checkout") {
  const modal = document.getElementById("order-ticket-modal");
  if (!modal) return;

  orderTicketModalMode = mode;
  if (mode === "checkout") {
    hideCartModalForOrderTicket();
  } else {
    cartModalHiddenForOrderTicket = false;
  }

  if (pendingOrderPreview) {
    pendingOrderPreview = {
      ...pendingOrderPreview,
      statusLabel: mode === "shared" ? "Pronto para imprimir" : "Pronto para enviar"
    };
  }

  updateOrderTicketModalMode();
  renderOrderTicketPreview();
  modal.hidden = false;
  document.body.classList.add("modal-open");
  document.body.classList.toggle("ticket-view-active", mode === "shared");

  requestAnimationFrame(() => {
    modal.classList.add("is-visible");
    modal.querySelector(".order-ticket-modal-content")?.focus();
  });
}

function closeOrderTicketModal(options = {}) {
  const modal = document.getElementById("order-ticket-modal");
  if (!modal) return;
  const wasSharedMode = orderTicketModalMode === "shared";
  const shouldRestoreCart = options.restoreCart !== false && !wasSharedMode;

  modal.classList.remove("is-visible");

  setTimeout(() => {
    modal.hidden = true;
    if (wasSharedMode) {
      const url = new URL(window.location.href);
      url.searchParams.delete("t");
      url.searchParams.delete("ticket");
      history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
      document.body.classList.remove("ticket-view-active");
      pendingOrderPreview = null;
      orderTicketModalMode = "checkout";
    }

    if (shouldRestoreCart) {
      restoreCartModalAfterOrderTicket();
    } else {
      cartModalHiddenForOrderTicket = false;
    }

    syncBodyModalState();
  }, 220);
}

function printOrderTicket() {
  if (!pendingOrderPreview) {
    showToast("Nenhuma comanda pronta para imprimir.");
    return;
  }

  const printWindow = window.open("", "_blank", "width=520,height=760");

  if (!printWindow) {
    showToast("N\u00e3o foi poss\u00edvel abrir a janela de impress\u00e3o.");
    return;
  }

  printWindow.document.open();
  printWindow.document.write(buildOrderTicketPrintDocument(pendingOrderPreview));
  printWindow.document.close();
}

function confirmOrderTicket() {
  if (!pendingOrderPreview) {
    logCheckoutWarn("Tentativa de confirmar comanda sem preview.");
    showToast("Monte a comanda novamente antes de enviar.");
    return;
  }

  if (!pendingOrderPreview.sharedTicketUrl) {
    showToast("Link da comanda indispon\u00edvel neste teste local. Configure a URL p\u00fablica da loja para liberar a impress\u00e3o pelo WhatsApp.");
  }
  setOrderTicketConfirmButtonBusy(true);

  try {
    const wasSubmitted = submitPendingOrder(pendingOrderPreview, {
      closeReviewModal: true,
      source: "review"
    });

    if (!wasSubmitted) {
      resetOrderSubmissionButtons();
    }
  } catch (error) {
    logCheckoutError("Falha ao abrir o WhatsApp do pedido.", error);
    showToast("N\u00e3o foi poss\u00edvel abrir o WhatsApp agora. Tente novamente.");
    resetOrderSubmissionButtons();
  }
}

async function verifyPendingOrderPreviewDeliveryQuote() {
  if (!pendingOrderPreview || pendingOrderPreview.isPickup || !pendingOrderPreview.deliveryQuote?.token) {
    return;
  }

  const addressKey = buildDeliveryAddressKey(pendingOrderPreview.deliveryValues || {});

  pendingOrderPreview = {
    ...pendingOrderPreview,
    deliveryQuote: {
      ...pendingOrderPreview.deliveryQuote,
      validationStatus: "loading"
    }
  };
  renderOrderTicketPreview();

  try {
    const verification = await verifyDeliveryQuoteToken(pendingOrderPreview.deliveryQuote.token, addressKey);
    const verifiedQuote = verification.quote || {};
    const isFeeMatch = Number(verifiedQuote.fee || 0) === Number(pendingOrderPreview.deliveryFeeValue || 0);

    pendingOrderPreview = {
      ...pendingOrderPreview,
      deliveryQuote: {
        ...pendingOrderPreview.deliveryQuote,
        code: verifiedQuote.code || pendingOrderPreview.deliveryQuote.code,
        distanceKm: Number(verifiedQuote.distanceKm || pendingOrderPreview.deliveryQuote.distanceKm || 0),
        zone: verifiedQuote.zone || pendingOrderPreview.deliveryQuote.zone,
        zoneLabel: verifiedQuote.zoneLabel || pendingOrderPreview.deliveryQuote.zoneLabel,
        addressKey: verifiedQuote.addressKey || pendingOrderPreview.deliveryQuote.addressKey,
        validationStatus: isFeeMatch ? "verified" : "invalid"
      }
    };
  } catch (error) {
    const code = error.payload?.code || error.code || "";

    pendingOrderPreview = {
      ...pendingOrderPreview,
      deliveryQuote: {
        ...pendingOrderPreview.deliveryQuote,
        validationStatus: code === "quote_expired" ? "expired" : "invalid"
      }
    };
  }

  renderOrderTicketPreview();
}

function handleSharedOrderTicketFromUrl() {
  const searchParams = new URLSearchParams(window.location.search);
  const encodedTicket = searchParams.get("t") || searchParams.get("ticket");
  if (!encodedTicket) return;

  const decodedTicket = decodeSharedOrderTicketPayload(encodedTicket);
  if (!decodedTicket) return;

  pendingOrderPreview = decodedTicket;
  openOrderTicketModal("shared");
  verifyPendingOrderPreviewDeliveryQuote();
}

function validateCheckout() {
  const nameField = document.getElementById("customer-name");
  const payment = getPaymentFields();
  const paymentField = payment.field;
  const isPickup = getCurrentFulfillmentMode() === "pickup";
  const subtotal = getCartTotal();

  if (!cart.length) {
    logCheckoutWarn("Checkout bloqueado: carrinho vazio.");
    showToast("Seu pedido est\u00e1 vazio.");
    return false;
  }

  if (!ensureStoreIsOpen(true)) {
    logCheckoutWarn("Checkout bloqueado: loja fechada.");
    return false;
  }

  if (!normalizeText(nameField?.value)) {
    setFieldInvalid(nameField);
    logCheckoutWarn("Checkout bloqueado: nome n\u00e3o informado.");
    showToast("Informe seu nome.");
    return false;
  }

  clearFieldInvalid(nameField);

  if (!hasReachedMinimumOrder(subtotal)) {
    logCheckoutWarn("Checkout bloqueado: pedido m\u00ednimo n\u00e3o atingido.", { subtotal });
    showToast(`O pedido m\u00ednimo da Galaxy Burger \u00e9 ${formatCurrency(MIN_ORDER_AMOUNT)} em produtos. Faltam ${formatCurrency(getMinimumOrderShortfall(subtotal))} para continuar.`);
    return false;
  }

  if (!isPickup) {
    if (!validateAddressFields(true)) return false;

    if (deliveryState.status === "loading") {
      logCheckoutWarn("Checkout bloqueado: valida\u00e7\u00e3o da entrega em andamento.");
      showToast("Aguarde a valida\u00e7\u00e3o da entrega.");
      return false;
    }

    if (deliveryState.status === "out_of_range") {
      logCheckoutWarn("Checkout bloqueado: endere\u00e7o fora da \u00e1rea.");
      showToast("Esse endere\u00e7o est\u00e1 fora da \u00e1rea de entrega. Selecione retirada para continuar.");
      return false;
    }

    if (!isDeliveryQuoteFresh(deliveryState)) {
      clearDeliveryQuote("A valida\u00e7\u00e3o da entrega expirou. Valide o endere\u00e7o novamente.");
      logCheckoutWarn("Checkout bloqueado: taxa de entrega sem valida\u00e7\u00e3o ativa.", { deliveryState });
      showToast("Valide o endere\u00e7o novamente antes de finalizar.");
      return false;
    }

    if (deliveryState.status !== "ready" || !deliveryState.quoteToken) {
      logCheckoutWarn("Checkout bloqueado: taxa de entrega n\u00e3o validada.", { deliveryState });
      showToast("Valide a entrega antes de finalizar.");
      return false;
    }

    if (!validateDeliveryEstimateAcceptance(true)) {
      return false;
    }
  }

  clearPaymentInvalid();

  if (!paymentField?.value) {
    setPaymentInvalid();
    payment.buttons[0]?.focus();
    logCheckoutWarn("Checkout bloqueado: forma de pagamento n\u00e3o selecionada.");
    showToast("Escolha uma forma de pagamento.");
    return false;
  }

  const cashChangeSummary = getCashChangeSummary(updateCartTotals().total, true);
  if (!cashChangeSummary) {
    return false;
  }

  return true;
}

async function buildPendingOrderPreview() {
  const name = normalizeText(document.getElementById("customer-name")?.value);
  const notes = normalizeText(document.getElementById("order-notes")?.value);
  const paymentMethod = document.getElementById("payment-method")?.value || "";
  const isPickup = getCurrentFulfillmentMode() === "pickup";
  let deliveryValues = isPickup ? {} : getDeliveryValues();

  if (!isPickup) {
    const refreshedQuote = await requestDeliveryQuote({
      showMessage: true,
      quietSuccess: true,
      reason: "finalize"
    });

    if (!refreshedQuote || refreshedQuote.status !== "ready" || !refreshedQuote.quoteToken) {
      return null;
    }

    deliveryValues = {
      ...deliveryValues,
      ...(refreshedQuote.validatedAddress || {})
    };
  }

  const address = isPickup ? STORE_ADDRESS : syncDeliveryAddressField();
  const totals = updateCartTotals();
  const cashChangeSummary = getCashChangeSummary(totals.total, false);
  const createdAt = getOrderCreatedAtLabel();

  if (!cashChangeSummary) {
    return null;
  }

  const paymentLabel = cashChangeSummary.paymentLabel || formatPaymentLabel(paymentMethod);
  const paymentLines = buildOrderPaymentLines({
    paymentMethod,
    paymentLabel,
    cashChangeText: cashChangeSummary.cashChangeText
  });
  const { addressData, addressLines } = buildOrderAddressPreviewLines({
    isPickup,
    address,
    deliveryValues
  });
  const deliveryFeeLabel = isPickup ? "Sem taxa de entrega" : formatCurrency(totals.fee);
  const subtotalLabel = formatCurrency(totals.subtotal);
  const totalLabel = formatCurrency(totals.total);
  const deliveryQuote = isPickup ? null : {
    code: deliveryState.quoteCode,
    token: deliveryState.quoteToken,
    expiresAt: deliveryState.expiresAt,
    distanceKm: deliveryState.distanceKm,
    zone: deliveryState.distanceRange,
    zoneLabel: deliveryState.distanceLabel,
    addressKey: deliveryState.addressKey,
    locationPrecision: deliveryState.locationPrecision,
    geocoderSource: deliveryState.geocoderSource,
    validationStatus: "verified"
  };
  const orderPreview = {
    createdAt,
    name,
    notes,
    isPickup,
    fulfillmentLabel: isPickup ? "Retirada" : "Entrega",
    items: getOrderLineItems(),
    itemsCount: getCartItemsCount(),
    addressData,
    addressLines,
    mapsLink: isPickup ? "" : generateMapsLink(addressData.mapsQueryAddress),
    paymentMethod,
    paymentSummary: paymentLines.join(" | "),
    paymentLines,
    deliveryValues,
    deliveryQuote,
    deliveryFeeValue: totals.fee,
    deliveryFeeLabel,
    feeLabelTitle: isPickup ? "Retirada" : "Entrega validada",
    subtotalValue: totals.subtotal,
    subtotalLabel,
    totalValue: totals.total,
    totalLabel
  };
  let sharedTicketUrl = "";

  try {
    sharedTicketUrl = buildSharedOrderTicketUrl(orderPreview);
  } catch (error) {
    logCheckoutError("Falha ao gerar a comanda compartilhada.", error);
  }

  const whatsAppPayload = {
    name,
    isPickup,
    address,
    deliveryValues,
    deliveryFee: deliveryFeeLabel,
    subtotal: subtotalLabel,
    total: totalLabel,
    paymentMethod,
    paymentLabel,
    cashChangeText: cashChangeSummary.cashChangeText,
    notes,
    createdAt,
    deliveryQuote
  };
  const compactWhatsAppMessage = buildWhatsAppOrderMessage({
    ...whatsAppPayload,
    ticketUrl: ""
  });
  const whatsAppMessageWithTicket = sharedTicketUrl
    ? buildWhatsAppOrderMessage({
        ...whatsAppPayload,
        ticketUrl: sharedTicketUrl
      })
    : "";
  const shouldUseSharedTicketUrl = Boolean(whatsAppMessageWithTicket)
    && buildWhatsAppUrl(whatsAppMessageWithTicket).length <= MAX_WHATSAPP_URL_LENGTH;

  logCheckoutInfo("Comanda preparada para envio.", {
    items: orderPreview.itemsCount,
    isPickup,
    paymentMethod,
    sharedTicketIncluded: shouldUseSharedTicketUrl
  });

  return {
    ...orderPreview,
    sharedTicketUrl,
    sharedTicketIncludedInMessage: shouldUseSharedTicketUrl,
    whatsAppMessage: shouldUseSharedTicketUrl
      ? whatsAppMessageWithTicket
      : compactWhatsAppMessage
  };
}

async function finalizeOrder() {
  if (isFinalizeButtonBusy()) {
    logCheckoutWarn("Clique ignorado: envio j\u00e1 est\u00e1 em andamento.");
    return false;
  }

  if (!validateCheckout()) return;
  setFinalizeButtonBusy(true, "Validando entrega...");

  try {
    pendingOrderPreview = await buildPendingOrderPreview();

    if (!pendingOrderPreview) {
      resetOrderSubmissionButtons();
      return false;
    }

    const wasSubmitted = submitPendingOrder(pendingOrderPreview, { source: "checkout" });

    if (!wasSubmitted) {
      resetOrderSubmissionButtons();
      return false;
    }

    return true;
  } catch (error) {
    logCheckoutError("Falha ao preparar o checkout.", error);
    showToast("N\u00e3o foi poss\u00edvel preparar o pedido agora. Tente novamente.");
    resetOrderSubmissionButtons();
    return false;
  }
}

function bindDeliveryEvents() {
  const fields = getDeliveryFields();
  const cashFields = getCashChangeFields();

  if (fields.cep) {
    fields.cep.addEventListener("input", () => {
      fields.cep.value = formatCep(fields.cep.value);
      clearFieldInvalid(fields.cep);
      clearDeliveryQuote("CEP alterado. Valide a entrega novamente.");

      if (normalizeCep(fields.cep.value).length === 8) {
        lookupCep(false);
      }
    });
  }

  if (fields.searchCepButton) {
    fields.searchCepButton.addEventListener("click", () => lookupCep(true));
  }

  if (fields.calculateDeliveryButton) {
    fields.calculateDeliveryButton.addEventListener("click", handleCalculateDelivery);
  }

  [fields.street, fields.number, fields.neighborhood, fields.city, fields.state].forEach(field => {
    if (!field) return;

    field.addEventListener("input", () => {
      clearFieldInvalid(field);
      syncDeliveryAddressField();
      clearDeliveryQuote("Endere\u00e7o alterado. Valide a entrega novamente.");
    });
  });

  [fields.complement, fields.reference].forEach(field => {
    if (!field) return;

    field.addEventListener("input", () => {
      clearFieldInvalid(field);
      syncDeliveryAddressField();
      saveDeliveryData();
    });
  });

  if (fields.estimateAck) {
    fields.estimateAck.addEventListener("change", () => {
      clearEstimateTermsInvalid(fields.estimateTerms, fields.estimateAck);
      updateDeliveryUI();
      updateCartTotals();
      saveDeliveryData();
    });
  }

  cashFields.typeInputs.forEach(input => {
    input.addEventListener("change", () => {
      clearFieldInvalid(cashFields.valueInput);
      updateCashChangeUI();
    });
  });

  if (cashFields.valueInput) {
    cashFields.valueInput.addEventListener("input", () => {
      clearFieldInvalid(cashFields.valueInput);
      cashFields.valueInput.value = normalizeCurrencyInput(cashFields.valueInput.value);
    });

    cashFields.valueInput.addEventListener("blur", () => {
      cashFields.valueInput.value = formatCurrencyInputValue(cashFields.valueInput.value);
    });
  }
}

function updateStoreStatusUI(availability = getStoreAvailability()) {
  const statusCard = document.getElementById("store-status-card");
  const statusPill = document.getElementById("store-status-pill");
  const statusTitle = document.getElementById("store-status-title");
  const statusMessage = document.getElementById("store-status-message");
  const closeTimeLabel = formatStoreTimeLabel(availability.todaySchedule?.closeMinutes || 0);

  if (statusCard) statusCard.dataset.open = String(availability.isOpen);
  if (statusPill) {
    statusPill.textContent = !availability.scheduleEnforced
      ? "Teste liberado"
      : availability.isOpen
        ? "Aberta no momento"
        : "Fechada no momento";
  }
  if (statusTitle) {
    statusTitle.textContent = !availability.scheduleEnforced
      ? "A Galaxy Burger est\u00e1 liberada para testes"
      : availability.isOpen
        ? "A Galaxy Burger est\u00e1 aberta agora"
        : "A Galaxy Burger est\u00e1 fechada agora";
  }
  if (statusMessage) {
    statusMessage.textContent = !availability.scheduleEnforced
      ? "Bloqueio por hor\u00e1rio desativado temporariamente para valida\u00e7\u00e3o do checkout e apresenta\u00e7\u00e3o ao cliente."
      : availability.isOpen
        ? `Recebendo pedidos at\u00e9 ${closeTimeLabel}.`
        : formatNextOpeningMessage(availability.nextOpen);
  }

  updateOrderAvailabilityUI(availability);
  updateCartTotals();
}

let cardDescriptionIdSequence = 0;
let cardDescriptionSyncFrame = 0;

function setCardDescriptionExpanded(card, isExpanded) {
  const description = card.querySelector(".card-description");
  const toggle = card.querySelector(".card-description-toggle");
  if (!description || !toggle) return;

  card.classList.toggle("is-description-expanded", isExpanded);
  description.setAttribute("aria-expanded", String(isExpanded));
  toggle.setAttribute("aria-expanded", String(isExpanded));
  toggle.textContent = isExpanded ? "Ocultar ingredientes" : "Ver ingredientes";
}

function toggleCardDescription(source) {
  const card = source.closest(".card");
  if (!card || !card.classList.contains("has-description-toggle")) return;

  setCardDescriptionExpanded(card, !card.classList.contains("is-description-expanded"));
}

function syncExpandableCardDescription(description) {
  const card = description.closest(".card");
  const toggle = card?.querySelector(".card-description-toggle");
  if (!card || !toggle) return;

  const wasExpanded = card.classList.contains("is-description-expanded");

  card.classList.remove("is-description-expanded");
  description.classList.remove("is-expandable");
  description.removeAttribute("aria-expanded");
  description.removeAttribute("role");
  description.removeAttribute("tabindex");
  toggle.removeAttribute("aria-expanded");
  toggle.textContent = "Ver ingredientes";
  toggle.hidden = true;

  const needsToggle = description.scrollHeight > description.clientHeight + 2;
  card.classList.toggle("has-description-toggle", needsToggle);

  if (!needsToggle) {
    return;
  }

  description.classList.add("is-expandable");
  description.setAttribute("role", "button");
  description.setAttribute("tabindex", "0");
  toggle.hidden = false;
  setCardDescriptionExpanded(card, wasExpanded);
}

function syncAllExpandableCardDescriptions() {
  document.querySelectorAll(".card-description").forEach(syncExpandableCardDescription);
}

function requestExpandableCardDescriptionsSync() {
  if (cardDescriptionSyncFrame) {
    window.cancelAnimationFrame(cardDescriptionSyncFrame);
  }

  cardDescriptionSyncFrame = window.requestAnimationFrame(() => {
    cardDescriptionSyncFrame = 0;
    syncAllExpandableCardDescriptions();
  });
}

function setupExpandableCardDescriptions() {
  const descriptions = Array.from(document.querySelectorAll(".card .card-content p"));

  descriptions.forEach(description => {
    description.classList.add("card-description");

    if (!description.id) {
      cardDescriptionIdSequence += 1;
      description.id = `card-description-${cardDescriptionIdSequence}`;
    }

    let toggle = description.parentElement?.querySelector(".card-description-toggle");
    if (!toggle && description.parentElement) {
      toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "card-description-toggle";
      toggle.hidden = true;
      toggle.setAttribute("aria-controls", description.id);
      description.parentElement.insertBefore(toggle, description.parentElement.querySelector(".price"));
    }

    if (!toggle) return;

    if (!description.dataset.expandableBound) {
      description.dataset.expandableBound = "true";
      description.addEventListener("click", () => {
        if (!description.classList.contains("is-expandable")) return;
        toggleCardDescription(description);
      });
      description.addEventListener("keydown", event => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        toggleCardDescription(description);
      });
    }

    if (!toggle.dataset.expandableBound) {
      toggle.dataset.expandableBound = "true";
      toggle.addEventListener("click", () => toggleCardDescription(toggle));
    }
  });

  requestExpandableCardDescriptionsSync();
}

document.addEventListener("DOMContentLoaded", () => {
  /*
    Remove coordenadas antigas salvas por versões anteriores.
    Isso é essencial, porque seu bug pode estar vindo do localStorage antigo.
  */
  LEGACY_DELIVERY_STORAGE_KEYS.forEach(storageKey => {
    localStorage.removeItem(storageKey);
  });

  loadDeliveryData();
  bindDeliveryEvents();
  updateCashChangeUI();
  updateOrderTicketModalMode();
  updateUI();
  updateDeliveryUI();
  updateStoreStatusUI();
  handleSharedOrderTicketFromUrl();
  setupExpandableCardDescriptions();
  window.setInterval(() => updateStoreStatusUI(), 60000);
  window.addEventListener("resize", requestExpandableCardDescriptionsSync);

  if (document.fonts?.ready) {
    document.fonts.ready.then(() => {
      requestExpandableCardDescriptionsSync();
    });
  }

  window.addEventListener("load", requestExpandableCardDescriptionsSync, { once: true });

  const pixKeyDisplay = document.getElementById("pix-key-display");
  if (pixKeyDisplay) {
    pixKeyDisplay.textContent = PIX_KEY;
  }

  const pixBeneficiaryDisplay = document.getElementById("pix-beneficiary-display");
  if (pixBeneficiaryDisplay) {
    pixBeneficiaryDisplay.textContent = PIX_BENEFICIARY_NAME;
  }

  window.addEventListener("error", event => {
    logCheckoutError("Erro global capturado no checkout.", event.error || event.message);
  });

  window.addEventListener("unhandledrejection", event => {
    logCheckoutError("Promise rejeitada sem tratamento no checkout.", event.reason);
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      closeOrderTicketModal();
      closeCartModal();
      closeComboDrinkModal();
      closeMobileNav();
    }
  });
});




