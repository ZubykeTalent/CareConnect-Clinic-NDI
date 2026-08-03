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
async function executeSecureAPIRequest(endpoint, options = {}) {
    setLoadingState(true);
    const url = `${API_BASE_URL}${endpoint}`;

    options.headers = options.headers || {};
    if (AppState.token) {
        options.headers['Authorization'] = `Bearer ${AppState.token}`;
    }

    try {
        const response = await fetch(url, options);
        const data = await response.json();
        setLoadingState(false);

        if (!response.ok) {
            throw new Error(data.message || `HTTP Execution Collision Error: Code ${response.status}`);
        }
        return data;
    } catch (err) {
        setLoadingState(false);
        showToast(err.message, 'danger');
        throw err;
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

    // Fallback selection system: attempts to read by specific IDs, falling back to basic input types
    const nameInput = document.getElementById('reg-fullname') || document.getElementById('fullname') || form.querySelector('input[type="text"]');
    const emailInput = document.getElementById('reg-email') || document.getElementById('email') || form.querySelector('input[type="email"]');
    const phoneInput = document.getElementById('reg-phone') || document.getElementById('phone') || form.querySelector('input[type="tel"]');
    const genderInput = document.getElementById('reg-gender') || document.getElementById('gender') || form.querySelector('select');
    const dobInput = document.getElementById('reg-dob') || document.getElementById('dob') || form.querySelector('input[type="date"]');
    const addressInput = document.getElementById('reg-address') || document.getElementById('address');
    const historyInput = form.querySelector('textarea') || document.getElementById('medical-history');

    // Create the data bundle to send to the backend
    const payload = {
        full_name: nameInput ? nameInput.value.trim() : '',
        email: emailInput ? emailInput.value.trim() : '',
        phone: phoneInput ? phoneInput.value.trim() : '',
        gender: genderInput ? genderInput.value : '',
        dob: dobInput ? dobInput.value : '',
        address: addressInput ? addressInput.value.trim() : '',
        medical_history_summary: historyInput ? historyInput.value.trim() : ''
    };

    // 🔍 This will let you inspect exactly what data JavaScript extracted in your browser console
    console.log("Data harvested by frontend submission script:", payload);

    try {
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (!response.ok) {
            alert(`Registration Error: ${result.message}`);
            return;
        }

        alert('Patient profile successfully registered!');
        form.reset(); // Clear form fields on success

    } catch (error) {
        console.error("Submission pipeline error:", error);
        alert("Could not connect to the authentication server. Please try again.");
    }
}
async function checkExistingSession() {
    if (!AppState.token) return;
    try {
        const data = await executeSecureAPIRequest('/profile/me', { method: 'GET' });
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

        if (data.appointments.length === 0) {
            upcomingContainer.innerHTML = '<tr><td colspan="6" class="text-center">No structural upcoming appointments allocated.</td></tr>';
            document.getElementById('p-metric-next').innerText = 'No records loaded';
            return;
        }

        const next = data.appointments[0];
        document.getElementById('p-metric-next').innerText = `${next.appointment_date.split('T')[0]} @ ${next.appointment_time}`;

        upcomingContainer.innerHTML = data.appointments.map(a => `
            <tr>
                <td><strong>#CC-0${a.appointment_id}</strong></td>
                <td>Dr. ${a.doctor_name} (${a.specialization})</td>
                <td>${a.appointment_date.split('T')[0]}</td>
                <td>${a.appointment_time}</td>
                <td><span class="badge-status status-${a.status.toLowerCase().replace(' ', '')}">${a.status}</span></td>
                <td>
                    ${a.status === 'Pending' || a.status === 'Confirmed' ? `
                        <button class="btn btn-login" style="padding: 0.35rem 0.75rem; font-size:0.8rem;" onclick="triggerCancelAppointmentByPatient(${a.appointment_id})"><i class="fa-solid fa-calendar-xmark"></i> Cancel</button>
                    ` : 'Locked'}
                </td>
            </tr>
        `).join('');
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
    document.getElementById('prof-name').value = AppState.user.full_name;
    document.getElementById('prof-email').value = AppState.user.email;
    document.getElementById('prof-phone').value = AppState.user.phone || '';
    document.getElementById('prof-address').value = AppState.user.address || '';

    const contextBlock = document.getElementById('prof-medical-history-group');
    if (AppState.activeRole === 'Patient') {
        contextBlock.classList.remove('hidden');
        document.getElementById('prof-medical-summary').value = AppState.user.medical_history_summary || 'None Logged';
    } else {
        contextBlock.classList.add('hidden');
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