// ==========================================
// NYSRP ERLC Staff Dashboard - Application JS
// ==========================================

import { app, auth, db, secondaryApp, secondaryAuth } from './firebase.js';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { collection, doc, setDoc, addDoc, getDoc, getDocs, onSnapshot, query, orderBy, deleteDoc, updateDoc, where, writeBatch, serverTimestamp } from 'firebase/firestore';
import { ALLOWED_RANKS, normalizeRank, formatRankLabel, canManageRankChanges, canHandleBolo, canManagePresets, canManageLoa, canManageStaff, canManageReasons, canViewAllShifts, canManageShifts, canAccessRemoteControl, canViewErlcData } from './permissions.js';
import './seasonal-theme.js';

function canEditRank(targetRank, actingRank) {
    return canManageRankChanges(actingRank, targetRank);
}

// Default Message Presets
const DEFAULT_PRESETS = [
    {
        id: "p1",
        title: "Greeting",
        template: "Hello, I'm [user], my rank is [rank]. How may I help you?\n\nIf I am too late, please say \"void\".\n\nPlease make sure to join our comms:\n\nA-d-4-H-H-c-p-3-4-9"
    },
    {
        id: "p2",
        title: "Closing",
        template: "Thank you for your patience. I will be with you shortly."
    },
    {
        id: "p3",
        title: "Ticket Closed",
        template: "This ticket has been closed. Please reach out again if you need further assistance."
    },
    {
        id: "p4",
        title: "Waiting for Response",
        template: "Thank you for waiting. I am still reviewing your request and will respond shortly."
    },
    {
        id: "p5",
        title: "Information Needed",
        template: "I need a bit more information before I can proceed. Please provide the details requested."
    },
    {
        id: "p6",
        title: "Transferring Staff",
        template: "I am transferring this case to another staff member for further assistance."
    },
    {
        id: "p7",
        title: "Escalation",
        template: "This matter has been escalated to a higher staff member for review."
    },
    {
        id: "p8",
        title: "Warning",
        template: "This is a warning regarding your recent behavior. Please follow the rules."
    },
    {
        id: "p9",
        title: "Thank You",
        template: "Thank you for your cooperation and understanding."
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

// ========================================
// PROTECTED OWNER ACCOUNT
// ========================================
// Keep the configured Owner profile protected in the interface as well as in Firestore rules.
let PROTECTED_OWNER_UID = null;
const PROTECTED_OWNER_EMAIL = "sprog28@hotmail.com";

// Helper to check if a UID is the protected Owner
function isProtectedOwner(uid, email = "") {
    return (PROTECTED_OWNER_UID && uid === PROTECTED_OWNER_UID)
        || String(email).trim().toLowerCase() === PROTECTED_OWNER_EMAIL;
}

// Helper to log the protected owner UID for identification
function identifyProtectedOwner(user) {
    if (user && String(user.email || "").trim().toLowerCase() === PROTECTED_OWNER_EMAIL) {
        PROTECTED_OWNER_UID = user.uid;
        console.log('[PROTECTED OWNER] UID for sprog28@hotmail.com:', user.uid);
        console.log('[PROTECTED OWNER] This account is permanently locked as Owner rank');
        return user.uid;
    }
    return null;
}

// State Management
let currentStaff = null;
let staffRank = "Junior Moderator";
let currentStaffEmail = null;
let currentUserDoc = null;
let currentDiscordUserId = "";
let logs = [];
let presets = [];
let reasonTemplates = [];
let loaRequests = [];
let shifts = [];
let activeUserShift = null;
let staffMembers = [];
let staffMembersLoaded = false;
let shiftsLoaded = false;
let staffNotifications = [];
let staffNotificationError = null;
let managedStaffNotifications = [];
let selectedNotificationRecipientUid = "";
let selectedStatsUid = null;
let lastObservedDutyState = null;
let currentShiftFilter = "all";
let shiftSearchQuery = "";
let currentFilter = "all";
let currentPresetEditId = null;
let presetSearchQuery = "";
let reasonSearchQuery = "";
let hasSeededDefaultPresets = false;
let shiftLiveTimerInterval = null;

// ER:LC State Management
let erlcServerInfo = null;
let erlcPlayers = [];
let erlcKills = [];
let erlcJoinLogs = [];
let erlcInGameCommandLogs = [];
let erlcModCalls = [];
let erlcRemoteCommands = [];
let erlcPlayerSessions = [];
let erlcEvents = [];
let erlcActiveTab = 'kills';
let erlcPlayersSearchQuery = '';
let rcPlayerSearchQuery = '';
let erlcLogsSearchQuery = '';
let erlcPollInterval = null;

// Firebase Listeners
let unsubLogs = null;
let unsubPresets = null;
let unsubReasons = null;
let unsubLoa = null;
let unsubShifts = null;
let unsubNotifications = null;
let unsubManagedNotifications = null;
let unsubErlcCommands = null;
let unsubErlcKills = null;
let unsubErlcPlayerSessions = null;
let unsubErlcEvents = null;
let unsubErlcModCalls = null;

function getConfiguredOwnerDiscordId() {
    return (window.__OWNER_DISCORD_USER_ID__ || localStorage.getItem("nysrp_owner_discord_user_id") || "").toString().trim();
}

function isMatchingOwnerDiscordUser() {
    const configuredOwnerId = getConfiguredOwnerDiscordId();
    const currentId = (currentDiscordUserId || currentUserDoc?.discordUserId || "").toString().trim();
    return Boolean(configuredOwnerId) && Boolean(currentId) && currentId === configuredOwnerId;
}

function canManageReasonTemplates() {
    return canManageReasons(staffRank) || isMatchingOwnerDiscordUser();
}

function canManagePresetsUI() {
    return canManagePresets(staffRank) || isMatchingOwnerDiscordUser();
}

function canManageStaffUI() {
    return canManageStaff(staffRank) || isMatchingOwnerDiscordUser();
}

function isJuniorAdministrator() {
    return normalizeRank(staffRank) === "Junior Administrator";
}

function isTrainingEligibleRank(rank) {
    const normalized = normalizeRank(rank ?? staffRank);
    return ["Junior Moderator", "Junior Administrator"].includes(normalized);
}

function getSelectedReasonTemplates() {
    if (!logReasonTemplateSelect) return [];
    return Array.from(logReasonTemplateSelect.selectedOptions || [])
        .filter(option => option.value)
        .map(option => ({
            id: option.dataset.reasonId || "",
            text: option.value
        }))
        .filter((reason, index, list) => reason.text && list.findIndex(item => item.text === reason.text) === index);
}

async function seedDefaultPresetsIfNeeded(snapshot) {
    if (hasSeededDefaultPresets || !auth.currentUser || snapshot.docs.length > 0) return;

    hasSeededDefaultPresets = true;
    const seedOperations = DEFAULT_PRESETS.map((preset, index) => {
        const presetDoc = {
            title: preset.title,
            template: preset.template,
            category: "Default",
            order: index,
            active: true,
            createdBy: auth.currentUser?.uid || "system"
        };
        return setDoc(doc(db, "presets", preset.id), presetDoc);
    });

    try {
        await Promise.all(seedOperations);
        showToast("Presets Loaded", "Default message presets are now available.", "info");
    } catch (error) {
        showToast("Database Error", `Failed to seed default presets: ${error.message}`, "error");
    }
}

function setupFirebaseListeners() {
    if (unsubLogs) unsubLogs();
    if (unsubPresets) unsubPresets();
    if (unsubReasons) unsubReasons();
    if (unsubLoa) unsubLoa();
    if (unsubNotifications) unsubNotifications();
    if (unsubManagedNotifications) unsubManagedNotifications();
    unsubManagedNotifications = null;
    managedStaffNotifications = [];
    selectedNotificationRecipientUid = "";
    if (canViewAllShifts(staffRank)) {
        staffMembersLoaded = false;
        shiftsLoaded = false;
    }

    unsubLogs = onSnapshot(collection(db, "logs"), (snapshot) => {
        logs = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
        logs.sort((a, b) => new Date(b.date) - new Date(a.date)); // Sort newest first
        renderOverview();
        renderLogsTable();
        renderSearchTable();
    }, (error) => {
        showToast("Database Error", `Unable to load logs: ${error.message}`, "error");
    });

    unsubPresets = onSnapshot(query(collection(db, "presets"), orderBy("order")), async (snapshot) => {
        presets = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        await seedDefaultPresetsIfNeeded(snapshot);
        renderPresets();
    }, (error) => {
        showToast("Database Error", `Unable to load presets: ${error.message}`, "error");
    });

    unsubReasons = onSnapshot(collection(db, "reasons"), (snapshot) => {
        reasonTemplates = snapshot.docs.map(doc => {
            const data = doc.data() || {};
            const rawOrder = data.order;
            const orderNum = typeof rawOrder === "number" ? rawOrder : parseInt(rawOrder, 10);
            return {
                id: doc.id,
                text: data.text || data.reason || "",
                order: Number.isFinite(orderNum) ? orderNum : 0,
                ...data
            };
        });
        reasonTemplates.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        renderReasonTemplates();
    }, (error) => {
        showToast("Database Error", `Unable to load reason templates: ${error.message}`, "error");
    });

    unsubLoa = onSnapshot(collection(db, "loaRequests"), (snapshot) => {
        loaRequests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        loaRequests.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        renderLoaRequests();
        renderPersonalDashboard();
    }, (error) => {
        showToast("Database Error", `Unable to load LOA requests: ${error.message}`, "error");
    });

    unsubShifts = onSnapshot(collection(db, "shifts"), (snapshot) => {
        shifts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        shifts.sort((a, b) => new Date(b.startTime || b.createdAt || 0) - new Date(a.startTime || a.createdAt || 0));
        shiftsLoaded = true;

        const myCurrentUid = auth.currentUser?.uid;
        activeUserShift = shifts.find(s => {
            const hasValidStart = timestampToMillis(s.startTime) !== null || timestampToMillis(s.createdAt) !== null;
            return s.staffUid === myCurrentUid && hasValidStart && (s.status === "active" || s.status === "break");
        }) || null;

        const isOnDuty = Boolean(activeUserShift);
        const wasOnDuty = lastObservedDutyState;
        lastObservedDutyState = isOnDuty;
        if (isOnDuty) {
            releaseStoredStaffNotifications(wasOnDuty === false);
        }

        updateShiftClockUI();
        renderPersonalDashboard();
        renderStaffStatistics();
        if (shiftsPage && shiftsPage.classList.contains("active")) {
            renderShifts();
        }
    }, (error) => {
        showToast("Database Error", `Unable to load shifts: ${error.message}`, "error");
    });

    if (unsubStaff) unsubStaff();
    unsubStaff = null;
    if (canViewAllShifts(staffRank)) {
        unsubStaff = onSnapshot(collection(db, "users"), (snapshot) => {
            staffMembers = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            staffMembersLoaded = true;
            if (canManageStaffUI()) renderStaffList(staffMembers);
            renderStaffStatistics();
            renderNotificationRecipientOptions();
        }, (error) => {
            console.error("Unable to load staff statistics recipients:", error);
            showToast("Database Error", `Unable to load staff list: ${error.message}`, "error");
        });
    }

    const currentUid = auth.currentUser?.uid;
    if (currentUid) {
        const notificationQuery = query(
            collection(db, "users", currentUid, "notifications"),
            where("recipientUid", "==", currentUid),
            where("available", "==", true)
        );
        unsubNotifications = onSnapshot(notificationQuery, (snapshot) => {
            staffNotifications = snapshot.docs.map(notification => ({
                id: notification.id,
                ...notification.data()
            })).sort((a, b) =>
                (timestampToMillis(b.createdAt) || 0) - (timestampToMillis(a.createdAt) || 0)
            );
            staffNotificationError = null;
            renderNotifications();
            renderPersonalDashboard();
        }, (error) => {
            staffNotificationError = error;
            console.error("Unable to load staff notifications:", {
                projectId: app.options.projectId,
                path: "users/{uid}/notifications",
                actorUid: currentUid,
                actorRank: staffRank,
                userDocumentRank: currentUserDoc?.rank || null,
                query: {
                    recipientUid: currentUid,
                    available: true
                },
                firebaseErrorName: error?.name || "UnknownError",
                firebaseErrorCode: error?.code || "unknown",
                firebaseErrorMessage: error?.message || String(error)
            });
            showToast("Database Error", `Unable to load notifications: ${error.message}`, "error");
        });
    }

    // ER:LC Firestore Listeners
    if (unsubErlcCommands) unsubErlcCommands();
    unsubErlcCommands = onSnapshot(collection(db, "erlc_commands"), (snapshot) => {
        erlcRemoteCommands = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        erlcRemoteCommands.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        renderRcCommandsHistory();
        renderErlcRemoteAudit();
    }, (error) => {
        console.warn("Unable to load erlc_commands:", error);
    });

    if (unsubErlcKills) unsubErlcKills();
    unsubErlcKills = onSnapshot(collection(db, "erlc_kills"), (snapshot) => {
        erlcKills = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        erlcKills.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        renderErlcKills();
    }, (error) => {
        console.warn("Unable to load erlc_kills:", error);
    });

    if (unsubErlcPlayerSessions) unsubErlcPlayerSessions();
    unsubErlcPlayerSessions = onSnapshot(collection(db, "erlc_player_sessions"), (snapshot) => {
        erlcPlayerSessions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        erlcPlayerSessions.sort((a, b) => (b.timestamp || b.joinedAt || 0) - (a.timestamp || a.joinedAt || 0));
        renderErlcJoins();
    }, (error) => {
        console.warn("Unable to load erlc_player_sessions:", error);
    });

    if (unsubErlcEvents) unsubErlcEvents();
    unsubErlcEvents = onSnapshot(collection(db, "erlc_events"), (snapshot) => {
        erlcEvents = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        erlcEvents.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    }, (error) => {
        console.warn("Unable to load erlc_events:", error);
    });

    if (unsubErlcModCalls) unsubErlcModCalls();
    unsubErlcModCalls = onSnapshot(collection(db, "erlc_mod_calls"), (snapshot) => {
        erlcModCalls = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        erlcModCalls.sort((a, b) => (b.requestedAt || 0) - (a.requestedAt || 0));
        renderErlcModCalls();
    }, (error) => {
        console.warn("Unable to load erlc_mod_calls:", error);
    });
}

// DOM Elements
const loginPage = document.getElementById("loginPage");
const dashboardPage = document.getElementById("dashboardPage");
const loginForm = document.getElementById("loginForm");
const loginEmail = document.getElementById("loginEmail");
const loginPassword = document.getElementById("loginPassword");
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
const navLoa = document.getElementById("navLoa");
const navShifts = document.getElementById("navShifts");
const navNotifications = document.getElementById("navNotifications");
const navRemoteControl = document.getElementById("navRemoteControl");
const navErlcPlayers = document.getElementById("navErlcPlayers");
const navErlcLogs = document.getElementById("navErlcLogs");
const sidebarLinks = document.querySelectorAll(".sidebar-nav > a:not(.action-item)");
const actionLinks = document.querySelectorAll(".action-item");

// Pages
const overviewPage = document.getElementById("overviewPage");
const logsPage = document.getElementById("logsPage");
const searchPage = document.getElementById("searchPage");
const toolboxPage = document.getElementById("toolboxPage");
const loaPage = document.getElementById("loaPage");
const shiftsPage = document.getElementById("shiftsPage");
const trainingPage = document.getElementById("trainingPage");
const staffPage = document.getElementById("staffPage");
const reasonsPage = document.getElementById("reasonsPage");
const remoteControlPage = document.getElementById("remoteControlPage");
const erlcPlayersPage = document.getElementById("erlcPlayersPage");
const erlcLogsPage = document.getElementById("erlcLogsPage");
const notificationsPage = document.getElementById("notificationsPage");
const pages = [overviewPage, logsPage, searchPage, toolboxPage, loaPage, shiftsPage, trainingPage, staffPage, reasonsPage, remoteControlPage, erlcPlayersPage, erlcLogsPage, notificationsPage];

// Modals
const logModal = document.getElementById("logModal");
const logModalForm = document.getElementById("logForm");
const newLogSelector = document.getElementById("newLogSelector");
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
const presetCategoryInput = document.getElementById("presetCategory");
const presetActiveInput = document.getElementById("presetActive");
const tbStaffName = document.getElementById("tbStaffName");
const tbStaffRank = document.getElementById("tbStaffRank");
const presetSearchInput = document.getElementById("presetSearch");
const presetsContainer = document.getElementById("presetsContainer");

// Toast System
const toastContainer = document.getElementById("toastContainer");
const interactionModal = document.getElementById("deleteModal");
const interactionTitle = document.getElementById("interactionTitle");
const interactionMessage = document.getElementById("interactionMessage");
const interactionIcon = document.getElementById("interactionIcon");
const interactionInputGroup = document.getElementById("interactionInputGroup");
const interactionInputLabel = document.getElementById("interactionInputLabel");
const interactionInput = document.getElementById("interactionInput");
const interactionFeedback = document.getElementById("interactionFeedback");
const interactionErrorCode = document.getElementById("interactionErrorCode");
const interactionCancelButton = document.getElementById("deleteCancelBtn");
const interactionCloseButton = document.getElementById("deleteClose");
const interactionConfirmButton = document.getElementById("deleteConfirmBtn");
const interactionConfirmIcon = document.getElementById("interactionConfirmIcon");
const interactionConfirmLabel = document.getElementById("interactionConfirmLabel");
let interactionConfig = null;
let interactionResolver = null;
let interactionBusy = false;
let interactionFinished = false;
let interactionPreviousFocus = null;

const ERROR_CODES = {
    auth: "NYSRP-AUTH-001",
    permission: "NYSRP-PERM-001",
    firebase: "NYSRP-FIRE-001",
    data: "NYSRP-DATA-001",
    network: "NYSRP-NET-001",
    validation: "NYSRP-VAL-001",
    action: "NYSRP-ACT-001"
};

function getErrorCode(title, message = "") {
    const text = `${title} ${message}`.toLowerCase();
    if (/permission|unauthori[sz]ed|insufficient/.test(text)) return ERROR_CODES.permission;
    if (/auth|sign.?in|password|access denied/.test(text)) return ERROR_CODES.auth;
    if (/validat|invalid|training required/.test(text)) return ERROR_CODES.validation;
    if (/missing data|not found|required data/.test(text)) return ERROR_CODES.data;
    if (/network|api|offline|fetch|roblox/.test(text)) return ERROR_CODES.network;
    if (/database|firestore|firebase/.test(text)) return ERROR_CODES.firebase;
    return ERROR_CODES.action;
}

function getSafeErrorMessage(message, error = null) {
    const fallback = "This action couldn't be completed. Please try again.";
    const candidate = String(message || "").trim();
    const rawDetails = `${candidate} ${error?.message || ""}`;
    const technicalError = /FirebaseError|Firebase:|(?:auth|firestore)\/[a-z-]+|permission-denied|permission denied|Missing or insufficient permissions|NetworkError|TypeError:|ReferenceError:|HTTP \d{3}/i;
    if (!candidate || technicalError.test(rawDetails)) {
        const task = candidate.split(/:\s*(?=(?:Firebase|FirebaseError|Missing or insufficient permissions|permission[- ]denied|auth\/|firestore\/|NetworkError|TypeError|ReferenceError))/i)[0]
            .replace(/(?:\s*Please try again\.)+$/i, "")
            .trim();
        return task && task.length <= 100 && !technicalError.test(task)
            ? `${task.replace(/[.:]+$/, "")}. Please try again.`
            : fallback;
    }
    return candidate;
}

// Show Toast Notification
function showToast(title, message, type = "success", providedErrorCode = null) {
    const toast = document.createElement("div");
    toast.className = "toast";

    const iconNames = {
        success: "fa-check-circle",
        error: "fa-exclamation-circle",
        info: "fa-info-circle",
        warning: "fa-exclamation-triangle"
    };
    const icon = document.createElement("i");
    icon.className = `fas ${iconNames[type] || iconNames.success}`;

    const iconWrap = document.createElement("div");
    iconWrap.className = `toast-icon ${type}`;
    iconWrap.appendChild(icon);

    const content = document.createElement("div");
    content.className = "toast-content";
    const titleElement = document.createElement("div");
    titleElement.className = "toast-title";
    titleElement.textContent = String(title ?? "");
    const messageElement = document.createElement("div");
    messageElement.className = "toast-message";
    messageElement.textContent = type === "error" ? getSafeErrorMessage(message) : String(message ?? "");
    content.append(titleElement, messageElement);

    if (type === "error") {
        const codeElement = document.createElement("div");
        codeElement.className = "toast-error-code";
        codeElement.textContent = `Error Code: ${providedErrorCode || getErrorCode(title, message)}`;
        content.appendChild(codeElement);
    }

    toast.append(iconWrap, content);

    toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.classList.add("toast-out");
        toast.addEventListener("animationend", () => {
            toast.remove();
        });
    }, 4000);
}

function closeInteractionDialog(value) {
    if (interactionBusy || !interactionResolver) return;
    const resolve = interactionResolver;
    interactionResolver = null;
    interactionConfig = null;
    interactionFinished = false;
    interactionModal.classList.remove("visible");
    interactionModal.setAttribute("aria-hidden", "true");
    interactionInputGroup.classList.add("hidden");
    interactionErrorCode.classList.add("hidden");
    interactionInput.value = "";
    interactionInput.required = false;
    interactionInput.removeAttribute("aria-invalid");
    interactionFeedback.textContent = "";
    interactionCancelButton.hidden = false;
    interactionCloseButton.disabled = false;
    interactionConfirmButton.disabled = false;
    interactionConfirmButton.className = "btn-delete";
    interactionConfirmIcon.className = "fas fa-exclamation-triangle";
    interactionConfirmLabel.textContent = "Confirm";
    if (interactionPreviousFocus?.isConnected) interactionPreviousFocus.focus();
    resolve(value);
}

function dismissInteractionDialog() {
    closeInteractionDialog(interactionConfig?.input ? null : false);
}

function openInteractionDialog(config) {
    if (interactionResolver) return Promise.resolve(config.input ? null : false);

    interactionConfig = config;
    interactionPreviousFocus = document.activeElement;
    interactionBusy = false;
    interactionFinished = false;
    interactionTitle.textContent = config.title || "Confirm action";
    interactionMessage.textContent = config.message || "";
    interactionErrorCode.classList.add("hidden");
    interactionErrorCode.textContent = "";
    interactionFeedback.textContent = "";
    interactionInputGroup.classList.toggle("hidden", !config.input);
    interactionInputLabel.textContent = config.inputLabel || "Details";
    interactionInput.value = config.initialValue || "";
    interactionInput.placeholder = config.placeholder || "";
    interactionInput.required = Boolean(config.required);
    interactionInput.maxLength = config.maxLength || 2000;
    interactionIcon.className = `modal-icon ${config.variant === "danger" ? "delete-icon" : "select-icon"}`;
    interactionIcon.firstElementChild.className = `fas ${config.variant === "danger" ? "fa-exclamation-triangle" : "fa-pen"}`;
    interactionConfirmButton.className = config.variant === "danger" ? "btn-delete" : "btn-submit";
    interactionConfirmIcon.className = `fas ${config.variant === "danger" ? "fa-exclamation-triangle" : "fa-check"}`;
    interactionConfirmLabel.textContent = config.confirmLabel || (config.input ? "Save" : "Confirm");
    interactionCancelButton.textContent = config.cancelLabel || "Cancel";
    interactionCancelButton.hidden = false;
    interactionCloseButton.disabled = false;
    interactionConfirmButton.disabled = false;
    interactionModal.classList.add("visible");
    interactionModal.setAttribute("aria-hidden", "false");

    return new Promise(resolve => {
        interactionResolver = resolve;
        window.requestAnimationFrame(() => {
            (config.input ? interactionInput : interactionConfirmButton).focus();
        });
    });
}

function showConfirmation(options) {
    return openInteractionDialog({ ...options, input: false });
}

function showTextPrompt(options) {
    return openInteractionDialog({ ...options, input: true });
}

async function handleInteractionConfirm() {
    if (!interactionConfig || interactionBusy) return;
    if (interactionFinished) {
        closeInteractionDialog(true);
        return;
    }

    if (interactionConfig.input) {
        const value = interactionInput.value;
        if (interactionConfig.required && !value.trim()) {
            interactionFeedback.textContent = interactionConfig.validationMessage || "This field is required.";
            interactionInput.setAttribute("aria-invalid", "true");
            interactionInput.focus();
            return;
        }
        interactionInput.removeAttribute("aria-invalid");
        closeInteractionDialog(value);
        return;
    }

    if (!interactionConfig.action) {
        closeInteractionDialog(true);
        return;
    }

    interactionBusy = true;
    interactionConfirmButton.disabled = true;
    interactionCancelButton.disabled = true;
    interactionCloseButton.disabled = true;
    interactionConfirmIcon.className = "fas fa-spinner fa-spin";
    interactionConfirmLabel.textContent = "Please wait...";
    interactionMessage.textContent = interactionConfig.loadingMessage || "This may take a moment.";
    try {
        await interactionConfig.action();
        interactionFinished = true;
        interactionBusy = false;
        interactionTitle.textContent = interactionConfig.successTitle || "Completed";
        interactionMessage.textContent = interactionConfig.successMessage || "The action completed successfully.";
        interactionIcon.className = "modal-icon interaction-success";
        interactionIcon.firstElementChild.className = "fas fa-check";
        interactionConfirmButton.disabled = false;
        interactionConfirmButton.className = "btn-submit";
        interactionConfirmIcon.className = "fas fa-check";
        interactionConfirmLabel.textContent = "Done";
        interactionCancelButton.hidden = true;
        interactionCancelButton.disabled = false;
        interactionCloseButton.disabled = false;
        if (interactionConfig.successToast) {
            showToast(interactionConfig.successToast.title, interactionConfig.successToast.message, "success");
        }
    } catch (error) {
        const title = interactionConfig.errorTitle || "Action Failed";
        const code = getErrorCode(title, error?.message || "");
        const message = getSafeErrorMessage(interactionConfig.errorMessage || "This action couldn't be completed. Please try again.", error);
        interactionBusy = false;
        interactionFinished = true;
        interactionTitle.textContent = title;
        interactionMessage.textContent = message;
        interactionErrorCode.textContent = `Error Code: ${code}`;
        interactionErrorCode.classList.remove("hidden");
        interactionIcon.className = "modal-icon interaction-error";
        interactionIcon.firstElementChild.className = "fas fa-exclamation-circle";
        interactionConfirmButton.disabled = false;
        interactionConfirmButton.className = "btn-submit";
        interactionConfirmIcon.className = "fas fa-times";
        interactionConfirmLabel.textContent = "Close";
        interactionCancelButton.hidden = true;
        interactionCancelButton.disabled = false;
        interactionCloseButton.disabled = false;
        if (interactionConfig.onError) interactionConfig.onError(error, code);
    }
}

interactionConfirmButton.addEventListener("click", handleInteractionConfirm);
interactionCancelButton.addEventListener("click", dismissInteractionDialog);
interactionCloseButton.addEventListener("click", dismissInteractionDialog);
interactionModal.addEventListener("click", event => {
    if (event.target === interactionModal) dismissInteractionDialog();
});
document.addEventListener("keydown", event => {
    if (event.key === "Escape" && interactionResolver) {
        event.preventDefault();
        dismissInteractionDialog();
    }
});
interactionModal.addEventListener("keydown", event => {
    if (event.key !== "Tab") return;
    const focusable = Array.from(interactionModal.querySelectorAll("button:not(:disabled), textarea:not(:disabled)"))
        .filter(element => !element.hidden && element.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
});

// Client-Side Error Reporting Dispatcher (Strictly via server proxy)
function reportSystemError(errorData) {
    if (!errorData) return;
    const staff = currentStaff || (auth.currentUser?.email ? auth.currentUser.email.split('@')[0] : 'Staff');
    const payload = {
        title: errorData.title || 'Dashboard Error',
        staffUsername: staff,
        detail: `${staff}: ${errorData.detail || errorData.message || 'An error occurred'}`,
        system: errorData.system || 'NYSRP Staff Dashboard',
        endpoint: errorData.endpoint || 'Client Interface',
        status: String(errorData.status || '500'),
        command: errorData.command || null,
        extra: errorData.extra || null
    };

    fetch('/api/report-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    }).catch(() => {
        // Silently catch client fetch errors so UX is never impacted
    });
}

// Format Dates
function formatDate(dateString) {
    if (!dateString) return "Unknown";
    let date;
    if (typeof dateString === "object" && typeof dateString.toDate === "function") {
        date = dateString.toDate();
    } else if (typeof dateString === "number") {
        date = new Date(dateString);
    } else {
        date = new Date(dateString);
    }
    if (isNaN(date.getTime())) return "Unknown";
    return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}

function timestampToMillis(value) {
    if (!value) return null;
    if (typeof value === "object" && typeof value.toMillis === "function") {
        const time = value.toMillis();
        return Number.isFinite(time) ? time : null;
    }
    if (typeof value === "object" && typeof value.toDate === "function") {
        const time = value.toDate().getTime();
        return Number.isFinite(time) ? time : null;
    }
    if (value instanceof Date) {
        const time = value.getTime();
        return Number.isFinite(time) ? time : null;
    }
    if (typeof value === "object" && typeof value.seconds === "number") {
        const millis = value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1000000);
        return Number.isFinite(millis) ? millis : null;
    }
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? time : null;
}

function timestampToIso(value) {
    const millis = timestampToMillis(value);
    return millis === null ? null : new Date(millis).toISOString();
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
setInterval(() => {
    if (!auth.currentUser) return;
    renderPersonalDashboard();
    renderStaffStatistics();
}, 60000);
updateDateTime();

// ============================
// AUTHENTICATION & LOGIN
// ============================

onAuthStateChanged(auth, async (user) => {
    if (user) {
        try {
            // Identify and log protected owner account
            identifyProtectedOwner(user);
            
            // Fetch user rank and profile from Firestore
            const userDocRef = doc(db, "users", user.uid);
            const userDoc = await getDoc(userDocRef);
            let data = userDoc.exists() ? userDoc.data() : {};
            
            const normalizedRank = normalizeRank(data.rank);
            const userEmail = user.email || data.email || "";
            const robloxUsername = data.robloxUsername || data.username || (userEmail ? userEmail.split('@')[0] : "Staff");
            const createdAt = data.createdAt || data.joinedAt || user.metadata?.creationTime || new Date().toISOString();

            currentUserDoc = { ...data, email: userEmail, robloxUsername, rank: normalizedRank, createdAt };
            currentDiscordUserId = data.discordUserId || "";
            currentStaff = robloxUsername;
            staffRank = normalizedRank;
            currentStaffEmail = userEmail;
            selectedStatsUid = user.uid;
            staffMembers = [];
            staffMembersLoaded = false;
            shiftsLoaded = false;
            staffNotifications = [];
            staffNotificationError = null;
            lastObservedDutyState = null;

            // Safe sync backfill if any core field is missing.
            // Do not rewrite an existing user's rank from their own session; rules correctly
            // reject self-rank updates, and permission checks already use the normalized value.
            const updatePayload = {};
            if (!data.email && userEmail) updatePayload.email = userEmail;
            if (!data.robloxUsername && robloxUsername) updatePayload.robloxUsername = robloxUsername;
            if (!data.createdAt && createdAt) updatePayload.createdAt = createdAt;
            if (["Junior Moderator", "Junior Administrator"].includes(normalizedRank) && !data.training) {
                updatePayload.training = {
                    tutorialCompleted: false,
                    status: "not_started",
                    juniorAdministratorTraining: normalizedRank === "Junior Administrator" ? "required" : "not_required",
                    supervisedBoloTraining: normalizedRank === "Junior Administrator" ? "required" : "not_required",
                    supervisingUid: "",
                    supervisingName: ""
                };
            }

            if (Object.keys(updatePayload).length > 0) {
                try {
                    if (userDoc.exists()) {
                        await updateDoc(userDocRef, updatePayload);
                    } else {
                        await setDoc(userDocRef, {
                            email: userEmail,
                            robloxUsername,
                            rank: normalizedRank,
                            createdAt,
                            ...updatePayload
                        });
                    }
                } catch (syncError) {
                    console.warn("Optional user profile backfill warning:", syncError);
                }
            }
        } catch (err) {
            console.warn("User profile sync warning:", err);
            currentUserDoc = null;
            currentDiscordUserId = "";
            selectedStatsUid = null;
            staffMembers = [];
            staffMembersLoaded = false;
            shiftsLoaded = false;
            staffNotifications = [];
            staffNotificationError = null;
            lastObservedDutyState = null;
            currentStaff = user.email ? user.email.split('@')[0] : "Staff";
            staffRank = "Junior Moderator";
            currentStaffEmail = user.email;
        }

        // Ensure we have staffRank defined for subsequent checks
        const effectiveRank = staffRank || "Junior Moderator";
        const navStaff = document.getElementById("navStaff");
        const navReasons = document.getElementById("navReasons");
        const navTraining = document.getElementById("navTraining");
        
        if (canManageStaffUI()) {
            if (navStaff) navStaff.classList.remove("hidden");
        } else {
            if (navStaff) navStaff.classList.add("hidden");
        }

        if (canManageReasonTemplates()) {
            if (navReasons) navReasons.classList.remove("hidden");
        } else {
            if (navReasons) navReasons.classList.add("hidden");
        }

        // Show training for Junior Moderator and Junior Administrator
        if (["Junior Moderator", "Junior Administrator"].includes(effectiveRank)) {
            if (navTraining) navTraining.classList.remove("hidden");
        } else {
            if (navTraining) navTraining.classList.add("hidden");
        }

        // ER:LC Navigation
        if (canAccessRemoteControl(effectiveRank)) {
            if (navRemoteControl) navRemoteControl.classList.remove("hidden");
        } else {
            if (navRemoteControl) navRemoteControl.classList.add("hidden");
        }
        if (navErlcPlayers) navErlcPlayers.classList.remove("hidden");
        if (navErlcLogs) navErlcLogs.classList.remove("hidden");

        startErlcPolling();
        
        setupFirebaseListeners();
        initDashboard();
        showToast("Access Granted", `Welcome back, ${formatRankLabel(staffRank)} ${currentStaff}!`, "success");
        
        const btnSubmit = document.getElementById("loginBtn");
        btnSubmit.innerHTML = `<span>Sign In</span>`;
        btnSubmit.disabled = false;
    } else {
        // User logged out
        currentStaff = null;
        staffRank = "Junior Moderator";
        currentStaffEmail = null;
        currentUserDoc = null;
        currentDiscordUserId = "";
        loginPage.classList.remove("hidden");
        dashboardPage.classList.add("hidden");
        document.getElementById("navStaff")?.classList.add("hidden");
        document.getElementById("navReasons")?.classList.add("hidden");
        document.getElementById("navTraining")?.classList.add("hidden");
        document.getElementById("navRemoteControl")?.classList.add("hidden");
        document.getElementById("navErlcPlayers")?.classList.add("hidden");
        document.getElementById("navErlcLogs")?.classList.add("hidden");
        stopErlcPolling();
        if (unsubLogs) unsubLogs();
        if (unsubPresets) unsubPresets();
        if (unsubReasons) unsubReasons();
        if (unsubLoa) unsubLoa();
        if (unsubNotifications) unsubNotifications();
        if (unsubManagedNotifications) unsubManagedNotifications();
        if (unsubStaff) unsubStaff();
        if (unsubShifts) unsubShifts();
        if (unsubErlcCommands) unsubErlcCommands();
        if (unsubErlcKills) unsubErlcKills();
        if (unsubErlcPlayerSessions) unsubErlcPlayerSessions();
        if (unsubErlcEvents) unsubErlcEvents();
        if (unsubErlcModCalls) unsubErlcModCalls();
        unsubLogs = unsubPresets = unsubReasons = unsubLoa = unsubStaff = unsubShifts = unsubNotifications = unsubManagedNotifications = unsubErlcCommands = unsubErlcKills = unsubErlcPlayerSessions = unsubErlcEvents = unsubErlcModCalls = null;
        managedStaffNotifications = [];
        selectedNotificationRecipientUid = "";
        shifts = [];
        activeUserShift = null;
        erlcPlayers = [];
        erlcKills = [];
        erlcJoinLogs = [];
        erlcInGameCommandLogs = [];
        erlcModCalls = [];
        erlcRemoteCommands = [];
        erlcPlayerSessions = [];
        erlcEvents = [];
        if (shiftLiveTimerInterval) {
            clearInterval(shiftLiveTimerInterval);
            shiftLiveTimerInterval = null;
        }
    }
});

loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = loginEmail.value.trim();
    const password = loginPassword.value;
    
    const btnSubmit = document.getElementById("loginBtn");
    const originalText = btnSubmit.innerHTML;
    btnSubmit.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Authenticating...`;
    btnSubmit.disabled = true;
    
    try {
        await signInWithEmailAndPassword(auth, email, password);
        // Toast handled by onAuthStateChanged
    } catch (error) {
        showToast("Access Denied", "Incorrect email or password.", "error");
        loginPassword.value = "";
        loginPassword.focus();
    } finally {
        btnSubmit.innerHTML = originalText;
        btnSubmit.disabled = false;
    }
});

// Logout Handling
document.getElementById("logoutBtn").addEventListener("click", async () => {
    try {
        await signOut(auth);
        loginEmail.value = "";
        loginPassword.value = "";
        showToast("Signed Out", "You have successfully signed out of the dashboard.", "info");
    } catch (error) {
        showToast("Sign Out Failed", "Unable to sign out. Please try again.", "error");
    }
});

// Switch Between Pages
function switchPage(pageId, updateHistory = true) {
    if (pageId === "staff" && !canManageStaffUI()) {
        showToast("Permission Denied", "Only Owner and Co Owner can manage staff.", "error");
        pageId = "overview";
    }
    if (pageId === "reasons" && !canManageReasonTemplates()) {
        showToast("Permission Denied", "Only Owner and Co Owner can manage reason templates.", "error");
        pageId = "overview";
    }

    pages.forEach(p => p.classList.remove("active"));
    sidebarLinks.forEach(link => link.classList.remove("active"));

    if (pageId === "overview") {
        overviewPage.classList.add("active");
        navOverview.classList.add("active");
        pageTitle.textContent = "Overview";
        renderOverview();
    } else if (pageId === "notifications") {
        notificationsPage.classList.add("active");
        navNotifications?.classList.add("active");
        pageTitle.textContent = "Notifications";
        renderNotifications();
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
        tbStaffRank.value = formatRankLabel(staffRank) || "Staff";
        renderPresets();
    } else if (pageId === "loa") {
        loaPage.classList.add("active");
        navLoa?.classList.add("active");
        pageTitle.textContent = "LOA Requests";
        renderLoaRequests();
    } else if (pageId === "shifts") {
        shiftsPage.classList.add("active");
        navShifts?.classList.add("active");
        pageTitle.textContent = "Manage Shifts";
        renderShifts();
    } else if (pageId === "training") {
        if (!currentUserDoc || !isTrainingEligibleRank(currentUserDoc.rank || staffRank)) {
            showToast("Not Eligible", "You must be a Junior Moderator or Junior Administrator to access training.", "warning");
            pageId = "overview";
            switchPage("overview");
            return;
        }
        trainingPage.classList.add("active");
        const navTraining = document.getElementById("navTraining");
        if (navTraining) navTraining.classList.add("active");
        pageTitle.textContent = "Staff Training Tutorial";
        renderTraining();
    } else if (pageId === "staff") {
        // Owner/Admin staff management
        staffPage.classList.add("active");
        document.getElementById("navStaff")?.classList.add("active");
        pageTitle.textContent = "Manage Staff";
        // If staff listener isn't active, trigger a one-time render (listener set up on nav click)
        // Render will be driven by the onSnapshot listener when available
    } else if (pageId === "reasons") {
        reasonsPage.classList.add("active");
        document.getElementById("navReasons")?.classList.add("active");
        pageTitle.textContent = "Manage Reasons";
        renderReasonTemplates();
    } else if (pageId === "remote-control") {
        if (!canAccessRemoteControl(staffRank)) {
            showToast("Permission Denied", "Only Management, Director, Co Owner, and Owner can access Remote Control.", "error");
            pageId = "overview";
            switchPage("overview");
            return;
        }
        remoteControlPage.classList.add("active");
        navRemoteControl?.classList.add("active");
        pageTitle.textContent = "ER:LC Remote Control";
        renderRemoteControlPage();
    } else if (pageId === "erlc-players") {
        erlcPlayersPage.classList.add("active");
        navErlcPlayers?.classList.add("active");
        pageTitle.textContent = "Live In-Game Players";
        renderErlcPlayersPage();
    } else if (pageId === "erlc-logs") {
        erlcLogsPage.classList.add("active");
        navErlcLogs?.classList.add("active");
        pageTitle.textContent = "ER:LC Activity & Logs";
        renderErlcLogsPage();
    }

    const nextPath = pageId === "loa" ? "/loa" : pageId === "shifts" ? "/shifts" : pageId === "remote-control" ? "/remote-control" : pageId === "erlc-players" ? "/erlc-players" : pageId === "erlc-logs" ? "/erlc-logs" : "/";
    if (updateHistory && window.location.pathname !== nextPath) {
        history.pushState({ pageId }, "", nextPath);
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

window.addEventListener("popstate", () => {
    const p = window.location.pathname;
    const mapped = p === "/loa" ? "loa" : p === "/shifts" ? "shifts" : p === "/remote-control" ? "remote-control" : p === "/erlc-players" ? "erlc-players" : p === "/erlc-logs" ? "erlc-logs" : "overview";
    switchPage(mapped, false);
});

document.getElementById("notificationBell")?.addEventListener("click", () => switchPage("notifications"));
document.getElementById("personalNotificationLink")?.addEventListener("click", () => switchPage("notifications"));
document.getElementById("markAllNotificationsReadBtn")?.addEventListener("click", markAllStaffNotificationsRead);
document.getElementById("ownerNotificationRecipient")?.addEventListener("change", event => {
    loadManagedStaffNotifications(event.target.value);
});
document.getElementById("sendStaffNotificationBtn")?.addEventListener("click", () => {
    if (!canManagePresets(staffRank)) {
        showToast("Permission Denied", "Only Management, Director, Co Owner, and Owner can send staff notifications.", "error");
        return;
    }
    renderNotificationRecipientOptions();
    document.getElementById("staffNotificationModal").classList.add("visible");
});
document.getElementById("staffNotificationForm")?.addEventListener("submit", sendStaffNotification);
document.getElementById("staffNotificationAudience")?.addEventListener("change", event => {
    document.getElementById("staffNotificationRecipientsGroup").classList.toggle("hidden", event.target.value !== "selected");
});
document.getElementById("staffNotificationCloseBtn")?.addEventListener("click", () => {
    document.getElementById("staffNotificationModal").classList.remove("visible");
});
document.getElementById("staffNotificationCancelBtn")?.addEventListener("click", () => {
    document.getElementById("staffNotificationModal").classList.remove("visible");
});
document.getElementById("staffNotificationModal")?.addEventListener("click", event => {
    if (event.target.id === "staffNotificationModal") event.currentTarget.classList.remove("visible");
});
document.getElementById("statisticsStaffSelect")?.addEventListener("change", event => {
    selectedStatsUid = event.target.value || auth.currentUser?.uid || null;
    renderStaffStatistics();
});
document.getElementById("statisticsActivityFilter")?.addEventListener("change", renderStaffStatistics);

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
    logUsernameInput.dataset.displayName = "";
    logUsernameInput.dataset.avatarUrl = "";
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
        if (action === "shift") {
            switchPage("shifts");
            return;
        }
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
const closeButtons = document.querySelectorAll("#logModal .modal-close, #logModal .btn-cancel, #logModal, #newLogSelector .modal-close, #newLogSelector, #presetModal .modal-close, #presetModal .btn-cancel, #presetModal");
closeButtons.forEach(btn => {
    btn.addEventListener("click", (e) => {
        const overlay = e.target.closest(".modal-overlay");
        if (!overlay) return;
        if (e.target === overlay || e.target.closest(".modal-close") || e.target.classList.contains("btn-cancel")) {
            overlay.classList.remove("visible");
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
    const selectedReasons = getSelectedReasonTemplates();
    const selectedReasonTexts = selectedReasons.map(item => item.text);
    const selectedReasonIds = selectedReasons.map(item => item.id).filter(Boolean);
    const normalBolo = type === "bolo" && canHandleBolo(staffRank);
    const trainingBolo = type === "bolo" && !normalBolo && isJuniorAdministrator();
    let trainingSupervisorUid = "";
    let trainingSupervisorName = "";

    if (trainingBolo) {
        const supervisorUid = await showTextPrompt({
            title: "Training BOLO Supervisor",
            message: "Enter the Firebase UID of the authorized supervising staff member.",
            inputLabel: "Supervisor Firebase UID",
            placeholder: "Firebase UID",
            required: true,
            validationMessage: "A supervisor UID is required.",
            confirmLabel: "Continue"
        });
        if (supervisorUid === null) return;
        trainingSupervisorUid = supervisorUid;
        trainingSupervisorUid = trainingSupervisorUid.trim();
        const supervisorName = await showTextPrompt({
            title: "Training BOLO Supervisor",
            message: "Enter the supervising staff member's display name.",
            inputLabel: "Supervisor display name",
            placeholder: "Display name",
            required: true,
            validationMessage: "A supervisor display name is required.",
            confirmLabel: "Continue"
        });
        if (supervisorName === null) return;
        trainingSupervisorName = supervisorName;
        trainingSupervisorName = trainingSupervisorName.trim();
        if (!trainingSupervisorUid || !trainingSupervisorName) {
            showToast("Training Required", "A supervised training BOLO requires an authorized supervisor UID and name.", "error");
            return;
        }
    }

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
        logUsernameInput.dataset.displayName = resolvedUser.displayName || resolvedUser.name;
        logUsernameInput.dataset.avatarUrl = resolvedUser.avatarUrl || "";
    } catch (err) {
        showToast("Network Error", "Unable to reach Roblox verification servers. Try again later.", "error");
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnContent;
        return;
    }

    if (!robloxId) {
        showToast("Validation Error", "A valid Roblox User ID is required. Try typing the username again.", "error");
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnContent;
        return;
    }

    const actionLabel = String(type || "LOG").toUpperCase();
    const targetUser = logUsernameInput.value || "Unknown";
    const staffUser = currentStaff || "Staff";
    const reasonText = reason || selectedReasonTexts.join("\n") || "No reason provided";

    const newLog = {
        id: Date.now().toString(),
        type,
        username: targetUser,
        robloxId,
        robloxDisplayName: logUsernameInput.dataset.displayName || targetUser,
        robloxAvatarUrl: logUsernameInput.dataset.avatarUrl || "",
        reason: reasonText,
        reasonTemplateIds: selectedReasonIds,
        reasonTemplateNames: selectedReasonTexts,
        duration,
        staff: staffUser,
        date: new Date().toISOString(),
        evidence,
        message: `${actionLabel} | Target: ${targetUser} | By: ${staffUser} | Reason: ${reasonText}`,
        user: staffUser,
        staffUid: auth.currentUser?.uid || "",
        time: Date.now()
    };

    if (type === "bolo") {
        newLog.boloStatus = "pending";
        if (trainingBolo) {
            newLog.trainingBolo = true;
            newLog.trainingStatus = "pending_supervisor_review";
            newLog.supervisorUid = trainingSupervisorUid;
            newLog.supervisorName = trainingSupervisorName;
            newLog.normalBoloPermission = false;
        } else {
            newLog.trainingBolo = false;
            newLog.normalBoloPermission = normalBolo;
        }
    }

    try {
        const docRef = await addDoc(collection(db, "logs"), newLog);
        newLog.id = docRef.id;
        dispatchDiscordModerationAudit(newLog);
        showToast("Log Submitted", `Successfully logged ${actionLabel} for ${targetUser}`, "success");
    } catch (e) {
        showToast("Database Error", `Failed to save log with Firebase: ${e?.message || "Unknown error"}`, "error");
        reportSystemError({
            title: "Moderation Log Submission Failed",
            detail: `Failed to save ${type.toUpperCase()} log for ${targetUser}: ${e?.message || "Unknown error"}`,
            system: "NYSRP Moderation System",
            endpoint: "Firestore /logs",
            status: "500"
        });
    }

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

// Roblox API Cache
const robloxCache = new Map();
const robloxProfileCache = new Map();

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 8000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const message = data?.errors?.[0]?.message || data?.error || `Request failed with ${response.status}`;
            throw new Error(message);
        }
        return data;
    } catch (error) {
        if (error.name === "AbortError") throw new Error("Request timed out");
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

async function fetchRobloxHeadshot(userId) {
    try {
        const result = await fetchJsonWithTimeout(`/api/roblox/headshot?userIds=${encodeURIComponent(userId)}&size=100x100&format=Png&isCircular=true`, {}, 4000);
        return result?.data?.[0]?.imageUrl || "";
    } catch (e) {
        return "";
    }
}

// Resolve Roblox User via API Proxy → Roblox Official API
async function resolveExactRobloxUser(username) {
    const cleanUsername = String(username || "").trim();
    if (!cleanUsername || cleanUsername.length < 3) return null;
    
    const lowerUser = cleanUsername.toLowerCase();
    if (robloxCache.has(lowerUser)) {
        return robloxCache.get(lowerUser);
    }

    const result = await fetchJsonWithTimeout("/api/roblox/lookup", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
        },
        body: JSON.stringify({
            usernames: [cleanUsername],
            excludeBannedUsers: false
        })
    });

    if (result && Array.isArray(result.data) && result.data.length > 0) {
        const userData = result.data[0];
        const userId = String(userData.id);
        const name = userData.name || cleanUsername;
        const displayName = userData.displayName || name;

        // Retrieve avatar thumbnail in background or non-blocking
        const avatarUrl = await fetchRobloxHeadshot(userId);

        const profile = {
            id: userId,
            name: name,
            displayName: displayName,
            avatarUrl: avatarUrl || ""
        };

        robloxCache.set(lowerUser, profile);
        robloxProfileCache.set(userId, profile);
        return profile;
    }
    return null;
}

// ==========================================
// ROBLOX AUTOMATIC VERIFICATION
// ==========================================

let verificationTimeout = null;

async function verifyRobloxUsernameAutomatically(query) {
    const cleanQuery = String(query || "").trim();
    if (!cleanQuery || cleanQuery.length < 3) {
        robloxAutocomplete.classList.add("hidden");
        logRobloxIdInput.value = "";
        return;
    }

    robloxAutocomplete.innerHTML = `
        <div class="autocomplete-loading">
            <i class="fas fa-spinner fa-spin"></i>
            <span>Verifying Roblox user...</span>
        </div>
    `;
    robloxAutocomplete.classList.remove("hidden");

    try {
        const resolvedUser = await resolveExactRobloxUser(cleanQuery);
        
        if (resolvedUser) {
            // Success
            logRobloxIdInput.value = resolvedUser.id;
            logUsernameInput.value = resolvedUser.name;
            logUsernameInput.dataset.displayName = resolvedUser.displayName || resolvedUser.name;
            logUsernameInput.dataset.avatarUrl = resolvedUser.avatarUrl || "";
            robloxAutocomplete.innerHTML = `
                <div class="autocomplete-item" style="cursor: default; background: transparent;">
                    ${resolvedUser.avatarUrl ? `<img src="${escapeHTML(resolvedUser.avatarUrl)}" alt="" class="roblox-avatar-sm">` : `<span class="roblox-avatar-sm roblox-avatar-fallback"><i class="fas fa-user"></i></span>`}
                    <div class="autocomplete-info">
                        <span class="autocomplete-username" style="color: var(--success-color);">
                            <i class="fas fa-check-circle"></i> ${escapeHTML(resolvedUser.name)}
                        </span>
                        <span class="autocomplete-displayname">${escapeHTML(resolvedUser.displayName || resolvedUser.name)} | ID: ${escapeHTML(resolvedUser.id)}</span>
                    </div>
                </div>
            `;
            setTimeout(() => robloxAutocomplete.classList.add("hidden"), 3500);
        } else {
            // Not found on Roblox
            logRobloxIdInput.value = "";
            robloxAutocomplete.innerHTML = `
                <div class="autocomplete-loading">
                    <i class="fas fa-exclamation-circle" style="color: var(--ban-color)"></i>
                    <span>Roblox user not found.</span>
                </div>
            `;
        }
    } catch (error) {
        logRobloxIdInput.value = "";
        robloxAutocomplete.innerHTML = `
            <div class="autocomplete-loading">
                <i class="fas fa-wifi-slash" style="color: var(--warn-color)"></i>
                <span>Unable to verify this Roblox user right now. Please try again.</span>
            </div>
        `;
    }
}

logUsernameInput.addEventListener("input", () => {
    const query = logUsernameInput.value.trim();
    
    if (verificationTimeout) clearTimeout(verificationTimeout);
    
    // Clear the ID if they change the username
    logRobloxIdInput.value = "";
    logUsernameInput.dataset.displayName = "";
    logUsernameInput.dataset.avatarUrl = "";
    
    if (query.length < 3) {
        robloxAutocomplete.classList.add("hidden");
        return;
    }
    
    // Debounce the automatic lookup
    verificationTimeout = setTimeout(() => {
        verifyRobloxUsernameAutomatically(query);
    }, 800);
});

logUsernameInput.addEventListener("blur", () => {
    const query = logUsernameInput.value.trim();
    if (query && !logRobloxIdInput.value) {
        if (verificationTimeout) clearTimeout(verificationTimeout);
        verifyRobloxUsernameAutomatically(query);
    }
});

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
        const nextRank = normalizeRank(tbStaffRank.value.trim() || staffRank);
        staffRank = nextRank;
        localStorage.setItem("nysrp_logged_in_rank", nextRank);
        if (staffRoleSidebar) {
            staffRoleSidebar.textContent = formatRankLabel(nextRank);
        }
        renderPresets();
    });
}

if (presetSearchInput) {
    presetSearchInput.addEventListener("input", (e) => {
        presetSearchQuery = e.target.value.trim().toLowerCase();
        renderPresets();
    });
}

function parsePresetTemplate(template) {
    const staff = currentStaff || "Staff";
    const rank = formatRankLabel(staffRank);
    const time = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    
    return template
        .replace(/\[user\]/gi, staff)
        .replace(/\[rank\]/gi, rank)
        .replace(/\[time\]/gi, time);
}

function getVisiblePresets() {
    const keyword = presetSearchQuery.trim().toLowerCase();
    return presets.filter(preset => {
        const matchesSearch = !keyword || [preset.title, preset.template, preset.category].join(" ").toLowerCase().includes(keyword);
        const isActive = preset.active !== false;
        return matchesSearch && (canManagePresetsUI() || isActive);
    });
}

function renderPresets() {
    if (!presetsContainer) return;

    const visiblePresets = getVisiblePresets();

    if (!canManagePresetsUI()) {
        document.getElementById("btnCreatePreset")?.classList.add("hidden");
    } else {
        document.getElementById("btnCreatePreset")?.classList.remove("hidden");
    }

    if (visiblePresets.length === 0) {
        presetsContainer.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1; background: var(--bg-card); border-radius: var(--radius-lg); border: 1px dashed var(--border-color); padding: 50px 20px;">
                <i class="fas fa-toolbox" style="font-size: 2.5rem;"></i>
                <p>No message presets match your current search.</p>
                ${canManagePresetsUI() ? `<button class="btn-new-log" onclick="openPresetModal(null)" style="margin-top: 10px;"><i class="fas fa-plus"></i> Create First Preset</button>` : ""}
            </div>
        `;
        return;
    }
    
    presetsContainer.innerHTML = visiblePresets.map((preset, index) => {
        const previewHtml = escapeHTML(preset.template)
            .replace(/\[user\]/gi, `<span class="preset-placeholder-highlight">${escapeHTML(currentStaff || "Staff")}</span>`)
            .replace(/\[rank\]/gi, `<span class="preset-placeholder-highlight">${escapeHTML(formatRankLabel(staffRank))}</span>`)
            .replace(/\[time\]/gi, `<span class="preset-placeholder-highlight">${escapeHTML(new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }))}</span>`);
        const categoryText = escapeHTML(preset.category || "General");
        const isDisabled = preset.active === false;
        const managementButtons = canManagePresetsUI() ? `
            <button class="btn-preset-action" onclick="togglePresetStatus('${preset.id}')" title="${isDisabled ? 'Enable' : 'Disable'} Preset">
                <i class="fas ${isDisabled ? 'fa-toggle-off' : 'fa-toggle-on'}"></i>
                <span>${isDisabled ? 'Disabled' : 'Enabled'}</span>
            </button>
            <button class="btn-preset-action" onclick="reorderPreset('${preset.id}', 'up')" title="Move Up">
                <i class="fas fa-arrow-up"></i>
            </button>
            <button class="btn-preset-action" onclick="reorderPreset('${preset.id}', 'down')" title="Move Down">
                <i class="fas fa-arrow-down"></i>
            </button>
            <button class="btn-preset-action" onclick="openPresetModal('${preset.id}')" title="Edit Template">
                <i class="fas fa-edit"></i>
                <span>Edit</span>
            </button>
            <button class="btn-preset-action btn-delete-preset" onclick="deletePreset('${preset.id}', '${escapeHTML(preset.title)}')" title="Delete Preset">
                <i class="fas fa-trash-alt"></i>
            </button>
        ` : "";
        
        return `
            <div class="preset-card log-row-enter" style="animation-delay: ${index * 0.05}s; ${isDisabled ? 'opacity: 0.7;' : ''}">
                <div class="preset-card-header">
                    <span class="preset-card-title">${escapeHTML(preset.title)}</span>
                    <span class="type-badge badge-note" style="font-size: 0.7rem;">${categoryText}</span>
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
                    ${managementButtons}
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
        
        const originalText = label?.textContent || "Copy Message";
        const originalIconClass = icon?.className || "fas fa-copy";
        
        if (label) label.textContent = "Copied!";
        if (icon) icon.className = "fas fa-check";
        
        showToast("Preset Copied", "Message copied to your clipboard successfully.", "success");
        
        setTimeout(() => {
            if (label) label.textContent = originalText;
            if (icon) icon.className = originalIconClass;
        }, 2000);
    }).catch(err => {
        showToast("Copy Failed", "Unable to copy text.", "error");
    });
};

window.openPresetModal = function(id = null) {
    if (!canManagePresetsUI()) {
        showToast("Permission Denied", "Only the owner can manage message presets.", "error");
        return;
    }

    presetForm.reset();
    
    if (id) {
        const preset = presets.find(p => p.id === id);
        if (!preset) return;
        
        currentPresetEditId = id;
        presetIdInput.value = id;
        presetTitleInput.value = preset.title;
        presetTemplateInput.value = preset.template;
        presetCategoryInput.value = preset.category || "General";
        presetActiveInput.value = preset.active === false ? "false" : "true";
        presetModalTitle.textContent = "Edit Message Preset";
    } else {
        currentPresetEditId = null;
        presetIdInput.value = "";
        presetCategoryInput.value = "General";
        presetActiveInput.value = "true";
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

presetForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    if (!canManagePresetsUI()) {
        showToast("Permission Denied", "Only the owner can manage message presets.", "error");
        return;
    }

    const id = presetIdInput.value;
    const title = presetTitleInput.value.trim();
    const template = presetTemplateInput.value.trim();
    const category = presetCategoryInput.value.trim() || "General";
    const active = presetActiveInput.value === "true";
    const payload = { title, template, category, active, order: currentPresetEditId ? presets.find(p => p.id === currentPresetEditId)?.order ?? 0 : presets.length };

    try {
        if (currentPresetEditId) {
            await updateDoc(doc(db, "presets", currentPresetEditId), payload);
            showToast("Preset Updated", "Your template has been saved.", "success");
        } else {
            const newId = Date.now().toString();
            await setDoc(doc(db, "presets", newId), { ...payload, id: newId });
            showToast("Preset Created", "New template added to toolbox.", "success");
        }
    } catch(e) {
        showToast("Error", "Failed to save preset.", "error");
    }
    
    presetModal.classList.remove("visible");
    renderPresets();
});

window.togglePresetStatus = async function(id) {
    if (!canManagePresetsUI()) {
        showToast("Permission Denied", "Only the owner can manage message presets.", "error");
        return;
    }

    const preset = presets.find(p => p.id === id);
    if (!preset) return;
    try {
        await updateDoc(doc(db, "presets", id), { active: preset.active === false });
        showToast("Preset Updated", "Preset availability updated.", "success");
    } catch (error) {
        showToast("Error", "Failed to update preset status.", "error");
    }
};

window.reorderPreset = async function(id, direction) {
    if (!canManagePresetsUI()) return;

    const currentIndex = presets.findIndex(p => p.id === id);
    if (currentIndex < 0) return;

    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= presets.length) return;

    const currentPreset = presets[currentIndex];
    const targetPreset = presets[targetIndex];

    try {
        await Promise.all([
            updateDoc(doc(db, "presets", currentPreset.id), { order: targetPreset.order || 0 }),
            updateDoc(doc(db, "presets", targetPreset.id), { order: currentPreset.order || 0 })
        ]);
        showToast("Preset Reordered", "Preset order updated.", "success");
    } catch (error) {
        showToast("Error", "Failed to reorder preset.", "error");
    }
};

window.deletePreset = async function(id, title) {
    if (!canManagePresetsUI()) {
        showToast("Permission Denied", "Only the owner can manage message presets.", "error");
        return;
    }

    await showConfirmation({
        title: "Delete Message Preset",
        message: `Permanently delete the preset "${title}"? This action cannot be undone.`,
        variant: "danger",
        confirmLabel: "Delete Preset",
        loadingMessage: "Deleting preset...",
        successTitle: "Preset Deleted",
        successMessage: "The preset was permanently removed.",
        successToast: { title: "Preset Deleted", message: "Preset template removed." },
        errorTitle: "Preset Delete Failed",
        errorMessage: "The preset couldn't be deleted. Please try again.",
        action: () => deleteDoc(doc(db, "presets", id))
    });
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

window.completeActiveBolo = async function(logId) {
    if (!canHandleBolo(staffRank)) {
        showToast("Permission Denied", "Only approved ranks can resolve BOLOs.", "error");
        return;
    }

    const logRef = doc(db, "logs", String(logId || ""));
    try {
        const logSnapshot = await getDoc(logRef);
        const log = logSnapshot.exists() ? logSnapshot.data() : null;
        if (!log || log.type !== "bolo" || !["pending", "active"].includes(log.boloStatus)) {
            console.warn("completeActiveBolo skipped invalid BOLO document:", {
                collection: "logs",
                document: logId,
                exists: logSnapshot.exists(),
                type: log?.type,
                boloStatus: log?.boloStatus
            });
            showToast("BOLO Unavailable", "This BOLO could not be found or has already been reviewed.", "error", ERROR_CODES.data);
            return;
        }

        await updateDoc(logRef, {
            boloStatus: "completed",
            approvedBy: currentStaff || "Staff",
            approvedAt: new Date().toISOString(),
            approvalReason: "Approved by staff",
            finalOutcome: "completed"
        });

        const banCmd = `:ban ${log.robloxId} Bolo`;
        navigator.clipboard.writeText(banCmd).then(() => {
            showToast("BOLO Completed", `Ban command copied to clipboard: ${banCmd}`, "success");
        }).catch(err => {
            showToast("BOLO Completed", "BOLO status updated.", "success");
        });
    } catch(e) {
        console.error("completeActiveBolo error:", {
            code: e?.code || "unknown",
            message: e?.message || String(e),
            collection: "logs",
            document: logId,
            operation: "updateDoc",
            uid: auth.currentUser?.uid || null,
            rank: normalizeRank(staffRank),
            permissionPassed: canHandleBolo(staffRank),
            error: e
        });
        showToast("Error", `Failed to complete BOLO: ${e?.message || "Unknown error"}`, "error");
        reportSystemError({
            title: "BOLO Approval Failed",
            detail: `Failed to complete BOLO review for log ${logId}: ${e?.message || "Unknown error"}`,
            system: "NYSRP BOLO System",
            endpoint: "Firestore /logs",
            status: "500"
        });
    }
};

window.denyActiveBolo = async function(logId) {
    if (!canHandleBolo(staffRank)) {
        showToast("Permission Denied", "Only approved ranks can review BOLOs.", "error");
        return;
    }
    const log = logs.find(l => l.id === logId);
    if (!log || !["pending", "active"].includes(log.boloStatus)) {
        showToast("BOLO Unavailable", "This BOLO could not be found or has already been reviewed.", "error", ERROR_CODES.data);
        return;
    }
    const denialReason = await showTextPrompt({
        title: "Deny BOLO Review",
        message: "Provide a reason for denying this BOLO review.",
        inputLabel: "Denial reason",
        placeholder: "Enter the reason",
        required: true,
        validationMessage: "A denial reason is required.",
        confirmLabel: "Deny BOLO",
        variant: "danger"
    });
    if (denialReason === null) return;
    const trimmedReason = denialReason.trim();
    if (!trimmedReason) {
        showToast("Validation Error", "A denial reason is required.", "error");
        return;
    }

    try {
        await updateDoc(doc(db, "logs", logId), {
            boloStatus: "denied",
            approvedBy: currentStaff || "Staff",
            approvedAt: new Date().toISOString(),
            approvalReason: trimmedReason,
            finalOutcome: "denied"
        });
        showToast("BOLO Denied", "The BOLO review was marked as denied.", "info");
    } catch (e) {
        console.error("denyActiveBolo error:", e);
        showToast("Error", "Failed to deny BOLO.", "error");
        reportSystemError({
            title: "BOLO Denial Failed",
            detail: `Failed to deny BOLO review for log ${logId}: ${e?.message || "Unknown error"}`,
            system: "NYSRP BOLO System",
            endpoint: "Firestore /logs",
            status: "500"
        });
    }
};

// ==========================================
// LIST RENDERING & COUNTERS
// ==========================================

window.confirmDeleteLog = async function(id) {
    await showConfirmation({
        title: "Delete Action Log",
        message: "Are you sure you want to permanently delete this log? This action cannot be undone.",
        variant: "danger",
        confirmLabel: "Delete Log",
        loadingMessage: "Deleting log...",
        successTitle: "Log Deleted",
        successMessage: "The log has been permanently removed.",
        successToast: { title: "Log Deleted", message: "The log has been permanently removed." },
        errorTitle: "Log Delete Failed",
        errorMessage: "The log couldn't be deleted. Please try again.",
        action: () => deleteDoc(doc(db, "logs", id))
    });
};

function getBoloStatusLabel(status) {
    const normalized = String(status || "active").toLowerCase();
    if (normalized === "completed") return "Bolo Resolved";
    if (normalized === "pending") return "Bolo Pending";
    if (normalized === "denied") return "Bolo Denied";
    return "Bolo Active";
}

function getBoloBadgeClass(status) {
    const normalized = String(status || "active").toLowerCase();
    if (normalized === "completed") return "badge-note";
    if (normalized === "denied") return "badge-ban";
    return "badge-bolo";
}

function getLogTimeMillis(log) {
    return timestampToMillis(log.date || log.createdAt || log.time);
}

function getStaffActivityLogs(uid, staffName) {
    return logs.filter(log => {
        if (log.staffUid) return log.staffUid === uid;
        return String(log.staff || log.user || "").trim().toLowerCase() === String(staffName || "").trim().toLowerCase();
    });
}

function getLocalDayStart(date) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    return start.getTime();
}

function getWeekStartMillis(date = new Date()) {
    const start = new Date(getLocalDayStart(date));
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    return start.getTime();
}

function getLogStatisticType(log) {
    return ["warn", "kick", "ban", "note", "bolo"].includes(log.type) ? log.type : null;
}

function getShiftWorkSecondsInRange(uid, rangeStart, rangeEnd) {
    const now = Date.now();
    return shifts.reduce((total, shift) => {
        if (shift.staffUid !== uid) return total;
        const start = timestampToMillis(shift.startTime || shift.createdAt);
        if (start === null) return total;

        const end = timestampToMillis(shift.endTime) ?? now;
        const overlapStart = Math.max(start, rangeStart);
        const overlapEnd = Math.min(end, rangeEnd, now);
        if (overlapEnd <= overlapStart) return total;

        let workedMs = overlapEnd - overlapStart;
        const breaks = Array.isArray(shift.breaks) ? shift.breaks : [];
        breaks.forEach(shiftBreak => {
            const breakStart = timestampToMillis(shiftBreak.start);
            if (breakStart === null) return;
            const breakEnd = timestampToMillis(shiftBreak.end)
                ?? (shift.status === "break" ? now : null);
            if (breakEnd === null) return;
            const clippedStart = Math.max(breakStart, overlapStart);
            const clippedEnd = Math.min(breakEnd, overlapEnd);
            if (clippedEnd > clippedStart) workedMs -= clippedEnd - clippedStart;
        });

        if (breaks.length === 0 && shift.status === "completed" && start >= rangeStart && end <= rangeEnd
            && Number.isFinite(shift.durationSeconds) && shift.durationSeconds > 0) {
            workedMs = Math.min(workedMs, shift.durationSeconds * 1000);
        }
        return total + Math.max(0, workedMs) / 1000;
    }, 0);
}

function formatStatisticsShiftHours(totalSeconds) {
    const minutes = Math.floor(Math.max(0, totalSeconds || 0) / 60);
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return hours ? `${hours}h ${remainingMinutes}m` : `${remainingMinutes}m`;
}

function renderPersonalDashboard() {
    if (!auth.currentUser) return;

    const uid = auth.currentUser.uid;
    const name = currentUserDoc?.robloxUsername || currentUserDoc?.displayName || currentStaff || "Staff";
    const training = currentUserDoc?.training || null;
    const now = new Date();
    const todayStart = getLocalDayStart(now);
    const personalLogs = getStaffActivityLogs(uid, name);
    const todayActions = personalLogs.filter(log => {
        const time = getLogTimeMillis(log);
        return time !== null && time >= todayStart && time <= now.getTime() && getLogStatisticType(log);
    }).length;
    const latestLoa = loaRequests
        .filter(request => request.staffUid === uid)
        .sort((a, b) => (timestampToMillis(b.createdAt) || 0) - (timestampToMillis(a.createdAt) || 0))[0];
    const unreadCount = staffNotifications.filter(notification => notification.available !== false && notification.read !== true).length;

    document.getElementById("personalStaffName").textContent = name;
    document.getElementById("personalStaffRank").textContent = formatRankLabel(currentUserDoc?.rank || staffRank);
    document.getElementById("personalShiftStatus").textContent = activeUserShift
        ? (activeUserShift.status === "break" ? "🟢 ON DUTY · ON BREAK" : "🟢 ON DUTY")
        : "⚪ OFF DUTY";
    document.getElementById("personalTodayActivity").textContent = `${todayActions} ${todayActions === 1 ? "action" : "actions"}`;

    let trainingStatus = "Not required";
    if (training) {
        const completed = training.tutorialCompleted === true || training.status === "completed";
        if (completed) {
            trainingStatus = "100% Complete";
        } else if (training.status === "in_progress") {
            const stepCount = Math.max(1, Array.isArray(TRAINING_STEPS) ? TRAINING_STEPS.length : 1);
            const step = Math.min(stepCount, Math.max(1, Number(training.currentStep) || 1));
            trainingStatus = `${Math.round((step / stepCount) * 100)}% · In progress`;
        } else {
            trainingStatus = "Not started";
        }
    } else if (isTrainingEligibleRank(currentUserDoc?.rank || staffRank)) {
        trainingStatus = "Not started";
    }
    document.getElementById("personalTrainingStatus").textContent = trainingStatus;

    const loaStatus = latestLoa ? String(latestLoa.status || "pending").toLowerCase() : "";
    document.getElementById("personalLoaStatus").textContent = !latestLoa
        ? "None"
        : loaStatus === "approved"
            ? "🟢 Approved"
            : loaStatus === "pending"
                ? "🟡 Pending"
                : loaStatus === "denied"
                    ? "🔴 Denied"
                    : loaStatus.charAt(0).toUpperCase() + loaStatus.slice(1);
    document.getElementById("personalNotificationCount").textContent = `${unreadCount} unread`;
}

function renderStaffStatistics() {
    if (!auth.currentUser) return;

    const canReviewStaffStats = canViewAllShifts(staffRank);
    const staffControl = document.getElementById("statisticsStaffControl");
    const staffSelect = document.getElementById("statisticsStaffSelect");
    const filterSelect = document.getElementById("statisticsActivityFilter");
    const requestedUid = selectedStatsUid || auth.currentUser.uid;
    const targetUid = canReviewStaffStats
        && (requestedUid === auth.currentUser.uid || staffMembers.some(member => member.id === requestedUid))
        ? requestedUid
        : auth.currentUser.uid;
    const targetProfile = targetUid === auth.currentUser.uid
        ? currentUserDoc
        : staffMembers.find(member => member.id === targetUid);
    const targetName = targetProfile?.robloxUsername || targetProfile?.displayName || targetProfile?.username || currentStaff || "Staff";
    const targetLogs = getStaffActivityLogs(targetUid, targetName);
    const now = new Date();
    const nowMillis = now.getTime();
    const weekStart = getWeekStartMillis(now);
    const weekLogs = targetLogs.filter(log => {
        const time = getLogTimeMillis(log);
        return time !== null && time >= weekStart && time <= nowMillis;
    });
    const counts = { warn: 0, kick: 0, ban: 0, note: 0, bolo: 0 };
    weekLogs.forEach(log => {
        const type = getLogStatisticType(log);
        if (type) counts[type] += 1;
    });

    if (staffControl) staffControl.classList.toggle("hidden", !canReviewStaffStats);
    if (canReviewStaffStats && staffSelect) {
        const options = [
            { id: auth.currentUser.uid, name: currentUserDoc?.robloxUsername || currentStaff || "My Statistics", rank: staffRank },
            ...staffMembers
                .filter(member => member.id !== auth.currentUser.uid)
                .map(member => ({
                    id: member.id,
                    name: member.robloxUsername || member.displayName || member.username || member.email || "Staff",
                    rank: member.rank || "Staff"
                }))
        ];
        staffSelect.innerHTML = options.map(member =>
            `<option value="${escapeHTML(member.id)}">${escapeHTML(member.name)} · ${escapeHTML(formatRankLabel(member.rank))}</option>`
        ).join("");
        if (!options.some(member => member.id === targetUid)) selectedStatsUid = auth.currentUser.uid;
        staffSelect.value = selectedStatsUid || auth.currentUser.uid;
    }

    document.getElementById("staffStatisticsTitle").textContent = canReviewStaffStats
        ? `Statistics · ${targetName}`
        : "Your Staff Statistics";
    document.getElementById("weeklyWarnings").textContent = String(counts.warn);
    document.getElementById("weeklyKicks").textContent = String(counts.kick);
    document.getElementById("weeklyBans").textContent = String(counts.ban);
    document.getElementById("weeklyNotes").textContent = String(counts.note);
    document.getElementById("weeklyBolos").textContent = String(counts.bolo);
    document.getElementById("weeklyShiftHours").textContent = formatStatisticsShiftHours(
        getShiftWorkSecondsInRange(targetUid, weekStart, nowMillis)
    );

    const selectedActivity = filterSelect?.value || "all";
    const firstDay = new Date(getLocalDayStart(now));
    firstDay.setDate(firstDay.getDate() - 6);
    const chartRows = Array.from({ length: 7 }, (_, index) => {
        const dayStart = new Date(firstDay);
        dayStart.setDate(firstDay.getDate() + index);
        const startMillis = dayStart.getTime();
        const endMillis = startMillis + 24 * 60 * 60 * 1000;
        const count = selectedActivity === "shifts"
            ? getShiftWorkSecondsInRange(targetUid, startMillis, Math.min(endMillis, nowMillis)) / 3600
            : targetLogs.filter(log => {
                const time = getLogTimeMillis(log);
                const type = getLogStatisticType(log);
                return time !== null && time >= startMillis && time < endMillis && type
                    && (selectedActivity === "all" || selectedActivity === type);
            }).length;
        return {
            label: dayStart.toLocaleDateString("en-US", { weekday: "short" }),
            value: count,
            formattedValue: selectedActivity === "shifts" ? `${count.toFixed(1)}h` : String(count)
        };
    });
    const maxValue = Math.max(1, ...chartRows.map(row => row.value));
    const graph = document.getElementById("staffActivityGraph");
    graph.setAttribute("aria-label", `Seven day ${selectedActivity === "all" ? "activity" : selectedActivity} chart for ${targetName}`);
    graph.innerHTML = chartRows.map(row => `
        <div class="activity-chart-row">
            <span>${row.label}</span>
            <div class="activity-chart-track"><div class="activity-chart-bar" style="width: ${row.value ? Math.max(2, row.value / maxValue * 100) : 0}%"></div></div>
            <strong>${row.formattedValue}</strong>
        </div>
    `).join("");
}

function getAvailableStaffNotifications() {
    return staffNotifications.filter(notification => notification.available === true);
}

function isOwnerRank() {
    return normalizeRank(staffRank) === "Owner";
}

function getRelativeNotificationTime(value) {
    const time = timestampToMillis(value);
    if (time === null) return "Recently";
    const elapsedMinutes = Math.max(0, Math.floor((Date.now() - time) / 60000));
    if (elapsedMinutes < 1) return "Just now";
    if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`;
    const elapsedHours = Math.floor(elapsedMinutes / 60);
    if (elapsedHours < 24) return `${elapsedHours}h ago`;
    const elapsedDays = Math.floor(elapsedHours / 24);
    if (elapsedDays < 7) return `${elapsedDays}d ago`;
    return new Date(time).toLocaleDateString();
}

function renderNotifications() {
    const list = document.getElementById("notificationList");
    const visibleNotifications = getAvailableStaffNotifications();
    const unreadCount = visibleNotifications.filter(notification => notification.read !== true).length;
    const bellCount = document.getElementById("notificationBellCount");
    const navCount = document.getElementById("notificationNavCount");
    const sendButton = document.getElementById("sendStaffNotificationBtn");
    const markAllButton = document.getElementById("markAllNotificationsReadBtn");
    const ownerManager = document.getElementById("ownerNotificationManager");

    [bellCount, navCount].forEach(element => {
        if (!element) return;
        element.textContent = unreadCount > 99 ? "99+" : String(unreadCount);
        element.classList.toggle("hidden", unreadCount === 0);
    });
    sendButton?.classList.toggle("hidden", !canManagePresets(staffRank));
    ownerManager?.classList.toggle("hidden", !isOwnerRank());
    if (markAllButton) markAllButton.disabled = unreadCount === 0;
    if (isOwnerRank()) renderManagedStaffNotifications();
    if (!list) return;

    if (staffNotificationError) {
        list.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Notifications could not be loaded. Refresh the dashboard or try again.</p></div>`;
        return;
    }

    if (!visibleNotifications.length) {
        list.innerHTML = `<div class="empty-state"><i class="fas fa-bell-slash"></i><p>You have no available notifications.</p></div>`;
        return;
    }

    list.innerHTML = visibleNotifications.map(notification => {
        const title = escapeHTML(notification.title || "Staff notification");
        const message = escapeHTML(notification.message || "");
        const creator = escapeHTML(notification.creatorName || "NYSRP Management");
        const creatorRank = escapeHTML(notification.creatorRank || "");
        const priority = ["normal", "important", "urgent"].includes(notification.priority)
            ? notification.priority
            : "normal";
        const createdAt = getRelativeNotificationTime(notification.createdAt);
        const destination = ["overview", "logs", "shifts", "training", "loa"].includes(notification.destination)
            ? notification.destination
            : "";
        const read = notification.read === true;
        const destinationButton = destination
            ? `<button class="btn-cancel notification-open-destination" type="button" data-notification-id="${escapeHTML(notification.id)}">Open destination</button>`
            : "";

        return `
            <article class="notification-card ${read ? "is-read" : ""}" data-priority="${priority}">
                <div class="notification-card-heading">
                    <h4>${title}</h4>
                    <span class="notification-priority">${priority}</span>
                </div>
                <p>${message}</p>
                <div class="notification-card-meta">
                    <span>From ${creator}${creatorRank ? ` · ${creatorRank}` : ""}</span>
                    <time>${createdAt}</time>
                    ${read ? `<span>Read</span>` : `<span>Unread</span>`}
                </div>
                <div class="notification-card-actions">
                    ${read ? "" : `<button class="btn-cancel notification-mark-read" type="button" data-notification-id="${escapeHTML(notification.id)}">Mark as Read</button>`}
                    ${destinationButton}
                    <button class="btn-delete notification-delete" type="button" data-notification-id="${escapeHTML(notification.id)}">Delete</button>
                </div>
            </article>
        `;
    }).join("");

    list.querySelectorAll(".notification-mark-read").forEach(button => {
        button.addEventListener("click", () => markStaffNotificationRead(button.dataset.notificationId));
    });
    list.querySelectorAll(".notification-open-destination").forEach(button => {
        button.addEventListener("click", () => openStaffNotificationDestination(button.dataset.notificationId));
    });
    list.querySelectorAll(".notification-delete").forEach(button => {
        button.addEventListener("click", () => deleteStaffNotification(
            button.dataset.notificationId,
            auth.currentUser?.uid
        ));
    });

}

function renderManagedStaffNotifications() {
    const list = document.getElementById("managedNotificationList");
    if (!list || !isOwnerRank()) return;

    if (!selectedNotificationRecipientUid) {
        list.innerHTML = `<div class="empty-state"><i class="fas fa-users"></i><p>Select a staff member to manage their notifications.</p></div>`;
        return;
    }

    const recipient = staffMembers.find(member => member.id === selectedNotificationRecipientUid);
    const recipientName = escapeHTML(
        recipient?.robloxUsername || recipient?.displayName || recipient?.username || recipient?.email || "Staff"
    );
    if (!managedStaffNotifications.length) {
        list.innerHTML = `<div class="empty-state"><i class="fas fa-bell-slash"></i><p>${recipientName} has no notifications.</p></div>`;
        return;
    }

    list.innerHTML = managedStaffNotifications.map(notification => {
        const title = escapeHTML(notification.title || "Staff notification");
        const message = escapeHTML(notification.message || "");
        const creator = escapeHTML(notification.creatorName || "NYSRP Management");
        const creatorRank = escapeHTML(notification.creatorRank || "");
        const priority = ["normal", "important", "urgent"].includes(notification.priority)
            ? notification.priority
            : "normal";
        const createdAt = getRelativeNotificationTime(notification.createdAt);
        const read = notification.read === true;
        return `
            <article class="notification-card ${read ? "is-read" : ""}" data-priority="${priority}">
                <div class="notification-card-heading">
                    <h4>${title}</h4>
                    <span class="notification-priority">${priority}</span>
                </div>
                <p>${message}</p>
                <div class="notification-card-meta">
                    <span>For ${recipientName}</span>
                    <span>From ${creator}${creatorRank ? ` · ${creatorRank}` : ""}</span>
                    <time>${createdAt}</time>
                    <span>${read ? "Read" : "Unread"}</span>
                </div>
                <div class="notification-card-actions">
                    <button class="btn-delete notification-delete" type="button" data-notification-id="${escapeHTML(notification.id)}">Delete</button>
                </div>
            </article>
        `;
    }).join("");

    list.querySelectorAll(".notification-delete").forEach(button => {
        button.addEventListener("click", () => deleteStaffNotification(
            button.dataset.notificationId,
            selectedNotificationRecipientUid
        ));
    });
}

function loadManagedStaffNotifications(recipientUid) {
    if (unsubManagedNotifications) unsubManagedNotifications();
    unsubManagedNotifications = null;
    managedStaffNotifications = [];
    selectedNotificationRecipientUid = "";

    if (!isOwnerRank() || !staffMembers.some(member => member.id === recipientUid)) {
        renderManagedStaffNotifications();
        return;
    }

    selectedNotificationRecipientUid = recipientUid;
    renderManagedStaffNotifications();
    unsubManagedNotifications = onSnapshot(
        query(
            collection(db, "users", recipientUid, "notifications"),
            where("recipientUid", "==", recipientUid)
        ),
        snapshot => {
            managedStaffNotifications = snapshot.docs.map(notification => ({
                id: notification.id,
                ...notification.data()
            })).sort((a, b) =>
                (timestampToMillis(b.createdAt) || 0) - (timestampToMillis(a.createdAt) || 0)
            );
            renderManagedStaffNotifications();
        },
        error => {
            managedStaffNotifications = [];
            console.error("Unable to load managed staff notifications:", {
                recipientUid,
                firebaseErrorCode: error?.code || "unknown",
                firebaseErrorMessage: error?.message || String(error)
            });
            renderManagedStaffNotifications();
            showToast("Notification Error", `Unable to load staff notifications: ${error.message}`, "error");
        }
    );
}

async function deleteStaffNotification(notificationId, recipientUid) {
    const currentUid = auth.currentUser?.uid;
    if (!currentUid || !notificationId || !recipientUid) return;
    if (recipientUid !== currentUid && !isOwnerRank()) {
        showToast("Permission Denied", "You can only delete your own notifications.", "error");
        return;
    }

    if (!(await showConfirmation({
        title: "Delete Notification",
        message: "Permanently delete this notification?",
        variant: "danger",
        confirmLabel: "Delete Notification"
    }))) return;

    try {
        await deleteDoc(doc(db, "users", recipientUid, "notifications", notificationId));
        if (recipientUid === currentUid) {
            staffNotifications = staffNotifications.filter(notification => notification.id !== notificationId);
            renderNotifications();
        }
        if (recipientUid === selectedNotificationRecipientUid) {
            managedStaffNotifications = managedStaffNotifications.filter(notification => notification.id !== notificationId);
            renderManagedStaffNotifications();
        }
        showToast("Notification Deleted", "The notification was permanently deleted.", "success");
    } catch (error) {
        console.error("Unable to delete staff notification:", {
            recipientUid,
            notificationId,
            firebaseErrorCode: error?.code || "unknown",
            firebaseErrorMessage: error?.message || String(error)
        });
        showToast("Notification Error", `Unable to delete notification: ${error.message}`, "error");
    }
}

async function markStaffNotificationRead(notificationId) {
    const uid = auth.currentUser?.uid;
    if (!uid || !notificationId) return;
    try {
        await updateDoc(doc(db, "users", uid, "notifications", notificationId), {
            read: true,
            readAt: serverTimestamp()
        });
    } catch (error) {
        console.error("Unable to mark staff notification as read:", error);
        showToast("Notification Error", `Unable to mark notification as read: ${error.message}`, "error");
    }
}

async function markAllStaffNotificationsRead() {
    const uid = auth.currentUser?.uid;
    const unread = getAvailableStaffNotifications().filter(notification => notification.read !== true);
    if (!uid || !unread.length) return;

    try {
        for (let offset = 0; offset < unread.length; offset += 450) {
            const batch = writeBatch(db);
            unread.slice(offset, offset + 450).forEach(notification => {
                batch.update(doc(db, "users", uid, "notifications", notification.id), {
                    read: true,
                    readAt: serverTimestamp()
                });
            });
            await batch.commit();
        }
    } catch (error) {
        console.error("Unable to mark all staff notifications as read:", error);
        showToast("Notification Error", `Unable to mark all notifications as read: ${error.message}`, "error");
    }
}

async function openStaffNotificationDestination(notificationId) {
    const notification = staffNotifications.find(item => item.id === notificationId);
    if (!notification) return;

    if (notification.read !== true) await markStaffNotificationRead(notificationId);
    const destinations = ["overview", "logs", "shifts", "training", "loa"];
    if (destinations.includes(notification.destination)) {
        switchPage(notification.destination);
    }
}

async function releaseStoredStaffNotifications(showDutyToast = false) {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    try {
        const stored = await getDocs(query(
            collection(db, "users", uid, "notifications"),
            where("recipientUid", "==", uid),
            where("available", "==", false)
        ));
        if (stored.empty) return;

        for (let offset = 0; offset < stored.docs.length; offset += 450) {
            const batch = writeBatch(db);
            stored.docs.slice(offset, offset + 450).forEach(notification => {
                batch.update(notification.ref, { available: true });
            });
            await batch.commit();
        }

        if (showDutyToast) {
            const unreadCount = stored.docs.filter(notification => notification.data().read !== true).length;
            if (unreadCount) {
                showToast("You are now on duty", `${unreadCount} new staff ${unreadCount === 1 ? "notification is" : "notifications are"} available.`, "info");
            }
        }
    } catch (error) {
        console.error("Unable to release stored staff notifications:", error);
        showToast("Notification Error", `Unable to load stored notifications: ${error.message}`, "error");
    }
}

function renderNotificationRecipientOptions() {
    const select = document.getElementById("staffNotificationRecipients");
    if (!select) return;
    const previousSelection = new Set(Array.from(select.selectedOptions || [], option => option.value));
    select.innerHTML = staffMembers.map(member => {
        const name = member.robloxUsername || member.displayName || member.username || member.email || "Staff";
        const rank = formatRankLabel(member.rank || "Staff");
        return `<option value="${escapeHTML(member.id)}">${escapeHTML(name)} · ${escapeHTML(rank)}</option>`;
    }).join("");
    Array.from(select.options).forEach(option => {
        option.selected = previousSelection.has(option.value);
    });

    const ownerSelect = document.getElementById("ownerNotificationRecipient");
    if (!ownerSelect) return;
    const currentOwnerSelection = selectedNotificationRecipientUid;
    ownerSelect.innerHTML = `<option value="">Select a staff member</option>` + staffMembers.map(member => {
        const name = member.robloxUsername || member.displayName || member.username || member.email || "Staff";
        const rank = formatRankLabel(member.rank || "Staff");
        return `<option value="${escapeHTML(member.id)}">${escapeHTML(name)} · ${escapeHTML(rank)}</option>`;
    }).join("");
    ownerSelect.value = staffMembers.some(member => member.id === currentOwnerSelection)
        ? currentOwnerSelection
        : "";
    if (!ownerSelect.value && currentOwnerSelection) loadManagedStaffNotifications("");
}

function getOnDutyStaffUids() {
    return new Set(shifts
        .filter(shift => shift.staffUid && (shift.status === "active" || shift.status === "break"))
        .map(shift => shift.staffUid));
}

async function sendStaffNotification(event) {
    event.preventDefault();
    if (!auth.currentUser || !canManagePresets(staffRank)) {
        showToast("Permission Denied", "Only Management, Director, Co Owner, and Owner can send staff notifications.", "error");
        return;
    }
    if (!staffMembersLoaded || !shiftsLoaded) {
        showToast("Please Wait", "The staff list and current shift statuses are still loading.", "info");
        return;
    }

    const title = document.getElementById("staffNotificationTitle").value.trim();
    const message = document.getElementById("staffNotificationMessage").value.trim();
    const priority = document.getElementById("staffNotificationPriority").value;
    const audience = document.getElementById("staffNotificationAudience").value;
    const destination = document.getElementById("staffNotificationDestination").value;
    const selectedUids = Array.from(
        document.getElementById("staffNotificationRecipients").selectedOptions || [],
        option => option.value
    );
    const onDutyUids = getOnDutyStaffUids();
    const recipients = staffMembers.filter(member => {
        if (audience === "on-duty") return onDutyUids.has(member.id);
        if (audience === "selected") return selectedUids.includes(member.id);
        return true;
    });

    if (!title || !message) {
        showToast("Validation Error", "Enter both a notification title and message.", "warning");
        return;
    }
    if (audience === "selected" && !selectedUids.length) {
        showToast("Select Recipients", "Select at least one staff member.", "warning");
        return;
    }
    if (!recipients.length) {
        showToast("No Recipients", "There are no staff members in the selected recipient group.", "warning");
        return;
    }

    const submitButton = document.getElementById("staffNotificationSubmitBtn");
    submitButton.disabled = true;
    const notificationWriteContext = {
        projectId: app.options.projectId,
        path: "users/{recipientUid}/notifications/{notificationId}",
        actorUid: auth.currentUser.uid,
        actorRank: staffRank,
        userDocumentRank: currentUserDoc?.rank || null,
        clientManagementAllowed: canManagePresets(staffRank),
        recipientCount: recipients.length,
        documentFields: [
            "recipientUid", "title", "message", "type", "createdAt", "read",
            "available", "priority", "destination", "creatorUid", "creatorName",
            "creatorRank"
        ]
    };
    try {
        const currentUid = auth.currentUser.uid;
        const onDutySet = getOnDutyStaffUids();
        for (let offset = 0; offset < recipients.length; offset += 450) {
            const batch = writeBatch(db);
            recipients.slice(offset, offset + 450).forEach(recipient => {
                const notificationRef = doc(collection(db, "users", recipient.id, "notifications"));
                batch.set(notificationRef, {
                    recipientUid: recipient.id,
                    title,
                    message,
                    type: "staff_notification",
                    createdAt: serverTimestamp(),
                    read: false,
                    available: onDutySet.has(recipient.id),
                    priority,
                    destination,
                    creatorUid: currentUid,
                    creatorName: currentStaff || "Management",
                    creatorRank: formatRankLabel(staffRank)
                });
            });
            await batch.commit();
        }

        document.getElementById("staffNotificationForm").reset();
        document.getElementById("staffNotificationRecipientsGroup").classList.add("hidden");
        document.getElementById("staffNotificationModal").classList.remove("visible");
        showToast("Notification Sent", `Notification delivered to ${recipients.length} staff ${recipients.length === 1 ? "member" : "members"}.`, "success");
    } catch (error) {
        console.error("Unable to send staff notification:", {
            ...notificationWriteContext,
            firebaseErrorName: error?.name || "UnknownError",
            firebaseErrorCode: error?.code || "unknown",
            firebaseErrorMessage: error?.message || String(error)
        });
        showToast("Notification Error", `Unable to send notification: ${error.message}`, "error");
    } finally {
        submitButton.disabled = false;
    }
}

function renderOverview() {
    renderPersonalDashboard();
    renderStaffStatistics();

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
            typeLabel = getBoloStatusLabel(log.boloStatus);
        }
        const badgeClass = log.type === "bolo" ? getBoloBadgeClass(log.boloStatus) : `badge-${log.type}`;

        return `
            <tr class="log-row-enter" style="animation-delay: ${index * 0.05}s">
                <td>
                    <span class="type-badge ${badgeClass}">
                        <i class="fas ${log.type === 'bolo' && log.boloStatus === 'completed' ? 'fa-check-circle' : (ACTION_CONFIG[log.type]?.icon || 'fa-info-circle')}"></i>
                        ${typeLabel}
                    </span>
                </td>
                <td style="font-weight: 600; color: var(--text-primary);">${renderRobloxIdentity(log)}</td>
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
            typeLabel = getBoloStatusLabel(log.boloStatus);
            badgeClass = getBoloBadgeClass(log.boloStatus);
        }
        
        const durationText = log.duration ? log.duration : "—";
        const evidenceBtn = log.evidence ? `<a href="${escapeHTML(log.evidence)}" target="_blank" class="table-action-btn view-btn" title="View Evidence"><i class="fas fa-external-link-alt"></i></a>` : "";

        // Copy buttons
        const copyIdBtn = `<button class="table-action-btn view-btn" onclick="copyToClipboardText('${log.robloxId}', 'Roblox ID')" title="Copy Roblox ID"><i class="fas fa-copy"></i></button>`;
        
        let boloCompleteBtn = "";
        let boloDenyBtn = "";
        let copyCmdBtn = "";
        
        if (log.type === "bolo" && (log.boloStatus === "pending" || log.boloStatus === "active")) {
            copyCmdBtn = `<button class="table-action-btn view-btn" onclick="copyBoloCommand('${log.robloxId}', 'Bolo')" style="color: var(--accent);" title="Copy Ban Command"><i class="fas fa-terminal"></i></button>`;
            
            if (canHandleBolo(staffRank)) {
                boloCompleteBtn = `<button class="table-action-btn view-btn" onclick="completeActiveBolo('${log.id}')" style="color: var(--note-color); border-color: rgba(16, 185, 129, 0.2);" title="Approve Bolo"><i class="fas fa-check-double"></i></button>`;
                boloDenyBtn = `<button class="table-action-btn delete-btn" onclick="denyActiveBolo('${log.id}')" title="Deny Bolo"><i class="fas fa-times"></i></button>`;
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
                <td style="font-weight: 600; color: var(--text-primary);">${renderRobloxIdentity(log, true)}</td>
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
                        ${boloDenyBtn}
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
        let badgeClass = `badge-${log.type}`;
        if (log.type === "bolo") {
            typeLabel = getBoloStatusLabel(log.boloStatus);
            badgeClass = getBoloBadgeClass(log.boloStatus);
        }
        const durationText = log.duration ? log.duration : "—";
        
        return `
            <tr class="log-row-enter" style="animation-delay: ${index * 0.03}s">
                <td>
                    <span class="type-badge ${badgeClass}">
                        <i class="fas ${ACTION_CONFIG[log.type]?.icon || 'fa-info-circle'}"></i>
                        ${typeLabel}
                    </span>
                </td>
                <td style="font-weight: 600; color: var(--text-primary);">${renderRobloxIdentity(log, true)}</td>
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
backdrop.setAttribute("aria-hidden", "true");
document.body.appendChild(backdrop);

function setSidebarOpen(open) {
    sidebar.classList.toggle("open", open);
    backdrop.classList.toggle("visible", open);
    document.body.classList.toggle("sidebar-open", open);
    sidebarToggle?.setAttribute("aria-expanded", String(open));
    sidebarToggle?.setAttribute("aria-label", open ? "Close navigation menu" : "Open navigation menu");
}

if (sidebarToggle) {
    sidebarToggle.addEventListener("click", () => {
        setSidebarOpen(!sidebar.classList.contains("open"));
    });
}

backdrop.addEventListener("click", () => {
    setSidebarOpen(false);
});

document.querySelectorAll(".sidebar-nav > a").forEach(link => {
    link.addEventListener("click", () => {
        setSidebarOpen(false);
    });
});

document.addEventListener("keydown", event => {
    if (event.key === "Escape" && sidebar.classList.contains("open")) {
        setSidebarOpen(false);
        sidebarToggle?.focus();
    }
});

// Helper: Escape HTML to prevent XSS
function escapeHTML(str) {
    if (!str) return "";
    return String(str).replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}

function getRobloxAvatarHtml(avatarUrl, fallbackText = "") {
    const safeUrl = typeof avatarUrl === 'string' ? avatarUrl.trim() : "";
    if (safeUrl) {
        return `<img src="${escapeHTML(safeUrl)}" alt="" class="roblox-avatar-sm" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none'; this.nextElementSibling?.classList.remove('hidden');">` +
            `<span class="roblox-avatar-sm roblox-avatar-fallback hidden"><i class="fas fa-user"></i>${fallbackText ? `<span class="sr-only">${escapeHTML(fallbackText)}</span>` : ""}</span>`;
    }
    return `<span class="roblox-avatar-sm roblox-avatar-fallback"><i class="fas fa-user"></i>${fallbackText ? `<span class="sr-only">${escapeHTML(fallbackText)}</span>` : ""}</span>`;
}

function renderRobloxIdentity(log, includeId = false) {
    const username = escapeHTML(log.username || "Unknown");
    const displayName = escapeHTML(log.robloxDisplayName || log.username || "Unknown");
    const userId = escapeHTML(log.robloxId || "");
    const avatar = getRobloxAvatarHtml(log.robloxAvatarUrl, log.username || "Player");
    const meta = includeId && userId ? `${displayName} | ID: ${userId}` : displayName;

    return `
        <div class="roblox-identity">
            ${avatar}
            <div class="roblox-identity-text">
                <span class="roblox-username">${username}</span>
                <span class="roblox-meta">${meta}</span>
            </div>
        </div>
    `;
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
        staffRoleSidebar.textContent = formatRankLabel(staffRank);
    }
    
    // Generate initials for avatar
    const initials = currentStaff.substring(0, 2).toUpperCase();
    staffAvatarSidebar.innerHTML = `<span style="color: #fff; font-weight: 800; font-size: 0.85rem;">${initials}</span>`;

    switchPage(window.location.pathname === "/loa" ? "loa" : "overview");
}

// Check if already logged in
if (currentStaff) {
    initDashboard();
}

// ==========================================
// STAFF MANAGEMENT LOGIC (OWNER ONLY)
// ==========================================
const createStaffForm = document.getElementById("createStaffForm");
const staffListBody = document.getElementById("staffListBody");
let unsubStaff = null;

const navStaff = document.getElementById("navStaff");
if (navStaff) {
    navStaff.addEventListener("click", (e) => {
        e.preventDefault();
        switchPage("staff");
        
        // Listen to staff users if owner
        if (canManageStaffUI() && !unsubStaff) {
            unsubStaff = onSnapshot(collection(db, "users"), (snapshot) => {
                const users = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                renderStaffList(users);
            }, (error) => {
                showToast("Database Error", `Unable to load staff: ${error.message}`, "error");
            });
        }
    });
}

function renderStaffList(users) {
    if (!staffListBody) return;
    if (users.length === 0) {
        staffListBody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><p>No staff found.</p></div></td></tr>`;
        return;
    }

    const protectedOwner = users.find(user => String(user.email || "").trim().toLowerCase() === PROTECTED_OWNER_EMAIL);
    if (protectedOwner) PROTECTED_OWNER_UID = protectedOwner.id;

    const canEditRanks = canManageStaffUI();

    staffListBody.innerHTML = users.map(user => {
        const normalizedRank = normalizeRank(user.rank);
        const isSelf = auth.currentUser?.uid === user.id;
        const isProtected = isProtectedOwner(user.id, user.email);
        const canEditThisUser = canEditRanks && !isSelf && !isProtected && canEditRank(normalizedRank, staffRank);
        const options = ALLOWED_RANKS.map(option => `
            <option value="${option}" ${normalizedRank === option ? "selected" : ""}>${formatRankLabel(option)}</option>
        `).join("");

        const username = escapeHTML(user.robloxUsername || user.username || user.name || (user.email ? user.email.split('@')[0] : 'Staff'));
        const email = escapeHTML(user.email || '—');
        const joinedDate = formatDate(user.createdAt || user.joinedAt || user.creationTime);

        return `
            <tr ${isProtected ? "style='background: rgba(255, 193, 7, 0.05);'" : ""}>
                <td style="font-weight: 600; color: var(--text-primary);">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span class="staff-avatar-sm" style="width: 28px; height: 28px; border-radius: 50%; background: var(--bg-hover); display: inline-flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 700; color: var(--accent); border: 1px solid var(--border-color);">
                            ${escapeHTML(username.substring(0, 2).toUpperCase())}
                        </span>
                        <span>${username}</span>
                        ${isProtected ? '<span style="font-size: 0.75rem; padding: 2px 6px; background: #FFC107; color: #000; border-radius: 3px; font-weight: 600;">🔒 LOCKED</span>' : ""}
                    </div>
                </td>
                <td style="color: var(--text-secondary); font-size: 0.9rem;">${email}</td>
                <td>
                    <select class="staff-rank-select" data-user-id="${user.id}" data-current-rank="${normalizedRank}" ${canEditThisUser ? "" : "disabled"} style="padding: 8px 10px; border-radius: var(--radius-md); border: 1px solid ${isProtected ? '#FFC107' : 'var(--border-color)'}; background: var(--bg-input); color: var(--text-primary); cursor: ${canEditThisUser ? 'pointer' : 'default'};${isProtected ? ' font-weight: 600;' : ''}">
                        ${options}
                    </select>
                </td>
                <td style="color: var(--text-muted); font-size: 0.85rem;">${joinedDate}</td>
                <td>
                    <div class="table-actions">
                        <button class="table-action-btn delete-btn" onclick="deleteStaff('${user.id}')" title="Delete Staff Account" ${canEditRanks && !isSelf && !isProtected ? "" : "disabled style='opacity: 0.3; cursor: not-allowed;'"}>
                            <i class="fas fa-user-minus"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join("");

    document.querySelectorAll(".staff-rank-select").forEach(select => {
        select.addEventListener("change", async (event) => {
            const userId = event.target.getAttribute("data-user-id");
            const newRank = normalizeRank(event.target.value);
            
            // PROTECTION: Prevent any changes to the protected Owner account
            if (isProtectedOwner(userId, users.find(user => user.id === userId)?.email)) {
                showToast("Protected Account", "The Owner account (sprog28@hotmail.com) is permanently locked and cannot be modified.", "error");
                // Reset dropdown to current value
                event.target.value = event.target.getAttribute("data-current-rank") || "Owner";
                return;
            }
            
            if (!userId || !canEditRank(newRank, staffRank)) {
                showToast("Permission Denied", "You cannot assign that rank.", "error");
                return;
            }
            try {
                await updateDoc(doc(db, "users", userId), { rank: newRank });
                showToast("Rank Updated", "Staff rank saved to Firestore.", "success");
            } catch (error) {
                showToast("Error", "Failed to update staff rank.", "error");
            }
        });
    });
}

if (createStaffForm) {
    createStaffForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        
        const email = document.getElementById("newStaffEmail").value.trim();
        const password = document.getElementById("newStaffPassword").value;
        const requestedRank = normalizeRank(document.getElementById("newStaffRank").value);
        const btnCreateStaff = document.getElementById("btnCreateStaff");

        if (!canManageStaffUI() || !canEditRank(requestedRank, staffRank)) {
            showToast("Permission Denied", "You can only create accounts within your rank scope.", "error");
            return;
        }
        
        btnCreateStaff.disabled = true;
        btnCreateStaff.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Creating...`;
        
        try {
            // Create user in secondary auth so current user isn't logged out
            const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
            const newUid = userCredential.user.uid;
            const createdAt = userCredential.user.metadata?.creationTime || new Date().toISOString();
            
            // Save to Firestore users collection
            await setDoc(doc(db, "users", newUid), {
                email: email,
                robloxUsername: email.split('@')[0],
                rank: requestedRank,
                createdAt: createdAt
            });
            
            // Logout secondary auth
            await signOut(secondaryAuth);
            
            showToast("Staff Created", `Successfully created account for ${email} with rank ${formatRankLabel(requestedRank)}.`, "success");
            createStaffForm.reset();
        } catch (error) {
            showToast("Error", "Failed to create staff account. " + error.message, "error");
        } finally {
            btnCreateStaff.disabled = false;
            btnCreateStaff.innerHTML = `<i class="fas fa-user-plus"></i> <span>Create Account</span>`;
        }
    });
}

window.deleteStaff = async function(uid) {
    // PROTECTION: Prevent deletion of protected Owner account
    if (isProtectedOwner(uid)) {
        showToast("Protected Account", "The Owner account (sprog28@hotmail.com) is permanently protected and cannot be deleted.", "error");
        return;
    }
    
    if (!canManageStaffUI()) {
        showToast("Permission Denied", "Only Owner and Co Owner can remove staff.", "error");
        return;
    }
    await showConfirmation({
        title: "Remove Staff Profile",
        message: "Delete this staff profile from Firestore? This does not disable the person's Firebase Authentication login.",
        variant: "danger",
        confirmLabel: "Delete Profile",
        loadingMessage: "Removing staff profile...",
        successTitle: "Staff Profile Removed",
        successMessage: "The staff profile was removed.",
        successToast: { title: "Staff Profile Removed", message: "The staff profile was removed from the database." },
        errorTitle: "Staff Removal Failed",
        errorMessage: "The staff profile couldn't be removed. Please try again.",
        action: () => deleteDoc(doc(db, "users", uid))
    });
};

// ==========================================
// REASON TEMPLATES LOGIC
// ==========================================
const createReasonForm = document.getElementById("createReasonForm");
const reasonsListBody = document.getElementById("reasonsListBody");
const logReasonTemplateSelect = document.getElementById("logReasonTemplate");
const logReasonTextArea = document.getElementById("logReason");
const clearReasonTemplatesBtn = document.getElementById("clearReasonTemplates");
const reasonSearchInput = document.getElementById("reasonSearch");

if (logReasonTemplateSelect && logReasonTextArea) {
    logReasonTemplateSelect.addEventListener("change", () => {
        const selected = getSelectedReasonTemplates().map(reason => reason.text);
        if (selected.length > 0) {
            logReasonTextArea.value = selected.join("\n");
        }
    });
}

if (clearReasonTemplatesBtn && logReasonTemplateSelect && logReasonTextArea) {
    clearReasonTemplatesBtn.addEventListener("click", () => {
        Array.from(logReasonTemplateSelect.options).forEach(option => {
            option.selected = false;
        });
        logReasonTextArea.value = "";
        logReasonTextArea.focus();
    });
}

if (reasonSearchInput) {
    reasonSearchInput.addEventListener("input", (event) => {
        reasonSearchQuery = event.target.value.trim().toLowerCase();
        renderReasonTemplates();
    });
}

function renderReasonTemplates() {
    if (createReasonForm) {
        createReasonForm.style.display = canManageReasonTemplates() ? "flex" : "none";
    }

    if (logReasonTemplateSelect) {
        const currentValues = new Set(Array.from(logReasonTemplateSelect.selectedOptions || []).map(option => option.value));
        logReasonTemplateSelect.multiple = true;
        logReasonTemplateSelect.size = Math.min(Math.max(reasonTemplates.length, 3), 6);
        logReasonTemplateSelect.innerHTML = reasonTemplates.map(r => `
            <option value="${escapeHTML(r.text)}" data-reason-id="${escapeHTML(r.id)}" ${currentValues.has(r.text) ? "selected" : ""}>${escapeHTML(r.text)}</option>
        `).join("");
    }
    
    if (!reasonsListBody) return;
    const visibleReasons = reasonTemplates.filter(reason => !reasonSearchQuery || String(reason.text || "").toLowerCase().includes(reasonSearchQuery));

    if (visibleReasons.length === 0) {
        reasonsListBody.innerHTML = `<tr><td colspan="3"><div class="empty-state"><p>No reason templates found.</p></div></td></tr>`;
        return;
    }
    
    reasonsListBody.innerHTML = visibleReasons.map(r => `
        <tr>
            <td style="font-weight: 500;">${r.order ?? 0}</td>
            <td style="font-weight: 500; color: var(--text-primary);">${escapeHTML(r.text)}</td>
            <td>
                <div class="table-actions">
                    ${canManageReasonTemplates() ? `<button class="table-action-btn view-btn" onclick="editReasonTemplate('${r.id}')" title="Edit Template"><i class="fas fa-edit"></i></button>` : ""}
                    ${canManageReasonTemplates() ? `<button class="table-action-btn delete-btn" onclick="deleteReasonTemplate('${r.id}')" title="Delete Template"><i class="fas fa-trash-alt"></i></button>` : ""}
                </div>
            </td>
        </tr>
    `).join("");
}

if (createReasonForm) {
    createReasonForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!canManageReasonTemplates()) {
            showToast("Permission Denied", "Only authorized staff can manage reason templates.", "error");
            return;
        }

        const textInput = document.getElementById("newReasonText");
        const orderInput = document.getElementById("newReasonOrder");
        const text = textInput ? textInput.value.trim() : "";
        const order = orderInput ? parseInt(orderInput.value, 10) || 0 : 0;
        const btnCreateReason = document.getElementById("btnCreateReason");

        if (!text) {
            showToast("Validation Error", "Reason template text is required.", "error");
            return;
        }
        
        if (btnCreateReason) {
            btnCreateReason.disabled = true;
            btnCreateReason.innerHTML = `<i class="fas fa-spinner fa-spin"></i> <span>Adding...</span>`;
        }

        try {
            const newDocRef = doc(collection(db, "reasons"));
            await setDoc(newDocRef, {
                text,
                order,
                createdAt: new Date().toISOString(),
                createdBy: currentStaff || "Staff"
            });
            showToast("Template Created", "Reason template added successfully.", "success");
            createReasonForm.reset();
            if (orderInput) orderInput.value = "0";
        } catch (error) {
            showToast("Database Error", `Failed to create reason template: ${error.message}`, "error");
        } finally {
            if (btnCreateReason) {
                btnCreateReason.disabled = false;
                btnCreateReason.innerHTML = `<i class="fas fa-plus"></i> <span>Add Reason</span>`;
            }
        }
    });
}

window.deleteReasonTemplate = async function(id) {
    if (!canManageReasonTemplates()) {
        showToast("Permission Denied", "Only authorized staff can manage reason templates.", "error");
        return;
    }

    await showConfirmation({
        title: "Delete Reason Template",
        message: "Permanently delete this reason template? Existing logs will not be changed.",
        variant: "danger",
        confirmLabel: "Delete Template",
        loadingMessage: "Deleting reason template...",
        successTitle: "Template Deleted",
        successMessage: "The reason template was removed.",
        successToast: { title: "Template Deleted", message: "Reason template removed." },
        errorTitle: "Template Delete Failed",
        errorMessage: "The reason template couldn't be deleted. Please try again.",
        action: () => deleteDoc(doc(db, "reasons", id))
    });
};

window.editReasonTemplate = async function(id) {
    if (!canManageReasonTemplates()) {
        showToast("Permission Denied", "Only authorized staff can manage reason templates.", "error");
        return;
    }

    const template = reasonTemplates.find(reason => reason.id === id);
    if (!template) {
        showToast("Template Unavailable", "This reason template could not be found. Refresh the page and try again.", "error", ERROR_CODES.data);
        return;
    }

    const nextText = await showTextPrompt({
        title: "Edit Reason Template",
        message: "Update the reason text used by staff in moderation forms.",
        inputLabel: "Reason text",
        initialValue: template.text || "",
        placeholder: "Enter the reason text",
        required: true,
        validationMessage: "Reason template text cannot be empty.",
        confirmLabel: "Continue"
    });
    if (nextText === null) return;
    const trimmed = nextText.trim();
    if (!trimmed) {
        showToast("Validation Error", "Reason template text cannot be empty.", "error");
        return;
    }

    const nextOrderRaw = await showTextPrompt({
        title: "Edit Display Order",
        message: "Enter a numeric display order for this reason template.",
        inputLabel: "Display order",
        initialValue: String(template.order ?? 0),
        placeholder: "0",
        confirmLabel: "Save Order"
    });
    if (nextOrderRaw === null) return;
    const nextOrder = Number.parseInt(nextOrderRaw, 10);

    try {
        await updateDoc(doc(db, "reasons", id), {
            text: trimmed,
            order: Number.isFinite(nextOrder) ? nextOrder : 0,
            updatedAt: new Date().toISOString(),
            updatedBy: currentStaff || "Staff"
        });
        showToast("Template Updated", "Reason template saved.", "success");
    } catch (error) {
        showToast("Database Error", `Failed to update reason template: ${error.message}`, "error");
    }
};

// ==========================================
// LOA REQUESTS
// ==========================================
const loaForm = document.getElementById("loaForm");
const loaListBody = document.getElementById("loaListBody");

if (loaForm) {
    loaForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        const startDate = document.getElementById("loaStartDate").value;
        const endDate = document.getElementById("loaEndDate").value;
        const reason = document.getElementById("loaReason").value.trim();
        const submitButton = document.getElementById("btnSubmitLoa");

        if (!startDate || !endDate || !reason) {
            showToast("Validation Error", "Start date, end date, and reason are required.", "error");
            return;
        }

        if (new Date(endDate) < new Date(startDate)) {
            showToast("Validation Error", "End date cannot be before the start date.", "error");
            return;
        }

        submitButton.disabled = true;
        submitButton.innerHTML = `<i class="fas fa-spinner fa-spin"></i> <span>Submitting...</span>`;

        try {
            await addDoc(collection(db, "loaRequests"), {
                staffUid: auth.currentUser?.uid || "",
                staffName: currentStaff || "Staff",
                staffEmail: currentStaffEmail || "",
                staffRank,
                startDate,
                endDate,
                reason,
                status: "pending",
                createdAt: new Date().toISOString()
            });
            loaForm.reset();
            showToast("LOA Submitted", "Your LOA request is pending review.", "success");
        } catch (error) {
            showToast("Database Error", `Failed to submit LOA: ${error.message}`, "error");
            reportSystemError({
                title: "LOA Submission Failed",
                detail: `Failed to submit LOA request: ${error.message}`,
                system: "NYSRP LOA System",
                endpoint: "Firestore /loaRequests",
                status: "500"
            });
        } finally {
            submitButton.disabled = false;
            submitButton.innerHTML = `<i class="fas fa-paper-plane"></i> <span>Submit LOA</span>`;
        }
    });
}

function renderLoaRequests() {
    if (!loaListBody) return;

    const canReview = canManageLoa(staffRank);
    const visibleRequests = canReview
        ? loaRequests
        : loaRequests.filter(request => request.staffUid === auth.currentUser?.uid || request.staffEmail === currentStaffEmail);

    if (visibleRequests.length === 0) {
        loaListBody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><p>No LOA requests found.</p></div></td></tr>`;
        return;
    }

    loaListBody.innerHTML = visibleRequests.map(request => {
        const status = String(request.status || "pending").toLowerCase();
        const statusBadge = status === "approved" ? "badge-note" : status === "denied" ? "badge-ban" : "badge-bolo";
        const canAct = canReview && status === "pending";
        const reviewedBy = request.reviewedBy ? `${escapeHTML(request.reviewedBy)}${request.denialReason ? ` (${escapeHTML(request.denialReason)})` : ""}` : "Pending";

        return `
            <tr>
                <td>
                    <div style="font-weight: 600; color: var(--text-primary);">${escapeHTML(request.staffName || request.staffEmail || "Staff")}</div>
                    <div style="font-size: 0.78rem; color: var(--text-muted);">${escapeHTML(formatRankLabel(request.staffRank))}</div>
                </td>
                <td>${escapeHTML(request.startDate)} to ${escapeHTML(request.endDate)}</td>
                <td style="white-space: normal; min-width: 220px;">${escapeHTML(request.reason)}</td>
                <td><span class="type-badge ${statusBadge}">${escapeHTML(status.charAt(0).toUpperCase() + status.slice(1))}</span></td>
                <td>${reviewedBy}</td>
                <td>
                    <div class="table-actions">
                        ${canAct ? `<button class="table-action-btn view-btn" onclick="approveLoaRequest('${request.id}')" title="Approve LOA"><i class="fas fa-check"></i></button>` : ""}
                        ${canAct ? `<button class="table-action-btn delete-btn" onclick="denyLoaRequest('${request.id}')" title="Deny LOA"><i class="fas fa-times"></i></button>` : ""}
                    </div>
                </td>
            </tr>
        `;
    }).join("");
}

window.approveLoaRequest = async function(id) {
    if (!canManageLoa(staffRank)) {
        showToast("Permission Denied", "You do not have permission to approve LOA requests.", "error");
        return;
    }

    try {
        await updateDoc(doc(db, "loaRequests", id), {
            status: "approved",
            reviewedBy: currentStaff || "Staff",
            reviewedAt: new Date().toISOString(),
            reviewerUid: auth.currentUser?.uid || "",
            reviewerRank: staffRank,
            denialReason: ""
        });
        showToast("LOA Approved", "The request was successfully approved.", "success");
    } catch (error) {
        showToast("Database Error", `Failed to approve LOA: ${error.message}`, "error");
        reportSystemError({
            title: "LOA Approval Failed",
            detail: `Failed to approve LOA request (${id}): ${error.message}`,
            system: "NYSRP LOA System",
            endpoint: "Firestore /loaRequests",
            status: "500"
        });
    }
};

window.denyLoaRequest = async function(id) {
    if (!canManageLoa(staffRank)) {
        showToast("Permission Denied", "You do not have permission to deny LOA requests.", "error");
        return;
    }

    const denialReason = await showTextPrompt({
        title: "Deny LOA Request",
        message: "Provide a reason that will be recorded with this decision.",
        inputLabel: "Denial reason",
        placeholder: "Enter the reason",
        required: true,
        validationMessage: "A denial reason is required.",
        confirmLabel: "Deny Request",
        variant: "danger"
    });
    if (denialReason === null) return;
    const trimmedReason = denialReason.trim();
    if (!trimmedReason) {
        showToast("Validation Error", "A denial reason is required.", "error");
        return;
    }

    try {
        await updateDoc(doc(db, "loaRequests", id), {
            status: "denied",
            reviewedBy: currentStaff || "Staff",
            reviewedAt: new Date().toISOString(),
            reviewerUid: auth.currentUser?.uid || "",
            reviewerRank: staffRank,
            denialReason: trimmedReason
        });
        showToast("LOA Denied", "The request was marked as denied.", "info");
    } catch (error) {
        showToast("Database Error", `Failed to deny LOA: ${error.message}`, "error");
        reportSystemError({
            title: "LOA Denial Failed",
            detail: `Failed to deny LOA request (${id}): ${error.message}`,
            system: "NYSRP LOA System",
            endpoint: "Firestore /loaRequests",
            status: "500"
        });
    }
};

// ==========================================
// NYSRP STAFF SHIFT SYSTEM
// ==========================================

function formatDurationClock(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds || 0));
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function formatDurationHuman(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds || 0));
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;

    if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
}

function calculateShiftMetrics(shift, nowMs = Date.now()) {
    if (!shift) {
        return { workingSeconds: 0, breakSeconds: 0, totalSeconds: 0 };
    }

    const timeValue = shift.startTime || shift.createdAt;
    if (!timeValue) {
        return { workingSeconds: 0, breakSeconds: 0, totalSeconds: 0 };
    }

    const startMs = timestampToMillis(timeValue);
    if (startMs === null) {
        return { workingSeconds: 0, breakSeconds: 0, totalSeconds: 0 };
    }

    const endMs = timestampToMillis(shift.endTime) ?? nowMs;
    const totalMs = Math.max(0, endMs - startMs);

    let breakMs = 0;
    if (Array.isArray(shift.breaks)) {
        for (const b of shift.breaks) {
            if (typeof b.durationSeconds === 'number' && b.durationSeconds > 0) {
                breakMs += b.durationSeconds * 1000;
            } else if (b.start && b.end) {
                const breakStartMs = timestampToMillis(b.start);
                const breakEndMs = timestampToMillis(b.end);
                if (breakStartMs !== null && breakEndMs !== null) {
                    breakMs += Math.max(0, breakEndMs - breakStartMs);
                }
            } else if (b.start && !b.end) {
                const breakStartMs = timestampToMillis(b.start);
                if (breakStartMs !== null) {
                    breakMs += Math.max(0, nowMs - breakStartMs);
                }
            }
        }
    }

    if (!Array.isArray(shift.breaks) && typeof shift.breakDurationSeconds === 'number') {
        breakMs = Math.max(0, shift.breakDurationSeconds * 1000);
    }

    const workingMs = Math.max(0, totalMs - breakMs);

    return {
        workingSeconds: Math.floor(workingMs / 1000),
        breakSeconds: Math.floor(breakMs / 1000),
        totalSeconds: Math.floor(totalMs / 1000)
    };
}

function updateShiftClockUI() {
    const shiftStatusBadge = document.getElementById("shiftStatusBadge");
    const shiftStatusText = document.getElementById("shiftStatusText");
    const shiftStaffSummary = document.getElementById("shiftStaffSummary");
    const shiftLiveTimer = document.getElementById("shiftLiveTimer");
    const shiftTimerSub = document.getElementById("shiftTimerSub");

    const btnStartShift = document.getElementById("btnStartShift");
    const btnStartBreak = document.getElementById("btnStartBreak");
    const btnEndBreak = document.getElementById("btnEndBreak");
    const btnEndShift = document.getElementById("btnEndShift");

    if (!shiftStatusBadge || !shiftStatusText || !shiftLiveTimer) return;

    if (!auth.currentUser) {
        shiftStatusBadge.className = "shift-status-pill status-off";
        shiftStatusText.textContent = "Off Shift";
        if (shiftStaffSummary) shiftStaffSummary.textContent = "Not Clocked In";
        shiftLiveTimer.textContent = "00:00:00";
        if (shiftTimerSub) shiftTimerSub.textContent = "Clock in to begin tracking your active patrol/moderation shift.";

        btnStartShift?.classList.remove("hidden");
        btnStartBreak?.classList.add("hidden");
        btnEndBreak?.classList.add("hidden");
        btnEndShift?.classList.add("hidden");
        return;
    }

    if (!activeUserShift) {
        // OFF SHIFT
        shiftStatusBadge.className = "shift-status-pill status-off";
        shiftStatusText.textContent = "Off Shift";
        if (shiftStaffSummary) shiftStaffSummary.textContent = `${currentStaff || "Staff"} (${formatRankLabel(staffRank)}) • Ready to patrol`;
        shiftLiveTimer.textContent = "00:00:00";
        if (shiftTimerSub) shiftTimerSub.textContent = "Clock in to begin tracking your active patrol/moderation shift.";

        btnStartShift?.classList.remove("hidden");
        btnStartBreak?.classList.add("hidden");
        btnEndBreak?.classList.add("hidden");
        btnEndShift?.classList.add("hidden");
    } else if (activeUserShift.status === "active") {
        // ON SHIFT (ACTIVE)
        const metrics = calculateShiftMetrics(activeUserShift);
        shiftStatusBadge.className = "shift-status-pill status-active";
        shiftStatusText.textContent = "On Duty";
        if (shiftStaffSummary) shiftStaffSummary.textContent = `${currentStaff || "Staff"} (${formatRankLabel(staffRank)}) • Patrol Active`;
        shiftLiveTimer.textContent = formatDurationClock(metrics.workingSeconds);
        if (shiftTimerSub) shiftTimerSub.textContent = `Shift active since ${formatDate(activeUserShift.startTime || activeUserShift.createdAt)}. Total breaks: ${formatDurationHuman(metrics.breakSeconds)}.`;

        btnStartShift?.classList.add("hidden");
        btnStartBreak?.classList.remove("hidden");
        btnEndBreak?.classList.add("hidden");
        btnEndShift?.classList.remove("hidden");
    } else if (activeUserShift.status === "break") {
        // ON BREAK
        const metrics = calculateShiftMetrics(activeUserShift);
        const lastBreak = activeUserShift.breaks && activeUserShift.breaks[activeUserShift.breaks.length - 1];
        const lastBreakStartMs = timestampToMillis(lastBreak?.start);
        const currentBreakSeconds = lastBreakStartMs !== null ? Math.max(0, Math.floor((Date.now() - lastBreakStartMs) / 1000)) : 0;

        shiftStatusBadge.className = "shift-status-pill status-break";
        shiftStatusText.textContent = "On Break";
        if (shiftStaffSummary) shiftStaffSummary.textContent = `${currentStaff || "Staff"} (${formatRankLabel(staffRank)}) • Taking Break`;
        shiftLiveTimer.textContent = formatDurationClock(currentBreakSeconds);
        if (shiftTimerSub) shiftTimerSub.textContent = `Shift paused. Working time logged: ${formatDurationHuman(metrics.workingSeconds)}.`;

        btnStartShift?.classList.add("hidden");
        btnStartBreak?.classList.add("hidden");
        btnEndBreak?.classList.remove("hidden");
        btnEndShift?.classList.remove("hidden");
    }
}

// Start live interval for timer updates
if (shiftLiveTimerInterval) clearInterval(shiftLiveTimerInterval);
shiftLiveTimerInterval = setInterval(updateShiftClockUI, 1000);

async function dispatchDiscordShiftWebhook(action, shiftData, stats = {}) {
    const staffLabel = shiftData.staffName || currentStaff || "Staff";
    const rankLabel = formatRankLabel(shiftData.staffRank || staffRank);
    const shiftId = shiftData.id || "N/A";

    const payload = {
        action,
        staffName: staffLabel,
        staffRank: rankLabel,
        shiftId: String(shiftId),
        startTime: shiftData.startTime ? formatDate(shiftData.startTime) : "",
        endTime: shiftData.endTime ? formatDate(shiftData.endTime) : "",
        timeFormatted: formatDate(new Date().toISOString()),
        durationFormatted: stats.workingDurationFormatted || "",
        workingDurationFormatted: stats.workingDurationFormatted || "",
        breakFormatted: stats.breakDurationFormatted || "",
        totalDurationFormatted: stats.totalDurationFormatted || ""
    };

    try {
        const response = await fetch("/api/discord/shift-webhook", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            console.warn("[Discord shift webhook] Dispatch failed with HTTP", response.status);
        }
    } catch (err) {
        console.warn("[Discord Webhook non-fatal dispatch error]", err);
    }
}

async function dispatchDiscordModerationAudit(log) {
    try {
        const response = await fetch("/api/discord/audit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(log)
        });
        if (!response.ok) {
            console.warn("[Discord moderation audit] Dispatch failed with HTTP", response.status);
        }
    } catch (error) {
        console.warn("[Discord moderation audit] Dispatch failed", error);
    }
}

async function handleStartShift() {
    if (!auth.currentUser) {
        showToast("Authentication Error", "You must be logged in to clock in for a shift.", "error");
        return;
    }

    if (activeUserShift) {
        showToast("Active Shift Found", "You already have an active shift session in progress.", "warning");
        return;
    }

    const btnStartShift = document.getElementById("btnStartShift");
    if (btnStartShift) {
        btnStartShift.disabled = true;
        btnStartShift.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Starting...`;
    }

    const startTime = new Date().toISOString();
    const newShiftData = {
        staffUid: auth.currentUser.uid,
        staffName: currentStaff || "Staff",
        staffEmail: currentStaffEmail || "",
        staffRank: normalizeRank(staffRank),
        status: "active",
        startTime,
        endTime: null,
        durationSeconds: 0,
        breakDurationSeconds: 0,
        breaks: [],
        createdAt: startTime,
        updatedAt: startTime
    };

    try {
        const staffShiftQuery = query(
            collection(db, "shifts"),
            where("staffUid", "==", auth.currentUser.uid)
        );
        const staffShiftSnapshot = await getDocs(staffShiftQuery);
        const existingActiveShift = staffShiftSnapshot.docs.find((shiftDoc) => {
            const status = shiftDoc.data().status;
            return status === "active" || status === "break";
        });
        if (existingActiveShift) {
            activeUserShift = { id: existingActiveShift.id, ...existingActiveShift.data() };
            showToast("Active Shift Found", "You already have an active shift session in progress.", "warning");
            updateShiftClockUI();
            return;
        }

        const docRef = await addDoc(collection(db, "shifts"), newShiftData);
        newShiftData.id = docRef.id;
        activeUserShift = newShiftData;

        // Dispatch Discord notification (server-side webhook only; no /logs write)
        dispatchDiscordShiftWebhook("shift_started", newShiftData);

        showToast("Shift Started", "You are now on duty. Shift timer is running.", "success");
        updateShiftClockUI();
        renderShifts();
    } catch (error) {
        showToast("Database Error", `Failed to start shift: ${error.message}`, "error");
        reportSystemError({
            title: "Shift Start Failed",
            detail: `Failed to start shift: ${error.message}`,
            system: "NYSRP Shift System",
            endpoint: "Firestore /shifts",
            status: "500"
        });
    } finally {
        if (btnStartShift) {
            btnStartShift.disabled = false;
            btnStartShift.innerHTML = `<i class="fas fa-play"></i> <span>Start Shift</span>`;
        }
    }
}

async function handleStartBreak() {
    if (!auth.currentUser || !activeUserShift) {
        showToast("Error", "No active shift found to pause.", "error");
        return;
    }

    if (activeUserShift.staffUid !== auth.currentUser.uid) {
        showToast("Permission Denied", "You can only manage your own shift.", "error");
        return;
    }

    if (activeUserShift.status !== "active") {
        showToast("Invalid Shift State", "A break can only be started while you are on shift.", "warning");
        return;
    }

    const btnStartBreak = document.getElementById("btnStartBreak");
    if (btnStartBreak) {
        btnStartBreak.disabled = true;
        btnStartBreak.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Pausing...`;
    }

    const breakStart = new Date().toISOString();
    const currentBreaks = Array.isArray(activeUserShift.breaks) ? [...activeUserShift.breaks] : [];
    currentBreaks.push({
        start: breakStart,
        end: null,
        durationSeconds: 0
    });

    try {
        await updateDoc(doc(db, "shifts", activeUserShift.id), {
            status: "break",
            breaks: currentBreaks,
            updatedAt: breakStart
        });

        activeUserShift.status = "break";
        activeUserShift.breaks = currentBreaks;

        // Dispatch Discord notification (server-side webhook only; no /logs write)
        dispatchDiscordShiftWebhook("break_started", activeUserShift);

        showToast("Break Started", "Your shift is on break. Clock is paused.", "info");
        updateShiftClockUI();
        renderShifts();
    } catch (error) {
        showToast("Database Error", `Failed to start break: ${error.message}`, "error");
        reportSystemError({
            title: "Shift Break Start Failed",
            detail: `Failed to pause shift: ${error.message}`,
            system: "NYSRP Shift System",
            endpoint: "Firestore /shifts",
            status: "500"
        });
    } finally {
        if (btnStartBreak) {
            btnStartBreak.disabled = false;
            btnStartBreak.innerHTML = `<i class="fas fa-coffee"></i> <span>Start Break</span>`;
        }
    }
}

async function handleEndBreak() {
    if (!auth.currentUser || !activeUserShift) {
        showToast("Error", "No active shift found.", "error");
        return;
    }

    if (activeUserShift.status !== "break") {
        showToast("Warning", "You are not currently on break.", "warning");
        return;
    }

    if (activeUserShift.staffUid !== auth.currentUser.uid) {
        showToast("Permission Denied", "You can only manage your own shift.", "error");
        return;
    }

    const btnEndBreak = document.getElementById("btnEndBreak");
    if (btnEndBreak) {
        btnEndBreak.disabled = true;
        btnEndBreak.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Resuming...`;
    }

    const breakEnd = new Date().toISOString();
    const currentBreaks = Array.isArray(activeUserShift.breaks) ? [...activeUserShift.breaks] : [];
    let lastBreakDuration = 0;

    if (currentBreaks.length > 0) {
        const lastIdx = currentBreaks.length - 1;
        const last = { ...currentBreaks[lastIdx] };
        if (!last.end) {
            last.end = breakEnd;
            const lastStartMs = timestampToMillis(last.start);
            const breakEndMs = timestampToMillis(breakEnd);
            last.durationSeconds = lastStartMs !== null && breakEndMs !== null ? Math.max(0, Math.floor((breakEndMs - lastStartMs) / 1000)) : 0;
            lastBreakDuration = last.durationSeconds;
            currentBreaks[lastIdx] = last;
        }
    }

    const totalBreakSeconds = currentBreaks.reduce((acc, b) => acc + (b.durationSeconds || 0), 0);

    try {
        await updateDoc(doc(db, "shifts", activeUserShift.id), {
            status: "active",
            breaks: currentBreaks,
            breakDurationSeconds: totalBreakSeconds,
            updatedAt: breakEnd
        });

        activeUserShift.status = "active";
        activeUserShift.breaks = currentBreaks;
        activeUserShift.breakDurationSeconds = totalBreakSeconds;

        // Dispatch Discord notification (server-side webhook only; no /logs write)
        dispatchDiscordShiftWebhook("break_ended", activeUserShift, {
            breakDurationFormatted: formatDurationHuman(lastBreakDuration)
        });

        showToast("Returned From Break", "Welcome back! Your shift clock has resumed.", "success");
        updateShiftClockUI();
        renderShifts();
    } catch (error) {
        showToast("Database Error", `Failed to return from break: ${error.message}`, "error");
        reportSystemError({
            title: "Shift Break End Failed",
            detail: `Failed to resume shift from break: ${error.message}`,
            system: "NYSRP Shift System",
            endpoint: "Firestore /shifts",
            status: "500"
        });
    } finally {
        if (btnEndBreak) {
            btnEndBreak.disabled = false;
            btnEndBreak.innerHTML = `<i class="fas fa-play"></i> <span>Return From Break</span>`;
        }
    }
}

async function handleEndShift() {
    if (!auth.currentUser || !activeUserShift) {
        showToast("Error", "No active shift found to end.", "error");
        return;
    }

    if (activeUserShift.staffUid !== auth.currentUser.uid) {
        showToast("Permission Denied", "You can only manage your own shift.", "error");
        return;
    }

    if (!(await showConfirmation({
        title: "End Active Shift",
        message: "Are you sure you want to end your active shift session?",
        variant: "danger",
        confirmLabel: "End Shift"
    }))) {
        return;
    }

    const btnEndShift = document.getElementById("btnEndShift");
    if (btnEndShift) {
        btnEndShift.disabled = true;
        btnEndShift.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Clocking Out...`;
    }

    const endTime = new Date().toISOString();
    const currentBreaks = Array.isArray(activeUserShift.breaks) ? [...activeUserShift.breaks] : [];

    // If still on break, close out the open break period
    if (activeUserShift.status === "break" && currentBreaks.length > 0) {
        const lastIdx = currentBreaks.length - 1;
        const last = { ...currentBreaks[lastIdx] };
        if (!last.end) {
            last.end = endTime;
            const lastStartMs = timestampToMillis(last.start);
            const endMs = timestampToMillis(endTime);
            last.durationSeconds = lastStartMs !== null && endMs !== null ? Math.max(0, Math.floor((endMs - lastStartMs) / 1000)) : 0;
            currentBreaks[lastIdx] = last;
        }
    }

    const tempShift = {
        ...activeUserShift,
        endTime,
        breaks: currentBreaks
    };

    const metrics = calculateShiftMetrics(tempShift, new Date(endTime).getTime());

    try {
        await updateDoc(doc(db, "shifts", activeUserShift.id), {
            status: "completed",
            endTime,
            breaks: currentBreaks,
            breakDurationSeconds: metrics.breakSeconds,
            durationSeconds: metrics.workingSeconds,
            totalDurationSeconds: metrics.totalSeconds,
            updatedAt: endTime
        });

        const completedShift = {
            ...activeUserShift,
            status: "completed",
            endTime,
            breaks: currentBreaks,
            breakDurationSeconds: metrics.breakSeconds,
            durationSeconds: metrics.workingSeconds,
            totalDurationSeconds: metrics.totalSeconds
        };

        activeUserShift = null;

        // Dispatch Discord notification (server-side webhook only; no /logs write)
        dispatchDiscordShiftWebhook("shift_ended", completedShift, {
            workingDurationFormatted: formatDurationHuman(metrics.workingSeconds),
            breakDurationFormatted: formatDurationHuman(metrics.breakSeconds),
            totalDurationFormatted: formatDurationHuman(metrics.totalSeconds)
        });

        showToast("Shift Completed", `Shift ended. Total working time logged: ${formatDurationHuman(metrics.workingSeconds)}.`, "success");
        updateShiftClockUI();
        renderShifts();
    } catch (error) {
        showToast("Database Error", `Failed to end shift: ${error.message}`, "error");
        reportSystemError({
            title: "Shift End Failed",
            detail: `Failed to complete shift: ${error.message}`,
            system: "NYSRP Shift System",
            endpoint: "Firestore /shifts",
            status: "500"
        });
    } finally {
        if (btnEndShift) {
            btnEndShift.disabled = false;
            btnEndShift.innerHTML = `<i class="fas fa-stop"></i> <span>End Shift</span>`;
        }
    }
}

// Wire up shift button listeners
document.getElementById("btnStartShift")?.addEventListener("click", handleStartShift);
document.getElementById("btnStartBreak")?.addEventListener("click", handleStartBreak);
document.getElementById("btnEndBreak")?.addEventListener("click", handleEndBreak);
document.getElementById("btnEndShift")?.addEventListener("click", handleEndShift);

// Shift Filters and Search
document.querySelectorAll("[data-shift-filter]").forEach(btn => {
    btn.addEventListener("click", (e) => {
        document.querySelectorAll("[data-shift-filter]").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        currentShiftFilter = btn.getAttribute("data-shift-filter") || "all";
        renderShifts();
    });
});

const shiftSearchInput = document.getElementById("shiftSearchInput");
if (shiftSearchInput) {
    shiftSearchInput.addEventListener("input", (e) => {
        shiftSearchQuery = e.target.value.trim().toLowerCase();
        renderShifts();
    });
}

function renderShifts() {
    // 1. Update summary statistics
    const statActiveShifts = document.getElementById("statActiveShifts");
    const statOnBreak = document.getElementById("statOnBreak");
    const statMyShifts = document.getElementById("statMyShifts");
    const statMyHours = document.getElementById("statMyHours");

    const myUid = auth.currentUser?.uid;
    const activeCount = shifts.filter(s => s.status === "active").length;
    const breakCount = shifts.filter(s => s.status === "break").length;
    const myShiftsList = shifts.filter(s => s.staffUid === myUid);
    const myTotalWorkingSeconds = myShiftsList.reduce((acc, s) => {
        const metrics = calculateShiftMetrics(s);
        return acc + metrics.workingSeconds;
    }, 0);

    if (statActiveShifts) statActiveShifts.textContent = String(activeCount);
    if (statOnBreak) statOnBreak.textContent = String(breakCount);
    if (statMyShifts) statMyShifts.textContent = String(myShiftsList.length);
    if (statMyHours) {
        const hrs = Math.floor(myTotalWorkingSeconds / 3600);
        const mins = Math.floor((myTotalWorkingSeconds % 3600) / 60);
        statMyHours.textContent = `${hrs}h ${mins}m`;
    }

    // 2. Render Active Staff on Duty Table
    const activeStaffBody = document.getElementById("activeStaffBody");
    if (activeStaffBody) {
        const activeList = shifts.filter(s => s.status === "active" || s.status === "break");
        if (activeList.length === 0) {
            activeStaffBody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><i class="fas fa-user-clock"></i><p>No staff members currently on duty.</p></div></td></tr>`;
        } else {
            activeStaffBody.innerHTML = activeList.map(s => {
                const metrics = calculateShiftMetrics(s);
                const statusBadge = s.status === "active" ? "badge-active" : "badge-break";
                const statusText = s.status === "active" ? "On Duty" : "On Break";
                const breaksTaken = Array.isArray(s.breaks) ? s.breaks.length : 0;
                const avatarInitial = (s.staffName || "S").charAt(0).toUpperCase();

                return `
                    <tr>
                        <td>
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <span class="staff-avatar-sm">${escapeHTML(avatarInitial)}</span>
                                <span style="font-weight: 600; color: var(--text-primary);">${escapeHTML(s.staffName || "Staff")}</span>
                            </div>
                        </td>
                        <td><span style="font-size: 0.82rem; color: var(--text-secondary);">${escapeHTML(formatRankLabel(s.staffRank))}</span></td>
                        <td><span class="type-badge ${statusBadge}">${escapeHTML(statusText)}</span></td>
                        <td>${escapeHTML(formatDate(s.startTime))}</td>
                        <td style="font-weight: 600; font-family: monospace;">${escapeHTML(formatDurationHuman(metrics.workingSeconds))}</td>
                        <td>${breaksTaken} break${breaksTaken === 1 ? "" : "s"} (${escapeHTML(formatDurationHuman(metrics.breakSeconds))})</td>
                    </tr>
                `;
            }).join("");
        }
    }

    // 3. Render Shift History Table
    const shiftHistoryBody = document.getElementById("shiftHistoryBody");
    if (shiftHistoryBody) {
        const canViewAll = canViewAllShifts(staffRank);
        let list = shifts;

        // Base view permissions
        if (!canViewAll) {
            list = list.filter(s => s.staffUid === myUid);
        }

        // Category Filter
        if (currentShiftFilter === "mine") {
            list = list.filter(s => s.staffUid === myUid);
        } else if (currentShiftFilter === "active") {
            list = list.filter(s => s.status === "active" || s.status === "break");
        } else if (currentShiftFilter === "completed") {
            list = list.filter(s => s.status === "completed");
        }

        // Search Filter
        if (shiftSearchQuery) {
            list = list.filter(s =>
                String(s.staffName || "").toLowerCase().includes(shiftSearchQuery) ||
                String(s.staffRank || "").toLowerCase().includes(shiftSearchQuery)
            );
        }

        if (list.length === 0) {
            shiftHistoryBody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><p>No shift records found.</p></div></td></tr>`;
        } else {
            shiftHistoryBody.innerHTML = list.map(s => {
                const metrics = calculateShiftMetrics(s);
                const statusBadge = s.status === "active" ? "badge-active" : s.status === "break" ? "badge-break" : "badge-completed";
                const statusText = s.status === "active" ? "On Duty" : s.status === "break" ? "On Break" : "Completed";
                const avatarInitial = (s.staffName || "S").charAt(0).toUpperCase();

                return `
                    <tr>
                        <td>
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <span class="staff-avatar-sm">${escapeHTML(avatarInitial)}</span>
                                <span style="font-weight: 600; color: var(--text-primary);">${escapeHTML(s.staffName || "Staff")}</span>
                            </div>
                        </td>
                        <td><span style="font-size: 0.82rem; color: var(--text-secondary);">${escapeHTML(formatRankLabel(s.staffRank))}</span></td>
                        <td><span class="type-badge ${statusBadge}">${escapeHTML(statusText)}</span></td>
                        <td>${escapeHTML(formatDate(s.startTime))}</td>
                        <td>${s.endTime ? escapeHTML(formatDate(s.endTime)) : `<span style="color: var(--note-color); font-weight: 500;">In Progress</span>`}</td>
                        <td style="font-weight: 600; color: var(--text-primary); font-family: monospace;">${escapeHTML(formatDurationHuman(metrics.workingSeconds))}</td>
                        <td style="color: var(--text-muted); font-family: monospace;">${escapeHTML(formatDurationHuman(metrics.breakSeconds))}</td>
                        <td>${escapeHTML(formatDate(s.startTime || s.createdAt))}</td>
                    </tr>
                `;
            }).join("");
        }
    }
}

// ==========================================
// STAFF TRAINING TUTORIAL SYSTEM
// ==========================================

const TRAINING_STEPS = [
    {
        step: 1,
        title: "Welcome to Staff Training",
        body: `
Welcome to the NYSRP Staff Training Program! This tutorial will guide you through all the essential features and responsibilities of being a staff member.

As a new staff member, your primary responsibility is to maintain order, enforce the rules, and provide a positive experience for all players in the game.

Let's begin by exploring the Staff Dashboard and learning about your tools and responsibilities.
        `.trim()
    },
    {
        step: 2,
        title: "Staff Dashboard Overview",
        body: `
The Staff Dashboard is your command center. Here you can:

• **Overview**: View recent actions and system status
• **Action Logs**: Record warnings, kicks, bans, and BOLOs
• **Search Logs**: Find previous actions taken
• **Staff Toolbox**: Access message presets and templates
• **Manage Shifts**: Track your on-duty hours and breaks
• **LOA Requests**: Submit and manage leave of absence requests

Each tool serves an important function in staff operations. Take time to familiarize yourself with each section.
        `.trim()
    },
    {
        step: 3,
        title: "Moderation Actions",
        body: `
As staff, you have access to moderation tools:

• **Warnings**: Inform players of rule violations (no duration needed)
• **Kicks**: Remove a player from the game (immediate, no duration)
• **Bans**: Prevent player access for a specified duration
• **BOLO**: Issue a "Be On The Lookout" alert for problematic players
• **Notes**: Record information about players for future reference

Always use these tools responsibly and only when necessary. Document your actions with clear reasons and evidence.
        `.trim()
    },
    {
        step: 4,
        title: "Reason Templates & Multi-Reason System",
        body: `
The dashboard provides pre-defined reason templates to streamline moderation actions.

When logging an action, you can:
• Select one or multiple reason templates
• Add additional context or custom reasoning
• Include evidence links (YouTube, Streamable, etc.)

Using consistent reason templates helps maintain clear records and ensures fair enforcement of rules.
        `.trim()
    },
    {
        step: 5,
        title: "BOLO System & Shift Management",
        body: `
**BOLO (Be On The Lookout)**:
BOLOs alert staff to watch for specific problematic players. BOLOs require proper documentation and may require supervisor review depending on your rank.

**Shift Management**:
Track your active shifts with the built-in timer. You can:
• Start your shift to begin duty
• Take breaks during your shift
• End your shift when going off-duty
• View shift history and total working hours

Time tracking ensures accountability and helps management plan staffing.
        `.trim()
    },
    {
        step: 6,
        title: "Staff Conduct & Training Complete",
        body: `
**Remember:**
• Treat all players with respect
• Enforce rules consistently and fairly
• Document all actions with clear reasons
• Don't abuse your powers or permissions
• Escalate serious issues to higher-ranked staff
• Ask for guidance when uncertain

You have completed the Staff Training Tutorial! You're now ready to patrol and moderate the server. If you have questions, reach out to your supervisors or higher-ranked staff.

Good luck out there, and welcome to the team!
        `.trim()
    }
];

function renderTraining() {
    if (!currentUserDoc || !isTrainingEligibleRank(currentUserDoc.rank || staffRank)) {
        showToast("Not Eligible", "You must be a Junior Moderator or Junior Administrator to access training.", "warning");
        return;
    }

    if (!currentUserDoc.training) {
        const rank = normalizeRank(currentUserDoc.rank || staffRank);
        currentUserDoc.training = {
            tutorialCompleted: false,
            status: "not_started",
            currentStep: 1,
            juniorAdministratorTraining: rank === "Junior Administrator" ? "required" : "not_required",
            supervisedBoloTraining: rank === "Junior Administrator" ? "required" : "not_required",
            supervisingUid: "",
            supervisingName: ""
        };
    }

    const training = currentUserDoc.training;
    const trainingStepCounter = document.getElementById("trainingStepCounter");
    const trainingStatusLabel = document.getElementById("trainingStatusLabel");
    const trainingStepTitle = document.getElementById("trainingStepTitle");
    const trainingStepBody = document.getElementById("trainingStepBody");
    const btnTrainingPrevious = document.getElementById("btnTrainingPrevious");
    const btnTrainingNext = document.getElementById("btnTrainingNext");

    if (!trainingStepCounter || !trainingStatusLabel || !trainingStepTitle || !trainingStepBody) {
        return;
    }

    // Determine current step from training status
    let currentStep = training.currentStep || 1;
    if (training.status === "not_started") {
        currentStep = 1;
    } else if (training.status === "completed") {
        currentStep = TRAINING_STEPS.length;
    }

    const step = TRAINING_STEPS[currentStep - 1] || TRAINING_STEPS[0];

    trainingStepCounter.textContent = `${currentStep}/${TRAINING_STEPS.length}`;
    trainingStatusLabel.textContent = training.tutorialCompleted ? "Completed" : (training.status === "not_started" ? "Not Started" : "In Progress");
    trainingStepTitle.textContent = step.title;
    trainingStepBody.textContent = step.body;

    // Update button states and labels
    if (currentStep === 1 && training.status === "not_started") {
        btnTrainingPrevious.disabled = true;
        btnTrainingNext.innerHTML = `<span>Start Tutorial</span><i class="fas fa-arrow-right"></i>`;
    } else if (currentStep === TRAINING_STEPS.length) {
        btnTrainingPrevious.disabled = false;
        if (training.tutorialCompleted) {
            btnTrainingNext.innerHTML = `<i class="fas fa-check"></i> <span>Tutorial Completed</span>`;
            btnTrainingNext.disabled = true;
        } else {
            btnTrainingNext.innerHTML = `<span>Complete Tutorial</span><i class="fas fa-check"></i>`;
            btnTrainingNext.disabled = false;
        }
    } else {
        btnTrainingPrevious.disabled = currentStep === 1;
        btnTrainingNext.innerHTML = `<span>Next Step</span><i class="fas fa-arrow-right"></i>`;
        btnTrainingNext.disabled = false;
    }
}

async function handleTrainingNext() {
    if (!auth.currentUser || !currentUserDoc || !currentUserDoc.training) {
        showToast("Error", "Training data not found.", "error");
        return;
    }

    const training = currentUserDoc.training;
    let currentStep = training.currentStep || 1;

    if (training.status === "completed") {
        showToast("Complete", "You have already completed the training tutorial.", "info");
        return;
    }

    // If not started, mark as in progress
    if (training.status === "not_started") {
        currentStep = 1;
    } else {
        currentStep = Math.min(currentStep + 1, TRAINING_STEPS.length);
    }

    // If reached the end, mark as completed
    const isComplete = currentStep === TRAINING_STEPS.length;

    try {
        const updatedTraining = {
            ...training,
            status: isComplete ? "completed" : "in_progress",
            currentStep,
            tutorialCompleted: isComplete,
            completedAt: isComplete ? new Date().toISOString() : training.completedAt || null
        };

        await updateDoc(doc(db, "users", auth.currentUser.uid), {
            training: updatedTraining
        });

        currentUserDoc.training = updatedTraining;
        renderTraining();

        if (isComplete) {
            showToast("Tutorial Complete!", "Congratulations! You have completed the staff training.", "success");
        }
    } catch (error) {
        showToast("Database Error", `Failed to update training progress: ${error.message}`, "error");
    }
}

async function handleTrainingPrevious() {
    if (!auth.currentUser || !currentUserDoc || !currentUserDoc.training) {
        showToast("Error", "Training data not found.", "error");
        return;
    }

    const training = currentUserDoc.training;
    let currentStep = Math.max(1, (training.currentStep || 1) - 1);

    try {
        const updatedTraining = {
            ...training,
            status: currentStep === 1 ? "not_started" : "in_progress",
            currentStep
        };

        await updateDoc(doc(db, "users", auth.currentUser.uid), {
            training: updatedTraining
        });

        currentUserDoc.training = updatedTraining;
        renderTraining();
    } catch (error) {
        showToast("Database Error", `Failed to update training progress: ${error.message}`, "error");
    }
}

// Wire up training button listeners
document.getElementById("btnTrainingNext")?.addEventListener("click", handleTrainingNext);
document.getElementById("btnTrainingPrevious")?.addEventListener("click", handleTrainingPrevious);

// ==========================================
// NYSRP ER:LC MANAGEMENT SYSTEM
// ==========================================

async function fetchErlcServerStatus() {
    try {
        const res = await fetch("/api/erlc/server");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        erlcServerInfo = data;
        updateRcServerStatusUI();
    } catch (err) {
        console.warn("[ER:LC Server Fetch]", err);
    }
}

async function fetchErlcPlayers() {
    try {
        const res = await fetch("/api/erlc/players");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        erlcPlayers = Array.isArray(data.players) ? data.players : [];
        if (remoteControlPage?.classList.contains("active")) renderRcPlayersTable();
        if (erlcPlayersPage?.classList.contains("active")) renderErlcPlayersPage();
    } catch (err) {
        console.warn("[ER:LC Players Fetch]", err);
    }
}

async function fetchErlcKills() {
    try {
        const res = await fetch("/api/erlc/kills");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const apiKills = Array.isArray(data.kills) ? data.kills : [];
        await syncErlcKills(apiKills);
    } catch (err) {
        console.warn("[ER:LC Kills Fetch]", err);
    }
}

async function fetchErlcJoinLogs() {
    try {
        const res = await fetch("/api/erlc/joinlogs");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const apiJoins = Array.isArray(data.joinLogs) ? data.joinLogs : [];
        await syncErlcJoins(apiJoins);
    } catch (err) {
        console.warn("[ER:LC JoinLogs Fetch]", err);
    }
}

const processedOffDutyEventKeys = new Set();

async function processInGameOffDutyCommands(commandLogs) {
    if (!auth.currentUser || !Array.isArray(commandLogs) || commandLogs.length === 0) return;

    try {
        // Fetch known staff members from users collection
        const usersSnap = await getDocs(collection(db, "users"));
        const allStaff = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        if (allStaff.length === 0) return;

        for (const log of commandLogs.slice(0, 30)) {
            const playerStr = log.Player || log.player || log.staffUsername || "";
            const rawCommand = String(log.Command || log.command || "").trim();
            if (!rawCommand) continue;

            // Parse Roblox Player info
            let playerName = playerStr;
            let playerId = null;
            if (playerStr.includes(":")) {
                const parts = playerStr.split(":");
                playerName = parts[0] || "";
                playerId = parts[1] || null;
            }

            // Match against known staff members
            const matchedStaff = allStaff.find(u => {
                if (playerId && (String(u.robloxUid || u.robloxId) === String(playerId))) return true;
                if (playerName && u.robloxUsername && u.robloxUsername.toLowerCase() === playerName.toLowerCase()) return true;
                if (playerName && u.username && u.username.toLowerCase() === playerName.toLowerCase()) return true;
                return false;
            });

            // CRITICAL: If not staff, ignore (regular players executing commands)
            if (!matchedStaff) continue;

            // Verify duty status from shifts collection
            const staffShifts = shifts.filter(s => 
                (s.staffUid === matchedStaff.id || 
                 (matchedStaff.robloxUsername && s.staffName?.toLowerCase() === matchedStaff.robloxUsername.toLowerCase()) || 
                 (matchedStaff.username && s.staffName?.toLowerCase() === matchedStaff.username.toLowerCase())) &&
                (s.status === "active")
            );
            const isOnDuty = staffShifts.length > 0;

            // Only flag and alert if definitively OFF DUTY
            if (!isOnDuty) {
                const cmdTimestamp = log.Timestamp || log.timestamp || Math.floor(Date.now() / 1000);
                const safeCmdSlug = rawCommand.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30);
                const eventId = `offduty_ingame_${matchedStaff.id || playerId || playerName}_${cmdTimestamp}_${safeCmdSlug}`;

                if (processedOffDutyEventKeys.has(eventId)) continue;
                processedOffDutyEventKeys.add(eventId);

                const offDutyRef = doc(db, "erlc_off_duty_commands", eventId);
                const docSnap = await getDoc(offDutyRef);

                if (!docSnap.exists()) {
                    // Write to erlc_off_duty_commands
                    await setDoc(offDutyRef, {
                        id: eventId,
                        staffUid: matchedStaff.id || null,
                        staffUsername: matchedStaff.robloxUsername || matchedStaff.username || playerName,
                        staffRank: matchedStaff.rank || "Staff",
                        robloxUsername: playerName,
                        robloxId: playerId,
                        command: rawCommand,
                        source: "ER:LC In-Game",
                        timestamp: typeof cmdTimestamp === 'number' && cmdTimestamp < 1e11 ? cmdTimestamp * 1000 : cmdTimestamp,
                        createdAt: new Date().toISOString()
                    });

                    // Write to erlc_commands
                    await addDoc(collection(db, "erlc_commands"), {
                        staffUid: matchedStaff.id || null,
                        staffUsername: matchedStaff.robloxUsername || matchedStaff.username || playerName,
                        staffRank: matchedStaff.rank || "Staff",
                        command: rawCommand,
                        arguments: rawCommand.split(/\s+/).slice(1).join(" "),
                        timestamp: typeof cmdTimestamp === 'number' && cmdTimestamp < 1e11 ? cmdTimestamp * 1000 : cmdTimestamp,
                        source: "ERLC_IN_GAME",
                        onDuty: false,
                        offDutyFlag: true,
                        success: true,
                        result: "In-Game Command Recorded",
                        error: null,
                        createdAt: new Date().toISOString()
                    });

                    // Dispatch server webhook alert
                    try {
                        await fetch("/api/erlc/offduty-alert", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                staffName: matchedStaff.robloxUsername || matchedStaff.username || playerName,
                                staffRank: matchedStaff.rank || "Staff",
                                robloxUsername: playerName,
                                robloxId: playerId,
                                command: rawCommand,
                                source: "ER:LC In-Game",
                                timestamp: typeof cmdTimestamp === 'number' && cmdTimestamp < 1e11 ? cmdTimestamp * 1000 : cmdTimestamp,
                                eventId
                            })
                        });
                    } catch (err) {}
                }
            }
        }
    } catch (err) {
        console.warn("[ER:LC In-Game Off-Duty Check]", err);
    }
}

async function fetchErlcInGameCommands() {
    try {
        const res = await fetch("/api/erlc/commandlogs");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        erlcInGameCommandLogs = Array.isArray(data.commandLogs) ? data.commandLogs : [];
        if (erlcLogsPage?.classList.contains("active")) renderErlcInGameCommands();
        await processInGameOffDutyCommands(erlcInGameCommandLogs);
    } catch (err) {
        console.warn("[ER:LC In-Game Command Logs Fetch]", err);
    }
}

async function fetchErlcModCalls() {
    try {
        const res = await fetch("/api/erlc/modcalls");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const apiModCalls = Array.isArray(data.modCalls) ? data.modCalls : [];
        await syncErlcModCalls(apiModCalls);
    } catch (err) {
        console.warn("[ER:LC ModCalls Fetch]", err);
    }
}

async function syncErlcModCalls(apiModCalls) {
    if (!auth.currentUser || !Array.isArray(apiModCalls) || apiModCalls.length === 0) return;

    for (const call of apiModCalls.slice(0, 25)) {
        if (!call.id) continue;
        const callDocRef = doc(db, "erlc_mod_calls", String(call.id));
        try {
            await setDoc(callDocRef, {
                requesterUsername: call.requesterUsername || "Unknown",
                requesterRobloxUid: call.requesterRobloxUid || null,
                requestCommand: call.requestCommand || "!mod",
                requestedAt: call.requestedAt || Math.floor(Date.now() / 1000),
                status: call.status || "open",
                staffUsername: call.staffUsername || null,
                staffRobloxUid: call.staffRobloxUid || null,
                teleportCommand: call.teleportCommand || null,
                respondedAt: call.respondedAt || null,
                responseTimeSeconds: call.responseTimeSeconds ?? null,
                serverId: call.serverId || "NYSRP",
                updatedAt: new Date().toISOString()
            }, { merge: true });
        } catch (err) {
            // Ignore individual sync errors
        }
    }
}

async function syncErlcKills(apiKills) {
    if (!auth.currentUser || !Array.isArray(apiKills) || apiKills.length === 0) return;

    for (const kill of apiKills.slice(0, 15)) {
        const key = `${kill.killerRobloxUid || kill.killerUsername}_${kill.victimRobloxUid || kill.victimUsername}_${kill.timestamp}`;
        const alreadyRecorded = erlcKills.some(k => 
            k.timestamp === kill.timestamp && 
            k.killerUsername === kill.killerUsername && 
            k.victimUsername === kill.victimUsername
        );

        if (!alreadyRecorded) {
            try {
                await addDoc(collection(db, "erlc_kills"), {
                    killerUsername: kill.killerUsername || "Unknown",
                    killerRobloxUid: kill.killerRobloxUid || null,
                    victimUsername: kill.victimUsername || "Unknown",
                    victimRobloxUid: kill.victimRobloxUid || null,
                    weapon: "In-Game Action",
                    timestamp: kill.timestamp || Math.floor(Date.now() / 1000),
                    serverId: erlcServerInfo?.server?.JoinKey || "NYSRP",
                    createdAt: new Date().toISOString()
                });
            } catch (err) {
                // Ignore individual sync errors
            }
        }
    }
}

async function syncErlcJoins(apiJoins) {
    if (!auth.currentUser || !Array.isArray(apiJoins) || apiJoins.length === 0) return;

    for (const join of apiJoins.slice(0, 20)) {
        const normalizedTimestamp = Number(join.timestamp || join.createdAt || Date.now() / 1000);
        const normalizedUsername = String(join.username || "Unknown").trim() || "Unknown";
        const normalizedRobloxUid = join.robloxUid ?? join.robloxId ?? null;
        const normalizedJoin = join.join === true || join.event === "joined" || join.join === "true";
        const sameSessionKey = `${normalizedUsername}|${String(normalizedRobloxUid ?? "")}|${Math.floor(Number(normalizedTimestamp))}|${normalizedJoin ? "join" : "leave"}`;

        const alreadyRecorded = erlcPlayerSessions.some(s => {
            const sessionTimestamp = Number(s.timestamp || s.createdAt || 0);
            const sessionUsername = String(s.username || "Unknown").trim() || "Unknown";
            const sessionRobloxUid = s.robloxUid ?? s.robloxId ?? null;
            const sessionJoin = Boolean(s.join || s.event === "joined");
            return sessionTimestamp === Math.floor(Number(normalizedTimestamp)) &&
                sessionUsername === normalizedUsername &&
                String(sessionRobloxUid ?? "") === String(normalizedRobloxUid ?? "") &&
                sessionJoin === normalizedJoin;
        });

        if (alreadyRecorded) continue;

        try {
            await addDoc(collection(db, "erlc_player_sessions"), {
                username: normalizedUsername,
                robloxUid: normalizedRobloxUid,
                join: normalizedJoin,
                event: normalizedJoin ? "joined" : "left",
                timestamp: Number(normalizedTimestamp),
                serverId: erlcServerInfo?.server?.JoinKey || "NYSRP",
                createdAt: new Date().toISOString()
            });

            await addDoc(collection(db, "erlc_events"), {
                eventType: normalizedJoin ? "player_joined" : "player_left",
                username: normalizedUsername,
                robloxUid: normalizedRobloxUid,
                timestamp: Number(normalizedTimestamp),
                createdAt: new Date().toISOString()
            });
        } catch (err) {
            // Ignore individual sync errors
        }
    }
}

function startErlcPolling() {
    stopErlcPolling();
    fetchErlcServerStatus();
    fetchErlcPlayers();
    fetchErlcKills();
    fetchErlcJoinLogs();
    fetchErlcInGameCommands();
    fetchErlcModCalls();

    erlcPollInterval = setInterval(() => {
        if (!auth.currentUser) return;
        fetchErlcServerStatus();
        fetchErlcPlayers();
        if (erlcLogsPage?.classList.contains("active")) {
            fetchErlcKills();
            fetchErlcJoinLogs();
            fetchErlcInGameCommands();
            fetchErlcModCalls();
        }
    }, 12000);
}

function stopErlcPolling() {
    if (erlcPollInterval) {
        clearInterval(erlcPollInterval);
        erlcPollInterval = null;
    }
}

function updateRcServerStatusUI() {
    const rcStatusDot = document.getElementById("rcStatusDot");
    const rcServerName = document.getElementById("rcServerName");
    const rcStatusSub = document.getElementById("rcStatusSub");
    const rcPlayersCount = document.getElementById("rcPlayersCount");
    const rcJoinKey = document.getElementById("rcJoinKey");
    const rcDutyBanner = document.getElementById("rcDutyBanner");
    const rcDutyText = document.getElementById("rcDutyText");

    if (rcServerName) rcServerName.textContent = erlcServerInfo?.name || "NYSRP ER:LC Server";
    if (rcPlayersCount) rcPlayersCount.textContent = `${erlcServerInfo?.currentPlayers ?? 0} / ${erlcServerInfo?.maxPlayers ?? 0}`;
    if (rcJoinKey) rcJoinKey.textContent = erlcServerInfo?.joinKey || "Unavailable";

    if (rcStatusDot && rcStatusSub) {
        if (erlcServerInfo?.online) {
            rcStatusDot.className = "erlc-status-dot online";
            rcStatusSub.textContent = `Server Online • ${erlcServerInfo.currentPlayers} players active`;
        } else {
            rcStatusDot.className = "erlc-status-dot offline";
            rcStatusSub.textContent = "Server Offline or Unreachable";
        }
    }

    // Update duty indicator banner
    if (rcDutyBanner && rcDutyText) {
        const isOnDuty = Boolean(activeUserShift && activeUserShift.status === "active");
        if (isOnDuty) {
            rcDutyBanner.className = "rc-duty-banner onduty";
            rcDutyText.innerHTML = `<i class="fas fa-check-circle"></i> You are currently <strong>ON DUTY</strong> (${formatRankLabel(staffRank)}). Commands are logged normally.`;
        } else {
            rcDutyBanner.className = "rc-duty-banner offduty";
            rcDutyText.innerHTML = `<i class="fas fa-exclamation-triangle"></i> <strong>OFF DUTY WARNING:</strong> You are not clocked in. Commands will be recorded and flagged as <strong>OFF-DUTY COMMAND</strong> in audit logs.`;
        }
    }
}

// Execute Remote ER:LC Command
async function executeErlcRemoteCommand(commandText) {
    if (!auth.currentUser) {
        showToast("Authentication Error", "You must be signed in.", "error");
        return;
    }

    if (!canAccessRemoteControl(staffRank)) {
        showToast("Permission Denied", "Only Management, Director, Co Owner, and Owner can run ER:LC remote commands.", "error");
        return;
    }

    const cleanCommand = String(commandText || "").trim();
    if (!cleanCommand) {
        showToast("Validation Error", "Please enter a command to execute.", "warning");
        return;
    }

    const btnExecute = document.getElementById("btnExecuteCommand");
    const terminalOutput = document.getElementById("rcTerminalOutput");

    if (btnExecute) {
        btnExecute.disabled = true;
        btnExecute.innerHTML = `<i class="fas fa-spinner fa-spin"></i> <span>Sending...</span>`;
    }

    // Determine current duty status from active shifts
    const isOnDuty = Boolean(activeUserShift && activeUserShift.status === "active");
    const isOffDuty = !isOnDuty;

    const appendTerminalLog = (text, type = "cmd") => {
        if (!terminalOutput) return;
        const line = document.createElement("div");
        line.className = `rc-log-line ${type}`;
        line.textContent = `[${new Date().toLocaleTimeString()}] ${text}`;
        terminalOutput.appendChild(line);
        terminalOutput.scrollTop = terminalOutput.scrollHeight;
    };

    appendTerminalLog(`Executing: ${cleanCommand} (${isOnDuty ? "ON DUTY" : "OFF DUTY"})`, "cmd");

    try {
        const robloxUser = currentUserDoc?.robloxUsername || currentStaff || "Staff";
        const robloxUid = currentUserDoc?.robloxUid || currentUserDoc?.robloxId || null;

        const res = await fetch("/api/erlc/command", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                command: cleanCommand,
                staffUid: auth.currentUser.uid,
                staffUsername: currentStaff || "Staff",
                staffRank: staffRank,
                onDuty: isOnDuty,
                robloxUsername: robloxUser,
                robloxId: robloxUid
            })
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok || data.error) {
            if (res.status === 422 || data.offline || String(data.error || "").toLowerCase().includes("offline")) {
                appendTerminalLog("Notice: The ER:LC private server is currently offline.", "error");
                showToast("ER:LC Server Offline", "The ER:LC private server is currently offline. Please start the server and try again.", "error");
                return;
            }
            throw new Error(data.error || `HTTP ${res.status}`);
        }

        // Record to erlc_commands Firestore collection
        const commandRecord = {
            staffUid: auth.currentUser.uid,
            staffUsername: currentStaff || "Staff",
            staffRank: staffRank,
            command: cleanCommand,
            arguments: cleanCommand.split(/\s+/).slice(1).join(" "),
            timestamp: Date.now(),
            source: "WEBSITE_REMOTE_CONTROL",
            onDuty: isOnDuty,
            offDutyFlag: isOffDuty,
            success: true,
            result: data.result?.message || "Success",
            error: null,
            createdAt: new Date().toISOString()
        };

        await addDoc(collection(db, "erlc_commands"), commandRecord);

        // If executed off-duty, record to dedicated erlc_off_duty_commands collection
        if (isOffDuty) {
            try {
                const offDutyDocId = `offduty_web_${auth.currentUser.uid}_${Date.now()}`;
                await setDoc(doc(db, "erlc_off_duty_commands", offDutyDocId), {
                    id: offDutyDocId,
                    staffUid: auth.currentUser.uid,
                    staffUsername: currentStaff || "Staff",
                    staffRank: staffRank,
                    robloxUsername: robloxUser,
                    robloxId: robloxUid,
                    command: cleanCommand,
                    source: "WEBSITE_REMOTE_CONTROL",
                    timestamp: Date.now(),
                    createdAt: new Date().toISOString()
                });
            } catch (err) {
                console.warn("[ER:LC Off-Duty Audit Log]", err);
            }
        }

        // Record to erlc_events
        await addDoc(collection(db, "erlc_events"), {
            eventType: "command_executed",
            staffUid: auth.currentUser.uid,
            staffUsername: currentStaff || "Staff",
            staffRank: staffRank,
            command: cleanCommand,
            onDuty: isOnDuty,
            offDutyFlag: isOffDuty,
            timestamp: Date.now(),
            createdAt: new Date().toISOString()
        });

        appendTerminalLog(`Success: Command dispatched to ER:LC server.`, "success");
        if (isOffDuty) {
            appendTerminalLog(`Notice: Command recorded with [OFF-DUTY] audit flag.`, "warn");
            showToast("Command Executed (OFF DUTY)", `Ran "${cleanCommand}". Flagged as OFF-DUTY command in audit logs.`, "warning");
        } else {
            showToast("Command Sent", `Successfully executed "${cleanCommand}" in server.`, "success");
        }

        const rcInput = document.getElementById("rcCommandInput");
        if (rcInput) rcInput.value = "";
    } catch (err) {
        const message = "The command could not be executed. Please try again.";
        const errorCode = getErrorCode("Execution Failed", err?.message || "");
        appendTerminalLog(`${message} Error Code: ${errorCode}`, "error");
        showToast("Execution Failed", message, "error", errorCode);

        // Log failed execution attempt
        try {
            await addDoc(collection(db, "erlc_commands"), {
                staffUid: auth.currentUser?.uid || "unknown",
                staffUsername: currentStaff || "Staff",
                staffRank: staffRank,
                command: cleanCommand,
                arguments: cleanCommand.split(/\s+/).slice(1).join(" "),
                timestamp: Date.now(),
                source: "WEBSITE_REMOTE_CONTROL",
                onDuty: isOnDuty,
                offDutyFlag: isOffDuty,
                success: false,
                result: null,
                error: err.message,
                createdAt: new Date().toISOString()
            });
        } catch(e) {}
    } finally {
        if (btnExecute) {
            btnExecute.disabled = false;
            btnExecute.innerHTML = `<i class="fas fa-paper-plane"></i> <span>Run</span>`;
        }
    }
}

// Render Remote Control Page
function renderRemoteControlPage() {
    updateRcServerStatusUI();
    renderRcPlayersTable();
    renderRcCommandsHistory();
}

// Render Remote Control In-Game Players Table
function renderRcPlayersTable() {
    const rcPlayersBody = document.getElementById("rcPlayersBody");
    if (!rcPlayersBody) return;

    let list = erlcPlayers;
    if (rcPlayerSearchQuery) {
        list = list.filter(p => 
            String(p.username || "").toLowerCase().includes(rcPlayerSearchQuery) ||
            String(p.robloxId || "").includes(rcPlayerSearchQuery) ||
            String(p.team || "").toLowerCase().includes(rcPlayerSearchQuery)
        );
    }

    if (list.length === 0) {
        rcPlayersBody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><i class="fas fa-users-slash"></i><p>${erlcPlayers.length === 0 ? "No players currently connected to the server." : "No players match your search filter."}</p></div></td></tr>`;
        return;
    }

    rcPlayersBody.innerHTML = list.map(player => {
        const username = escapeHTML(player.username || "Unknown");
        const robloxId = escapeHTML(player.robloxId || "—");
        const permission = escapeHTML(player.permission || "Normal");
        const team = escapeHTML(player.team || "Civilian");

        return `
            <tr>
                <td>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span class="staff-avatar-sm" style="width: 28px; height: 28px; border-radius: 50%; background: var(--bg-hover); display: inline-flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 700; color: var(--accent); border: 1px solid var(--border-color);">
                            ${escapeHTML(username.substring(0, 2).toUpperCase())}
                        </span>
                        <strong style="color: var(--text-primary);">${username}</strong>
                    </div>
                </td>
                <td><code style="font-size: 0.85rem;">${robloxId}</code></td>
                <td><span class="type-badge ${permission !== 'Normal' ? 'badge-bolo' : ''}">${permission}</span></td>
                <td><span style="font-size: 0.85rem; color: var(--text-secondary);">${team}</span></td>
                <td>
                    <div class="shortcut-btn-group">
                        <button type="button" class="shortcut-btn pm" onclick="quickRcPrompt(':pm ${username} ', 'Enter private message to ${username}...', '${username}')" title="Private Message">
                            <i class="fas fa-envelope"></i> PM
                        </button>
                        <button type="button" class="shortcut-btn" onclick="quickRcCommand(':refresh ${username}')" title="Refresh Character">
                            <i class="fas fa-sync-alt"></i> Refresh
                        </button>
                        <button type="button" class="shortcut-btn kick" onclick="quickRcPrompt(':kick ${username} ', 'Enter kick reason for ${username}...', '${username}')" title="In-Game Kick">
                            <i class="fas fa-user-slash"></i> Kick
                        </button>
                        <button type="button" class="shortcut-btn ban" onclick="quickRcPrompt(':ban ${username} ', 'Enter ban reason for ${username}...', '${username}')" title="In-Game Ban">
                            <i class="fas fa-gavel"></i> Ban
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join("");
}

// Render Remote Commands History Table
function renderRcCommandsHistory() {
    const rcCommandsHistoryBody = document.getElementById("rcCommandsHistoryBody");
    if (!rcCommandsHistoryBody) return;

    if (erlcRemoteCommands.length === 0) {
        rcCommandsHistoryBody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><i class="fas fa-terminal"></i><p>No remote commands recorded yet.</p></div></td></tr>`;
        return;
    }

    rcCommandsHistoryBody.innerHTML = erlcRemoteCommands.slice(0, 15).map(cmd => {
        const staff = escapeHTML(cmd.staffUsername || "Staff");
        const rank = escapeHTML(formatRankLabel(cmd.staffRank || "Staff"));
        const command = escapeHTML(cmd.command || "");
        const outcomeBadge = cmd.success ? `<span class="type-badge badge-active"><i class="fas fa-check"></i> Executed</span>` : `<span class="type-badge badge-ban"><i class="fas fa-times"></i> Failed</span>`;
        const dutyBadge = cmd.offDutyFlag ? `<span class="type-badge badge-offduty"><i class="fas fa-exclamation-triangle"></i> OFF-DUTY</span>` : `<span class="type-badge badge-onduty"><i class="fas fa-shield-alt"></i> ON DUTY</span>`;
        const time = formatDate(cmd.timestamp || cmd.createdAt);

        return `
            <tr>
                <td><strong>${staff}</strong></td>
                <td><span style="font-size: 0.85rem; color: var(--text-secondary);">${rank}</span></td>
                <td><code style="color: var(--accent);">${command}</code></td>
                <td>${dutyBadge}</td>
                <td>${outcomeBadge}</td>
                <td>${time}</td>
            </tr>
        `;
    }).join("");
}

// Render In-Game Live Players Page
function renderErlcPlayersPage() {
    const erlcPlayersListBody = document.getElementById("erlcPlayersListBody");
    if (!erlcPlayersListBody) return;

    let list = erlcPlayers;
    if (erlcPlayersSearchQuery) {
        list = list.filter(p => 
            String(p.username || "").toLowerCase().includes(erlcPlayersSearchQuery) ||
            String(p.robloxId || "").includes(erlcPlayersSearchQuery) ||
            String(p.team || "").toLowerCase().includes(erlcPlayersSearchQuery)
        );
    }

    if (list.length === 0) {
        erlcPlayersListBody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><i class="fas fa-user-friends"></i><p>${erlcPlayers.length === 0 ? "No players currently online in ER:LC server." : "No players match your search filter."}</p></div></td></tr>`;
        return;
    }

    erlcPlayersListBody.innerHTML = list.map(player => {
        const username = escapeHTML(player.username || "Unknown");
        const robloxId = escapeHTML(player.robloxId || "—");
        const permission = escapeHTML(player.permission || "Normal");
        const team = escapeHTML(player.team || "Civilian");

        return `
            <tr>
                <td>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span class="staff-avatar-sm" style="width: 32px; height: 32px; border-radius: 50%; background: var(--bg-hover); display: inline-flex; align-items: center; justify-content: center; font-size: 0.85rem; font-weight: 700; color: var(--accent); border: 1px solid var(--border-color);">
                            ${escapeHTML(username.substring(0, 2).toUpperCase())}
                        </span>
                        <div>
                            <strong style="color: var(--text-primary); display: block;">${username}</strong>
                            <a href="https://www.roblox.com/users/${robloxId}/profile" target="_blank" style="font-size: 0.76rem; color: var(--accent); text-decoration: none;">View Roblox Profile <i class="fas fa-external-link-alt" style="font-size: 0.65rem;"></i></a>
                        </div>
                    </div>
                </td>
                <td>
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <code>${robloxId}</code>
                        ${player.robloxId ? `<button class="table-action-btn view-btn" onclick="copyToClipboardText('${robloxId}', 'Roblox ID')" title="Copy Roblox ID"><i class="fas fa-copy"></i></button>` : ""}
                    </div>
                </td>
                <td><span class="type-badge ${permission !== 'Normal' ? 'badge-bolo' : ''}">${permission}</span></td>
                <td><span style="font-weight: 500; color: var(--text-secondary);">${team}</span></td>
                <td>
                    <div class="shortcut-btn-group">
                        <button type="button" class="shortcut-btn warn" onclick="openModerationForErlcPlayer('warn', '${username}', '${robloxId}')" title="Issue Warning Log">
                            <i class="fas fa-exclamation-triangle"></i> Warn
                        </button>
                        <button type="button" class="shortcut-btn kick" onclick="openModerationForErlcPlayer('kick', '${username}', '${robloxId}')" title="Issue Kick Log">
                            <i class="fas fa-user-slash"></i> Kick
                        </button>
                        <button type="button" class="shortcut-btn ban" onclick="openModerationForErlcPlayer('ban', '${username}', '${robloxId}')" title="Issue Ban Log">
                            <i class="fas fa-gavel"></i> Ban
                        </button>
                        <button type="button" class="shortcut-btn bolo" onclick="openModerationForErlcPlayer('bolo', '${username}', '${robloxId}')" title="Issue BOLO">
                            <i class="fas fa-binoculars"></i> BOLO
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join("");
}

// Open Moderation Modal with prefilled ER:LC player details
window.openModerationForErlcPlayer = function(actionType, username, robloxId) {
    openActionModal(actionType);
    if (logUsernameInput) {
        logUsernameInput.value = username || "";
        logUsernameInput.dataset.displayName = username || "";
    }
    if (logRobloxIdInput) {
        logRobloxIdInput.value = robloxId && robloxId !== "—" ? robloxId : "";
    }
    showToast("Player Selected", `Pre-filled ${actionType.toUpperCase()} modal for ${username}.`, "info");
};

window.quickRcCommand = async function(cmd) {
    if (!(await showConfirmation({
        title: "Run ER:LC Server Command",
        message: `Execute "${cmd}" on the server now?`,
        variant: "danger",
        confirmLabel: "Execute Command"
    }))) return;
    executeErlcRemoteCommand(cmd);
};

window.quickRcPrompt = async function(prefix, placeholder, username) {
    const input = await showTextPrompt({
        title: "ER:LC Command Parameters",
        message: placeholder || `Enter command arguments for ${prefix}:`,
        inputLabel: "Command parameters",
        placeholder: "Enter parameters",
        required: true,
        validationMessage: "Command parameters cannot be empty.",
        confirmLabel: "Continue"
    });
    if (input === null) return;
    const trimmed = input.trim();
    if (!trimmed) {
        showToast("Validation Error", "Command parameters cannot be empty.", "warning");
        return;
    }
    executeErlcRemoteCommand(`${prefix}${trimmed}`);
};

// Render ER:LC Activity & Logs Page
function renderErlcLogsPage() {
    renderErlcKills();
    renderErlcInGameCommands();
    renderErlcModCalls();
    renderErlcJoins();
    renderErlcRemoteAudit();
}

function renderErlcKills() {
    const erlcKillsBody = document.getElementById("erlcKillsBody");
    if (!erlcKillsBody) return;

    let list = erlcKills;
    if (erlcLogsSearchQuery) {
        list = list.filter(k => 
            String(k.killerUsername || "").toLowerCase().includes(erlcLogsSearchQuery) ||
            String(k.victimUsername || "").toLowerCase().includes(erlcLogsSearchQuery) ||
            String(k.killerRobloxUid || "").includes(erlcLogsSearchQuery) ||
            String(k.victimRobloxUid || "").includes(erlcLogsSearchQuery)
        );
    }

    if (list.length === 0) {
        erlcKillsBody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><i class="fas fa-skull-crossbones"></i><p>No kill records found.</p></div></td></tr>`;
        return;
    }

    erlcKillsBody.innerHTML = list.map(k => {
        const killer = escapeHTML(k.killerUsername || "Unknown");
        const victim = escapeHTML(k.victimUsername || "Unknown");
        const killerId = escapeHTML(k.killerRobloxUid || "—");
        const victimId = escapeHTML(k.victimRobloxUid || "—");
        const time = formatDate(k.timestamp ? (typeof k.timestamp === 'number' && k.timestamp < 1e11 ? k.timestamp * 1000 : k.timestamp) : k.createdAt);

        return `
            <tr>
                <td><strong style="color: var(--ban-color);">${killer}</strong></td>
                <td><code>${killerId}</code></td>
                <td><strong style="color: var(--text-primary);">${victim}</strong></td>
                <td><code>${victimId}</code></td>
                <td>${time}</td>
                <td>
                    <div class="shortcut-btn-group">
                        <button type="button" class="shortcut-btn warn" onclick="openModerationForErlcPlayer('warn', '${killer}', '${killerId}')" title="Warn Killer">
                            Warn Killer
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join("");
}

function renderErlcInGameCommands() {
    const erlcInGameCommandsBody = document.getElementById("erlcInGameCommandsBody");
    if (!erlcInGameCommandsBody) return;

    let list = erlcInGameCommandLogs;
    if (erlcLogsSearchQuery) {
        list = list.filter(c => 
            String(c.staffUsername || "").toLowerCase().includes(erlcLogsSearchQuery) ||
            String(c.command || "").toLowerCase().includes(erlcLogsSearchQuery) ||
            String(c.staffRobloxUid || "").includes(erlcLogsSearchQuery)
        );
    }

    if (list.length === 0) {
        erlcInGameCommandsBody.innerHTML = `<tr><td colspan="4"><div class="empty-state"><i class="fas fa-clipboard-list"></i><p>No in-game command logs recorded.</p></div></td></tr>`;
        return;
    }

    erlcInGameCommandsBody.innerHTML = list.map(c => {
        const player = escapeHTML(c.staffUsername || "Staff");
        const robloxId = escapeHTML(c.staffRobloxUid || "—");
        const command = escapeHTML(c.command || "");
        const time = formatDate(c.timestamp ? (typeof c.timestamp === 'number' && c.timestamp < 1e11 ? c.timestamp * 1000 : c.timestamp) : Date.now());

        return `
            <tr>
                <td><strong>${player}</strong></td>
                <td><code>${robloxId}</code></td>
                <td><code style="color: var(--accent);">${command}</code></td>
                <td>${time}</td>
            </tr>
        `;
    }).join("");
}

function renderErlcModCalls() {
    const erlcModCallsBody = document.getElementById("erlcModCallsBody");
    if (!erlcModCallsBody) return;

    let list = erlcModCalls;
    if (erlcLogsSearchQuery) {
        list = list.filter(c => 
            String(c.requesterUsername || "").toLowerCase().includes(erlcLogsSearchQuery) ||
            String(c.requesterRobloxUid || "").includes(erlcLogsSearchQuery) ||
            String(c.requestCommand || "").toLowerCase().includes(erlcLogsSearchQuery) ||
            String(c.staffUsername || "").toLowerCase().includes(erlcLogsSearchQuery) ||
            String(c.status || "").toLowerCase().includes(erlcLogsSearchQuery)
        );
    }

    if (list.length === 0) {
        erlcModCallsBody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><i class="fas fa-headset"></i><p>No mod calls recorded.</p></div></td></tr>`;
        return;
    }

    const canRemote = canAccessRemoteControl(staffRank);

    erlcModCallsBody.innerHTML = list.map(c => {
        const reqUser = escapeHTML(c.requesterUsername || "Unknown");
        const reqUid = escapeHTML(c.requesterRobloxUid || "—");
        const reqCmd = escapeHTML(c.requestCommand || "!mod");
        const staffUser = c.staffUsername ? escapeHTML(c.staffUsername) : null;
        const tpCmd = c.teleportCommand ? escapeHTML(c.teleportCommand) : null;
        const status = String(c.status || "open").toLowerCase();
        
        const statusBadge = status === "responded" ? "badge-responded" : (status === "open" ? "badge-open" : "badge-unresolved");
        const statusIcon = status === "responded" ? "fa-check-circle" : (status === "open" ? "fa-exclamation-circle" : "fa-clock");
        const statusLabel = status === "responded" ? "Responded" : (status === "open" ? "Open" : "Unresolved");

        const requestedTime = formatDate(c.requestedAt ? (typeof c.requestedAt === 'number' && c.requestedAt < 1e11 ? c.requestedAt * 1000 : c.requestedAt) : c.createdAt);
        const respondedTime = c.respondedAt ? formatDate(typeof c.respondedAt === 'number' && c.respondedAt < 1e11 ? c.respondedAt * 1000 : c.respondedAt) : `<span style="color: var(--text-muted);">—</span>`;
        const durationText = c.responseTimeSeconds != null 
            ? `<span style="font-family: monospace; font-weight: 600; color: #10b981;">${formatDurationHuman(c.responseTimeSeconds)}</span>` 
            : (status === "open" ? `<span style="color: #f59e0b; font-weight: 500;">Pending</span>` : `<span style="color: var(--text-muted);">—</span>`);

        return `
            <tr>
                <td>
                    <span class="type-badge ${statusBadge}">
                        <i class="fas ${statusIcon}"></i> ${statusLabel}
                    </span>
                </td>
                <td>
                    <div style="font-weight: 600; color: var(--text-primary);">${reqUser}</div>
                    <code style="font-size: 0.78rem; color: var(--text-muted);">${reqUid}</code>
                </td>
                <td><code style="color: var(--accent);">${reqCmd}</code></td>
                <td>${staffUser ? `<strong>${staffUser}</strong>` : `<span style="color: var(--text-muted);">Unassigned</span>`}</td>
                <td>${tpCmd ? `<code>${tpCmd}</code>` : `<span style="color: var(--text-muted);">—</span>`}</td>
                <td>${requestedTime}</td>
                <td>${respondedTime}</td>
                <td>${durationText}</td>
                <td>
                    <div class="shortcut-btn-group">
                        ${canRemote ? `
                            <button type="button" class="shortcut-btn" onclick="executeErlcRemoteCommand(':to ${reqUser}')" title="Teleport to ${reqUser}">
                                <i class="fas fa-location-arrow"></i> :to
                            </button>
                            <button type="button" class="shortcut-btn pm" onclick="quickRcPrompt(':pm ${reqUser} ', 'Enter private message to ${reqUser}...', '${reqUser}')" title="PM Player">
                                <i class="fas fa-envelope"></i> PM
                            </button>
                        ` : ''}
                        <button type="button" class="shortcut-btn" onclick="openModerationForErlcPlayer('note', '${reqUser}', '${reqUid}')" title="Add Note for Player">
                            <i class="fas fa-sticky-note"></i> Note
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join("");
}

function renderErlcJoins() {
    const erlcJoinsBody = document.getElementById("erlcJoinsBody");
    if (!erlcJoinsBody) return;

    let list = erlcPlayerSessions;
    if (erlcLogsSearchQuery) {
        list = list.filter(j => 
            String(j.username || "").toLowerCase().includes(erlcLogsSearchQuery) ||
            String(j.robloxUid || "").includes(erlcLogsSearchQuery)
        );
    }

    if (list.length === 0) {
        erlcJoinsBody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><i class="fas fa-door-open"></i><p>No player session logs recorded.</p></div></td></tr>`;
        return;
    }

    erlcJoinsBody.innerHTML = list.map(j => {
        const username = escapeHTML(j.username || "Unknown");
        const robloxId = escapeHTML(j.robloxUid || "—");
        const isJoin = j.join || j.event === "joined";
        const badge = isJoin ? `<span class="type-badge badge-active"><i class="fas fa-sign-in-alt"></i> Joined</span>` : `<span class="type-badge badge-ban"><i class="fas fa-sign-out-alt"></i> Left</span>`;
        const time = formatDate(j.timestamp ? (typeof j.timestamp === 'number' && j.timestamp < 1e11 ? j.timestamp * 1000 : j.timestamp) : j.createdAt);

        return `
            <tr>
                <td><strong>${username}</strong></td>
                <td><code>${robloxId}</code></td>
                <td>${badge}</td>
                <td>${time}</td>
                <td>
                    <button type="button" class="shortcut-btn" onclick="openModerationForErlcPlayer('note', '${username}', '${robloxId}')">
                        <i class="fas fa-sticky-note"></i> Add Note
                    </button>
                </td>
            </tr>
        `;
    }).join("");
}

function renderErlcRemoteAudit() {
    const erlcRemoteAuditBody = document.getElementById("erlcRemoteAuditBody");
    if (!erlcRemoteAuditBody) return;

    let list = erlcRemoteCommands;
    if (erlcLogsSearchQuery) {
        list = list.filter(c => 
            String(c.staffUsername || "").toLowerCase().includes(erlcLogsSearchQuery) ||
            String(c.command || "").toLowerCase().includes(erlcLogsSearchQuery) ||
            String(c.staffRank || "").toLowerCase().includes(erlcLogsSearchQuery)
        );
    }

    if (list.length === 0) {
        erlcRemoteAuditBody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><i class="fas fa-history"></i><p>No remote command audit logs recorded.</p></div></td></tr>`;
        return;
    }

    erlcRemoteAuditBody.innerHTML = list.map(cmd => {
        const staff = escapeHTML(cmd.staffUsername || "Staff");
        const rank = escapeHTML(formatRankLabel(cmd.staffRank || "Staff"));
        const command = escapeHTML(cmd.command || "");
        const outcomeBadge = cmd.success ? `<span class="type-badge badge-active"><i class="fas fa-check"></i> Success</span>` : `<span class="type-badge badge-ban"><i class="fas fa-times"></i> Failed</span>`;
        const dutyBadge = cmd.offDutyFlag ? `<span class="type-badge badge-offduty"><i class="fas fa-exclamation-triangle"></i> OFF-DUTY</span>` : `<span class="type-badge badge-onduty"><i class="fas fa-shield-alt"></i> ON DUTY</span>`;
        const time = formatDate(cmd.timestamp || cmd.createdAt);

        return `
            <tr>
                <td><strong>${staff}</strong></td>
                <td><span style="font-size: 0.85rem; color: var(--text-secondary);">${rank}</span></td>
                <td><code style="color: var(--accent);">${command}</code></td>
                <td>${dutyBadge}</td>
                <td>${outcomeBadge}</td>
                <td>${time}</td>
            </tr>
        `;
    }).join("");
}

// Wire up ER:LC Command Form & Quick Action Triggers
const rcCommandForm = document.getElementById("rcCommandForm");
if (rcCommandForm) {
    rcCommandForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const input = document.getElementById("rcCommandInput");
        if (input && input.value.trim()) {
            executeErlcRemoteCommand(input.value.trim());
        }
    });
}

document.querySelectorAll(".rc-quick-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
        const cmd = btn.getAttribute("data-rc-cmd");
        const promptPrefix = btn.getAttribute("data-rc-prompt");
        const placeholder = btn.getAttribute("data-rc-placeholder");

        if (cmd) {
            if (await showConfirmation({
                title: "Run ER:LC Server Command",
                message: `Execute "${cmd}" now?`,
                variant: "danger",
                confirmLabel: "Execute Command"
            })) {
                executeErlcRemoteCommand(cmd);
            }
        } else if (promptPrefix) {
            const input = await showTextPrompt({
                title: "ER:LC Command Parameters",
                message: placeholder || `Enter parameters for ${promptPrefix}:`,
                inputLabel: "Command parameters",
                placeholder: "Enter parameters",
                required: true,
                validationMessage: "Command parameters cannot be empty.",
                confirmLabel: "Continue"
            });
            if (input !== null && input.trim()) {
                executeErlcRemoteCommand(`${promptPrefix}${input.trim()}`);
            }
        }
    });
});

// Refresh Buttons
document.getElementById("btnRefreshServer")?.addEventListener("click", () => {
    fetchErlcServerStatus();
    showToast("Server Refreshed", "Live ER:LC server data requested.", "info");
});

document.getElementById("btnRefreshErlcPlayers")?.addEventListener("click", () => {
    fetchErlcPlayers();
    showToast("Players Refreshed", "Fetching live connected players...", "info");
});

// Search Inputs
document.getElementById("rcPlayerSearch")?.addEventListener("input", (e) => {
    rcPlayerSearchQuery = e.target.value.trim().toLowerCase();
    renderRcPlayersTable();
});

document.getElementById("erlcPlayersSearch")?.addEventListener("input", (e) => {
    erlcPlayersSearchQuery = e.target.value.trim().toLowerCase();
    renderErlcPlayersPage();
});

document.getElementById("erlcLogsSearch")?.addEventListener("input", (e) => {
    erlcLogsSearchQuery = e.target.value.trim().toLowerCase();
    renderErlcLogsPage();
});

// Tab Switcher for ER:LC Activity Logs Page
document.querySelectorAll("[data-erlc-tab]").forEach(tabBtn => {
    tabBtn.addEventListener("click", () => {
        const tab = tabBtn.getAttribute("data-erlc-tab");
        document.querySelectorAll("[data-erlc-tab]").forEach(b => b.classList.remove("active"));
        tabBtn.classList.add("active");
        erlcActiveTab = tab;

        document.querySelectorAll(".erlc-tab-content").forEach(c => c.classList.add("hidden"));
        if (tab === "kills") document.getElementById("erlcKillsTab")?.classList.remove("hidden");
        if (tab === "commands") document.getElementById("erlcCommandsTab")?.classList.remove("hidden");
        if (tab === "modcalls") document.getElementById("erlcModCallsTab")?.classList.remove("hidden");
        if (tab === "joins") document.getElementById("erlcJoinsTab")?.classList.remove("hidden");
        if (tab === "remote") document.getElementById("erlcRemoteTab")?.classList.remove("hidden");

        renderErlcLogsPage();
    });
});

// Global Client-Side Error Listeners (Report to Discord via backend proxy)
window.addEventListener("error", (event) => {
    if (!event || (!event.error && !event.message)) return;
    const msg = String(event.message || event.error?.message || "Unknown error");
    if (msg.includes("ResizeObserver") || msg.includes("script error")) return;

    reportSystemError({
        title: "Client Runtime Exception",
        detail: `${msg} at ${event.filename || 'app'}:${event.lineno || 0}`,
        system: "NYSRP Frontend Client",
        endpoint: window.location.pathname || "/",
        status: "Runtime Error"
    });
});

window.addEventListener("unhandledrejection", (event) => {
    if (!event || !event.reason) return;
    const msg = String(event.reason?.message || event.reason || "Unhandled Promise Rejection");
    if (msg.includes("ResizeObserver")) return;

    reportSystemError({
        title: "Unhandled Promise Rejection",
        detail: msg,
        system: "NYSRP Frontend Client",
        endpoint: window.location.pathname || "/",
        status: "Promise Rejection"
    });
});
