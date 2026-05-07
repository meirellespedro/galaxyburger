let cart = JSON.parse(localStorage.getItem("cart")) || [];

const PIX_KEY = "66.219.861/0001-73";
const PIX_BENEFICIARY_NAME = "Sulen Ferreira de Carvalho de Souza";
const STORE_WHATSAPP = "5521995578652";
const IFOOD_STORE_URL = "https://www.ifood.com.br/delivery/rio-de-janeiro-rj/galaxy-burger-199-campo-grande/fe3716f9-fab7-4b6b-9e7a-09f0ccff22d1";

const STORE_ADDRESS = "Rua Embaixador Muniz Gordilho, 199 - Campo Grande, Rio de Janeiro/RJ - CEP 23070-010";
const STORE_ADDRESS_LINES = Object.freeze([
  "Rua Embaixador Muniz Gordilho, 199",
  "Campo Grande - Rio de Janeiro/RJ",
  "CEP 23070-010"
]);
const ORDER_TICKET_WIDTH = 30;
const ORDER_TICKET_DIVIDER = "-".repeat(ORDER_TICKET_WIDTH);
const STORE_TIME_ZONE = "America/Sao_Paulo";
// Use "live" para respeitar o horario real da loja. Troque para "preview" apenas em testes.
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
  "terca",
  "quarta",
  "quinta",
  "sexta",
  "sabado"
]);
const STORE_HOURS = Object.freeze({
  0: Object.freeze({ openMinutes: 19 * 60, closeMinutes: 23 * 60 }),
  1: Object.freeze({ openMinutes: 19 * 60, closeMinutes: 23 * 60 + 59 }),
  2: Object.freeze({ openMinutes: 19 * 60, closeMinutes: 23 * 60 + 59 }),
  3: Object.freeze({ openMinutes: 19 * 60, closeMinutes: 23 * 60 + 59 }),
  4: Object.freeze({ openMinutes: 19 * 60, closeMinutes: 23 * 60 + 59 }),
  5: Object.freeze({ openMinutes: 19 * 60, closeMinutes: 23 * 60 + 59 }),
  6: Object.freeze({ openMinutes: 19 * 60, closeMinutes: 23 * 60 + 59 })
});

const VIA_CEP_BASE_URL = "https://viacep.com.br/ws";
const DELIVERY_FEE_LOCAL = 5;
const DELIVERY_FEE_EXTENDED = 10;
const MIN_ORDER_AMOUNT = 20;
const DELIVERY_IDLE_MESSAGE = "Preencha o endereco, selecione a faixa estimada e confirme a taxa para atualizar o total.";

const DELIVERY_STORAGE_KEY = "galaxy_burguer_delivery_v9";
const LEGACY_DELIVERY_STORAGE_KEYS = [
  "galaxy_burguer_delivery",
  "galaxy_burguer_delivery_v3",
  "galaxy_burguer_delivery_v4",
  "galaxy_burguer_delivery_v5",
  "galaxy_burguer_delivery_v6",
  "galaxy_burguer_delivery_v7",
  "galaxy_burguer_delivery_v8",
  "galaxy_burguer_store_coords_v1"
];

let deliveryState = {
  status: "idle",
  fee: 0,
  distanceLabel: "",
  distanceRange: "",
  address: "",
  message: DELIVERY_IDLE_MESSAGE
};

const viaCepCache = new Map();
const MANUAL_DELIVERY_RANGES = Object.freeze({
  campo_grande: Object.freeze({
    value: "campo_grande",
    status: "ready",
    fee: DELIVERY_FEE_LOCAL,
    label: "Campo Grande",
    description: "Campo Grande - estimativa R$ 5,00"
  }),
  nearby_area: Object.freeze({
    value: "nearby_area",
    status: "ready",
    fee: DELIVERY_FEE_EXTENDED,
    label: "Outros bairros atendidos",
    description: "Outros bairros atendidos ate 5 km - estimativa R$ 10,00"
  }),
  outside_area: Object.freeze({
    value: "outside_area",
    status: "out_of_range",
    fee: 0,
    label: "Fora da area de entrega",
    description: "Fora da area de entrega - acima de 5 km"
  })
});
const DEFAULT_COMBO_DRINK_OPTIONS = Object.freeze([
  "Coca-Cola Comum 350ML",
  "Coca-Cola Zero 350 ml",
  "Pepsi lata 350ml",
  "Pepsi Black lata 350ml",
  "Fanta Laranja",
  "Guarana lata 350ml",
  "Sprite lata 350ml",
  "Fanta uva",
  "Guaracamp copo 285ml"
]);
let activeComboSelection = null;

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
    return "Consulte a loja para o proximo horario.";
  }

  const timeLabel = formatStoreTimeLabel(nextOpen.openMinutes);

  if (nextOpen.offset === 0) {
    return `A proxima abertura e hoje, as ${timeLabel}.`;
  }

  if (nextOpen.offset === 1) {
    return `A proxima abertura e amanha, as ${timeLabel}.`;
  }

  return `A proxima abertura e ${STORE_WEEKDAY_LABELS[nextOpen.dayIndex]}, as ${timeLabel}.`;
}

function getStoreClosedOrderMessage(availability = getStoreAvailability()) {
  return `A Galaxy Burger esta fechada agora. ${formatNextOpeningMessage(availability.nextOpen)}`;
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
      cashChangeText: "Nao precisa de troco."
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
    { field: fields.street, value: values.street, message: "Informe a rua." },
    { field: fields.number, value: values.number, message: "Informe o numero." },
    { field: fields.neighborhood, value: values.neighborhood, message: "Informe o bairro." }
  ];

  const missing = required.find(item => !item.value);

  required.forEach(item => clearFieldInvalid(item.field));

  if (missing) {
    setFieldInvalid(missing.field);
    missing.field?.focus();

    if (showMessage) {
      showToast(missing.message);
      setDeliveryState({
        status: "idle",
        fee: 0,
        distanceLabel: "",
        distanceRange: values.distanceRange || "",
        message: missing.message
      });
    }

    return false;
  }

  return true;
}

function getManualDeliveryRange(value) {
  return MANUAL_DELIVERY_RANGES[value] || null;
}

function validateManualDeliveryRange(showMessage = true) {
  const fields = getDeliveryFields();
  const selectedRange = getManualDeliveryRange(fields.distanceRange?.value || "");

  clearFieldInvalid(fields.distanceRange);

  if (selectedRange) {
    return selectedRange;
  }

  if (showMessage) {
    setFieldInvalid(fields.distanceRange);
    fields.distanceRange?.focus();
    showToast("Selecione a faixa estimada do endereco.");
    setDeliveryState({
      status: "idle",
      fee: 0,
      distanceLabel: "",
      distanceRange: "",
      address: syncDeliveryAddressField(),
      message: "Selecione a faixa estimada do endereco para confirmar a entrega."
    });
  }

  return null;
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
    showToast("Confirme que entendeu a taxa estimada antes de enviar o pedido.");
  }

  return false;
}

function validateAreaMatchesNeighborhood(selectedRange, showMessage = true) {
  const fields = getDeliveryFields();
  const neighborhood = normalizeText(fields.neighborhood?.value);

  clearFieldInvalid(fields.distanceRange);

  if (
    !selectedRange ||
    selectedRange.value !== "campo_grande" ||
    !neighborhood ||
    isCampoGrandeNeighborhood(neighborhood)
  ) {
    return true;
  }

  if (showMessage) {
    setFieldInvalid(fields.distanceRange);
    fields.distanceRange?.focus();
    showToast("Para usar a estimativa de R$ 5,00, o bairro informado precisa ser Campo Grande.");
    setDeliveryState({
      status: "idle",
      fee: 0,
      distanceLabel: "",
      distanceRange: selectedRange.value,
      address: syncDeliveryAddressField(),
      message: "Bairro informado diferente de Campo Grande. Escolha a faixa de outros bairros atendidos ou selecione retirada."
    });
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
    setDeliveryState({
      status: "idle",
      message: "Digite um CEP valido com 8 numeros."
    });

    if (isManual) showToast("Digite um CEP valido com 8 numeros.");
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

    setDeliveryState({
      status: "idle",
      fee: 0,
      distanceLabel: "",
      distanceRange: fields.distanceRange?.value || "",
      address: syncDeliveryAddressField(),
      message: "CEP localizado. Revise o endereco e confirme a taxa estimada de entrega."
    });

    saveDeliveryData();
  } catch (error) {
    setDeliveryState({
      status: "error",
      fee: 0,
      message: error.message === "cep_not_found"
        ? "CEP nao encontrado."
        : "Nao foi possivel buscar o CEP agora."
    });

    showToast(deliveryState.message);
  } finally {
    if (fields.searchCepButton) {
      fields.searchCepButton.disabled = false;
      fields.searchCepButton.textContent = "Buscar CEP";
    }
  }
}

function handleCalculateDelivery() {
  if (getCurrentFulfillmentMode() === "pickup") {
    setDeliveryState({
      status: "pickup",
      fee: 0,
      distanceLabel: "",
      distanceRange: "",
      address: STORE_ADDRESS,
      message: "Retirada no balcao, sem taxa de entrega."
    });
    updateCartTotals();
    return;
  }

  if (!validateAddressFields(true)) return;

  const selectedRange = validateManualDeliveryRange(true);
  if (!selectedRange) return;
  if (!validateAreaMatchesNeighborhood(selectedRange, true)) return;

  const address = syncDeliveryAddressField();
  const isOutOfRange = selectedRange.status === "out_of_range";

  setDeliveryState({
    status: selectedRange.status,
    fee: isOutOfRange ? 0 : selectedRange.fee,
    distanceLabel: selectedRange.description,
    distanceRange: selectedRange.value,
    address,
    message: isOutOfRange
      ? "Esse endereco fica fora da area de entrega da Galaxy Burger. Acima de 5 km, trabalhamos apenas com retirada."
      : `Taxa estimada confirmada: ${selectedRange.description}. O valor final segue sujeito a validacao da loja pelo endereco informado.`
  });
  updateCartTotals();
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
    feedbackMessage = "Taxa estimada pronta. Confirme o aceite abaixo para liberar o envio do pedido para a hamburgueria.";
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
        ? "Confirmando..."
        : deliveryState.status === "ready"
          ? "Taxa estimada confirmada"
          : deliveryState.status === "out_of_range"
            ? "Entrega indisponivel"
          : "Confirmar taxa estimada";

    fields.calculateDeliveryButton.classList.toggle("is-success", deliveryState.status === "ready");
  }

  if (fields.feeLine) {
    if (isPickup) {
      fields.feeLine.textContent = "Entrega: R$ 0,00";
    } else if (deliveryState.status === "ready") {
      fields.feeLine.textContent = `Entrega estimada: ${formatCurrency(deliveryState.fee)}`;
    } else if (deliveryState.status === "out_of_range") {
      fields.feeLine.textContent = "Entrega: indisponivel";
    } else if (deliveryState.status === "loading") {
      fields.feeLine.textContent = "Entrega estimada: confirmando...";
    } else {
      fields.feeLine.textContent = "Entrega estimada: aguardando confirmacao";
    }
  }

  if (fields.totalNote) {
    if (isPickup) {
      fields.totalNote.textContent = "Total final para retirada no local";
    } else if (deliveryState.status === "ready") {
      fields.totalNote.textContent = `Taxa estimada selecionada: ${deliveryState.distanceLabel}. A loja valida esse valor no WhatsApp antes do preparo.`;
    } else if (deliveryState.status === "out_of_range") {
      fields.totalNote.textContent = "Endereco fora da area de entrega. Selecione retirada para continuar.";
    } else if (deliveryState.status === "loading") {
      fields.totalNote.textContent = "Confirmando taxa estimada...";
    } else {
      fields.totalNote.textContent = "Confirme a taxa estimada de entrega para atualizar o total";
    }
  }

  if (fields.totalLabel) {
    if (isPickup) {
      fields.totalLabel.textContent = "Total do pedido";
    } else if (deliveryState.status === "out_of_range") {
      fields.totalLabel.textContent = "Subtotal do pedido";
    } else {
      fields.totalLabel.textContent = "Total estimado do pedido";
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
    message: DELIVERY_IDLE_MESSAGE
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
    note.textContent = `Pedido minimo da Galaxy Burger: ${formatCurrency(MIN_ORDER_AMOUNT)} em produtos.`;
    return;
  }

  if (hasReachedMinimumOrder(subtotal)) {
    note.dataset.status = "ready";
    note.textContent = `Pedido minimo atingido. Subtotal dos produtos: ${formatCurrency(subtotal)}.`;
    return;
  }

  note.dataset.status = "warning";
  note.textContent = `Pedido minimo de ${formatCurrency(MIN_ORDER_AMOUNT)} em produtos. Faltam ${formatCurrency(getMinimumOrderShortfall(subtotal))} para liberar o envio.`;
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
      totalCaption.textContent = "O valor final do Pix aparece aqui assim que voce adicionar itens ao pedido.";
    } else if (!meetsMinimumOrder) {
      totalCaption.textContent = `Faltam ${formatCurrency(getMinimumOrderShortfall(subtotal))} em produtos para liberar o pedido.`;
    } else if (!isPickup && deliveryState.status !== "ready") {
      totalCaption.textContent = "Confirme a taxa estimada de entrega para fechar o valor final do Pix.";
    } else if (isPickup) {
      totalCaption.textContent = "Pague o valor exato da retirada para agilizar a conferencia da loja.";
    } else {
      totalCaption.textContent = "Pague o valor exato exibido aqui para acelerar a conferencia do pagamento.";
    }
  }

  if (proofNote) {
    proofNote.textContent = hasItems
      ? "A Galaxy Burger confere o comprovante antes de preparar o pedido. Envie o comprovante na mesma conversa do pedido no WhatsApp oficial."
      : "A Galaxy Burger confere o comprovante antes de preparar o pedido. Assim que voce montar o carrinho, o valor final do Pix aparecera aqui.";
  }
}

function getFinalizeButtonLabel() {
  return getCurrentFulfillmentMode() === "pickup"
    ? "Enviar retirada para a hamburgueria"
    : "Enviar pedido para a hamburgueria";
}

function updateCartTotals() {
  const subtotal = getCartTotal();
  const subtotalEl = document.getElementById("modal-cart-subtotal");
  const totalEl = document.getElementById("modal-cart-total");
  const finalizeButton = document.querySelector(".finalize-order-btn");
  const storeOpen = getStoreAvailability().isOpen;

  const isPickup = getCurrentFulfillmentMode() === "pickup";
  const hasItems = cart.length > 0;
  const meetsMinimumOrder = hasReachedMinimumOrder(subtotal);
  const hasAcceptedEstimate = Boolean(getDeliveryFields().estimateAck?.checked);
  const fee = hasItems && !isPickup && deliveryState.status === "ready"
    ? deliveryState.fee
    : 0;

  const total = hasItems ? subtotal + fee : 0;

  if (subtotalEl) subtotalEl.textContent = formatCurrency(subtotal);
  if (totalEl) totalEl.textContent = formatCurrency(total);
  updateMinimumOrderNote(subtotal);
  updatePixPanelSummary({ subtotal, total });

  if (finalizeButton) {
    finalizeButton.disabled =
      !storeOpen ||
      !hasItems ||
      !meetsMinimumOrder ||
      (!isPickup && (deliveryState.status !== "ready" || !hasAcceptedEstimate));
    finalizeButton.textContent = !storeOpen
      ? "Loja fechada no momento"
      : hasItems && !meetsMinimumOrder
        ? `Faltam ${formatCurrency(getMinimumOrderShortfall(subtotal))} para o minimo`
        : getFinalizeButtonLabel();
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
    container.innerHTML = `<p class="empty-cart">Seu pedido esta vazio.</p>`;
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

function closeComboDrinkModal() {
  const { modal, fields } = getComboDrinkModalElements();
  if (!modal) return;

  modal.classList.remove("is-visible");

  setTimeout(() => {
    modal.hidden = true;
    if (fields) fields.innerHTML = "";
  }, 220);

  const cartModal = document.getElementById("cart-modal");
  if (!cartModal || cartModal.hidden) {
    document.body.classList.remove("modal-open");
  }

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
      message: "Retirada no balcao, sem taxa de entrega."
    });
  } else {
    setDeliveryState({
      status: "idle",
      fee: 0,
      distanceLabel: "",
      distanceRange: deliveryFields.distanceRange?.value || "",
      address: syncDeliveryAddressField(),
      message: DELIVERY_IDLE_MESSAGE
    });
  }

  updateCartTotals();
}

function copyPixKey() {
  navigator.clipboard?.writeText(PIX_KEY)
    .then(() => showToast(`Chave Pix oficial copiada. No banco, confira se o favorecido e ${PIX_BENEFICIARY_NAME}.`))
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
  const minimumOrderCopy = `Pedido minimo: ${formatCurrency(MIN_ORDER_AMOUNT)} em produtos.`;
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
      ? "Modo de validacao ativo. O bloqueio por horario foi desativado temporariamente para voce testar o checkout, inclusive o envio do pedido para a hamburgueria."
      : availability.isOpen
      ? "Revise os itens, confirme a taxa estimada e envie o pedido direto para a hamburgueria pelo WhatsApp oficial."
      : `${getStoreClosedOrderMessage(availability)} Voce pode montar o carrinho normalmente, mas o envio do pedido fica liberado apenas no horario de funcionamento.`;
  }

  if (checkoutHelper) {
    checkoutHelper.textContent = !availability.scheduleEnforced
      ? `Modo de testes ativo: o envio para a hamburgueria esta liberado temporariamente para validar o fluxo completo do pedido. ${minimumOrderCopy}`
      : availability.isOpen
      ? `Para entrega, o pedido e enviado pelo WhatsApp oficial da Galaxy Burger com taxa estimada e confirmacao final da loja. ${minimumOrderCopy}`
      : `${getStoreClosedOrderMessage(availability)} Monte seu carrinho normalmente; o envio pelo WhatsApp fica bloqueado ate a reabertura. ${minimumOrderCopy}`;
  }

  if (availability.isOpen && cart.length && cartStatusLabel && cartStatusMessage && !hasReachedMinimumOrder(subtotal)) {
    cartStatusLabel.textContent = "Pedido minimo nao atingido";
    cartStatusMessage.textContent = `Adicione mais ${formatCurrency(getMinimumOrderShortfall(subtotal))} em produtos para liberar o envio do pedido para a hamburgueria.`;
  }

  if (footerStatus) {
    footerStatus.textContent = !availability.scheduleEnforced
      ? "Status atual: modo de testes ativo, com pedidos liberados temporariamente."
      : availability.isOpen
      ? `Status atual: aberta ate ${formatStoreTimeLabel(availability.todaySchedule?.closeMinutes || 0)}.`
      : `Status atual: fechada. ${formatNextOpeningMessage(availability.nextOpen)}`;
  }
}

function openCartModal() {
  const modal = document.getElementById("cart-modal");
  if (!modal) return;

  modal.hidden = false;
  document.body.classList.add("modal-open");
  updateModalCart();

  requestAnimationFrame(() => {
    modal.classList.add("is-visible");
  });
}

function closeCartModal() {
  const modal = document.getElementById("cart-modal");
  if (!modal) return;

  modal.classList.remove("is-visible");
  document.body.classList.remove("modal-open");

  setTimeout(() => {
    modal.hidden = true;
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
    "cartao de credito": "Cartao de credito",
    "cartao de debito": "Cartao de debito",
    "Cart\u00E3o de cr\u00E9dito": "Cartao de credito",
    "Cart\u00E3o de d\u00E9bito": "Cartao de debito"
  };

  return labels[payment] || payment;
}

function sanitizeTicketText(value) {
  return String(value ?? "")
    .replace(/[#*`_~]/g, "")
    .replace(/[\p{Extended_Pictographic}\p{Regional_Indicator}\u200D\uFE0F]/gu, "")
    .trim();
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
  return lines
    .flatMap(line => wrapTicketLine(line))
    .join("\n")
    .trim();
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
    referenceText: reference || "Nao informado",
    mapsQueryAddress: mapsQueryAddress || address
  };
}

function buildTicketItemsLines() {
  return cart.flatMap((item, index) => {
    const lines = [`${item.quantity}x ${item.name}`];

    if (item.variantLabel) {
      lines.push(`Obs: ${item.variantLabel}`);
    }

    if (index < cart.length - 1) {
      lines.push("");
    }

    return lines;
  });
}

function getCartItemsCount() {
  return cart.reduce((sum, item) => sum + item.quantity, 0);
}

function buildWhatsAppOrderMessage({
  name,
  isPickup,
  address,
  deliveryValues,
  deliveryFee,
  subtotal,
  total,
  paymentMethod,
  paymentLabel,
  cashChangeText,
  notes
}) {
  const resolvedPaymentLabel = formatTicketPaymentLabel(paymentMethod || paymentLabel);
  const addressData = buildDeliveryAddressData({ isPickup, deliveryValues, address });
  const itemsCount = getCartItemsCount();
  const paymentLines = [];
  const normalizedPaymentMethod = String(paymentMethod || "").toLowerCase();

  if (normalizedPaymentMethod === "pix") {
    paymentLines.push("Pix - AGUARDANDO COMPROVANTE");
  } else {
    paymentLines.push(resolvedPaymentLabel);
  }

  if (normalizedPaymentMethod === "dinheiro") {
    paymentLines.push(`Troco: ${cashChangeText || "Nao precisa de troco."}`);
  }

  const lines = [
    "NOTA - GALAXY BURGER",
    ORDER_TICKET_DIVIDER,
    "NOVO PEDIDO",
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
      `Referencia: ${addressData.referenceText}`,
      generateMapsLink(addressData.mapsQueryAddress)
    );
  }

  lines.push(
    "",
    `Nome: ${name}`,
    `Pedido: ${itemsCount}`,
    "",
    "Itens:",
    ...buildTicketItemsLines()
  );

  if (notes) {
    lines.push(
      "",
      "Observacoes:",
      notes
    );
  }

  lines.push(
    "",
    "Pagamento:",
    ...paymentLines,
    ""
  );

  if (!isPickup) {
    lines.push(`Entrega: ${deliveryFee}`);
  }

  lines.push(
    `Total: ${total}`,
    "",
    ORDER_TICKET_DIVIDER,
    "Pedido sujeito a confirmacao."
  );

  return formatTicketLines(lines);
}

function openWhatsAppOrder(message) {
  const normalizedMessage = String(message || "").replace(/\r\n/g, "\n").trim();
  const whatsappUrl = `https://wa.me/${STORE_WHATSAPP}?text=${encodeURIComponent(normalizedMessage)}`;
  const popup = window.open(whatsappUrl, "_blank", "noopener,noreferrer");

  if (!popup) {
    window.location.href = whatsappUrl;
  }
}

function validateCheckout() {
  const nameField = document.getElementById("customer-name");
  const paymentField = document.getElementById("payment-method");
  const isPickup = getCurrentFulfillmentMode() === "pickup";
  const subtotal = getCartTotal();

  if (!cart.length) {
    showToast("Seu pedido esta vazio.");
    return false;
  }

  if (!ensureStoreIsOpen(true)) {
    return false;
  }

  if (!normalizeText(nameField?.value)) {
    setFieldInvalid(nameField);
    showToast("Informe seu nome.");
    return false;
  }

  clearFieldInvalid(nameField);

  if (!hasReachedMinimumOrder(subtotal)) {
    showToast(`O pedido minimo da Galaxy Burger e ${formatCurrency(MIN_ORDER_AMOUNT)} em produtos. Faltam ${formatCurrency(getMinimumOrderShortfall(subtotal))} para continuar.`);
    return false;
  }

  if (!isPickup) {
    if (!validateAddressFields(true)) return false;
    const selectedRange = validateManualDeliveryRange(true);
    if (!selectedRange) return false;
    if (!validateAreaMatchesNeighborhood(selectedRange, true)) return false;

    if (deliveryState.status === "loading") {
      showToast("Aguarde a confirmacao da entrega.");
      return false;
    }

    if (deliveryState.status === "out_of_range") {
      showToast("Esse endereco esta fora da area de entrega. Selecione retirada para continuar.");
      return false;
    }

    if (deliveryState.status !== "ready") {
      showToast("Confirme a taxa estimada de entrega antes de finalizar.");
      return false;
    }

    if (!validateDeliveryEstimateAcceptance(true)) {
      return false;
    }
  }

  if (!paymentField?.value) {
    showToast("Escolha uma forma de pagamento.");
    return false;
  }

  const cashChangeSummary = getCashChangeSummary(updateCartTotals().total, true);
  if (!cashChangeSummary) {
    return false;
  }

  return true;
}

function finalizeOrder() {
  if (!validateCheckout()) return;

  const name = normalizeText(document.getElementById("customer-name")?.value);
  const notes = normalizeText(document.getElementById("order-notes")?.value);
  const payment = document.getElementById("payment-method")?.value || "";
  const isPickup = getCurrentFulfillmentMode() === "pickup";
  const address = isPickup ? STORE_ADDRESS : syncDeliveryAddressField();
  const deliveryValues = isPickup ? {} : getDeliveryValues();

  const totals = updateCartTotals();
  const cashChangeSummary = getCashChangeSummary(totals.total, false);
  if (!cashChangeSummary) return;

  const message = buildWhatsAppOrderMessage({
    name,
    isPickup,
    address,
    deliveryValues,
    deliveryFee: isPickup ? "Sem taxa de entrega" : formatCurrency(totals.fee),
    subtotal: formatCurrency(totals.subtotal),
    total: formatCurrency(totals.total),
    paymentMethod: payment,
    paymentLabel: cashChangeSummary.paymentLabel || formatPaymentLabel(payment),
    cashChangeText: cashChangeSummary.cashChangeText,
    notes
  });

  openWhatsAppOrder(message);

  cart = [];
  saveCart();
  clearDeliveryData();
  updateUI();
  closeCartModal();
}

function bindDeliveryEvents() {
  const fields = getDeliveryFields();
  const cashFields = getCashChangeFields();

  if (fields.cep) {
    fields.cep.addEventListener("input", () => {
      fields.cep.value = formatCep(fields.cep.value);

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

  [fields.street, fields.number, fields.neighborhood, fields.complement, fields.reference, fields.city, fields.state].forEach(field => {
    if (!field) return;

    field.addEventListener("input", () => {
      clearFieldInvalid(field);
      syncDeliveryAddressField();

      deliveryState = {
        ...deliveryState,
        status: "idle",
        fee: 0,
        distanceLabel: "",
        distanceRange: fields.distanceRange?.value || "",
        message: "Endereco alterado. Confirme novamente a taxa estimada de entrega."
      };

      updateDeliveryUI();
      updateCartTotals();
      saveDeliveryData();
    });
  });

  if (fields.distanceRange) {
    fields.distanceRange.addEventListener("change", () => {
      clearFieldInvalid(fields.distanceRange);

      if (getCurrentFulfillmentMode() === "pickup") {
        return;
      }

      syncDeliveryAddressField();

      deliveryState = {
        ...deliveryState,
        status: "idle",
        fee: 0,
        distanceLabel: "",
        distanceRange: fields.distanceRange.value || "",
        message: "Faixa alterada. Confirme a taxa estimada novamente."
      };

      updateDeliveryUI();
      updateCartTotals();
      saveDeliveryData();
    });
  }

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
      ? "A Galaxy Burger esta liberada para testes"
      : availability.isOpen
        ? "A Galaxy Burger esta aberta agora"
        : "A Galaxy Burger esta fechada agora";
  }
  if (statusMessage) {
    statusMessage.textContent = !availability.scheduleEnforced
      ? "Bloqueio por horario desativado temporariamente para validacao do checkout e apresentacao ao cliente."
      : availability.isOpen
        ? `Recebendo pedidos ate ${closeTimeLabel}.`
        : formatNextOpeningMessage(availability.nextOpen);
  }

  updateOrderAvailabilityUI(availability);
  updateCartTotals();
}

document.addEventListener("DOMContentLoaded", () => {
  /*
    Remove coordenadas antigas salvas por versoes anteriores.
    Isso e essencial, porque seu bug pode estar vindo do localStorage antigo.
  */
  LEGACY_DELIVERY_STORAGE_KEYS.forEach(storageKey => {
    localStorage.removeItem(storageKey);
  });

  loadDeliveryData();
  bindDeliveryEvents();
  updateCashChangeUI();
  updateUI();
  updateDeliveryUI();
  updateStoreStatusUI();
  window.setInterval(() => updateStoreStatusUI(), 60000);

  const pixKeyDisplay = document.getElementById("pix-key-display");
  if (pixKeyDisplay) {
    pixKeyDisplay.textContent = PIX_KEY;
  }

  const pixBeneficiaryDisplay = document.getElementById("pix-beneficiary-display");
  if (pixBeneficiaryDisplay) {
    pixBeneficiaryDisplay.textContent = PIX_BENEFICIARY_NAME;
  }

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      closeCartModal();
      closeComboDrinkModal();
      closeMobileNav();
    }
  });
});
