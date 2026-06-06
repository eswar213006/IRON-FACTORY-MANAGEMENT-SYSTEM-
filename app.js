// Core Logic and State Management for FerrumForge Iron Logistics App

// No pre-seeded data — app starts empty and clean

// App State
let state = {
    inventory: [],
    salesLog: [],
    skuCounter: 1,
    sortField: 'sku',
    sortAscending: true,
    user: null, // { username, name, role }
    token: null,
    charts: {
        category: null,
        warehouse: null
    }
};

// API Call Wrapper with Authorization Injection
async function apiFetch(url, options = {}) {
    const token = localStorage.getItem("ferrumforge_token");
    const headers = {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...(options.headers || {})
    };

    const response = await fetch(url, {
        ...options,
        headers
    });

    if (response.status === 401) {
        if (state.token) {
            showToast("Session expired. Please sign in again.", "warning");
        }
        logoutUser();
        throw new Error("Unauthorized");
    }

    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Request failed with status ${response.status}`);
    }

    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
        return await response.json();
    }
    return null;
}

// Session Helpers
function logoutUser() {
    localStorage.removeItem("ferrumforge_token");
    localStorage.removeItem("ferrumforge_user");
    state.token = null;
    state.user = null;
    state.inventory = [];
    state.salesLog = [];

    // Toggle views
    document.getElementById("app-view").classList.add("hidden");
    document.getElementById("auth-view").classList.remove("hidden");
}

function loginUser(token, user) {
    localStorage.setItem("ferrumforge_token", token);
    localStorage.setItem("ferrumforge_user", JSON.stringify(user));
    state.token = token;
    state.user = user;

    // Toggle views
    document.getElementById("auth-view").classList.add("hidden");
    document.getElementById("app-view").classList.remove("hidden");

    // Populate profile details in sidebar
    document.getElementById("sidebar-user-name").innerText = user.name;
    document.getElementById("sidebar-user-role").innerText = user.role;

    const roleIcon = document.getElementById("sidebar-role-icon");
    if (roleIcon) {
        if (user.role === 'Admin') {
            roleIcon.setAttribute("data-lucide", "shield-check");
            roleIcon.className = "avatar-icon admin";
        } else {
            roleIcon.setAttribute("data-lucide", "user");
            roleIcon.className = "avatar-icon operator";
        }
    }
    lucide.createIcons();

    enforcePermissions();
    loadDataFromServer();
    showToast(`Access Granted: ${user.name} (${user.role})`, "success");
}

function enforcePermissions() {
    const isAdmin = state.user && state.user.role === 'Admin';

    // Toggle register SKU buttons
    const addBtn = document.getElementById("open-add-modal-btn");
    if (addBtn) {
        if (isAdmin) addBtn.classList.remove("hidden");
        else addBtn.classList.add("hidden");
    }

    // Toggle database reset button
    const resetBtn = document.getElementById("reset-data-btn");
    if (resetBtn) {
        if (isAdmin) resetBtn.classList.remove("hidden");
        else resetBtn.classList.add("hidden");
    }

    // Toggle actions column header in material inventory
    const tableHeader = document.querySelector("#inventory-table-element th.actions-header");
    if (tableHeader) {
        tableHeader.style.display = isAdmin ? "" : "none";
    }
}

async function loadDataFromServer() {
    try {
        const inventory = await apiFetch('/api/inventory');
        const sales = await apiFetch('/api/sales');

        state.inventory = inventory || [];
        state.salesLog = sales || [];

        // Determine SKU Counter automatically based on existing SKUs
        let maxCounter = 1;
        state.inventory.forEach(item => {
            const num = parseInt(item.sku.replace("UQ", ""));
            if (!isNaN(num) && num >= maxCounter) {
                maxCounter = num + 1;
            }
        });
        state.skuCounter = maxCounter;

        refreshApp();
    } catch (err) {
        console.error(err);
    }
}

// Refresh whole interface
function refreshApp() {
    renderKPIs();
    renderInventoryTable();
    updateOperationsSelects();
    renderSalesLog();
    renderAuditSummary();
    updateWarehouseProgress();
    updateCharts();
    updateNotifications();
}

// Initialize Application
document.addEventListener("DOMContentLoaded", () => {
    setupAuthUI();
    setupEventListeners();
    setupRouting();
    initializeCharts();

    const storedToken = localStorage.getItem("ferrumforge_token");
    const storedUser = localStorage.getItem("ferrumforge_user");

    if (storedToken && storedUser) {
        try {
            const user = JSON.parse(storedUser);
            loginUser(storedToken, user);
        } catch (e) {
            logoutUser();
        }
    } else {
        logoutUser();
    }
    lucide.createIcons();
});

// Toast alerts helper
function showToast(message, type = 'info') {
    const container = document.getElementById("toast-container");
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    
    let iconName = 'info';
    if (type === 'success') iconName = 'check-circle';
    if (type === 'warning') iconName = 'alert-triangle';
    if (type === 'error') iconName = 'x-circle';

    toast.innerHTML = `
        <i data-lucide="${iconName}"></i>
        <div class="toast-message">${message}</div>
    `;
    container.appendChild(toast);
    lucide.createIcons();

    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// CSS Toast FadeOut
const styleSheet = document.createElement("style");
styleSheet.innerText = `
    @keyframes fadeOut {
        to { opacity: 0; transform: translateY(-10px); }
    }
`;
document.head.appendChild(styleSheet);

// Routing / View Swapper
function setupRouting() {
    const menuItems = document.querySelectorAll(".menu-item");
    const tabContents = document.querySelectorAll(".tab-content");

    menuItems.forEach(item => {
        item.addEventListener("click", (e) => {
            e.preventDefault();
            const tabId = item.getAttribute("data-tab");

            menuItems.forEach(m => m.classList.remove("active"));
            tabContents.forEach(c => c.classList.remove("active"));

            item.classList.add("active");
            document.getElementById(`view-${tabId}`).classList.add("active");

            // Redraw charts if active tab is dashboard to prevent render glitches
            if (tabId === 'dashboard') {
                setTimeout(() => {
                    if (state.charts.category) state.charts.category.render();
                    if (state.charts.warehouse) state.charts.warehouse.render();
                }, 100);
            }
        });
    });
}

async function clearAppData() {
    try {
        await apiFetch('/api/reset', { method: 'POST' });
        showToast('All foundry data cleared from database.', 'warning');
        loadDataFromServer();
    } catch (err) {
        showToast(err.message || "Failed to clear database.", "error");
    }
}

// Set up event handlers for user authorization forms
function setupAuthUI() {
    const tabLogin = document.getElementById("tab-login-btn");
    const tabRegister = document.getElementById("tab-register-btn");
    const formLogin = document.getElementById("login-form");
    const formRegister = document.getElementById("register-form");
    const regRoleSelect = document.getElementById("reg-role");
    const adminKeyGroup = document.getElementById("admin-key-group");

    tabLogin.addEventListener("click", () => {
        tabLogin.classList.add("active");
        tabRegister.classList.remove("active");
        formLogin.classList.add("active");
        formRegister.classList.remove("active");
    });

    tabRegister.addEventListener("click", () => {
        tabRegister.classList.add("active");
        tabLogin.classList.remove("active");
        formRegister.classList.add("active");
        formLogin.classList.remove("active");
    });

    regRoleSelect.addEventListener("change", () => {
        if (regRoleSelect.value === 'Admin') {
            adminKeyGroup.classList.remove("hidden");
        } else {
            adminKeyGroup.classList.add("hidden");
        }
    });

    formLogin.addEventListener("submit", async (e) => {
        e.preventDefault();
        const username = document.getElementById("login-username").value.trim();
        const password = document.getElementById("login-password").value;

        try {
            const data = await apiFetch('/api/auth/login', {
                method: 'POST',
                body: JSON.stringify({ username, password })
            });
            loginUser(data.token, data.user);
        } catch (err) {
            showToast(err.message || "Failed to sign in", "error");
        }
    });

    formRegister.addEventListener("submit", async (e) => {
        e.preventDefault();
        const name = document.getElementById("reg-name").value.trim();
        const email = document.getElementById("reg-email").value.trim();
        const username = document.getElementById("reg-username").value.trim();
        const password = document.getElementById("reg-password").value;
        const role = regRoleSelect.value;
        const adminKey = document.getElementById("reg-admin-key").value;

        if (password.length < 6) {
            showToast("Password must be at least 6 characters.", "error");
            return;
        }

        try {
            await apiFetch('/api/auth/register', {
                method: 'POST',
                body: JSON.stringify({ name, email, username, password, role, adminKey })
            });
            showToast("Worker registered successfully. Please Sign In.", "success");
            tabLogin.click();
            formLogin.reset();
            formRegister.reset();
        } catch (err) {
            showToast(err.message || "Registration failed", "error");
        }
    });

    const logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", () => {
            logoutUser();
        });
    }
}

// UI Elements Event Listeners
function setupEventListeners() {
    // Theme toggle
    const themeBtn = document.getElementById("theme-toggle-btn");
    themeBtn.addEventListener("click", () => {
        document.body.classList.toggle("light-theme");
        document.body.classList.toggle("dark-theme");
        showToast(`Switched to ${document.body.classList.contains('light-theme') ? 'Light Slate' : 'Industrial Dark'} Mode`, 'info');
        
        // Dynamic chart options update on theme toggle
        const isDark = document.body.classList.contains("dark-theme");
        const chartTheme = { theme: { mode: isDark ? 'dark' : 'light' } };
        if (state.charts.category) state.charts.category.updateOptions(chartTheme);
        if (state.charts.warehouse) state.charts.warehouse.updateOptions(chartTheme);
    });

    // Reset data button
    const resetBtn = document.getElementById("reset-data-btn");
    if (resetBtn) {
        resetBtn.addEventListener("click", () => {
            if (confirm('This will permanently delete all inventory and sales records. Proceed?')) {
                clearAppData();
            }
        });
    }

    // Modal Control
    const modal = document.getElementById("sku-modal");
    const openModalBtn = document.getElementById("open-add-modal-btn");
    const closeModalBtn = document.getElementById("modal-close-btn");
    const cancelModalBtn = document.getElementById("modal-cancel-btn");
    const skuForm = document.getElementById("sku-form");

    const openModal = (titleText, isEditMode = false) => {
        document.getElementById("modal-title").innerText = titleText;
        modal.style.display = "flex";
        if (!isEditMode) {
            skuForm.reset();
            document.getElementById("edit-sku-index").value = "";
            document.getElementById("sku-qty").disabled = false;
        }
    };

    const closeModal = () => {
        modal.style.display = "none";
        skuForm.reset();
    };

    openModalBtn.addEventListener("click", () => openModal("Register Factory Material SKU"));
    closeModalBtn.addEventListener("click", closeModal);
    cancelModalBtn.addEventListener("click", closeModal);
    
    // Close modal on click outside content
    modal.addEventListener("click", (e) => {
        if (e.target === modal) closeModal();
    });

    // Form Submission: Add/Edit SKU
    skuForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        
        const editIndexVal = document.getElementById("edit-sku-index").value;
        const name = document.getElementById("sku-name").value.trim();
        const category = document.getElementById("sku-category").value;
        const quantity = parseInt(document.getElementById("sku-qty").value);
        const minStock = parseInt(document.getElementById("sku-min-stock").value);
        const location = document.getElementById("sku-location").value;
        const size = document.getElementById("sku-size").value.trim();
        const sell = parseFloat(document.getElementById("sku-sell-price").value);

        if (!name || isNaN(quantity) || isNaN(minStock) || !size || isNaN(sell)) {
            showToast("Please fill all fields with valid data.", "error");
            return;
        }

        if (quantity < 0 || minStock < 0 || sell < 0) {
            showToast("Numeric fields must be positive values.", "error");
            return;
        }

        try {
            if (editIndexVal === "") {
                // Add Mode
                const sku = `UQ${String(state.skuCounter++).padStart(3, '0')}`;
                const payload = { sku, name, quantity, size, sell, category, location, minStock };
                await apiFetch('/api/inventory', {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });
                showToast(`Registered SKU: ${sku} (${name})`, "success");
            } else {
                // Edit Mode
                const index = parseInt(editIndexVal);
                const original = state.inventory[index];
                const payload = {
                    name,
                    category,
                    minStock,
                    location,
                    size,
                    sell
                };
                await apiFetch(`/api/inventory?sku=${original.sku}`, {
                    method: 'PUT',
                    body: JSON.stringify(payload)
                });
                showToast(`Updated SKU details: ${original.sku}`, "success");
            }

            closeModal();
            loadDataFromServer();
        } catch (err) {
            showToast(err.message || "Failed to save material SKU", "error");
        }
    });

    // Search and filters on Inventory Table
    const invSearch = document.getElementById("inventory-search");
    const catFilter = document.getElementById("filter-category");
    const locFilter = document.getElementById("filter-location");
    const statFilter = document.getElementById("filter-status");

    [invSearch, catFilter, locFilter, statFilter].forEach(el => {
        el.addEventListener("input", () => renderInventoryTable());
    });

    // Global quick search
    const globalSearch = document.getElementById("global-search");
    globalSearch.addEventListener("input", () => {
        const query = globalSearch.value.trim();
        if (query) {
            // Redirect user to inventory tab and apply search
            document.getElementById("nav-inventory").click();
            invSearch.value = query;
            renderInventoryTable();
        }
    });

    // Notification dropdown trigger
    const notifTrigger = document.getElementById("notification-trigger");
    const notifDropdown = document.getElementById("notification-dropdown");
    const notifClose = document.getElementById("notif-close-btn");

    notifTrigger.addEventListener("click", (e) => {
        e.stopPropagation();
        notifDropdown.style.display = notifDropdown.style.display === "flex" ? "none" : "flex";
    });

    notifClose.addEventListener("click", () => notifDropdown.style.display = "none");
    document.addEventListener("click", () => notifDropdown.style.display = "none");
    notifDropdown.addEventListener("click", (e) => e.stopPropagation());

    // Operations Select elements interactive hints
    const dispatchSelect = document.getElementById("dispatch-item-select");
    dispatchSelect.addEventListener("change", () => {
        const sku = dispatchSelect.value;
        const item = state.inventory.find(i => i.sku === sku);
        const hint = document.getElementById("dispatch-stock-status");
        if (item) {
            const unitType = item.category === 'Equipment & Spares' ? 'units' : 'Tons';
            hint.innerText = `Available Stock: ${item.quantity} ${unitType} (Yard: ${item.location})`;
            document.getElementById("dispatch-qty").max = item.quantity;
        } else {
            hint.innerText = "Available Stock: 0 Tons";
        }
    });

    const restockSelect = document.getElementById("restock-item-select");
    restockSelect.addEventListener("change", () => {
        const sku = restockSelect.value;
        const item = state.inventory.find(i => i.sku === sku);
        const hint = document.getElementById("restock-current-status");
        if (item) {
            const unitType = item.category === 'Equipment & Spares' ? 'units' : 'Tons';
            hint.innerText = `Current Stock: ${item.quantity} ${unitType} (Yard: ${item.location})`;
        } else {
            hint.innerText = "Current Stock: 0 Tons";
        }
    });

    // Operations submit: Dispatch Shipment
    const dispatchForm = document.getElementById("dispatch-form");
    dispatchForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const sku = dispatchSelect.value;
        const qty = parseInt(document.getElementById("dispatch-qty").value);
        const destination = document.getElementById("dispatch-destination").value.trim();

        if (!sku || isNaN(qty) || qty <= 0 || !destination) {
            showToast("Please fill all dispatch fields.", "error");
            return;
        }

        try {
            const data = await apiFetch('/api/operations/dispatch', {
                method: 'POST',
                body: JSON.stringify({ sku, quantity: qty, destination })
            });
            showToast(data.message || "Dispatch logged successfully", "success");
            dispatchForm.reset();
            loadDataFromServer();
        } catch (err) {
            showToast(err.message || "Failed to process dispatch", "error");
        }
    });

    // Operations submit: Restock Intake
    const restockForm = document.getElementById("restock-form");
    restockForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const sku = restockSelect.value;
        const qty = parseInt(document.getElementById("restock-qty").value);
        const supplier = document.getElementById("restock-supplier").value.trim();

        if (!sku || isNaN(qty) || qty <= 0 || !supplier) {
            showToast("Please fill all restocking fields.", "error");
            return;
        }

        try {
            const data = await apiFetch('/api/operations/restock', {
                method: 'POST',
                body: JSON.stringify({ sku, quantity: qty, supplier })
            });
            showToast(data.message || "Material intake logged", "success");
            restockForm.reset();
            loadDataFromServer();
        } catch (err) {
            showToast(err.message || "Failed to process intake", "error");
        }
    });

    // Reports Tabs Switching
    const reportTabBtns = document.querySelectorAll(".report-tab-btn");
    reportTabBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            reportTabBtns.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            
            const target = btn.getAttribute("data-report");
            if (target === 'sales') {
                document.getElementById("report-sales-panel").classList.add("active");
                document.getElementById("report-summary-panel").classList.remove("active");
            } else {
                document.getElementById("report-sales-panel").classList.remove("active");
                document.getElementById("report-summary-panel").classList.add("active");
                renderAuditSummary();
            }
        });
    });

    // Audit refresh button
    document.getElementById("refresh-summary-btn").addEventListener("click", () => {
        renderAuditSummary();
        showToast("Audit values recalculated", "success");
    });

    // Export CSV
    document.getElementById("export-csv-btn").addEventListener("click", exportToCSV);

    // Sorting columns click
    const headers = document.querySelectorAll("#inventory-table-element th[data-sort]");
    headers.forEach(h => {
        h.addEventListener("click", () => {
            const field = h.getAttribute("data-sort");
            if (state.sortField === field) {
                state.sortAscending = !state.sortAscending;
            } else {
                state.sortField = field;
                state.sortAscending = true;
            }
            renderInventoryTable();
        });
    });
}

// KPI Dashboard Values Card renderer
function renderKPIs() {
    // Total material tons count (only summing Raw, Semi, and Finished products weight)
    const totalWeight = state.inventory
        .filter(i => i.category !== 'Equipment & Spares')
        .reduce((acc, curr) => acc + curr.quantity, 0);
    document.getElementById("kpi-total-items-val").innerText = `${totalWeight.toLocaleString()} t`;

    // Total valuation (selling price based)
    const totalValue = state.inventory.reduce((acc, curr) => acc + (curr.quantity * curr.sell), 0);
    document.getElementById("kpi-total-value-val").innerText = `₹${totalValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    // Total sales value
    const totalSales = state.salesLog.reduce((acc, curr) => acc + curr.total, 0);
    document.getElementById("kpi-sales-val").innerText = `₹${totalSales.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    document.getElementById("kpi-sales-count").innerText = `${state.salesLog.length} cargo dispatch${state.salesLog.length !== 1 ? 'es' : ''}`;

    // Low stock alerts
    const lowStockCount = state.inventory.filter(item => item.quantity <= item.minStock).length;
    const lowStockValElement = document.getElementById("kpi-low-stock-val");
    lowStockValElement.innerText = lowStockCount;

    const alertCard = document.getElementById("kpi-low-stock");
    const warningSubtitle = document.getElementById("kpi-low-stock-subtitle");
    if (lowStockCount > 0) {
        alertCard.classList.add("active");
        warningSubtitle.innerText = `${lowStockCount} alert${lowStockCount !== 1 ? 's' : ''} require yard intake`;
        warningSubtitle.className = "kpi-trend negative";
    } else {
        alertCard.classList.remove("active");
        warningSubtitle.innerText = "Foundry yards normal";
        warningSubtitle.className = "kpi-trend positive";
    }
}

// Render dynamic table rows for Inventory
function renderInventoryTable() {
    const tbody = document.getElementById("inventory-table-body");
    const emptyState = document.getElementById("table-empty-element");
    tbody.innerHTML = "";

    // Filters
    const searchQuery = document.getElementById("inventory-search").value.toLowerCase().trim();
    const catFilter = document.getElementById("filter-category").value;
    const locFilter = document.getElementById("filter-location").value;
    const statFilter = document.getElementById("filter-status").value;

    let filtered = state.inventory.filter(item => {
        // Search matches name, SKU, category, or location
        const matchesSearch = !searchQuery || 
            item.name.toLowerCase().includes(searchQuery) ||
            item.sku.toLowerCase().includes(searchQuery) ||
            item.category.toLowerCase().includes(searchQuery) ||
            item.location.toLowerCase().includes(searchQuery);

        const matchesCat = !catFilter || item.category === catFilter;
        const matchesLoc = !locFilter || item.location === locFilter;

        let matchesStat = true;
        if (statFilter === 'in-stock') {
            matchesStat = item.quantity > item.minStock;
        } else if (statFilter === 'low-stock') {
            matchesStat = item.quantity > 0 && item.quantity <= item.minStock;
        } else if (statFilter === 'out-of-stock') {
            matchesStat = item.quantity === 0;
        }

        return matchesSearch && matchesCat && matchesLoc && matchesStat;
    });

    // Sorting
    filtered.sort((a, b) => {
        let valA = a[state.sortField];
        let valB = b[state.sortField];

        // Format case insensitive for strings
        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();

        if (valA < valB) return state.sortAscending ? -1 : 1;
        if (valA > valB) return state.sortAscending ? 1 : -1;
        return 0;
    });

    // Update Sorting UI indicators
    const headers = document.querySelectorAll("#inventory-table-element th[data-sort]");
    headers.forEach(h => {
        const field = h.getAttribute("data-sort");
        if (field === state.sortField) {
            h.classList.add("active-sort");
            const icon = h.querySelector("i");
            if (icon) {
                icon.setAttribute("data-lucide", state.sortAscending ? "chevron-up" : "chevron-down");
            }
        } else {
            h.classList.remove("active-sort");
            const icon = h.querySelector("i");
            if (icon) {
                icon.setAttribute("data-lucide", "chevrons-up-down");
            }
        }
    });
    lucide.createIcons();

    if (filtered.length === 0) {
        emptyState.style.display = "flex";
        return;
    } else {
        emptyState.style.display = "none";
    }

    const isAdmin = state.user && state.user.role === 'Admin';

    filtered.forEach(item => {
        const row = document.createElement("tr");
        
        let statusBadge = `<span class="badge success">Optimal</span>`;
        if (item.quantity === 0) {
            row.className = "out-of-stock-row";
            statusBadge = `<span class="badge danger">Depleted</span>`;
        } else if (item.quantity <= item.minStock) {
            row.className = "low-stock-row";
            statusBadge = `<span class="badge warning">Low Stock</span>`;
        }

        const indexInMaster = state.inventory.findIndex(i => i.sku === item.sku);
        const qtyLabel = item.category === 'Equipment & Spares' ? 'pcs' : 't';

        let actionsCellHtml = '';
        if (isAdmin) {
            actionsCellHtml = `
                <td>
                    <div class="table-actions-cell">
                        <button class="btn-icon-only edit-item-btn" title="Edit Item Details" data-index="${indexInMaster}">
                            <i data-lucide="edit-3"></i>
                        </button>
                        <button class="btn-icon-only red-hover delete-item-btn" title="Delete Material SKU" data-sku="${item.sku}">
                            <i data-lucide="trash-2"></i>
                        </button>
                    </div>
                </td>
            `;
        } else {
            actionsCellHtml = `<td style="display: none;"></td>`;
        }

        row.innerHTML = `
            <td style="font-weight: 700; color: var(--accent-blue);">${item.sku}</td>
            <td style="font-weight: 600; color: var(--text-primary);">${item.name}</td>
            <td>${item.size || '—'}</td>
            <td><strong>${item.quantity.toLocaleString()}</strong> <span style="font-size: 11px; color: var(--text-muted);">${qtyLabel}</span></td>
            <td>₹${item.sell.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td>${item.category}</td>
            <td>${item.location}</td>
            <td>${item.minStock}</td>
            <td>${statusBadge}</td>
            ${actionsCellHtml}
        `;
        tbody.appendChild(row);
    });

    // Rebind table button events
    if (isAdmin) {
        document.querySelectorAll(".edit-item-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                const idx = parseInt(btn.getAttribute("data-index"));
                populateEditModal(idx);
            });
        });

        document.querySelectorAll(".delete-item-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                const sku = btn.getAttribute("data-sku");
                deleteInventoryItem(sku);
            });
        });
    }

    lucide.createIcons();
}

// Populate modal form for Edit SKU
function populateEditModal(index) {
    const item = state.inventory[index];
    document.getElementById("edit-sku-index").value = index;
    document.getElementById("sku-name").value = item.name;
    document.getElementById("sku-category").value = item.category;
    
    const qtyInput = document.getElementById("sku-qty");
    qtyInput.value = item.quantity;
    qtyInput.disabled = true; // Quantities updated via Operations tab
    
    document.getElementById("sku-min-stock").value = item.minStock;
    document.getElementById("sku-location").value = item.location;
    document.getElementById("sku-size").value = item.size || '';
    document.getElementById("sku-sell-price").value = item.sell;

    document.getElementById("modal-title").innerText = `Edit Material SKU: ${item.sku}`;
    document.getElementById("sku-modal").style.display = "flex";
}

// Delete inventory item handler
async function deleteInventoryItem(sku) {
    if (confirm(`Are you sure you want to delete material SKU ${sku}? This action is irreversible.`)) {
        try {
            await apiFetch(`/api/inventory?sku=${sku}`, {
                method: 'DELETE'
            });
            showToast(`SKU ${sku} deleted.`, 'warning');
            loadDataFromServer();
        } catch (err) {
            showToast(err.message || "Failed to delete SKU", "error");
        }
    }
}

// Update Operations form SKU dropdown menus
function updateOperationsSelects() {
    const dispatchSelect = document.getElementById("dispatch-item-select");
    const restockSelect = document.getElementById("restock-item-select");

    dispatchSelect.innerHTML = `<option value="" disabled selected>Select Material SKU to ship...</option>`;
    restockSelect.innerHTML = `<option value="" disabled selected>Select Material SKU to receive...</option>`;

    // Sort alphabetically by name
    const sortedInv = [...state.inventory].sort((a,b) => a.name.localeCompare(b.name));

    sortedInv.forEach(item => {
        const qtyLabel = item.category === 'Equipment & Spares' ? 'pcs' : 'tons';
        // Dispatches dropdown
        if (item.quantity > 0) {
            const opt = document.createElement("option");
            opt.value = item.sku;
            opt.innerText = `${item.sku} - ${item.name} (${item.quantity} ${qtyLabel} available)`;
            dispatchSelect.appendChild(opt);
        }

        // Restocking dropdown
        const optRestock = document.createElement("option");
        optRestock.value = item.sku;
        optRestock.innerText = `${item.sku} - ${item.name} (Current: ${item.quantity} ${qtyLabel})`;
        restockSelect.appendChild(optRestock);
    });

    // Reset details label
    document.getElementById("dispatch-stock-status").innerText = "Available Stock: 0 Tons";
    document.getElementById("restock-current-status").innerText = "Current Stock: 0 Tons";
}

// Render Sales Invoice logs in Reports
function renderSalesLog() {
    const tbody = document.getElementById("sales-log-table-body");
    const emptyState = document.getElementById("sales-log-empty");
    tbody.innerHTML = "";

    if (state.salesLog.length === 0) {
        emptyState.style.display = "flex";
        return;
    } else {
        emptyState.style.display = "none";
    }

    state.salesLog.forEach((sale, index) => {
        const row = document.createElement("tr");
        row.innerHTML = `
            <td>${sale.timestamp}</td>
            <td style="font-weight: 700; color: var(--accent-blue);">${sale.sku}</td>
            <td style="font-weight: 600; color: var(--text-primary);">${sale.name}</td>
            <td>${sale.category}</td>
            <td><strong>${sale.quantity.toLocaleString()}</strong></td>
            <td>₹${sale.price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td style="font-weight: 700; color: var(--accent-green);">₹${sale.total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td>${sale.destination}</td>
            <td>
                <button class="btn btn-sm btn-outline print-bill-btn" data-index="${index}" title="Print Dispatch Bill">
                    <i data-lucide="printer"></i>
                    <span>Print Bill</span>
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });

    // Bind print button events
    document.querySelectorAll(".print-bill-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const idx = parseInt(btn.getAttribute("data-index"));
            printDispatchBill(state.salesLog[idx]);
        });
    });

    lucide.createIcons();
}

// Fill the print template with a specific sale and trigger browser print dialog
function printDispatchBill(sale) {
    // Generate a human-readable invoice ID from SKU + timestamp
    const invoiceId = `FF-${sale.sku}-${sale.timestamp.replace(/[^0-9]/g, '').substring(0, 10)}`;

    document.getElementById("pb-invoice-id").innerText = invoiceId;
    document.getElementById("pb-date").innerText = sale.timestamp;
    document.getElementById("pb-destination").innerText = sale.destination;
    document.getElementById("pb-sku").innerText = sale.sku;
    document.getElementById("pb-name").innerText = sale.name;
    document.getElementById("pb-size").innerText = sale.size || '—';
    document.getElementById("pb-category").innerText = sale.category;

    const unitLabel = sale.category === 'Equipment & Spares' ? 'pcs' : 'Metric Tons';
    document.getElementById("pb-qty").innerText = `${sale.quantity.toLocaleString()} ${unitLabel}`;
    document.getElementById("pb-price").innerText = `₹${sale.price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / ton`;
    document.getElementById("pb-total").innerText = `₹${sale.total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    // Give the DOM a moment to update then print
    setTimeout(() => {
        window.print();
    }, 150);
}


// Warehouse Capacity calculations based on Units capacity limits
function updateWarehouseProgress() {
    const capacities = {
        "Raw Material Yard": { max: 5000, current: 0, items: 0 },
        "Finished Goods Hub": { max: 3000, current: 0, items: 0 },
        "Blast Furnace Yard": { max: 2000, current: 0, items: 0 },
        "Rolling Mill Area": { max: 2000, current: 0, items: 0 }
    };

    // Aggregate inventory numbers
    state.inventory.forEach(item => {
        if (capacities[item.location]) {
            capacities[item.location].current += item.quantity;
            capacities[item.location].items += 1;
        }
    });

    const whMap = {
        "Raw Material Yard": "A",
        "Finished Goods Hub": "B",
        "Blast Furnace Yard": "S1",
        "Rolling Mill Area": "S2"
    };

    // Update progress bars & UI
    for (const [wh, data] of Object.entries(capacities)) {
        const prefix = whMap[wh];
        const pct = Math.min(Math.round((data.current / data.max) * 100), 100);

        document.getElementById(`wh-${prefix}-capacity`).innerText = `${pct}%`;
        document.getElementById(`wh-${prefix}-items`).innerText = data.items;
        document.getElementById(`wh-${prefix}-stock`).innerText = data.current;

        const fill = document.querySelector(`.wh-${prefix}-fill`);
        fill.style.width = `${pct}%`;

        // Bar colors based on utility loads (Orange theme accents)
        if (pct >= 85) {
            fill.style.background = 'var(--accent-red)';
        } else if (pct >= 65) {
            fill.style.background = 'var(--accent-amber)';
        } else {
            fill.style.background = 'linear-gradient(90deg, var(--accent-blue), var(--accent-green))';
        }
    }
}

// Generate Text Audit Report
function renderAuditSummary() {
    const totalSKUs = state.inventory.length;
    const totalQty = state.inventory.reduce((acc, curr) => acc + curr.quantity, 0);
    const retailValue = state.inventory.reduce((acc, curr) => acc + (curr.quantity * curr.sell), 0);

    const categoryBreakdown = {};
    const warehouseBreakdown = {};
    const lowStockItems = [];

    state.inventory.forEach(item => {
        categoryBreakdown[item.category] = (categoryBreakdown[item.category] || 0) + item.quantity;
        warehouseBreakdown[item.location] = (warehouseBreakdown[item.location] || 0) + item.quantity;
        if (item.quantity <= item.minStock) {
            lowStockItems.push(item);
        }
    });

    const timestamp = new Date().toLocaleString();

    let auditString = `==========================================================
FERRUMFORGE FACILITY METRICS & RAW STOCK AUDIT
Generated: ${timestamp}
Plant Controller Signature: ${state.user ? state.user.name : 'Forge Master'}
==========================================================

SUMMARY STATISTICS:
----------------------------------------------------------
Total Unique material SKUs    : ${totalSKUs}
Total Weight/Units in Stock   : ${totalQty.toLocaleString()} t/pcs
Total Retail Stock Valuation  : ₹${retailValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}

STOCK BY METALLURGICAL CATEGORY:
----------------------------------------------------------\n`;

    for (const [cat, qty] of Object.entries(categoryBreakdown)) {
        const units = cat === 'Equipment & Spares' ? 'pcs' : 'tons';
        auditString += `${cat.padEnd(25)}: ${qty.toLocaleString()} ${units}\n`;
    }

    auditString += `\nSTOCK ALLOCATION BY STORAGE YARDS:
----------------------------------------------------------\n`;
    for (const [loc, qty] of Object.entries(warehouseBreakdown)) {
        auditString += `${loc.padEnd(25)}: ${qty.toLocaleString()} tons/units\n`;
    }

    auditString += `\nCRITICAL LOW STOCK & YARD REPLENISH ALERTS:
----------------------------------------------------------\n`;
    if (lowStockItems.length === 0) {
        auditString += `No active replenishing alerts. All blast furnaces and mills operating optimally.\n`;
    } else {
        lowStockItems.forEach(item => {
            const state = item.quantity === 0 ? "DEPLETED" : "CRITICAL LOW ALERT";
            const units = item.category === 'Equipment & Spares' ? 'pcs' : 't';
            auditString += `SKU: ${item.sku.padEnd(8)} | Material: ${item.name.padEnd(25)} | Weight: ${String(item.quantity).padEnd(4)} ${units} | Min Threshold: ${item.minStock} t (${state})\n`;
        });
    }

    auditString += `==========================================================
END OF FACILITY METRICS & STOCK AUDIT`;

    document.getElementById("audit-text-area").innerText = auditString;
}

// Download Table Inventory as CSV
function exportToCSV() {
    if (state.inventory.length === 0) {
        showToast("No material item in stock sheets to export.", "warning");
        return;
    }

    const headers = ["SKU", "Material Name", "Weight (Tons / Pcs)", "Size", "Selling Price/Ton (₹)", "Category", "Yard Location", "Min Threshold"];
    let csvContent = headers.join(",") + "\n";

    state.inventory.forEach(item => {
        const row = [
            `"${item.sku}"`,
            `"${item.name.replace(/"/g, '""')}"`,
            item.quantity,
            `"${item.size || ''}"`,
            item.sell,
            `"${item.category}"`,
            `"${item.location}"`,
            item.minStock
        ];
        csvContent += row.join(",") + "\n";
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `ferrumforge_materials_sheet_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("CSV exported and downloaded successfully.", "success");
}

// Initialize ApexCharts Options
function initializeCharts() {
    const isDark = document.body.classList.contains("dark-theme");

    // Donut chart: Categories
    const donutOptions = {
        chart: {
            type: 'donut',
            height: 280,
            background: 'transparent',
            foreColor: 'var(--text-secondary)'
        },
        labels: [],
        series: [],
        colors: ['#ff6d00', '#ffab00', '#78909c', '#ff3d00'],
        stroke: {
            show: true,
            width: 1,
            colors: ['rgba(255, 255, 255, 0.05)']
        },
        theme: {
            mode: isDark ? 'dark' : 'light'
        },
        plotOptions: {
            pie: {
                donut: {
                    size: '70%',
                    labels: {
                        show: true,
                        total: {
                            show: true,
                            label: 'Total Weight',
                            color: 'var(--text-secondary)',
                            formatter: function (w) {
                                // Summing non-equipment category weights for label
                                const total = w.globals.seriesTotals.reduce((a, b) => a + b, 0);
                                return total.toLocaleString() + ' t';
                            }
                        }
                    }
                }
            }
        },
        dataLabels: {
            enabled: false
        },
        legend: {
            position: 'bottom',
            fontFamily: 'var(--font-body)'
        }
    };

    state.charts.category = new ApexCharts(document.querySelector("#category-donut-chart"), donutOptions);
    state.charts.category.render();

    // Bar Chart: Warehouses (Yards)
    const barOptions = {
        chart: {
            type: 'bar',
            height: 280,
            background: 'transparent',
            foreColor: 'var(--text-secondary)',
            toolbar: {
                show: false
            }
        },
        colors: ['#ff6d00'],
        series: [{
            name: 'Weight (Tons)',
            data: []
        }],
        plotOptions: {
            bar: {
                horizontal: false,
                columnWidth: '45%',
                borderRadius: 4
            }
        },
        theme: {
            mode: isDark ? 'dark' : 'light'
        },
        stroke: {
            show: true,
            width: 0
        },
        grid: {
            borderColor: 'var(--border-color)',
            strokeDashArray: 4
        },
        xaxis: {
            categories: ['Raw Material Yard', 'Finished Goods Hub', 'Blast Furnace Yard', 'Rolling Mill Area', 'Tooling Room'],
            labels: {
                style: {
                    fontFamily: 'var(--font-body)'
                }
            }
        },
        yaxis: {
            labels: {
                style: {
                    fontFamily: 'var(--font-body)'
                }
            }
        },
        dataLabels: {
            enabled: false
        }
    };

    state.charts.warehouse = new ApexCharts(document.querySelector("#warehouse-bar-chart"), barOptions);
    state.charts.warehouse.render();
}

// Update charts dataset dynamically
function updateCharts() {
    // 1. Category distribution
    const categorySums = { "Raw Materials": 0, "Semi-Finished Goods": 0, "Finished Products": 0, "Equipment & Spares": 0 };
    state.inventory.forEach(item => {
        if (categorySums[item.category] !== undefined) {
            categorySums[item.category] += item.quantity;
        }
    });

    const catLabels = Object.keys(categorySums);
    const catSeries = Object.values(categorySums);

    if (state.charts.category) {
        state.charts.category.updateOptions({
            labels: catLabels,
            series: catSeries
        });
    }

    // 2. Warehouse (Yard) Distribution
    const warehouseSums = { "Raw Material Yard": 0, "Finished Goods Hub": 0, "Blast Furnace Yard": 0, "Rolling Mill Area": 0, "Tooling Room": 0 };
    state.inventory.forEach(item => {
        if (warehouseSums[item.location] !== undefined) {
            warehouseSums[item.location] += item.quantity;
        }
    });

    const whSeries = [
        warehouseSums["Raw Material Yard"],
        warehouseSums["Finished Goods Hub"],
        warehouseSums["Blast Furnace Yard"],
        warehouseSums["Rolling Mill Area"],
        warehouseSums["Tooling Room"]
    ];

    if (state.charts.warehouse) {
        state.charts.warehouse.updateSeries([{
            name: 'Weight (Tons/Units)',
            data: whSeries
        }]);
    }
}

// Notification Dropdown rendering warnings
function updateNotifications() {
    const listBody = document.getElementById("notif-list-body");
    const badge = document.getElementById("low-stock-badge");
    listBody.innerHTML = "";

    const lowStockItems = state.inventory.filter(item => item.quantity <= item.minStock);
    badge.innerText = lowStockItems.length;

    if (lowStockItems.length === 0) {
        listBody.innerHTML = `<div class="notif-empty">All material yards and smelters within normal limits.</div>`;
        badge.style.display = "none";
        return;
    }

    badge.style.display = "flex";

    lowStockItems.forEach(item => {
        const div = document.createElement("div");
        div.className = "notif-item";
        
        const unitType = item.category === 'Equipment & Spares' ? 'pcs' : 'tons';
        let message = `Material SKU <strong>${item.sku}</strong> (${item.name}) is below melting threshold limits. Current: <strong>${item.quantity}</strong> ${unitType} (Min: ${item.minStock} t).`;
        if (item.quantity === 0) {
            message = `Material SKU <strong>${item.sku}</strong> (${item.name}) is completely <strong>Depleted</strong> from foundry yards.`;
        }

        div.innerHTML = `
            <i data-lucide="alert-triangle"></i>
            <div class="notif-content">
                <p>${message}</p>
                <div class="notif-time">Storage Area: ${item.location}</div>
            </div>
        `;
        listBody.appendChild(div);
    });
    lucide.createIcons();
}
