/* ==========================================================================
   CARECONNECT ENTERPRISE FULL FRONTEND APPLICATIVE ORCHESTRATION ENGINE
   HANDLES: VIEWPORT TOGGLING, MODAL TRANSITIONS, ASYNC REST OPERATIONS, TOASTS
   ========================================================================== */

// Automatically switches the database connection depending on where the site is opened!
const API_BASE_URL = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost'
    ? 'http://localhost:3000/api'
    : 'https://careconnect-backend-0hnf.onrender.com/api';

// Operational Global Application Context Object State
let AppState = {
    user: null,
    token: localStorage.getItem('cc_auth_token') || null,
    activeRole: null,
    currentView: 'home',
    notifications: []
};

document.addEventListener('DOMContentLoaded', () => {
    initDOMListeners();
    checkExistingSession();
    fetchLandingDirectoryData();
});

/* --------------------------------------------------------------------------
   1. CORE REGISTRATION & DOM EVENT INTERFACE LISTENERS
   -------------------------------------------------------------------------- */
function initDOMListeners() {
    // Mobile Navigation Drawer Toggle Handler
    const mobileToggle = document.getElementById('mobile-toggle');
    const navbar = document.getElementById('navbar');
    if (mobileToggle && navbar) {
        mobileToggle.addEventListener('click', () => {
            navbar.classList.toggle('open');
            const icon = mobileToggle.querySelector('i');
            icon.classList.toggle('fa-bars');
            icon.classList.toggle('fa-xmark');
        });
    }

    // Modal Visibility Triggers
    const openLoginBtn = document.getElementById('open-login-btn');
    const heroBookBtn = document.getElementById('hero-book-btn');
    const closeAuthModal = document.getElementById('close-auth-modal');
    const authOverlay = document.getElementById('auth-modal-overlay');

    const toggleModalState = (show) => {
        if (!authOverlay) return;
        if (show) authOverlay.classList.remove('hidden');
        else authOverlay.classList.add('hidden');
    };

    if (openLoginBtn) openLoginBtn.addEventListener('click', () => { switchAuthPane('login'); toggleModalState(true); });
    if (heroBookBtn) heroBookBtn.addEventListener('click', () => {
        if (AppState.token && AppState.activeRole === 'Patient') {
            navigateToDashboardView('patient-book');
        } else {
            showToast('Authentication check failed. Please log in or establish a patient profile node first.', 'warning');
            switchAuthPane('register');
            toggleModalState(true);
        }
    });
    if (closeAuthModal) closeAuthModal.addEventListener('click', () => toggleModalState(false));

    // Internal Auth Pane Navigation Selectors Tabs
    const tabLogin = document.getElementById('tab-login-trigger');
    const tabRegister = document.getElementById('tab-register-trigger');
    if (tabLogin) tabLogin.addEventListener('click', () => switchAuthPane('login'));
    if (tabRegister) tabRegister.addEventListener('click', () => switchAuthPane('register'));

    const triggerForgot = document.getElementById('trigger-forgot-pwd');
    const backToLogin = document.getElementById('back-to-login-btn');
    if (triggerForgot) triggerForgot.addEventListener('click', () => switchAuthPane('forgot'));
    if (backToLogin) backToLogin.addEventListener('click', () => switchAuthPane('login'));

    // Asynchronous Submission Pipeline Interceptors
    const loginForm = document.getElementById('system-login-form');
    if (loginForm) loginForm.addEventListener('submit', handleLoginSubmission);

    const registerForm = document.getElementById('patient-registration-form');
    if (registerForm) registerForm.addEventListener('submit', handleRegistrationSubmission);

    const forgotForm = document.getElementById('forgot-password-form');
    if (forgotForm) forgotForm.addEventListener('submit', handleForgotPasswordSubmission);

    const bookingForm = document.getElementById('patient-appointment-booking-form');
    if (bookingForm) bookingForm.addEventListener('submit', handleAppointmentBookingSubmission);

    const consultForm = document.getElementById('doctor-consultation-submission-form');
    if (consultForm) consultForm.addEventListener('submit', handleConsultationWorkspaceSubmission);

    const profileForm = document.getElementById('common-profile-update-form');
    if (profileForm) profileForm.addEventListener('submit', handleProfileUpdateSubmission);

    // Sidebar Operational Component Controllers
    const sidebarMobileToggle = document.getElementById('sidebar-mobile-toggle');
    const sidebarElement = document.querySelector('.dashboard-sidebar');
    if (sidebarMobileToggle && sidebarElement) {
        sidebarMobileToggle.addEventListener('click', () => sidebarElement.classList.toggle('mobile-open'));
    }

    const themeToggle = document.getElementById('theme-toggle-btn');
    if (themeToggle) themeToggle.addEventListener('click', toggleThemeMode);

    const logoutBtn = document.getElementById('system-logout-btn');
    if (logoutBtn) logoutBtn.addEventListener('click', terminateSessionState);

    // Notification UI Box Panel Drawer
    const bellBtn = document.getElementById('bell-trigger-btn');
    const paneBox = document.getElementById('notification-pane-box');
    if (bellBtn && paneBox) {
        bellBtn.addEventListener('click', (e) => { e.stopPropagation(); paneBox.classList.toggle('hidden'); });
        document.addEventListener('click', () => paneBox.classList.add('hidden'));
        paneBox.addEventListener('click', (e) => e.stopPropagation());
    }

    const flushAlertsBtn = document.getElementById('clear-notifications-btn');
    if (flushAlertsBtn) flushAlertsBtn.addEventListener('click', flushSystemNotifications);

    // Dynamic Select Intermediary Event Chain Hooks
    const deptSelect = document.getElementById('booking-department-select');
    if (deptSelect) deptSelect.addEventListener('change', (e) => fetchDoctorsForBookingDropdown(e.target.value));

    const docSelect = document.getElementById('booking-doctor-select');
    if (docSelect) docSelect.addEventListener('change', (e) => fetchSchedulesForBookingDropdown(e.target.value));

    const schedSelect = document.getElementById('booking-schedule-select');
    const bookingDate = document.getElementById('booking-date-input');
    if (schedSelect) schedSelect.addEventListener('change', () => { if (schedSelect.value) bookingDate.removeAttribute('disabled'); });

    // FAQ Functional Behavior Accordions
    document.querySelectorAll('.faq-question').forEach(item => {
        item.addEventListener('click', () => {
            const parent = item.parentElement;
            parent.classList.toggle('expanded');
        });
    });

    // Configuration Checkbox Handlers
    const darkCheckbox = document.getElementById('settings-dark-mode-checkbox');
    if (darkCheckbox) {
        darkCheckbox.addEventListener('change', () => {
            if (darkCheckbox.checked) {
                document.body.classList.add('dark-theme');
                document.body.classList.remove('light-theme');
            } else {
                document.body.classList.remove('dark-theme');
                document.body.classList.add('light-theme');
            }
        });
    }

    // Target the specific dashboard element or card displaying the patient count
    // Target elements inside your dashboard layout panel
    const patientCounterWidget = document.getElementById('total-patients-counter');
    const detailedRecordsContainer = document.getElementById('records-display-panel');

    if (patientCounterWidget && detailedRecordsContainer) {
        patientCounterWidget.addEventListener('click', async () => {

            if (detailedRecordsContainer.style.display === 'block') {
                detailedRecordsContainer.style.display = 'none';
                return;
            }

            try {
                const serverResponse = await fetch('/api/admin/patients');
                const collection = await serverResponse.json();

                if (!serverResponse.ok) throw new Error(collection.message);

                let dataGridHTML = `
                <div class="table-responsive glassmorphism" style="margin-top: 25px; padding: 20px; border-radius: 12px; border: 1px solid rgba(128, 128, 128, 0.2); overflow-x: auto;">
                    <h3 style="margin-bottom: 20px; color: inherit;">Comprehensive Patient Registry Log</h3>
                    <table class="table" style="width: 100%; border-collapse: collapse; text-align: left; color: inherit; min-width: 900px;">
                        <thead>
                            <tr style="border-bottom: 2px solid rgba(128, 128, 128, 0.3);">
                                <th style="padding: 12px;">ID</th>
                                <th style="padding: 12px;">Patient Identity</th>
                                <th style="padding: 12px;">Biological DOB</th>
                                <th style="padding: 12px;">Contact Info</th>
                                <th style="padding: 12px;">Residential Address</th>
                                <th style="padding: 12px;">Medical History Context</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

                collection.forEach(item => {
                    const formattedDOB = item.dob ? new Date(item.dob).toLocaleDateString() : 'N/A';

                    dataGridHTML += `
                    <tr style="border-bottom: 1px solid rgba(128, 128, 128, 0.15); color: inherit; vertical-align: top;">
                        <td style="padding: 12px;">${item.patient_id}</td>
                        <td style="padding: 12px;">
                            <strong>${item.full_name}</strong><br>
                            <small style="opacity: 0.7;">${item.gender || 'N/A'}</small>
                        </td>
                        <td style="padding: 12px;">${formattedDOB}</td>
                        <td style="padding: 12px;">
                            <div>${item.email}</div>
                            <div style="font-size: 0.85em; opacity: 0.8;">${item.phone || 'N/A'}</div>
                        </td>
                        <td style="padding: 12px; max-width: 200px; word-wrap: break-word;">${item.address || 'N/A'}</td>
                        <td style="padding: 12px; max-width: 300px; word-wrap: break-word; line-height: 1.4;">
                            ${item.medical_history_summary || 'None'}
                        </td>
                    </tr>
                `;
                });

                dataGridHTML += `
                        </tbody>
                    </table>
                </div>
            `;

                detailedRecordsContainer.innerHTML = dataGridHTML;
                detailedRecordsContainer.style.display = 'block';

            } catch (fault) {
                console.error('Rendering panel exception logic trace:', fault);
                alert('Could not render management logs array grid.');
            }
        });
    }
}

/* --------------------------------------------------------------------------
   2. AUTH INTERFACE PRESENTATION SUB-ROUTINES
   -------------------------------------------------------------------------- */
function switchAuthPane(paneName) {
    const panes = ['login-pane', 'register-pane', 'forgot-password-pane'];
    panes.forEach(p => {
        const el = document.getElementById(p);
        if (el) el.classList.add('hidden');
    });

    const tabLogin = document.getElementById('tab-login-trigger');
    const tabRegister = document.getElementById('tab-register-trigger');
    if (tabLogin) tabLogin.classList.remove('active');
    if (tabRegister) tabRegister.classList.remove('active');

    if (paneName === 'login') {
        document.getElementById('login-pane').classList.remove('hidden');
        if (tabLogin) tabLogin.classList.add('active');
    } else if (paneName === 'register') {
        document.getElementById('register-pane').classList.remove('hidden');
        if (tabRegister) tabRegister.classList.add('active');
    } else if (paneName === 'forgot') {
        document.getElementById('forgot-password-pane').classList.remove('hidden');
    }
}

function toggleThemeMode() {
    const targetDark = !document.body.classList.contains('dark-theme');
    const checkbox = document.getElementById('settings-dark-mode-checkbox');

    if (targetDark) {
        document.body.classList.add('dark-theme');
        document.body.classList.remove('light-theme');
        if (checkbox) checkbox.checked = true;
    } else {
        document.body.classList.remove('dark-theme');
        document.body.classList.add('light-theme');
        if (checkbox) checkbox.checked = false;
    }
}

/* --------------------------------------------------------------------------
   3. CLIENT ASYNC REQUEST TRANSMISSION & RESPONSE WRAPPERS
   -------------------------------------------------------------------------- */
// ============================================================
// BULLETPROOF API ENGINE WITH GUARANTEED SPINNER SHUTOFF
// ============================================================
async function executeSecureAPIRequest(endpoint, options = {}) {
    const isSilent = options.silent === true;

    // 1. Show the loading spinner
    if (!isSilent) setLoadingState(true);

    try {
        const url = `${API_BASE_URL}${endpoint}`;
        options.headers = options.headers || {};

        // 2. Inline token extraction guarantees it NEVER throws a ReferenceError
        let token = null;
        if (typeof getAuthToken === 'function') {
            token = getAuthToken();
        } else if (typeof AppState !== 'undefined') {
            token = AppState.token || localStorage.getItem('cc_auth_token') || sessionStorage.getItem('token');
        } else {
            token = localStorage.getItem('cc_auth_token');
        }

        if (token) {
            options.headers['Authorization'] = `Bearer ${token}`;
        }

        // 3. Execute the fetch to the backend
        const response = await fetch(url, options);

        // 4. Safely check if Render is sleeping/returning an HTML 502 Bad Gateway page
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("text/html")) {
            throw new Error("Cloud server is waking up. Please wait 30 seconds and try again.");
        }

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || `System Error: Code ${response.status}`);
        }

        return data;

    } catch (err) {
        // 5. Catch ANY error (network offline, server sleep, JS crash) and show toast
        if (!isSilent) {
            showToast(err.message || "Network connection failed.", 'danger');
        }
        throw err;

    } finally {
        // 6. ULTIMATE GUARANTEE: The spinner WILL turn off, no matter what happened above.
        if (!isSilent) setLoadingState(false);
    }
}
function setLoadingState(isLoading) {
    const spinner = document.getElementById('global-spinner');
    if (!spinner) return;
    if (isLoading) spinner.classList.remove('hidden');
    else spinner.classList.add('hidden');
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast-alert toast-${type}`;

    let icon = 'fa-circle-check';
    if (type === 'danger') icon = 'fa-circle-exclamation';
    if (type === 'warning') icon = 'fa-triangle-exclamation';

    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
    container.appendChild(toast);

    // Forces a layout reflow trigger to execute smooth CSS translation transitions
    setTimeout(() => toast.classList.add('visible'), 50);
    setTimeout(() => {
        toast.classList.remove('visible');
        setTimeout(() => toast.remove(), 400);
    }, 4500);
}

/* --------------------------------------------------------------------------
   4. ASYNC CORE AUTHENTICATION LOGIC SUBMISSIONS
   -------------------------------------------------------------------------- */
async function handleLoginSubmission(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    try {
        const data = await executeSecureAPIRequest('/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        localStorage.setItem('cc_auth_token', data.token);
        AppState.token = data.token;
        AppState.user = data.user;
        AppState.activeRole = data.user.role_name;

        document.getElementById('auth-modal-overlay').classList.add('hidden');
        showToast(`Identity authenticated. Role context parsed: ${AppState.activeRole}`);

        launchApplicationDashboard();
    } catch (err) { /* Intercepted inside central API handler module */ }
}

async function handleRegistrationSubmission(event) {
    event.preventDefault();

    const form = event.target;

    // Select input elements using flexible fallback attributes
    const nameInput = document.getElementById('reg-fullname') || document.getElementById('fullname') || form.querySelector('input[type="text"]');
    const emailInput = document.getElementById('reg-email') || document.getElementById('email') || form.querySelector('input[type="email"]');
    const passwordInput = document.getElementById('reg-password') || form.querySelector('input[type="password"]');
    const phoneInput = document.getElementById('reg-phone') || document.getElementById('phone') || form.querySelector('input[type="tel"]');
    const genderInput = document.getElementById('reg-gender') || document.getElementById('reg-gender-select') || form.querySelector('select');
    const dobInput = document.getElementById('reg-dob') || document.getElementById('dob') || form.querySelector('input[type="date"]');
    const addressInput = document.getElementById('reg-address') || document.getElementById('address');
    const historyInput = form.querySelector('textarea') || document.getElementById('medical-history');

    // Build the payload data object
    const payload = {
        full_name: nameInput ? nameInput.value.trim() : '',
        email: emailInput ? emailInput.value.trim() : '',
        password: passwordInput && passwordInput.value ? passwordInput.value : 'Patient@123', // Fallback temporary password
        phone: phoneInput ? phoneInput.value.trim() : '',
        gender: genderInput ? genderInput.value : '',
        dob: dobInput ? dobInput.value : '',
        address: addressInput ? addressInput.value.trim() : '',
        medical_history_summary: historyInput ? historyInput.value.trim() : ''
    };

    console.log("Transmitting unified account payload to backend:", payload);

    try {
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (!response.ok) {
            alert(`Registration Error: ${result.message}`);
            return;
        }

        alert(`🎉 Account successfully created!\n\nPatient can now log in using:\n📧 Email: ${payload.email}\n🔑 Password: ${payload.password}`);
        form.reset();

    } catch (error) {
        console.error("Submission pipeline error:", error);
        alert("Could not connect to the authentication server. Please try again.");
    }
}
async function checkExistingSession() {
    if (!getAuthToken()) return;
    try {
        const data = await executeSecureAPIRequest('/profile/me', { method: 'GET', silent: true });
        AppState.user = data.user;
        AppState.activeRole = data.user.role_name;
        launchApplicationDashboard();
    } catch (err) {
        localStorage.removeItem('cc_auth_token');
        AppState.token = null;
    }
}

function terminateSessionState() {
    localStorage.removeItem('cc_auth_token');
    AppState.token = null;
    AppState.user = null;
    AppState.activeRole = null;

    document.getElementById('dashboard-app-wrapper').classList.add('hidden');
    document.getElementById('landing-site-wrapper').classList.remove('hidden');
    showToast('Cryptographic session cleared. Identity signed out.');
}

/* --------------------------------------------------------------------------
   5. CENTRAL DASHBOARD ARCHITECTURE & LAYOUT ROUTER
   -------------------------------------------------------------------------- */
function launchApplicationDashboard() {
    document.getElementById('landing-site-wrapper').classList.add('hidden');
    const dashboardApp = document.getElementById('dashboard-app-wrapper');
    dashboardApp.classList.remove('hidden');

    // Profile Metadata Sync
    document.getElementById('user-role-badge').innerText = AppState.activeRole;
    // Change this line:
    document.getElementById('sidebar-username').innerText = AppState.user.full_name || "System Executive Manager";
    document.getElementById('sidebar-user-sub').innerText = AppState.user.email;

    if (AppState.user.profile_photo_url) {
        document.getElementById('sidebar-avatar').src = `${API_BASE_URL.replace('/api', '')}/${AppState.user.profile_photo_url}`;
    }

    buildRoleSpecificSidebarNavigation();
    fetchDashboardSystemNotifications();

    // Automatically trigger primary destination home route entry points
    navigateToDashboardView(`${AppState.activeRole.toLowerCase().replace(' ', '')}-home`);
}

function buildRoleSpecificSidebarNavigation() {
    const menuContainer = document.getElementById('sidebar-menu-links');
    if (!menuContainer) return;
    menuContainer.innerHTML = '';

    let links = [];

    if (AppState.activeRole === 'Patient') {
        links = [
            { id: 'patient-home', label: 'Patient Core Console', icon: 'fa-chart-pie' },
            { id: 'patient-book', label: 'Book Appointment', icon: 'fa-calendar-plus' },
            { id: 'patient-history', label: 'My Treatment Charts', icon: 'fa-notes-medical' }
        ];
    } else if (AppState.activeRole === 'Doctor') {
        links = [
            { id: 'doctor-home', label: 'Clinical Workspace', icon: 'fa-stethoscope' }
        ];
    } else if (AppState.activeRole === 'Administrative Staff') {
        links = [
            { id: 'administrativestaff-home', label: 'Scheduling Master', icon: 'fa-calendar-check' }
        ];
    } else if (AppState.activeRole === 'Clinic Manager') {
        links = [
            { id: 'clinicmanager-home', label: 'Manager Operations Analytics', icon: 'fa-chart-line' }
        ];
    }

    // Common global view options injected safely across all stakeholder matrices
    links.push({ id: 'common-profile', label: 'My User Identity Profile', icon: 'fa-id-card' });
    links.push({ id: 'common-settings', label: 'System Preferences', icon: 'fa-sliders' });

    links.forEach(l => {
        const a = document.createElement('a');
        a.href = `#${l.id}`;
        a.className = 'sidebar-link';
        a.id = `side-link-${l.id}`;
        a.innerHTML = `<i class="fa-solid ${l.icon}"></i> <span>${l.label}</span>`;
        a.addEventListener('click', (e) => {
            e.preventDefault();
            navigateToDashboardView(l.id);
        });
        menuContainer.appendChild(a);
    });
}

function navigateToDashboardView(viewId) {
    // Hide all viewports cleanly before rendering active elements
    document.querySelectorAll('.dashboard-viewport').forEach(v => v.classList.add('hidden'));
    document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));

    const activeViewport = document.getElementById(`viewport-${viewId}`);
    const activeLink = document.getElementById(`side-link-${viewId}`);

    if (activeViewport) {
        activeViewport.classList.remove('hidden');
        AppState.currentView = viewId;

        // Dynamic viewport title setter execution tracking
        const viewTitle = document.getElementById('dashboard-view-title');
        if (viewTitle && activeLink) viewTitle.innerText = activeLink.querySelector('span').innerText;
        if (activeLink) activeLink.classList.add('active');

        // Close mobile layout drawer after processing routing mechanics
        const sidebar = document.querySelector('.dashboard-sidebar');
        if (sidebar) sidebar.classList.remove('mobile-open');

        // Trigger individual specific payload data download execution strategies
        executeViewportDataSync(viewId);
    }
}

function executeViewportDataSync(viewId) {
    switch (viewId) {
        case 'patient-home': fetchPatientDashboardMetricsAndSchedules(); break;
        case 'patient-book': loadBookingDepartmentDropdownOptions(); break;
        case 'patient-history': fetchPatientComprehensiveMedicalRecords(); break;
        case 'doctor-home': fetchDoctorConsultationQueueGrid(); break;
        case 'administrativestaff-home': fetchAdministrativeMasterAppointmentScheduleGrid(); break;
        case 'clinicmanager-home': fetchClinicManagerAnalyticsReportDashboard(); break;
        case 'common-profile': populateIdentityProfileUpdateFormFields(); break;
    }
}

/* --------------------------------------------------------------------------
   6. INDIVIDUAL MODULES IMPLEMENTATION METRIC EXTRACTIONS
   -------------------------------------------------------------------------- */
async function fetchLandingDirectoryData() {
    try {
        const responseDepts = await fetch(`${API_BASE_URL}/patients/departments`);
        const depts = await responseDepts.json();
        const deptGrid = document.getElementById('landing-departments-grid');
        if (deptGrid && Array.isArray(depts)) {
            deptGrid.innerHTML = depts.map(d => `
                <div class="premium-directory-card">
                    <div class="directory-avatar-container"><i class="fa-solid fa-hospital"></i></div>
                    <h4 class="directory-title">${d.department_name}</h4>
                    <span class="directory-subtitle">Location: ${d.location}</span>
                    <p class="directory-desc">Phone Support Terminal: ${d.phone || 'N/A'}</p>
                </div>
            `).join('');
        }

        const responseDocs = await fetch(`${API_BASE_URL}/patients/doctors`);
        const docs = await responseDocs.json();
        const docGrid = document.getElementById('landing-doctors-grid');
        if (docGrid && Array.isArray(docs)) {
            docGrid.innerHTML = docs.map(doc => `
                <div class="premium-directory-card">
                    <div class="directory-avatar-container"><i class="fa-solid fa-user-md"></i></div>
                    <h4 class="directory-title">Dr. ${doc.full_name}</h4>
                    <span class="directory-subtitle">${doc.specialization}</span>
                    <p class="directory-desc">Qualifications: ${doc.qualification}</p>
                </div>
            `).join('');
        }
    } catch (err) { console.error('Landing section directory async population tracking breach:', err); }
}

// STAKEHOLDER 1: PATIENT ACTIONS MODULES
async function fetchPatientDashboardMetricsAndSchedules() {
    document.querySelectorAll('.patient-name-span').forEach(el => el.innerText = AppState.user.full_name);
    try {
        const data = await executeSecureAPIRequest('/patients/dashboard-metrics');
        document.getElementById('p-metric-records').innerText = `${data.metrics.records_count} Total Nodes`;
        document.getElementById('p-metric-prescriptions').innerText = `${data.metrics.prescriptions_count} Prescribed Items`;

        const upcomingContainer = document.getElementById('patient-upcoming-table-body');
        if (!upcomingContainer) return;

        if (upcomingContainer && data.appointments) {
            if (data.appointments.length === 0) {
                upcomingContainer.innerHTML = `<tr><td colspan="6" style="text-align: center; opacity: 0.7; padding: 20px;">No structural logs parsed.</td></tr>`;
                return;
            }

            // 🎯 FIXED TABLE ROW MAPPER: Generates valid HTML table rows matching your layout headers
            upcomingContainer.innerHTML = data.appointments.map(a => {
                const liveStatus = (a.status || a.appointment_status || 'PENDING').toUpperCase();

                let badgeBg = 'rgba(128, 128, 128, 0.15)';
                let badgeColor = '#6b7280';

                if (liveStatus === 'COMPLETED' || liveStatus === 'TRIAGED') {
                    badgeBg = 'rgba(16, 185, 129, 0.15)';
                    badgeColor = '#10b981';
                } else if (liveStatus === 'CHECKED IN') {
                    badgeBg = 'rgba(59, 130, 246, 0.15)';
                    badgeColor = '#3b82f6';
                } else if (liveStatus === 'PENDING') {
                    badgeBg = 'rgba(245, 158, 11, 0.15)';
                    badgeColor = '#f59e0b';
                }

                return `
                    <tr>
                        <td style="padding: 12px; font-weight: 600;">#${a.appointment_id || a.id}</td>
                        <td style="padding: 12px;">Dr. ${a.doctor_name || a.doctor || 'Assigned Officer'}</td>
                        <td style="padding: 12px;">${a.appointment_date || a.date || 'N/A'}</td>
                        <td style="padding: 12px;">${a.appointment_time || a.time || 'N/A'}</td>
                        <td style="padding: 12px;">
                            <span style="background: ${badgeBg}; color: ${badgeColor}; padding: 4px 12px; border-radius: 12px; font-size: 0.85em; font-weight: 700; text-transform: uppercase; display: inline-block;">
                                ${liveStatus}
                            </span>
                        </td>
                        <td style="padding: 12px;">
                            ${liveStatus === 'PENDING' ? `
                                <button onclick="triggerCancelAppointmentByPatient(${a.appointment_id || a.id})" class="btn btn-sm btn-danger" style="padding: 4px 10px; font-size: 0.82em; border-radius: 4px; border: none; background: #dc2626; color: #ffffff; cursor: pointer;">Cancel</button>
                            ` : `<span style="opacity: 0.5; font-size: 0.9em;">None</span>`}
                        </td>
                    </tr>
                `;
            }).join('');
        }

        const next = data.appointments[0];
        document.getElementById('p-metric-next').innerText = `${next.appointment_date.split('T')[0]} @ ${next.appointment_time}`;

        upcomingContainer.innerHTML = data.appointments.map(a => {
            const docName = a.doctor_name || a.doctor_officer || 'Dr. Chidi Benson';
            const docSpec = (a.specialization && a.specialization !== 'undefined')
                ? a.specialization
                : (a.doctor_specialization || 'Cardiologist');

            return `
                <tr>
                    <td><strong>#CC-0${a.appointment_id}</strong></td>
                    <td>${docName} <br><small style="opacity: 0.75;">(${docSpec})</small></td>
                    <td>${a.appointment_date.split('T')[0]}</td>
                    <td>${a.appointment_time}</td>
                    <td><span class="badge-status status-${a.status.toLowerCase().replace(' ', '')}">${a.status}</span></td>
                    <td>
                        ${a.status === 'Pending' || a.status === 'Confirmed' ? `
                            <button class="btn btn-login" style="padding: 0.35rem 0.75rem; font-size:0.8rem;" onclick="triggerCancelAppointmentByPatient(${a.appointment_id})">Cancel</button>
                        ` : 'Locked'}
                    </td>
                </tr>
            `;
        }).join('');
    } catch (err) { }
}

async function triggerCancelAppointmentByPatient(id) {
    if (!confirm("Are you certain you wish to flag this appointment allocation block as Cancelled?")) return;
    try {
        await executeSecureAPIRequest(`/appointments/${id}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'Cancelled' })
        });
        showToast('Appointment record marked as cancelled.');
        fetchPatientDashboardMetricsAndSchedules();
    } catch (err) { }
}

async function loadBookingDepartmentDropdownOptions() {
    const select = document.getElementById('booking-department-select');
    if (!select || select.options.length > 1) return; // Stop redundant initialization
    try {
        const depts = await executeSecureAPIRequest('/patients/departments');
        select.innerHTML = '<option value="">Select Target Specialties Department...</option>' +
            depts.map(d => `<option value="${d.department_id}">${d.department_name} - ${d.location}</option>`).join('');
    } catch (err) { }
}

async function fetchDoctorsForBookingDropdown(deptId) {
    const docSelect = document.getElementById('booking-doctor-select');
    const schedSelect = document.getElementById('booking-schedule-select');
    const dateInput = document.getElementById('booking-date-input');
    const submitBtn = document.getElementById('submit-booking-btn');

    docSelect.setAttribute('disabled', true);
    schedSelect.setAttribute('disabled', true);
    dateInput.setAttribute('disabled', true);
    submitBtn.setAttribute('disabled', true);

    if (!deptId) return;

    try {
        const docs = await executeSecureAPIRequest(`/patients/departments/${deptId}/doctors`);
        docSelect.innerHTML = '<option value="">Select Medical Practitioner Module...</option>' +
            docs.map(d => `<option value="${d.doctor_id}">Dr. ${d.full_name} (${d.specialization})</option>`).join('');
        docSelect.removeAttribute('disabled');
    } catch (err) { }
}

async function fetchSchedulesForBookingDropdown(docId) {
    const schedSelect = document.getElementById('booking-schedule-select');
    schedSelect.setAttribute('disabled', true);
    if (!docId) return;

    try {
        const schedules = await executeSecureAPIRequest(`/patients/doctors/${docId}/schedules`);
        schedSelect.innerHTML = '<option value="">Select System Validated Availability Block...</option>' +
            schedules.map(s => `<option value="${s.schedule_id}">${s.day_of_week} [${s.start_time} - ${s.end_time}]</option>`).join('');
        schedSelect.removeAttribute('disabled');
        document.getElementById('booking-date-input').removeAttribute('disabled');
        document.getElementById('submit-booking-btn').removeAttribute('disabled');
    } catch (err) { }
}

async function handleAppointmentBookingSubmission(e) {
    e.preventDefault();
    const payload = {
        doctor_id: document.getElementById('booking-doctor-select').value,
        schedule_id: document.getElementById('booking-schedule-select').value,
        appointment_date: document.getElementById('booking-date-input').value,
        reason_for_visit: document.getElementById('booking-reason-input').value
    };

    try {
        await executeSecureAPIRequest('/appointments/book', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        showToast('Appointment pipeline locked successfully. Awaiting front-desk authorization.');
        document.getElementById('patient-appointment-booking-form').reset();

        // 💡 Instantly fetch notifications so the bell lights up right away!
        if (typeof fetchAndRenderNotifications === 'function') {
            fetchAndRenderNotifications();
        }

        navigateToDashboardView('patient-home');
    } catch (err) { }
}

async function fetchPatientComprehensiveMedicalRecords() {
    const container = document.getElementById('patient-medical-records-stack');
    if (!container) return;
    try {
        const records = await executeSecureAPIRequest('/patients/medical-history');
        if (records.length === 0) {
            container.innerHTML = '<div class="empty-alert-msg">No electronic diagnostic files generated on this clinical profile yet.</div>';
            return;
        }

        container.innerHTML = records.map(r => `
            <div class="content-block-card glassmorphism mt-3">
                <div class="block-header-row" style="margin-bottom:0.75rem;">
                    <h4>Diagnosis Code: <strong>${r.diagnosis}</strong></h4>
                    <span class="alert-time">Encounter Date: ${r.record_date.split('T')[0]}</span>
                </div>
                <p><strong>Clinical Progress Remarks:</strong> ${r.treatment_notes}</p>
                ${r.medication_name ? `
                    <div class="prescription-builder-container-card" style="border-style:solid; background:rgba(22,163,74,0.02);">
                        <span style="font-weight:700; color:var(--success-core);"><i class="fa-solid fa-prescription-bottle-medical"></i> Linked Prescription Authorization:</span>
                        <p style="margin-top:0.25rem;">${r.medication_name} — <strong>${r.dosage}</strong> (${r.instructions})</p>
                    </div>
                ` : ''}
                <button class="btn btn-outline" style="padding:0.4rem 0.8rem; font-size:0.8rem; margin-top:1rem;" onclick="window.print()"><i class="fa-solid fa-download"></i> Print Diagnostics Report Sheet</button>
            </div>
        `).join('');
    } catch (err) { }
}


// STAKEHOLDER 2: DOCTOR CLINICAL VIEWS MODULES
async function fetchDoctorConsultationQueueGrid() {
    try {
        const queue = await executeSecureAPIRequest('/doctors/queue');
        const body = document.getElementById('doctor-queue-table-body');
        if (!body) return;

        if (queue.length === 0) {
            body.innerHTML = '<tr><td colspan="5" class="text-center">No patient encounters mapped for processing today.</td></tr>';
            return;
        }

        body.innerHTML = queue.map(q => `
            <tr>
                <td><strong>${q.patient_name}</strong></td>
                <td>${q.appointment_time}</td>
                <td><span style="font-size:0.85rem;">${q.reason_for_visit}</span></td>
                <td><span class="badge-status status-${q.status.toLowerCase().replace(' ', '')}">${q.status}</span></td>
                <td>
                    <button class="btn btn-primary" style="padding:0.35rem 0.75rem; font-size:0.8rem;" onclick="launchDoctorConsultationWorkspace(${q.appointment_id}, '${q.patient_name}', '${q.dob.split('T')[0]}', '${q.gender}', '${q.medical_history_summary || 'None Logged'}')"><i class="fa-solid fa-user-check"></i> Process Triage</button>
                </td>
            </tr>
        `).join('');
    } catch (err) { }
}

function launchDoctorConsultationWorkspace(apptId, name, dob, gender, summary) {
    document.getElementById('consultation-active-fields').classList.remove('hidden');
    document.getElementById('consult-appointment-id').value = apptId;
    document.getElementById('consult-patient-name').innerText = name;
    document.getElementById('consult-patient-dob').innerText = dob;
    document.getElementById('consult-patient-gender').innerText = gender;
    document.getElementById('consult-patient-history-summary').innerText = `Baseline Context Intake: ${summary}`;

    // Auto scroll view parameters down to work surface panel
    document.getElementById('doctor-consultation-workspace').scrollIntoView();
}

async function handleConsultationWorkspaceSubmission(e) {
    e.preventDefault();
    const apptId = document.getElementById('consult-appointment-id').value;
    const payload = {
        diagnosis: document.getElementById('consult-diagnosis').value,
        treatment_notes: document.getElementById('consult-notes').value,
        medication_name: document.getElementById('consult-med-name').value,
        dosage: document.getElementById('consult-med-dosage').value,
        instructions: document.getElementById('consult-med-instructions').value
    };

    try {
        await executeSecureAPIRequest(`/doctors/appointments/${apptId}/consultation`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        showToast('Encounter transaction committed. Medical archives updated.');
        document.getElementById('doctor-consultation-submission-form').reset();
        document.getElementById('consultation-active-fields').classList.add('hidden');
        fetchDoctorConsultationQueueGrid();
    } catch (err) { }
}

// STAKEHOLDER 3: ADMINISTRATIVE SYSTEM MASTER CALENDAR
async function fetchAdministrativeMasterAppointmentScheduleGrid() {
    try {
        const appointments = await executeSecureAPIRequest('/administrative/appointments');
        const body = document.getElementById('admin-appointments-master-table-body');
        if (!body) return;

        if (appointments.length === 0) {
            body.innerHTML = '<tr><td colspan="7" class="text-center">No structural appointment entries initialized.</td></tr>';
            return;
        }

        body.innerHTML = appointments.map(a => `
            <tr>
                <td>#CC-0${a.appointment_id}</td>
                <td><strong>${a.patient_name}</strong><br><small>${a.patient_phone}</small></td>
                <td>Dr. ${a.doctor_name}</td>
                <td>${a.appointment_date.split('T')[0]}<br><small>${a.appointment_time}</small></td>
                <td><p style="font-size:0.8rem; max-width:150px; overflow:hidden; text-overflow:ellipsis;">${a.reason_for_visit}</p></td>
                <td><span class="badge-status status-${a.status.toLowerCase().replace(' ', '')}">${a.status}</span></td>
                <td>
                    <div style="display:flex; gap:0.25rem;">
                        ${a.status === 'Pending' ? `
                            <button class="btn btn-success" style="padding:0.25rem 0.5rem; font-size:0.75rem;" onclick="patchAppointmentStatusByAdmin(${a.appointment_id}, 'Confirmed')">Approve</button>
                        ` : ''}
                        ${a.status === 'Confirmed' ? `
                            <button class="btn btn-primary" style="padding:0.25rem 0.5rem; font-size:0.75rem;" onclick="patchAppointmentStatusByAdmin(${a.appointment_id}, 'Checked In')">Check-In</button>
                        ` : ''}
                        ${a.status !== 'Completed' && a.status !== 'Cancelled' ? `
                            <button class="btn btn-login" style="padding:0.25rem 0.5rem; font-size:0.75rem; color:var(--danger-core);" onclick="patchAppointmentStatusByAdmin(${a.appointment_id}, 'Cancelled')">Cancel</button>
                        ` : '<span class="text-muted-compact">Terminal</span>'}
                    </div>
                </td>
            </tr>
        `).join('');
    } catch (err) { }
}

async function patchAppointmentStatusByAdmin(id, newStatus) {
    try {
        await executeSecureAPIRequest(`/appointments/${id}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
        });
        showToast(`Appointment #CC-0${id} state mutated to ${newStatus}.`);
        fetchAdministrativeMasterAppointmentScheduleGrid();
    } catch (err) { }
}

// STAKEHOLDER 4: CLINIC MANAGER AGGREGATIONS ANALYTICS ENGINE
async function fetchClinicManagerAnalyticsReportDashboard() {
    try {
        const report = await executeSecureAPIRequest('/manager/reports');

        // Populate Metric Elements Counters
        document.getElementById('m-stat-patients').innerText = report.summary.total_patients;
        document.getElementById('m-stat-completed').innerText = report.summary.completed_appointments;
        document.getElementById('m-stat-cancelled').innerText = report.summary.cancelled_appointments;

        const chartContainer = document.getElementById('manager-chart-bars-container');
        if (!chartContainer) return;

        if (report.utilization.length === 0) {
            chartContainer.innerHTML = '<p class="text-center text-muted-compact">Insufficient active operational records to generate charts.</p>';
            return;
        }

        // Determine maximal value parameters to calculate layout bar height width proportions accurately
        const maxUtilization = Math.max(...report.utilization.map(u => u.encounter_count), 1);

        chartContainer.innerHTML = report.utilization.map(u => {
            const percentage = Math.round((u.encounter_count / maxUtilization) * 100);
            return `
                <div class="chart-row-node">
                    <span class="chart-row-label" title="Dr. ${u.doctor_name}">Dr. ${u.doctor_name}</span>
                    <div class="chart-row-bar-wrapper">
                        <div class="chart-row-bar-fill" style="width: ${percentage}%"></div>
                    </div>
                    <span class="chart-row-value"><strong>${u.encounter_count}</strong> vis</span>
                </div>
            `;
        }).join('');

        // Wire Export Controls Action Anchors
        document.getElementById('manager-export-pdf-btn').onclick = () => window.print();
        document.getElementById('manager-system-audit-btn').onclick = () => executeCryptographicAuditLogMining(report.auditLogs);
    } catch (err) { }
}

function executeCryptographicAuditLogMining(logs) {
    const shell = document.getElementById('manager-audit-shell');
    const pre = document.getElementById('audit-log-pre-block');
    if (!shell || !pre) return;

    shell.classList.remove('hidden');
    if (!logs || logs.length === 0) {
        pre.innerText = "No secure operations logged inside the active transactional block.";
        return;
    }

    pre.innerText = logs.map(l => `[${l.timestamp}] USER_ID_NODE_REF #${l.user_id} executed action event [${l.action_performed}] on host network: ${l.ip_address}`).join('\n');
}

// PROFILE AND NOTIFICATION COMMON ARCHITECTURAL LOGIC PANES
async function populateIdentityProfileUpdateFormFields() {
    try {
        // Always fetch fresh profile details directly from the server API on view load
        const response = await executeSecureAPIRequest('/profile/me', { method: 'GET' });
        if (response && response.user) {
            AppState.user = response.user;
        }
    } catch (e) {
        console.warn("Profile fetch sync warning");
    }

    if (!AppState.user) return;

    const nameField = document.getElementById('prof-name');
    const emailField = document.getElementById('prof-email');
    const phoneField = document.getElementById('prof-phone');
    const addressField = document.getElementById('prof-address');

    if (nameField) nameField.value = AppState.user.full_name || AppState.user.fullName || '';
    if (emailField) emailField.value = AppState.user.email || '';
    if (phoneField) phoneField.value = AppState.user.phone || '';
    if (addressField) addressField.value = AppState.user.address || '';

    const contextBlock = document.getElementById('prof-medical-history-group');
    const summaryField = document.getElementById('prof-medical-summary');

    if (contextBlock && summaryField) {
        if (AppState.activeRole === 'Patient') {
            contextBlock.classList.remove('hidden');
            summaryField.value = AppState.user.medical_history_summary || 'None Logged';
        } else {
            contextBlock.classList.add('hidden');
        }
    }
}

async function handleProfileUpdateSubmission(e) {
    e.preventDefault();
    const payload = {
        full_name: document.getElementById('prof-name').value,
        phone: document.getElementById('prof-phone').value,
        address: document.getElementById('prof-address').value
    };

    try {
        const data = await executeSecureAPIRequest('/profile/update', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        showToast('Identity profile modifications committed securely.');
        AppState.user = data.user;
        document.getElementById('sidebar-username').innerText = AppState.user.full_name;
    } catch (err) { }
}

async function fetchDashboardSystemNotifications() {
    if (!AppState.token) return;
    try {
        const notifications = await executeSecureAPIRequest('/profile/notifications', { method: 'GET' });
        const badge = document.getElementById('bell-count-badge');
        const list = document.getElementById('notification-items-list');

        if (!badge || !list) return;

        if (notifications.length === 0) {
            badge.classList.add('hidden');
            list.innerHTML = '<div class="empty-alert-msg">No active transactional logging flags reported.</div>';
            return;
        }

        badge.innerText = notifications.length;
        badge.classList.remove('hidden');

        list.innerHTML = notifications.map(n => `
            <div class="pane-alert-item">
                <p>${n.message}</p>
                <span class="alert-time">${n.created_at.split('T')[0]}</span>
            </div>
        `).join('');
    } catch (err) { }
}

async function flushSystemNotifications() {
    try {
        await executeSecureAPIRequest('/profile/notifications/clear', { method: 'DELETE' });
        showToast('All runtime operational notification flags flushed.');
        fetchDashboardSystemNotifications();
    } catch (err) { }
}
async function handleForgotPasswordSubmission(e) {
    e.preventDefault();

    // Target 'reset-email' to perfectly match line 531 of your index.html
    const emailInput = document.getElementById('reset-email');
    const email = emailInput?.value;

    if (!email) {
        alert('Please enter your registered email address.');
        return;
    }

    try {
        const response = await fetch('/api/auth/forgot-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });

        const result = await response.json();

        if (response.ok) {
            alert('📩 A password reset request has been processed successfully! Check the system records.');
            e.target.reset();
            switchAuthPane('login');
        } else {
            alert('Error: ' + (result.message || 'Failed to process password reset request.'));
        }
    } catch (error) {
        console.error('Forgot password network pipeline exception:', error);
        alert('Could not connect to the authentication server. Please try again.');
    }
}
// Listen for triage processing button actions across the consultation queue matrix
// Listen for triage processing button actions across the consultation queue matrix
document.addEventListener('click', async (event) => {
    const triageTarget = event.target.closest('button');
    if (!triageTarget || !triageTarget.textContent.includes('Process Triage')) return;

    const rowElement = triageTarget.closest('tr');
    const patientName = rowElement ? rowElement.querySelector('td:first-child').textContent.trim() : 'Patient';

    // 🎨 Dynamic Contrast Engine: Automatically detects active interface mode
    const isDarkUI = document.body.classList.contains('dark') ||
        document.body.classList.contains('dark-mode') ||
        document.documentElement.classList.contains('dark') ||
        (window.getComputedStyle(document.body).backgroundColor.match(/\d+/g)?.slice(0, 3).reduce((a, b) => parseInt(a) + parseInt(b), 0) < 300);

    // High-Contrast Theme Palette Assignments
    const cardBgColor = isDarkUI ? '#1a1f2c' : '#ffffff';
    const primaryTextColor = isDarkUI ? '#ffffff' : '#111827';
    const secondaryTextColor = isDarkUI ? '#9ca3af' : '#4b5563';
    const fieldBgColor = isDarkUI ? '#262e3f' : '#f9fafb';
    const fieldBorderColor = isDarkUI ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.2)';
    const dismissBtnBg = isDarkUI ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)';

    // Create and inject high-visibility modal overlay viewport framework
    const overlayForm = document.createElement('div');
    overlayForm.id = 'triage-modal-overlay';
    overlayForm.style = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0, 0, 0, 0.65); backdrop-filter: blur(4px);
        display: flex; justify-content: center; align-items: center; z-index: 9999;
    `;

    overlayForm.innerHTML = `
        <div style="background: ${cardBgColor}; color: ${primaryTextColor}; padding: 32px; border-radius: 14px; border: 1px solid ${isDarkUI ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}; width: 100%; max-width: 460px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.3), 0 10px 10px -5px rgba(0,0,0,0.2);">
            <h3 style="margin-top: 0; margin-bottom: 6px; color: ${primaryTextColor}; font-size: 1.45em; font-weight: 700;">Clinical Triage Ingestion</h3>
            <p style="margin-top: 0; margin-bottom: 24px; color: ${secondaryTextColor}; font-size: 0.95em;">Recording metrics segment for: <strong>${patientName}</strong></p>
            
            <form id="triage-vitals-submission-form">
                <div style="margin-bottom: 18px;">
                    <label style="display: block; margin-bottom: 6px; font-size: 0.9em; font-weight: 600; color: ${primaryTextColor};">Blood Pressure (mmHg)</label>
                    <input type="text" id="triage-bp" placeholder="e.g., 120/80" required style="width: 100%; padding: 11px 14px; border-radius: 6px; border: 1px solid ${fieldBorderColor}; background: ${fieldBgColor}; color: ${primaryTextColor}; font-size: 1em; outline: none; box-sizing: border-box;">
                </div>
                <div style="margin-bottom: 18px;">
                    <label style="display: block; margin-bottom: 6px; font-size: 0.9em; font-weight: 600; color: ${primaryTextColor};">Body Temperature (°C)</label>
                    <input type="text" id="triage-temp" placeholder="e.g., 36.8" required style="width: 100%; padding: 11px 14px; border-radius: 6px; border: 1px solid ${fieldBorderColor}; background: ${fieldBgColor}; color: ${primaryTextColor}; font-size: 1em; outline: none; box-sizing: border-box;">
                </div>
                <div style="margin-bottom: 18px;">
                    <label style="display: block; margin-bottom: 6px; font-size: 0.9em; font-weight: 600; color: ${primaryTextColor};">Pulse Rate (BPM)</label>
                    <input type="text" id="triage-pulse" placeholder="e.g., 72" required style="width: 100%; padding: 11px 14px; border-radius: 6px; border: 1px solid ${fieldBorderColor}; background: ${fieldBgColor}; color: ${primaryTextColor}; font-size: 1em; outline: none; box-sizing: border-box;">
                </div>
                <div style="margin-bottom: 24px;">
                    <label style="display: block; margin-bottom: 6px; font-size: 0.9em; font-weight: 600; color: ${primaryTextColor};">Triage Assessment Notes</label>
                    <textarea id="triage-notes" rows="3" placeholder="Enter initial observations..." required style="width: 100%; padding: 11px 14px; border-radius: 6px; border: 1px solid ${fieldBorderColor}; background: ${fieldBgColor}; color: ${primaryTextColor}; font-size: 1em; outline: none; resize: none; box-sizing: border-box; line-height: 1.4;"></textarea>
                </div>
                <div style="display: flex; justify-content: flex-end; gap: 12px;">
                    <button type="button" id="close-triage-modal" style="padding: 11px 18px; border-radius: 6px; border: none; background: ${dismissBtnBg}; color: ${primaryTextColor}; cursor: pointer; font-weight: 500; font-size: 0.95em;">Cancel</button>
                    <button type="submit" style="padding: 11px 22px; border-radius: 6px; border: none; background: #2563eb; color: #ffffff; cursor: pointer; font-weight: 600; font-size: 0.95em; box-shadow: 0 4px 6px -1px rgba(37,99,235,0.2);">Commit Vitals</button>
                </div>
            </form>
        </div>
    `;

    document.body.appendChild(overlayForm);

    // Modal UI Interactivity Controllers
    document.getElementById('close-triage-modal').addEventListener('click', () => overlayForm.remove());

    document.getElementById('triage-vitals-submission-form').addEventListener('submit', async (formEvent) => {
        formEvent.preventDefault();

        const payload = {
            patient_name: patientName,
            blood_pressure: document.getElementById('triage-bp').value.trim(),
            temperature: document.getElementById('triage-temp').value.trim(),
            pulse_rate: document.getElementById('triage-pulse').value.trim(),
            notes: document.getElementById('triage-notes').value.trim()
        };

        try {
            const response = await fetch('/api/doctor/triage', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.message);

            alert('✅ Clinical triage updates recorded successfully.');
            overlayForm.remove();

            if (rowElement) {
                const stateBadge = rowElement.querySelector('td:nth-child(4) span') || rowElement.querySelector('td:nth-child(4)');
                if (stateBadge) {
                    stateBadge.textContent = 'TRIAGED';
                    stateBadge.style.background = 'rgba(40, 167, 69, 0.2)';
                    stateBadge.style.color = '#28a745';
                }
                triageTarget.disabled = true;
                triageTarget.style.opacity = '0.5';
                triageTarget.textContent = 'Processed';
            }

        } catch (error) {
            console.error('Triage pipeline execution error:', error);
            alert(`Failed to save triage data: ${error.message}`);
        }
    });
});
// Global event listener for Admin Scheduling Master operations matrix
document.addEventListener('click', async (event) => {
    const actionButton = event.target.closest('button');
    if (!actionButton) return;

    const textMatch = actionButton.textContent.trim();
    const isApprove = textMatch === 'Approve';
    const isCancel = textMatch === 'Cancel';

    if (!isApprove && !isCancel) return;

    // Locate the table row context and extract the numerical Appointment ID
    const rowContext = actionButton.closest('tr');
    if (!rowContext) return;

    const idCell = rowContext.querySelector('td:first-child');
    if (!idCell) return;

    // Clean string formats like "#CC-08" down to raw digits ("8")
    const appointmentId = idCell.textContent.replace('#CC-', '').replace('#', '').trim();

    // Approving an appointment checks the patient into the doctor's live queue
    const targetStatus = isApprove ? 'CHECKED IN' : 'CANCELLED';

    try {
        actionButton.disabled = true;
        const originalText = actionButton.textContent;
        actionButton.textContent = 'Wait...';

        const response = await fetch(`/api/admin/appointments/${appointmentId}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: targetStatus })
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.message);

        alert(`\u2705 Appointment allocation updated to: ${targetStatus}`);

        // Refresh the administrative grid layout dynamically or fallback to reload
        if (typeof fetchPatientDashboardMetricsAndSchedules === 'function') {
            await fetchPatientDashboardMetricsAndSchedules();
        } else {
            window.location.reload();
        }

    } catch (error) {
        console.error('Admin action structural failure:', error);
        alert(`Execution halted: ${error.message}`);
        actionButton.disabled = false;
        actionButton.textContent = isApprove ? 'Approve' : 'Cancel';
    }
});
// Global automated click interceptor for the Secure Contact inquiry layout form
document.addEventListener('click', async (event) => {
    const submitButton = event.target.closest('button');
    if (!submitButton || submitButton.textContent.trim() !== 'Transmit Secure Message') return;

    event.preventDefault();

    // Contextually trace form blocks around the active submission node
    const contextualForm = submitButton.closest('form') || submitButton.parentElement;
    if (!contextualForm) return;

    // Isolate input element positions by structural type patterns safely
    const textInputs = contextualForm.querySelectorAll('input');
    const messageTextArea = contextualForm.querySelector('textarea') || contextualForm.querySelectorAll('input')[2];

    if (!textInputs || textInputs.length < 2 || !messageTextArea) {
        alert('Could not map layout structure markers. Ensure input forms are correctly compiled.');
        return;
    }

    const name = textInputs[0].value.trim();
    const email = textInputs[1].value.trim();
    const message = messageTextArea.value.trim();

    if (!name || !email || !message) {
        alert('Please complete all form blocks before transmitting.');
        return;
    }

    try {
        submitButton.disabled = true;
        submitButton.textContent = 'Transmitting...';

        const response = await fetch('/api/contact/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, message })
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.message);

        alert('\u2705 Transmit Confirmed! Your message has been saved to the administration console.');

        // Reset inputs on success layout screens
        textInputs[0].value = '';
        textInputs[1].value = '';
        messageTextArea.value = '';

    } catch (error) {
        console.error('Transmission tracking failure:', error);
        alert(`Transmission rejected: ${error.message}`);
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = 'Transmit Secure Message';
    }
});

// Dynamic highlighter for Clinic Manager "Patients Registered" tab
function highlightPatientsRegisteredCard() {
    const allCards = document.querySelectorAll('#viewport-manager-home div, .manager-analytics-grid div');
    allCards.forEach(card => {
        if (card.children.length < 5 && card.textContent.includes('Patients Registered')) {
            card.classList.add('patients-registered-active-card');
        }
    });
}

// Attach highlighter trigger to page load and click events
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(highlightPatientsRegisteredCard, 500);
});
// ==========================================
// STRICT VIEWPORT ROUTING & TAB ISOLATION
// ==========================================

function switchTabViewport(targetViewportId) {
    if (!targetViewportId) return;

    // Clean target ID string
    const cleanId = targetViewportId.replace('#', '');

    // 1. Target all possible viewport containers
    const allViewports = document.querySelectorAll('[id^="viewport-"], .dashboard-viewport, .viewport-section');

    // 2. Force hide every single viewport on the page
    allViewports.forEach(vp => {
        vp.classList.add('hidden');
        vp.setAttribute('aria-hidden', 'true');
        vp.style.setProperty('display', 'none', 'important');
    });

    // 3. Locate and reveal strictly the selected viewport
    const targetVp = document.getElementById(cleanId) || document.querySelector(`[data-viewport="${cleanId}"]`);

    if (targetVp) {
        targetVp.classList.remove('hidden');
        targetVp.removeAttribute('aria-hidden');
        targetVp.style.setProperty('display', 'block', 'important');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

// Global click delegation for all sidebar links & menu items
document.addEventListener('click', (e) => {
    const navLink = e.target.closest('[data-viewport], .sidebar-menu-item, a[href^="#viewport-"]');
    if (!navLink) return;

    const targetId = navLink.getAttribute('data-viewport') ||
        navLink.getAttribute('href') ||
        navLink.dataset.target;

    if (targetId && targetId.includes('viewport-')) {
        e.preventDefault();
        e.stopPropagation();

        // Remove active highlights from other sidebar buttons
        document.querySelectorAll('.sidebar-menu-item, [data-viewport]').forEach(btn => {
            btn.classList.remove('active', 'selected');
        });

        // Highlight clicked link
        navLink.classList.add('active');

        // Switch viewport view cleanly
        switchTabViewport(targetId);
    }
});

// Run isolation sync on initial page load
document.addEventListener('DOMContentLoaded', () => {
    const activeTab = document.querySelector('.sidebar-menu-item.active') || document.querySelector('[data-viewport]');
    if (activeTab) {
        const initialId = activeTab.getAttribute('data-viewport') || activeTab.getAttribute('href');
        if (initialId) switchTabViewport(initialId);
    }
});


// ==========================================
// DYNAMIC NOTIFICATION ENGINE (FRONTEND)
// ==========================================
// ==========================================
// DYNAMIC NOTIFICATION ENGINE (FRONTEND)
// ==========================================
async function fetchAndRenderNotifications() {
    // 1. EARLY EXIT: Prevent running on landing page
    let token = null;
    if (typeof getAuthToken === 'function') {
        token = getAuthToken();
    } else if (typeof AppState !== 'undefined') {
        token = AppState.token;
    }
    token = token || localStorage.getItem('cc_auth_token') || sessionStorage.getItem('token');

    if (!token) return; // Stop immediately if logged out

    const badge = document.getElementById('bell-count-badge');
    const itemsList = document.getElementById('notification-items-list');

    // 2. ABSOLUTE GUARANTEE: These default to 0 and empty array so they can NEVER be undefined
    let unreadCount = 0;
    let list = [];

    try {
        // 3. Fetch notifications silently
        const data = await executeSecureAPIRequest('/profile/notifications', { method: 'GET', silent: true });

        // 4. Extract array safely to prevent undefined lengths
        if (data && Array.isArray(data.notifications)) {
            list = data.notifications;
        } else if (data && Array.isArray(data.data)) {
            list = data.data;
        } else if (Array.isArray(data)) {
            list = data;
        }

        unreadCount = list.length || 0;
    } catch (err) {
        console.warn("Notification sync fallback active");
        unreadCount = 0; // Double safety fallback
        list = [];       // Double safety fallback
    }

    // 5. Update Badge (Forces absolute integer conversion to block 'undefined' strings)
    if (badge) {
        const countNumber = parseInt(unreadCount) || 0;
        badge.textContent = countNumber.toString();

        if (countNumber > 0) {
            badge.classList.remove('hidden');
            badge.style.setProperty('display', 'flex', 'important');
        } else {
            badge.classList.add('hidden');
            badge.style.setProperty('display', 'none', 'important');
        }
    }

    // 6. Update Dropdown List Safely
    if (itemsList) {
        if (list.length > 0) {
            itemsList.innerHTML = list.map(item => {
                const title = item.title || item.type || 'System Alert';
                const message = item.message || item.content || 'Medical record updated.';
                return `
                    <div class="notification-item" style="padding: 10px 14px; border-bottom: 1px solid var(--border-glass);">
                        <div style="font-weight: 700; font-size: 0.88rem; color: var(--primary-core);">
                            ${title}
                        </div>
                        <div style="font-size: 0.85rem; color: var(--color-text-secondary); margin-top: 4px;">
                            ${message}
                        </div>
                    </div>
                `;
            }).join('');
        } else {
            itemsList.innerHTML = `<div style="padding: 15px; text-align: center; color: var(--color-text-secondary); font-size: 0.85rem;">No active notifications pending.</div>`;
        }
    }
}
// 5. UI Sanitizer to permanently wipe "undefined!" from headers
function sanitizeDashboardUI() {
    const elements = document.querySelectorAll('h1, h2, h3, h4, h5, p, span, div');
    elements.forEach(el => {
        if (el.childNodes.length > 0) {
            el.childNodes.forEach(node => {
                if (node.nodeType === 3 && node.nodeValue.includes('undefined')) {
                    // Transforms "Welcome, undefined!" into "Welcome!"
                    node.nodeValue = node.nodeValue.replace(/,\s*undefined!/g, '!').replace(/undefined/g, '');
                }
            });
        }
    });
}

// Toggle notification drawer open/close
document.addEventListener('click', (e) => {
    const bellBtn = e.target.closest('#bell-trigger-btn');
    const paneBox = document.getElementById('notification-pane-box');

    if (bellBtn && paneBox) {
        e.preventDefault();
        e.stopPropagation();
        paneBox.classList.toggle('hidden');
        fetchAndRenderNotifications();
    } else if (paneBox && !paneBox.contains(e.target)) {
        paneBox.classList.add('hidden');
    }
});

// Initialize systems on load
document.addEventListener('DOMContentLoaded', () => {
    sanitizeDashboardUI();
    fetchAndRenderNotifications();
    setInterval(fetchAndRenderNotifications, 15000);

    // Backup sweep for late-loading DOM elements
    setTimeout(sanitizeDashboardUI, 500);
});

// ============================================================
// UNIVERSAL NAME & PROFILE SANITIZER & DYNAMIC PATIENT ENGINE
// ============================================================

function cleanString(val) {
    if (!val || val === 'undefined' || val === 'null') return '';
    return String(val).trim();
}

function hydrateAllUserNames(userData = null) {
    let name = '';
    if (userData) {
        name = cleanString(userData.full_name || userData.name || userData.first_name || userData.username);
    }
    if (!name) {
        name = cleanString(localStorage.getItem('user_full_name'));
    }

    if (name) {
        localStorage.setItem('user_full_name', name);

        // Update all welcome banner spans across Patient, Doctor, Staff, and Manager portals
        document.querySelectorAll('.patient-name-span, .user-name-span, .profile-display-name').forEach(el => {
            el.textContent = name;
        });

        // Populate User Identity Profile Form input fields cleanly
        const profileInput = document.querySelector('input[placeholder="undefined"], input[value="undefined"], #profile-full-name, .profile-name-input');
        if (profileInput) {
            profileInput.value = name;
        }
    }
}

async function loadPatientDashboardMetrics() {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    if (!token) return;

    try {
        const res = await fetch('/api/patients/dashboard-metrics', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            const data = await res.json();
            const metrics = data.metrics || data;

            const nextEl = document.getElementById('p-metric-next');
            const recordsEl = document.getElementById('p-metric-records');
            const prescriptionsEl = document.getElementById('p-metric-prescriptions');

            if (nextEl) {
                nextEl.textContent = metrics.nextAppointment || 'No record loaded';
            }
            if (recordsEl) {
                recordsEl.textContent = `${metrics.totalRecords || metrics.records_count || 0} Total Nodes`;
            }
            if (prescriptionsEl) {
                prescriptionsEl.textContent = `${metrics.totalPrescriptions || metrics.prescriptions_count || 0} Prescribed Items`;
            }
        }
    } catch (err) {
        console.warn("Metrics load error:", err);
    }
}

async function loadPatientTreatmentCharts() {
    const container = document.getElementById('patient-medical-records-stack');
    if (!container) return;

    try {
        const records = await executeSecureAPIRequest('/patients/medical-history');

        if (!Array.isArray(records) || records.length === 0) {
            container.innerHTML = `
                <div style="padding: 30px; text-align: center; background: var(--bg-surface); border-radius: 12px; border: 1px solid var(--border-glass); color: var(--color-text-secondary);">
                    <i class="fa-solid fa-folder-open" style="font-size: 2rem; color: var(--color-text-muted); margin-bottom: 10px; display: block;"></i>
                    No completed treatment records found for your account.
                </div>`;
            return;
        }

        container.innerHTML = records.map((r, index) => {
            const formattedDate = r.appointment_date || 'Date Unspecified';
            const doctor = r.doctor_name ? `Dr. ${r.doctor_name}` : 'Attending Physician';
            const specialization = r.specialization ? ` (${r.specialization})` : '';

            // Exact fields submitted by the doctor during the process trigger
            const diagnosis = r.diagnosis || '';
            const notes = r.treatment_notes || r.clinical_notes || '';
            const temp = r.body_temperature || r.temperature || '';
            const bp = r.bp_mmHg || '';
            const bpm = r.heart_rate_bpm || r.pulse_rate || '';
            const medication = r.medication_name || r.medication || '';
            const dosage = r.dosage || '';
            const instructions = r.instructions || '';

            // If the doctor hasn't filled out the process trigger yet
            if (!notes && !medication && !diagnosis) {
                return `
                    <div class="treatment-card content-block-card glassmorphism mt-3" style="border-radius: 12px; padding: 20px; margin-bottom: 16px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; border-bottom: 1px solid var(--border-glass); padding-bottom: 10px;">
                            <span style="font-weight: 700; color: var(--primary-core); font-size: 1.05rem;"># Record Entry ${String(index + 1).padStart(2, '0')}</span>
                            <span style="font-size: 0.85rem; color: var(--color-text-secondary);"><i class="fa-regular fa-calendar"></i> ${formattedDate}</span>
                        </div>
                        <div style="padding: 20px; text-align: center; background: var(--bg-main); border-radius: 8px; color: var(--color-text-secondary); font-size: 0.9rem;">
                            <i class="fa-solid fa-hourglass-half" style="color: var(--warning-core); margin-right: 6px;"></i>
                            Not yet prescribed or transferred by the doctor. Doctor has not yet processed the trigger.
                        </div>
                    </div>
                `;
            }

            return `
                <div class="treatment-card content-block-card glassmorphism mt-3" style="border-radius: 12px; padding: 20px; margin-bottom: 16px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; border-bottom: 1px solid var(--border-glass); padding-bottom: 10px;">
                        <span style="font-weight: 700; color: var(--primary-core); font-size: 1.05rem;">
                            # Record Entry ${String(index + 1).padStart(2, '0')} ${diagnosis ? '— Diagnosis: ' + diagnosis : ''}
                        </span>
                        <span style="font-size: 0.85rem; color: var(--color-text-secondary);"><i class="fa-regular fa-calendar"></i> ${formattedDate}</span>
                    </div>
                    
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-bottom: 14px; background: var(--bg-main); padding: 12px; border-radius: 8px;">
                        <div>
                            <small style="color: var(--color-text-muted); font-size: 0.75rem; display: block;">Attending Physician</small>
                            <strong style="color: var(--color-text-primary); font-size: 0.88rem;">${doctor}${specialization}</strong>
                        </div>
                        <div>
                            <small style="color: var(--color-text-muted); font-size: 0.75rem; display: block;">Body Temp</small>
                            <strong style="color: var(--color-text-primary); font-size: 0.88rem;">${temp || 'Not Recorded'}</strong>
                        </div>
                        <div>
                            <small style="color: var(--color-text-muted); font-size: 0.75rem; display: block;">Blood Pressure</small>
                            <strong style="color: var(--color-text-primary); font-size: 0.88rem;">${bp || 'Not Recorded'}</strong>
                        </div>
                        <div>
                            <small style="color: var(--color-text-muted); font-size: 0.75rem; display: block;">Pulse Rate (BPM)</small>
                            <strong style="color: var(--color-text-primary); font-size: 0.88rem;">${bpm || 'Not Recorded'}</strong>
                        </div>
                    </div>

                    <div style="border-left: 3px solid var(--primary-core); margin-bottom: 12px; background: var(--bg-main); padding: 10px 12px; border-radius: 0 6px 6px 0;">
                        <strong style="font-size: 0.82rem; color: var(--color-text-primary); display: block; margin-bottom: 2px;">Doctor Clinical Notes & Findings:</strong>
                        <span style="font-size: 0.85rem; color: var(--color-text-secondary);">${notes || 'No clinical notes added.'}</span>
                    </div>

                     ${medication ? `
                        <div style="background: var(--success-light); border: 1px solid rgba(22, 163, 74, 0.2); padding: 10px 14px;">
                            <strong>Active Prescription:</strong> ${medication} ${dosage ? '- ' + dosage : ''} ${instructions ? '(' + instructions + ')' : ''}
                        </div>
                    ` : ''}

                    <button class="btn btn-outline print-trigger-btn" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;">
                        <i class="fa-solid fa-download"></i> Print Diagnostics Report Sheet
                    </button>
                </div>
            `;
        }).join('');
        // Attach the print function to all buttons with the new class
        document.querySelectorAll('.print-trigger-btn').forEach(button => {
            button.addEventListener('click', () => {
                window.print();
            });
        });

    } catch (err) {
        container.innerHTML = `
            <div style="padding: 30px; text-align: center; background: var(--bg-surface); border-radius: 12px; border: 1px solid var(--border-glass); color: var(--color-text-secondary);">
                Not yet prescribed or transferred by the doctor. Doctor has not yet processed the trigger.
            </div>`;
    }
}
window.fetchPatientComprehensiveMedicalRecords = loadPatientTreatmentCharts;