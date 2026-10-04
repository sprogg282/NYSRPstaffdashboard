// ==========================================
// NYSRP ERLC Staff Dashboard - Application JS
// ==========================================

// Pre-defined credentials
const VALID_PASSWORD = "nysrp_staff"; 

// Rank Hierarchy Levels
const RANK_LEVELS = {
    "owner": 10,
    "co owner": 9,
    "director": 8,
    "management": 7,
    "internal affairs": 6,
    "staff supervisor": 5,
    "administrator": 4,
    "admin": 4,
    "junior administrator": 3,
    "moderator": 2,
    "junior moderator": 1,
    "staff": 1
};

function canHandleBolo(rank) {
    return ["owner", "co owner", "management", "director"].includes(String(rank || "").trim().toLowerCase());
}

function isAdminAndUp(rank) {
    return RANK_LEVELS[String(rank || "").trim().toLowerCase()] >= RANK_LEVELS["administrator"];
}

// Default Message Presets
const DEFAULT_PRESETS = [
    {
        id: "p1",
        title: "Comms Check Invite",
        template: "Hello im [user] from [rank] we see you are not in our comms please join using this code Ad4HHcp349"
    },
    {
        id: "p2",
        title: "General Greeting",
        template: "Hello Im [user] I am a [rank] How may i help you?"
    },
    {
        id: "p3",
        title: "FRP (Fail Roleplay) Warning",
        template: "Hello, I'm [user] ([rank]). You are being warned for FRP (Fail Roleplay). Please roleplay realistically or further action will be taken."
    },
    {
        id: "p4",
        title: "LTAP Warning",
        template: "Hello, I'm [user] ([rank]). Please remain in-game. Leaving to avoid staff action (LTAP) will result in a ban."
    }
];

// Default Sample Data (if localStorage is empty)
const DEFAULT_LOGS = [
    {
        id: "1",
        type: "ban",
        username: "RobloxGamer123",
        robloxId: "48102938",
        reason: "FRP (Failed to Roleplay) & LTAP (Leaving to Avoid Punishment) during active traffic stop.",
        duration: "7 Days",
        staff: "Officer_John",
        date: "2026-06-16T14:32:00Z",
        evidence: "https://youtube.com/watch?v=example1"
    },
    {
        id: "2",
        type: "warn",
        username: "SpeedyRacer",
        robloxId: "9283741",
        reason: "VDF (Vehicle Deathmatch) - Ramming police cruisers at the intersection.",
        duration: "",
        staff: "Sergeant_Davis",
        date: "2026-06-16T16:15:00Z",
        evidence: "https://imgur.com/example2"
    },
    {
        id: "3",
        type: "kick",
        username: "TrollMaster99",
        robloxId: "102938475",
        reason: "Mic spamming in Public VC area and refusing to cooperate with staff instructions.",
        duration: "",
        staff: "Officer_John",
        date: "2026-06-16T17:45:00Z",
        evidence: ""
    },
    {
        id: "4",
        type: "bolo",
        username: "CopChaserX",
        robloxId: "85741029",
        reason: "Active bolo: Repeatedly resetting during pursuits and using exploits.",
        duration: "30 Days",
        staff: "Admin_Sarah",
        date: "2026-06-16T18:05:00Z",
        evidence: "https://streamable.com/example3",
        boloStatus: "pending"
    },
    {
        id: "5",
        type: "note",
        username: "Civilian_Joe",
        robloxId: "5748392",
        reason: "Cooperative during a major roleplay scenario. Good behavior record noted.",
        duration: "",
        staff: "Sergeant_Davis",
        date: "2026-06-16T18:50:00Z",
        evidence: ""
    }
];

// Session Migration (Force logout if logged in from an older version without rank)
if (localStorage.getItem("nysrp_logged_in_staff") && !localStorage.getItem("nysrp_logged_in_rank")) {
    localStorage.removeItem("nysrp_logged_in_staff");
}

// Initialize LocalStorage Databases
if (!localStorage.getItem("nysrp_logs")) {
    localStorage.setItem("nysrp_logs", JSON.stringify(DEFAULT_LOGS));
}
if (!localStorage.getItem("nysrp_presets")) {
    localStorage.setItem("nysrp_presets", JSON.stringify(DEFAULT_PRESETS));
}

// State Management
let currentStaff = localStorage.getItem("nysrp_logged_in_staff") || null;
let staffRank = localStorage.getItem("nysrp_logged_in_rank") || "moderator";
let logs = JSON.parse(localStorage.getItem("nysrp_logs"));
let presets = JSON.parse(localStorage.getItem("nysrp_presets"));
let currentFilter = "all";
let logToDeleteId = null;
let currentPresetEditId = null;

// Database migration check: ensure all BOLOs in localStorage have a boloStatus
let migrated = false;
logs = logs.map(log => {
    if (log.type === "bolo" && !log.boloStatus) {
        log.boloStatus = "pending";
        migrated = true;
    }
    return log;
});
if (migrated) {
    localStorage.setItem("nysrp_logs", JSON.stringify(logs));
}

// DOM Elements
const loginPage = document.getElementById("loginPage");
const dashboardPage = document.getElementById("dashboardPage");
const loginForm = document.getElementById("loginForm");
const loginUsername = document.getElementById("loginUsername");
const loginPassword = document.getElementById("loginPassword");
const loginRank = document.getElementById("loginRank");
const staffNameSidebar = document.getElementById("staffNameSidebar");
const staffRoleSidebar = document.getElementById("staffRoleSidebar");
const staffAvatarSidebar = document.getElementById("staffAvatarSidebar");
const currentDate = document.getElementById("currentDate");
const pageTitle = document.getElementById("pageTitle");

// Nav Buttons
const navOverview = document.getElementById("navOverview");
const navLogs = document.getElementById("navLogs");
const navSearch = document.getElementById("navSearch");
const navToolbox = document.getElementById("navToolbox");
const sidebarLinks = document.querySelectorAll(".sidebar-nav > a:not(.action-item)");
const actionLinks = document.querySelectorAll(".action-item");

// Pages
const overviewPage = document.getElementById("overviewPage");
const logsPage = document.getElementById("logsPage");
const searchPage = document.getElementById("searchPage");
const toolboxPage = document.getElementById("toolboxPage");
const pages = [overviewPage, logsPage, searchPage, toolboxPage];

// Modals
const logModal = document.getElementById("logModal");
const logModalForm = document.getElementById("logForm");
const newLogSelector = document.getElementById("newLogSelector");
const deleteModal = document.getElementById("deleteModal");
const presetModal = document.getElementById("presetModal");
const presetForm = document.getElementById("presetForm");

// Modal Inputs
const modalTitle = document.getElementById("modalTitle");
const modalIcon = document.getElementById("modalIcon");
const logTypeInput = document.getElementById("logType");
const logUsernameInput = document.getElementById("logUsername");
const logRobloxIdInput = document.getElementById("logRobloxId");
const logDurationInput = document.getElementById("logDuration");
const logReasonInput = document.getElementById("logReason");
const logEvidenceInput = document.getElementById("logEvidence");
const durationGroup = document.getElementById("durationGroup");
const evidenceGroup = document.getElementById("evidenceGroup");
const robloxAutocomplete = document.getElementById("robloxAutocomplete");

// Preset Inputs
const presetModalTitle = document.getElementById("presetModalTitle");
const presetIdInput = document.getElementById("presetId");
const presetTitleInput = document.getElementById("presetTitle");
const presetTemplateInput = document.getElementById("presetTemplate");
const tbStaffName = document.getElementById("tbStaffName");
const tbStaffRank = document.getElementById("tbStaffRank");
const presetsContainer = document.getElementById("presetsContainer");

// Toast System
const toastContainer = document.getElementById("toastContainer");

// Show Toast Notification
function showToast(title, message, type = "success") {
    const toast = document.createElement("div");
    toast.className = `toast`;
    
    let iconClass = "fa-check-circle success";
    if (type === "error") iconClass = "fa-exclamation-circle error";
    if (type === "info") iconClass = "fa-info-circle info";

    toast.innerHTML = `
        <div class="toast-icon ${type}">
            <i class="fas ${iconClass}"></i>
        </div>
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            <div class="toast-message">${message}</div>
        </div>
    `;

    toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.classList.add("toast-out");
        toast.addEventListener("animationend", () => {
            toast.remove();
        });
    }, 4000);
}

// Format Dates
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}

// Update Topbar Date
function updateDateTime() {
    if (currentDate) {
        const now = new Date();
        currentDate.textContent = now.toLocaleDateString("en-US", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric"
        }) + " | " + now.toLocaleTimeString("en-US", { hour: '2-digit', minute: '2-digit' });
    }
}
setInterval(updateDateTime, 60000);
updateDateTime();

// Authentication Handling
loginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const username = loginUsername.value.trim();
    const password = loginPassword.value;
    const rank = loginRank.value;

    if (password === VALID_PASSWORD) {
        currentStaff = username;
        staffRank = rank;
        localStorage.setItem("nysrp_logged_in_staff", username);
        localStorage.setItem("nysrp_logged_in_rank", rank);
        
        showToast("Access Granted", `Welcome back, ${rank} ${username}!`, "success");
        initDashboard();
    } else {
        showToast("Access Denied", "Incorrect staff password. Please try again.", "error");
        loginPassword.value = "";
        loginPassword.focus();
    }
});

// Logout Handling
document.getElementById("logoutBtn").addEventListener("click", () => {
    currentStaff = null;
    staffRank = "Mod";
    localStorage.removeItem("nysrp_logged_in_staff");
    localStorage.removeItem("nysrp_logged_in_rank");
    
    dashboardPage.classList.add("hidden");
    loginPage.classList.remove("hidden");
    loginUsername.value = "";
    loginPassword.value = "";
    loginRank.selectedIndex = 0;
    showToast("Signed Out", "You have successfully signed out of the dashboard.", "info");
});

// Switch Between Pages
function switchPage(pageId) {
    pages.forEach(p => p.classList.remove("active"));
    sidebarLinks.forEach(link => link.classList.remove("active"));

    if (pageId === "overview") {
        overviewPage.classList.add("active");
        navOverview.classList.add("active");
        pageTitle.textContent = "Overview";
        renderOverview();
    } else if (pageId === "logs") {
        logsPage.classList.add("active");
        navLogs.classList.add("active");
        pageTitle.textContent = "Action Logs";
        renderLogsTable();
    } else if (pageId === "search") {
        searchPage.classList.add("active");
        navSearch.classList.add("active");
        pageTitle.textContent = "Search Logs";
        document.getElementById("searchInput").focus();
        renderSearchTable();
    } else if (pageId === "toolbox") {
        toolboxPage.classList.add("active");
        navToolbox.classList.add("active");
        pageTitle.textContent = "Staff Toolbox";
        tbStaffName.value = currentStaff || "";
        tbStaffRank.value = staffRank || "Mod";
        renderPresets();
    }
}

// Wire up sidebar links
sidebarLinks.forEach(link => {
    link.addEventListener("click", (e) => {
        e.preventDefault();
        const page = link.getAttribute("data-page");
        switchPage(page);
    });
});

document.getElementById("viewAllLogs").addEventListener("click", (e) => {
    e.preventDefault();
    switchPage("logs");
});

// Modal Actions Configs (Updated with fa-user-slash for Kicks)
const ACTION_CONFIG = {
    warn: { title: "Issue Warning", icon: "fa-exclamation-triangle", color: "var(--warn-color)", hasDuration: false },
    kick: { title: "Kick Player", icon: "fa-user-slash", color: "var(--kick-color)", hasDuration: false },
    ban: { title: "Ban Player", icon: "fa-gavel", color: "var(--ban-color)", hasDuration: true },
    bolo: { title: "Bolo", icon: "fa-binoculars", color: "var(--bolo-color)", hasDuration: true },
    note: { title: "Add Note", icon: "fa-sticky-note", color: "var(--note-color)", hasDuration: false }
};

// Open Action Modal
function openActionModal(actionType) {
    const config = ACTION_CONFIG[actionType];
    if (!config) return;

    logModalForm.reset();
    robloxAutocomplete.classList.add("hidden");
    
    logTypeInput.value = actionType;
    modalTitle.textContent = config.title;
    modalIcon.innerHTML = `<i class="fas ${config.icon}"></i>`;
    modalIcon.style.color = config.color;
    modalIcon.style.background = `rgba(253, 135, 1, 0.1)`;

    if (config.hasDuration) {
        durationGroup.style.display = "flex";
        logDurationInput.setAttribute("required", "true");
    } else {
        durationGroup.style.display = "none";
        logDurationInput.removeAttribute("required");
    }

    if (actionType === "note") {
        evidenceGroup.style.display = "none";
    } else {
        evidenceGroup.style.display = "flex";
    }

    newLogSelector.classList.remove("visible");
    logModal.classList.add("visible");
    setTimeout(() => {
        logUsernameInput.focus();
    }, 150);
}

// Wire up action triggers
actionLinks.forEach(link => {
    link.addEventListener("click", (e) => {
        e.preventDefault();
        const action = link.getAttribute("data-action");
        if (ACTION_CONFIG[action]) {
            openActionModal(action);
        }
    });
});

document.querySelectorAll(".quick-action-card").forEach(card => {
    card.addEventListener("click", () => {
        const action = card.getAttribute("data-action");
        openActionModal(action);
    });
});

document.getElementById("newLogBtn").addEventListener("click", () => {
    newLogSelector.classList.add("visible");
});

document.querySelectorAll(".log-type-option").forEach(btn => {
    btn.addEventListener("click", () => {
        const action = btn.getAttribute("data-action");
        openActionModal(action);
    });
});

// Close Modals
const closeButtons = document.querySelectorAll(".modal-close, .btn-cancel, .modal-overlay");
closeButtons.forEach(btn => {
    btn.addEventListener("click", (e) => {
        if (e.target === logModal || e.target === newLogSelector || e.target === deleteModal || e.target === presetModal || e.target.closest(".modal-close") || e.target.classList.contains("btn-cancel")) {
            logModal.classList.remove("visible");
            newLogSelector.classList.remove("visible");
            deleteModal.classList.remove("visible");
            presetModal.classList.remove("visible");
        }
    });
});

// Handle Log Form Submission with Real Roblox Verification
logModalForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const type = logTypeInput.value;
    const username = logUsernameInput.value.trim();
    let robloxId = logRobloxIdInput.value.trim();
    const duration = durationGroup.style.display !== "none" ? logDurationInput.value : "";
    const reason = logReasonInput.value.trim();
    const evidence = logEvidenceInput.value.trim() || "";

    const submitBtn = document.getElementById("modalSubmitBtn");
    const originalBtnContent = submitBtn.innerHTML;

    // Show loading indicator
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Verifying Roblox User...`;

    // 1. Resolve username and fetch ID to make it 100% real Roblox verification
    try {
        const resolvedUser = await resolveExactRobloxUser(username);
        if (!resolvedUser) {
            showToast("Verification Failed", `"${username}" is not a valid Roblox username. Please check your spelling.`, "error");
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalBtnContent;
            return;
        }
        robloxId = resolvedUser.id;
        logRobloxIdInput.value = robloxId;
        logUsernameInput.value = resolvedUser.name; // Use correctly cased username
    } catch (err) {
        console.error(err);
        showToast("Network Error", "Unable to reach Roblox verification servers. Try again later.", "error");
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnContent;
        return;
    }

    const newLog = {
        id: Date.now().toString(),
        type,
        username: logUsernameInput.value,
        robloxId,
        reason,
        duration,
        staff: currentStaff || "Staff",
        date: new Date().toISOString(),
        evidence,
        boloStatus: type === "bolo" ? "pending" : undefined
    };

    logs.unshift(newLog);
    localStorage.setItem("nysrp_logs", JSON.stringify(logs));

    showToast("Log Submitted", `Successfully logged ${type.toUpperCase()} for ${logUsernameInput.value}`, "success");
    logModal.classList.remove("visible");
    
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalBtnContent;

    if (overviewPage.classList.contains("active")) {
        renderOverview();
    } else if (logsPage.classList.contains("active")) {
        renderLogsTable();
    } else if (searchPage.classList.contains("active")) {
        renderSearchTable();
    }
});

// Resolve Roblox User via API POST Request
async function resolveExactRobloxUser(username) {
    const response = await fetch("/api/roblox/lookup", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
        },
        body: JSON.stringify({
            usernames: [username],
            excludeBannedUsers: false
        })
    });
    
    if (!response.ok) throw new Error("Roblox usernames endpoint failed");
    
    const result = await response.json();
    if (result.data && result.data.length > 0) {
        return {
            id: result.data[0].id.toString(),
            name: result.data[0].name
        };
    }
    return null;
}

// ==========================================
// ROBLOX AUTOCOMPLETE CONTROLLER (REAL ONLY)
// ==========================================

let autocompleteTimeout = null;

logUsernameInput.addEventListener("input", () => {
    const query = logUsernameInput.value.trim();
    
    if (autocompleteTimeout) clearTimeout(autocompleteTimeout);
    
    if (query.length < 3) {
        robloxAutocomplete.classList.add("hidden");
        return;
    }
    
    autocompleteTimeout = setTimeout(() => {
        fetchRobloxUsersReal(query);
    }, 400);
});

document.addEventListener("click", (e) => {
    if (!e.target.closest(".autocomplete-wrapper")) {
        robloxAutocomplete.classList.add("hidden");
    }
});

async function fetchRobloxUsersReal(query) {
    robloxAutocomplete.innerHTML = `
        <div class="autocomplete-loading">
            <i class="fas fa-spinner"></i>
            <span>Searching Roblox...</span>
        </div>
    `;
    robloxAutocomplete.classList.remove("hidden");
    
    try {
        const robloxApiUrl = `https://users.roblox.com/v1/users/search?keyword=${encodeURIComponent(query)}&limit=5`;
        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(robloxApiUrl)}`;
        
        const response = await fetch(proxyUrl);
        if (!response.ok) throw new Error("CORS Proxy failed");
        
        const data = await response.json();
        
        if (!data.data || data.data.length === 0) {
            robloxAutocomplete.innerHTML = `
                <div class="autocomplete-loading">
                    <i class="fas fa-exclamation-circle" style="color: var(--ban-color)"></i>
                    <span>No Roblox users found.</span>
                </div>
            `;
            return;
        }
        
        const userIds = data.data.map(u => u.id);
        
        // Fetch avatar thumbnails
        const thumbnailApi = `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userIds.join(",")}&size=48x48&format=Png&isCircular=true`;
        const thumbProxy = `https://corsproxy.io/?${encodeURIComponent(thumbnailApi)}`;
        
        let avatars = {};
        try {
            const thumbRes = await fetch(thumbProxy);
            const thumbData = await thumbRes.json();
            if (thumbData.data) {
                thumbData.data.forEach(item => {
                    avatars[item.targetId] = item.imageUrl;
                });
            }
        } catch (e) {
            console.warn("Avatar headshot fetch failed");
        }
        
        renderAutocompleteResultsReal(data.data, avatars);
        
    } catch (error) {
        console.error("Autocomplete fetch error:", error);
        robloxAutocomplete.innerHTML = `
            <div class="autocomplete-loading" style="padding: 12px; font-size: 0.8rem; text-align: center; color: var(--text-muted);">
                <i class="fas fa-wifi-slash" style="color: var(--warn-color); margin-bottom: 4px; display: block; font-size: 1.1rem;"></i>
                <span>Offline mode. Enter user manually to verify.</span>
            </div>
        `;
    }
}

function renderAutocompleteResultsReal(users, avatars) {
    robloxAutocomplete.innerHTML = users.map(user => {
        const avatarUrl = avatars[user.id] || "https://tr.rbxcdn.com/30day-avatarheadshot/48/48/AvatarHeadshot/Png/isCircular";
        return `
            <div class="autocomplete-item" data-id="${user.id}" data-username="${escapeHTML(user.name)}">
                <img class="autocomplete-avatar" src="${avatarUrl}" alt="${escapeHTML(user.name)}">
                <div class="autocomplete-info">
                    <span class="autocomplete-username">${escapeHTML(user.name)}</span>
                    <span class="autocomplete-displayname">ID: ${user.id}</span>
                </div>
            </div>
        `;
    }).join("");
    
    setupAutocompleteClickListeners();
}

// ==========================================
// PRESET MESSAGES / TOOLBOX CONTROLLER
// ==========================================

if (tbStaffName) {
    tbStaffName.addEventListener("input", () => {
        currentStaff = tbStaffName.value.trim() || "Staff";
        localStorage.setItem("nysrp_logged_in_staff", currentStaff);
        staffNameSidebar.textContent = currentStaff;
        
        const initials = currentStaff.substring(0, 2).toUpperCase();
        staffAvatarSidebar.innerHTML = `<span style="color: #fff; font-weight: 800; font-size: 0.85rem;">${initials}</span>`;
        
        renderPresets();
    });
}

if (tbStaffRank) {
    tbStaffRank.addEventListener("input", () => {
        staffRank = tbStaffRank.value.trim() || "Mod";
        localStorage.setItem("nysrp_logged_in_rank", staffRank);
        if (staffRoleSidebar) {
            staffRoleSidebar.textContent = staffRank;
        }
        renderPresets();
    });
}

function parsePresetTemplate(template) {
    const staff = currentStaff || "Staff";
    const rank = staffRank || "Mod";
    
    return template
        .replace(/\[user\]/gi, staff)
        .replace(/\[rank\]/gi, rank);
}

function renderPresets() {
    if (!presetsContainer) return;
    
    if (presets.length === 0) {
        presetsContainer.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1; background: var(--bg-card); border-radius: var(--radius-lg); border: 1px dashed var(--border-color); padding: 50px 20px;">
                <i class="fas fa-toolbox" style="font-size: 2.5rem;"></i>
                <p>No messages presets configured yet.</p>
                <button class="btn-new-log" onclick="openPresetModal(null)" style="margin-top: 10px;">
                    <i class="fas fa-plus"></i> Create First Preset
                </button>
            </div>
        `;
        return;
    }
    
    presetsContainer.innerHTML = presets.map((preset, index) => {
        const previewHtml = escapeHTML(preset.template)
            .replace(/\[user\]/gi, `<span class="preset-placeholder-highlight">${escapeHTML(currentStaff || "Staff")}</span>`)
            .replace(/\[rank\]/gi, `<span class="preset-placeholder-highlight">${escapeHTML(staffRank || "Mod")}</span>`);
            
        return `
            <div class="preset-card log-row-enter" style="animation-delay: ${index * 0.05}s">
                <div class="preset-card-header">
                    <span class="preset-card-title">${escapeHTML(preset.title)}</span>
                </div>
                <div>
                    <div class="preset-preview-label">Live Preview</div>
                    <div class="preset-preview-box">${previewHtml}</div>
                </div>
                <div class="preset-card-actions">
                    <button class="btn-preset-action btn-copy-preset" onclick="copyPresetToClipboard('${preset.id}', this)">
                        <i class="fas fa-copy"></i>
                        <span>Copy Message</span>
                    </button>
                    <button class="btn-preset-action" onclick="openPresetModal('${preset.id}')" title="Edit Template">
                        <i class="fas fa-edit"></i>
                        <span>Edit</span>
                    </button>
                    <button class="btn-preset-action btn-delete-preset" onclick="deletePreset('${preset.id}')" title="Delete Preset">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            </div>
        `;
    }).join("");
}

window.copyPresetToClipboard = function(id, button) {
    const preset = presets.find(p => p.id === id);
    if (!preset) return;
    
    const textToCopy = parsePresetTemplate(preset.template);
    
    navigator.clipboard.writeText(textToCopy).then(() => {
        const label = button.querySelector("span");
        const icon = button.querySelector("i");
        
        const originalText = label.textContent;
        const originalIconClass = icon.className;
        
        label.textContent = "Copied!";
        icon.className = "fas fa-check";
        
        showToast("Preset Copied", "Message copied to your clipboard successfully.", "success");
        
        setTimeout(() => {
            label.textContent = originalText;
            icon.className = originalIconClass;
        }, 2000);
    }).catch(err => {
        showToast("Copy Failed", "Unable to copy text.", "error");
    });
};

window.openPresetModal = function(id = null) {
    presetForm.reset();
    
    if (id) {
        const preset = presets.find(p => p.id === id);
        if (!preset) return;
        
        currentPresetEditId = id;
        presetIdInput.value = id;
        presetTitleInput.value = preset.title;
        presetTemplateInput.value = preset.template;
        presetModalTitle.textContent = "Edit Message Preset";
    } else {
        currentPresetEditId = null;
        presetIdInput.value = "";
        presetModalTitle.textContent = "Create Message Preset";
    }
    
    presetModal.classList.add("visible");
    setTimeout(() => {
        presetTitleInput.focus();
    }, 150);
};

const btnCreatePreset = document.getElementById("btnCreatePreset");
if (btnCreatePreset) {
    btnCreatePreset.addEventListener("click", () => {
        openPresetModal(null);
    });
}

presetForm.addEventListener("submit", (e) => {
    e.preventDefault();
    
    const id = presetIdInput.value;
    const title = presetTitleInput.value.trim();
    const template = presetTemplateInput.value.trim();
    
    if (id) {
        presets = presets.map(p => p.id === id ? { id, title, template } : p);
        showToast("Preset Updated", `Successfully updated preset "${title}"`, "success");
    } else {
        const newPreset = {
            id: Date.now().toString(),
            title,
            template
        };
        presets.push(newPreset);
        showToast("Preset Created", `Successfully created preset "${title}"`, "success");
    }
    
    localStorage.setItem("nysrp_presets", JSON.stringify(presets));
    presetModal.classList.remove("visible");
    renderPresets();
});

window.deletePreset = function(id) {
    const preset = presets.find(p => p.id === id);
    if (!preset) return;
    
    if (confirm(`Are you sure you want to delete the preset "${preset.title}"?`)) {
        presets = presets.filter(p => p.id !== id);
        localStorage.setItem("nysrp_presets", JSON.stringify(presets));
        showToast("Preset Deleted", "Preset template removed.", "info");
        renderPresets();
    }
};

// ==========================================
// ACTIVE BOLO RESOLUTION & COPY CONTROLLERS
// ==========================================

window.copyToClipboardText = function(text, textDescription) {
    navigator.clipboard.writeText(text).then(() => {
        showToast("Copied", `${textDescription} copied to clipboard!`, "success");
    }).catch(() => {
        showToast("Copy Failed", "Failed to copy text.", "error");
    });
};

window.copyBoloCommand = function(robloxId, reason) {
    const cleanReason = reason || "Bolo";
    const commandText = `:ban ${robloxId} ${cleanReason}`;
    window.copyToClipboardText(commandText, "Ban Command");
};

window.completeActiveBolo = function(logId) {
    if (!canHandleBolo(staffRank)) {
        showToast("Permission Denied", "Only approved ranks can resolve bolos.", "error");
        return;
    }

    const logIndex = logs.findIndex(log => log.id === logId);
    if (logIndex === -1) return;

    const log = logs[logIndex];
    log.boloStatus = "completed";
    
    localStorage.setItem("nysrp_logs", JSON.stringify(logs));

    const banCmd = `:ban ${log.robloxId} Bolo`;
    navigator.clipboard.writeText(banCmd).then(() => {
        showToast("BOLO Completed", `Ban command copied to clipboard: ${banCmd}`, "success");
    }).catch(() => {
        showToast("BOLO Completed", "BOLO status updated.", "success");
    });

    if (overviewPage.classList.contains("active")) {
        renderOverview();
    } else if (logsPage.classList.contains("active")) {
        renderLogsTable();
    } else if (searchPage.classList.contains("active")) {
        renderSearchTable();
    }
};

// ==========================================
// LIST RENDERING & COUNTERS
// ==========================================

window.confirmDeleteLog = confirmDeleteLog;

function renderOverview() {
    const counts = { warn: 0, ban: 0, kick: 0, bolo: 0, note: 0 };
    logs.forEach(log => {
        if (log.type === "bolo") {
            if (log.boloStatus === "pending" || log.boloStatus === "active") {
                counts.bolo++;
            }
        } else if (counts[log.type] !== undefined) {
            counts[log.type]++;
        }
    });

    document.getElementById("warnCount").textContent = counts.warn;
    document.getElementById("banCount").textContent = counts.ban;
    document.getElementById("kickCount").textContent = counts.kick;
    document.getElementById("boloCount").textContent = counts.bolo;
    document.getElementById("noteCount").textContent = counts.note;

    const recentLogsBody = document.getElementById("recentLogsBody");
    const recentLogs = logs.slice(0, 5);

    if (recentLogs.length === 0) {
        recentLogsBody.innerHTML = `
            <tr class="empty-row">
                <td colspan="5">
                    <div class="empty-state">
                        <i class="fas fa-inbox"></i>
                        <p>No recent activity. Submit your first log!</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    recentLogsBody.innerHTML = recentLogs.map((log, index) => {
        let typeLabel = log.type;
        if (log.type === "bolo") {
            typeLabel = log.boloStatus === "completed" ? "Bolo Resolved" : (log.boloStatus === "pending" ? "Bolo Pending" : "Bolo Active");
        }
        const badgeClass = log.type === "bolo" && log.boloStatus === "completed" ? "badge-note" : `badge-${log.type}`;

        return `
            <tr class="log-row-enter" style="animation-delay: ${index * 0.05}s">
                <td>
                    <span class="type-badge ${badgeClass}">
                        <i class="fas ${log.type === 'bolo' && log.boloStatus === 'completed' ? 'fa-check-circle' : (ACTION_CONFIG[log.type]?.icon || 'fa-info-circle')}"></i>
                        ${typeLabel}
                    </span>
                </td>
                <td style="font-weight: 600; color: var(--text-primary);">${escapeHTML(log.username)}</td>
                <td class="table-reason-cell" style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHTML(log.reason)}">
                    ${escapeHTML(log.reason)}
                </td>
                <td>${escapeHTML(log.staff)}</td>
                <td>${formatDate(log.date)}</td>
            </tr>
        `;
    }).join("");
}

function renderLogsTable() {
    const allLogsBody = document.getElementById("allLogsBody");
    const filteredLogs = currentFilter === "all" ? logs : logs.filter(log => log.type === currentFilter);

    if (filteredLogs.length === 0) {
        allLogsBody.innerHTML = `
            <tr class="empty-row">
                <td colspan="8">
                    <div class="empty-state">
                        <i class="fas fa-inbox"></i>
                        <p>No logs found for selection.</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    allLogsBody.innerHTML = filteredLogs.map((log, index) => {
        let typeLabel = log.type;
        let badgeClass = `badge-${log.type}`;
        
        if (log.type === "bolo") {
            if (log.boloStatus === "completed") {
                typeLabel = "Bolo Resolved";
                badgeClass = "badge-note";
            } else if (log.boloStatus === "pending") {
                typeLabel = "Bolo Pending";
            } else {
                typeLabel = "Bolo Active";
            }
        }
        
        const durationText = log.duration ? log.duration : "—";
        const evidenceBtn = log.evidence ? `<a href="${escapeHTML(log.evidence)}" target="_blank" class="table-action-btn view-btn" title="View Evidence"><i class="fas fa-external-link-alt"></i></a>` : "";

        // Copy buttons
        const copyIdBtn = `<button class="table-action-btn view-btn" onclick="copyToClipboardText('${log.robloxId}', 'Roblox ID')" title="Copy Roblox ID"><i class="fas fa-copy"></i></button>`;
        
        let boloCompleteBtn = "";
        let copyCmdBtn = "";
        
        if (log.type === "bolo" && (log.boloStatus === "pending" || log.boloStatus === "active")) {
            copyCmdBtn = `<button class="table-action-btn view-btn" onclick="copyBoloCommand('${log.robloxId}', 'Bolo')" style="color: var(--accent);" title="Copy Ban Command"><i class="fas fa-terminal"></i></button>`;
            
            if (canHandleBolo(staffRank)) {
                boloCompleteBtn = `<button class="table-action-btn view-btn" onclick="completeActiveBolo('${log.id}')" style="color: var(--note-color); border-color: rgba(16, 185, 129, 0.2);" title="Approve Bolo"><i class="fas fa-check-double"></i></button>`;
            } else {
                boloCompleteBtn = `<button class="table-action-btn view-btn" onclick="completeActiveBolo('${log.id}')" style="opacity: 0.4; cursor: not-allowed;" title="Review Bolo (Restricted)"><i class="fas fa-lock"></i></button>`;
            }
        }

        return `
            <tr class="log-row-enter" style="animation-delay: ${index * 0.03}s">
                <td>
                    <span class="type-badge ${badgeClass}">
                        <i class="fas ${log.type === 'bolo' && log.boloStatus === 'completed' ? 'fa-check-circle' : (ACTION_CONFIG[log.type]?.icon || 'fa-info-circle')}"></i>
                        ${typeLabel}
                    </span>
                </td>
                <td style="font-weight: 600; color: var(--text-primary);">${escapeHTML(log.username)}</td>
                <td>
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <code>${escapeHTML(log.robloxId)}</code>
                        ${copyIdBtn}
                    </div>
                </td>
                <td style="white-space: normal; min-width: 200px;">${escapeHTML(log.reason)}</td>
                <td><span style="font-weight: 500;">${escapeHTML(durationText)}</span></td>
                <td>${escapeHTML(log.staff)}</td>
                <td>${formatDate(log.date)}</td>
                <td>
                    <div class="table-actions">
                        ${copyCmdBtn}
                        ${boloCompleteBtn}
                        ${evidenceBtn}
                        <button class="table-action-btn delete-btn" onclick="confirmDeleteLog('${log.id}')" title="Delete Log">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join("");
}

// Render Search Results
const searchInput = document.getElementById("searchInput");
const searchClear = document.getElementById("searchClear");

if (searchInput) {
    searchInput.addEventListener("input", () => {
        const query = searchInput.value.trim();
        if (query) {
            searchClear.classList.add("visible");
        } else {
            searchClear.classList.remove("visible");
        }
        renderSearchTable();
    });
}

if (searchClear) {
    searchClear.addEventListener("click", () => {
        searchInput.value = "";
        searchClear.classList.remove("visible");
        searchInput.focus();
        renderSearchTable();
    });
}

function renderSearchTable() {
    const searchLogsBody = document.getElementById("searchLogsBody");
    const query = searchInput.value.trim().toLowerCase();

    if (!query) {
        searchLogsBody.innerHTML = `
            <tr class="empty-row">
                <td colspan="7">
                    <div class="empty-state">
                        <i class="fas fa-search"></i>
                        <p>Search for a player username, Roblox ID, or staff name...</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    const filtered = logs.filter(log => 
        log.username.toLowerCase().includes(query) ||
        log.robloxId.toLowerCase().includes(query) ||
        log.reason.toLowerCase().includes(query) ||
        log.staff.toLowerCase().includes(query)
    );

    if (filtered.length === 0) {
        searchLogsBody.innerHTML = `
            <tr class="empty-row">
                <td colspan="7">
                    <div class="empty-state">
                        <i class="fas fa-exclamation-circle"></i>
                        <p>No matching logs found for "${escapeHTML(query)}".</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    searchLogsBody.innerHTML = filtered.map((log, index) => {
        let typeLabel = log.type;
        if (log.type === "bolo") {
            typeLabel = log.boloStatus === "completed" ? "Bolo Resolved" : (log.boloStatus === "pending" ? "Bolo Pending" : "Bolo Active");
        }
        const durationText = log.duration ? log.duration : "—";
        
        return `
            <tr class="log-row-enter" style="animation-delay: ${index * 0.03}s">
                <td>
                    <span class="type-badge badge-${log.type}">
                        <i class="fas ${ACTION_CONFIG[log.type]?.icon || 'fa-info-circle'}"></i>
                        ${typeLabel}
                    </span>
                </td>
                <td style="font-weight: 600; color: var(--text-primary);">${escapeHTML(log.username)}</td>
                <td><code>${escapeHTML(log.robloxId)}</code></td>
                <td style="white-space: normal; min-width: 200px;">${escapeHTML(log.reason)}</td>
                <td><span style="font-weight: 500;">${escapeHTML(durationText)}</span></td>
                <td>${escapeHTML(log.staff)}</td>
                <td>${formatDate(log.date)}</td>
            </tr>
        `;
    }).join("");
}

// Log Filter Buttons
document.querySelectorAll(".filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        currentFilter = btn.getAttribute("data-filter");
        renderLogsTable();
    });
});

// Mobile Sidebar Toggle
const sidebar = document.getElementById("sidebar");
const sidebarToggle = document.getElementById("sidebarToggle");

const backdrop = document.createElement("div");
backdrop.className = "sidebar-backdrop";
document.body.appendChild(backdrop);

if (sidebarToggle) {
    sidebarToggle.addEventListener("click", () => {
        sidebar.classList.toggle("open");
        backdrop.classList.toggle("visible");
    });
}

backdrop.addEventListener("click", () => {
    sidebar.classList.remove("open");
    backdrop.classList.remove("visible");
});

document.querySelectorAll(".sidebar-nav > a").forEach(link => {
    link.addEventListener("click", () => {
        sidebar.classList.remove("open");
        backdrop.classList.remove("visible");
    });
});

// Helper: Escape HTML to prevent XSS
function escapeHTML(str) {
    if (!str) return "";
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}

// Autocomplete click setup
function setupAutocompleteClickListeners() {
    const items = robloxAutocomplete.querySelectorAll(".autocomplete-item");
    items.forEach(item => {
        item.addEventListener("click", () => {
            const username = item.getAttribute("data-username");
            const id = item.getAttribute("data-id");
            
            logUsernameInput.value = username;
            logRobloxIdInput.value = id;
            
            robloxAutocomplete.classList.add("hidden");
            showToast("Player Verified", `${username} (${id}) selected`, "info");
        });
    });
}

// Initialize Dashboard View
function initDashboard() {
    loginPage.classList.add("hidden");
    dashboardPage.classList.remove("hidden");
    
    // Set Sidebar User Info
    staffNameSidebar.textContent = currentStaff;
    if (staffRoleSidebar) {
        staffRoleSidebar.textContent = staffRank;
    }
    
    // Generate initials for avatar
    const initials = currentStaff.substring(0, 2).toUpperCase();
    staffAvatarSidebar.innerHTML = `<span style="color: #fff; font-weight: 800; font-size: 0.85rem;">${initials}</span>`;

    switchPage("overview");
}

// Check if already logged in
if (currentStaff) {
    initDashboard();
}
