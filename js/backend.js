/* ==========================================================================
   CARECONNECT ENTERPRISE CENTRAL BACKEND CORE SYSTEM BluePrint
   TECHNOLOGY STACK: NODE.JS | EXPRESS.JS | MYSQL2 POOLS | JWT RBAC SECURITY
   ========================================================================== */

const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const morgan = require('morgan');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { body, validationResult } = require('express-validator');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const cors = require('cors');
app.use(cors());
const DB_PORT = parseInt(process.env.DB_PORT) || 3306;
const JWT_SECRET = process.env.JWT_SECRET || 'CARECONNECT_SECURE_COMPLIANCE_TOKEN_CLUSTER_2026';

// Establish Local Sub-Directories Framework Repositories for Upload Chains
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

/* --------------------------------------------------------------------------
   1. GLOBAL SECURITY AND ROUTING ENGINE INNERWARE REGISTER
   -------------------------------------------------------------------------- */
app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                ...helmet.contentSecurityPolicy.getDefaultDirectives(),
                "img-src": ["'self'", "data:", "https://images.unsplash.com"],
            },
        },
    })
);
app.use(cors({ origin: '*' })); // Enforces broad local development mapping boundaries
app.use(express.json());
// Automatically serve your frontend files (index.html, css, js) from the root folder
app.use(express.static(path.join(__dirname, '..')));
app.use(morgan('dev'));
app.use('/uploads', express.static(uploadsDir));

// Connect to Local/Cloud MySQL Pool Container
const dbPool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'careconnect',
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 20000 // 20s timeout allows remote cloud DB time to complete handshake
});

// Capture background pool errors gracefully so Node.js process doesn't exit on connection blips
dbPool.on('error', (err) => {
    console.error("⚠️ MySQL Pool Connection Warning:", err.message);
});

// DIAGNOSTIC TOOL: Force the server to test the database connection on startup
dbPool.getConnection((err, connection) => {
    if (err) {
        console.error("❌ CLOUD DATABASE CONNECTION CRASHED:", err.message);
        console.error("❌ ERROR CODE:", err.code);
    } else {
        console.log("✅ CLOUD DATABASE CONNECTED SUCCESSFULLY!");
        connection.release();
    }
});
// Configure Multer Engine Instances for Profiling Image Persistences
const storageConfig = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => cb(null, `avatar_${Date.now()}${path.extname(file.originalname)}`)
});
const uploadEngine = multer({ storage: storageConfig });

async function authenticateBearerToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ success: false, message: 'Authorization cryptographic missing.' });
    }

    try {
        // Matches the exact fallback key used inside /api/auth/login (Line 281)
        const jwtSecret = process.env.JWT_SECRET || 'careconnect_fallback_secret_key_2026';
        const decryptedPayload = jwt.verify(token, jwtSecret);

        req.userContext = decryptedPayload;
        next();
    } catch (err) {
        console.error("JWT Verification Exception:", err.message);
        return res.status(403).json({ success: false, message: 'Token token verification failure.' });
    }
}

const restrictToRoles = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.userContext) {
            return res.status(401).json({ success: false, message: 'Authentication token missing.' });
        }

        const userRole = (req.userContext.role || req.userContext.role_name || '').toLowerCase().trim();

        // Normalizes 'Manager' and 'Clinic Manager' so both are treated as equivalent
        const normalizedAllowed = allowedRoles.flatMap(r => {
            const lower = r.toLowerCase().trim();
            if (lower === 'manager' || lower === 'clinic manager') {
                return ['manager', 'clinic manager'];
            }
            return [lower];
        });

        if (!normalizedAllowed.includes(userRole)) {
            return res.status(403).json({ success: false, message: 'Access forbidden for this user role.' });
        }
        next();
    };
};

async function emitAuditLogEvent(userId, action, ipAddress = '127.0.0.1') {
    try {
        // Pass the query string directly as the first argument
        await dbPool.execute(
            'INSERT INTO auditlogs (user_id, action_performed, ip_address) VALUES (?, ?, ?)',
            [userId, action, ipAddress]
        );

        // Changed activityLogs to lowercase 'activitylogs' to prevent the next cloud crash
        await dbPool.execute(
            'INSERT INTO activitylogs (user_id, action, timestamp) VALUES (?, ?, NOW())',
            [userId, action]
        );

    } catch (err) {
        console.error('Audit monitoring component exception:', err);
    }
}

async function appendNotificationNode(userId, message, title = 'System Alert') {
    try {
        // Try the complete format first
        await dbPool.execute(
            'INSERT INTO notifications (user_id, title, message, created_at) VALUES (?, ?, ?, NOW())',
            [userId, title, message]
        );
    } catch (err) {
        try {
            // Fallback: If title or created_at columns don't exist, force the insert anyway
            await dbPool.execute(
                'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
                [userId, message]
            );
        } catch (e) {
            console.error('Notification node injection completely failed:', e.message);
        }
    }
}

/* --------------------------------------------------------------------------
   3. SECURE ENDPOINTS / ROUTING MANAGEMENT SUBSYSTEMS (APIs)
   -------------------------------------------------------------------------- */

// --- CATEGORY A: SECURITY & AUTHENTICATION SYSTEMS ---

app.post('/api/auth/register-patient', uploadEngine.single('photo'), [
    body('email').isEmail().withMessage('Invalid email template formatting.'),
    body('phone').notEmpty().withMessage('Contact phone required.'),
    body('full_name').notEmpty().withMessage('Legal registration name container mandatory.'),
    body('password').isLength({ min: 8 }).withMessage('Security constraints mandate minimum 8 characters.')
], async (req, res) => {
    const errorChecks = validationResult(req);
    if (!errorChecks.isEmpty()) {
        return res.status(400).json({ success: false, message: errorChecks.array()[0].msg });
    }

    const { full_name, gender, dob, phone, email, address, emergency_contact, medical_history_summary, password } = req.body;
    const profilePhotoPath = req.file ? `uploads/${req.file.filename}` : null;

    const dbConnection = await dbPool.getConnection();
    try {
        await dbConnection.beginTransaction();

        // 3NF Deduplication checks
        const [duplicateEmail] = await dbConnection.execute('SELECT user_id FROM users WHERE email = ?', [email]);
        if (duplicateEmail.length > 0) {
            throw new Error('Identity conflict: Email registry intersection.');
        }

        const [duplicatePhone] = await dbConnection.execute('SELECT patient_id FROM patients WHERE phone = ?', [phone]);
        if (duplicatePhone.length > 0) {
            throw new Error('Identity conflict: Phone matching node collision.');
        }

        const passwordHash = await bcrypt.hash(password, 12);

        // Core Users insert mapping Patient Role
        const [userResult] = await dbConnection.execute(
            'INSERT INTO users (email, password_hash, role_id) VALUES (?, ?, (SELECT role_id FROM roles WHERE role_name = "Patient"))',
            [email, passwordHash]
        );
        const generatedUserId = userResult.insertId;

        // Core Patients profile table linking
        await dbConnection.execute(
            'INSERT INTO patients (user_id, full_name, dob, gender, phone, email, address, emergency_contact, profile_photo_url, medical_history_summary) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [generatedUserId, full_name, dob, gender, phone, email, address, emergency_contact, profilePhotoPath, medical_history_summary]
        );

        await dbConnection.commit();
        await emitAuditLogEvent(generatedUserId, 'PATIENT_PROFILE_ESTABLISHED_SUCCESS');
        return res.status(21).json({ success: true, message: 'Patient structural registration locked.' });
    } catch (err) {
        await dbConnection.rollback();
        if (req.file) fs.unlinkSync(req.file.path); // Remove local tracking file upon abort
        return res.status(400).json({ success: false, message: err.message });
    } finally {
        dbConnection.release();
    }
});

// ==========================================
// UNIFIED AUTHENTICATION LOGIN ROUTE
// ==========================================
// ==========================================
// UNIFIED AUTHENTICATION LOGIN ROUTE (FIXED)
// ==========================================
// ==========================================
// UNIFIED AUTHENTICATION LOGIN ROUTE (UNIVERSAL ROLE FIX)
// ==========================================
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email and password required.' });
        }

        const cleanEmail = email.trim().toLowerCase();

        // Safe query without referencing non-existent u.full_name
        const [users] = await dbPool.execute(
            `SELECT u.user_id, u.email, u.password_hash, COALESCE(r.role_name, 'Patient') as role_name 
             FROM users u 
             LEFT JOIN roles r ON u.role_id = r.role_id 
             WHERE LOWER(u.email) = ?`,
            [cleanEmail]
        );

        if (!users || users.length === 0) {
            return res.status(401).json({ success: false, message: 'Invalid credentials.' });
        }

        const user = users[0];
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Invalid credentials.' });
        }

        let patientId = null;
        let doctorId = null;
        let displayName = user.email.split('@')[0];

        if (user.role_name === 'Patient') {
            const [p] = await dbPool.execute('SELECT patient_id, full_name FROM patients WHERE user_id = ?', [user.user_id]);
            if (p && p.length > 0) {
                patientId = p[0].patient_id;
                if (p[0].full_name) displayName = p[0].full_name;
            }
        } else if (user.role_name === 'Doctor') {
            const [d] = await dbPool.execute('SELECT doctor_id, full_name FROM doctors WHERE user_id = ?', [user.user_id]);
            if (d && d.length > 0) {
                doctorId = d[0].doctor_id;
                if (d[0].full_name) displayName = d[0].full_name;
            }
        } else {
            displayName = 'System Executive Manager';
        }

        const jwtSecret = process.env.JWT_SECRET || 'careconnect_fallback_secret_key_2026';
        const token = jwt.sign(
            {
                userId: user.user_id,
                email: user.email,
                role: user.role_name,
                role_name: user.role_name,
                fullName: displayName,
                patientId,
                doctorId
            },
            jwtSecret,
            { expiresIn: '24h' }
        );

        return res.json({
            success: true,
            message: 'Authentication successful.',
            token,
            user: {
                userId: user.user_id,
                email: user.email,
                role: user.role_name,
                role_name: user.role_name,
                fullName: displayName,
                full_name: displayName, // 👈 Ensures frontend never sees undefined!
                patientId,
                doctorId
            }
        });
    } catch (err) {
        console.error("Critical Auth Route Fault:", err);
        return res.status(500).json({ success: false, message: 'Internal engine fault routing login.' });
    }
});
app.post('/api/auth/register', async (req, res) => {
    console.log("Processing incoming registration credentials:", req.body);

    const full_name = req.body.full_name || req.body.fullName || req.body.name;
    const email = req.body.email;
    const password = req.body.password || 'Patient@123';
    const phone = req.body.phone || req.body.phoneNumber;
    const gender = req.body.gender;
    const dob = req.body.dob || req.body.dateOfBirth || req.body.birthDate;
    const address = req.body.address;
    const emergency_contact = req.body.emergency_contact || req.body.emergencyContact;
    const medical_history_summary = req.body.medical_history_summary || req.body.medicalHistorySummary || req.body.medical_history;

    if (!full_name || !email) {
        return res.status(400).json({ success: false, message: 'Patient identity and email address are required fields.' });
    }

    try {
        // 1. Verify that the email is completely unique across the system directories
        const [identityCheck] = await dbPool.execute('SELECT user_id FROM users WHERE email = ?', [email]);
        if (identityCheck.length > 0) {
            return res.status(400).json({ success: false, message: 'An account credentials set is already active for this email address.' });
        }

        // 2. Discover the target Patient role identification key dynamically from your roles schema
        const [roleLookup] = await dbPool.execute("SELECT role_id FROM roles WHERE LOWER(role_name) = 'patient' LIMIT 1");
        const assignedRoleId = roleLookup.length > 0 ? roleLookup[0].role_id : 3;

        // 🔐 3. Securely hash the plain-text password
        const bcrypt = require('bcrypt');
        const hashedPassword = await bcrypt.hash(password, 10);

        // 💡 FIXED COLUMN NAME: Changed 'password' to 'password_hash' to match your database schema
        const [userRegistryReceipt] = await dbPool.execute(
            'INSERT INTO users (email, password_hash, role_id) VALUES (?, ?, ?)',
            [email, hashedPassword, assignedRoleId]
        );

        const brandNewUserId = userRegistryReceipt.insertId;

        // 4. Bind the brandNewUserId directly to the patient clinical profile records table
        const profileQueryStr = `
            INSERT INTO patients (user_id, full_name, email, phone, gender, dob, address, emergency_contact, medical_history_summary) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        await dbPool.execute(profileQueryStr, [
            brandNewUserId,
            full_name,
            email,
            phone || 'N/A',
            gender || 'N/A',
            dob || null,
            address || 'N/A',
            emergency_contact || 'N/A',
            medical_history_summary || 'None'
        ]);

        return res.status(201).json({ success: true, message: 'Unified authentication data and profile details committed successfully.' });

    } catch (error) {
        console.error('Registration backend execution failure:', error);
        return res.status(500).json({ success: false, message: 'Internal engine fault routing registration database transactions.' });
    }
});
app.post('/api/auth/forgot-password', async (req, res) => {
    const { email } = req.body;
    try {
        const [users] = await dbPool.execute('SELECT user_id FROM users WHERE email = ?', [email]);
        if (users.length === 0) {
            return res.status(404).json({ success: false, message: 'Email coordinates missing across directories.' });
        }

        const transientToken = `RST-${Math.floor(100000 + Math.random() * 900000)}`;
        await dbPool.execute(
            'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 1 HOUR))',
            [users[0].user_id, transientToken]
        );

        return res.json({ success: true, message: 'Reset block calculated.', token: transientToken });
    } catch (err) { return res.status(500).json({ success: false, message: 'Processing resetting fault.' }); }
});


// --- CATEGORY B: PATIENT PORTAL INTERACTION CHANNELS ---

app.get('/api/patients/departments', async (req, res) => {
    try {
        const [depts] = await dbPool.execute('SELECT * FROM departments');
        return res.json(depts);
    } catch (err) { return res.status(500).json({ success: false, message: 'Failure auditing departments structural schema.' }); }
});

app.get('/api/patients/doctors', async (req, res) => {
    try {
        const [docs] = await dbPool.execute('SELECT doctor_id, full_name, specialization, qualification, department_id FROM doctors');
        return res.json(docs);
    } catch (err) { return res.status(500).json({ success: false, message: 'Failure processing clinical rosters.' }); }
});

app.get('/api/patients/departments/:id/doctors', async (req, res) => {
    try {
        const [docs] = await dbPool.execute('SELECT doctor_id, full_name, specialization FROM doctors WHERE department_id = ?', [req.params.id]);
        return res.json(docs);
    } catch (err) { return res.status(500).json({ success: false, message: 'Specialty lookup indexing exception.' }); }
});

app.get('/api/patients/doctors/:id/schedules', async (req, res) => {
    try {
        const [sched] = await dbPool.execute('SELECT schedule_id, day_of_week, start_time, end_time FROM schedules WHERE doctor_id = ? AND is_available = TRUE', [req.params.id]);
        return res.json(sched);
    } catch (err) { return res.status(500).json({ success: false, message: 'Working grids search collision.' }); }
});

app.post('/api/appointments/book', authenticateBearerToken, restrictToRoles('Patient'), async (req, res) => {
    const { doctor_id, schedule_id, appointment_date, reason_for_visit } = req.body;

    try {
        const [patientData] = await dbPool.execute('SELECT patient_id FROM patients WHERE user_id = ?', [req.userContext.userId]);
        const patientId = patientData[0].patient_id;

        const [collisionCheck] = await dbPool.execute(
            'SELECT appointment_id FROM appointments WHERE doctor_id = ? AND appointment_date = ? AND schedule_id = ? AND status != "COMPLETED"',
            [doctor_id, appointment_date, schedule_id]
        );

        if (collisionCheck.length > 0) {
            return res.status(409).json({ success: false, message: 'Schedules allocation conflict: The targeted physician block is fully committed for this date coordinate.' });
        }

        const [scheduleBlock] = await dbPool.execute('SELECT start_time FROM schedules WHERE schedule_id = ?', [schedule_id]);
        const appointmentTime = scheduleBlock[0].start_time;

        await dbPool.execute(
            'INSERT INTO appointments (patient_id, doctor_id, schedule_id, appointment_date, appointment_time, status, reason_for_visit) VALUES (?, ?, ?, ?, ?, "Pending", ?)',
            [patientId, doctor_id, schedule_id, appointment_date, appointmentTime, reason_for_visit]
        );

        await appendNotificationNode(req.userContext.userId, `New booking logged for ${appointment_date}. Awaiting management authorization validation.`);
        return res.status(201).json({ success: true, message: 'Appointment processing initialized.' });
    } catch (err) { return res.status(500).json({ success: false, message: err.message || 'Booking submission execution failure.' }); }
});

app.get('/api/patients/dashboard-metrics', authenticateBearerToken, restrictToRoles('Patient'), async (req, res) => {
    try {
        const [pData] = await dbPool.execute('SELECT patient_id FROM patients WHERE user_id = ?', [req.userContext.userId]);
        if (!pData || pData.length === 0) return res.status(404).json({ success: false, message: 'Patient missing.' });

        const patientId = pData[0].patient_id;

        // 1. Count actual completed appointments (0 for new/clean accounts)
        const [completedAppts] = await dbPool.execute(
            `SELECT COUNT(*) as total FROM appointments WHERE patient_id = ? AND status = 'COMPLETED'`,
            [patientId]
        );
        const totalNodes = completedAppts[0]?.total || 0;

        // 2. Prescription counter synchronizes 1-to-1 with completed encounters
        const totalPrescriptions = totalNodes;

        // 3. Fetch next upcoming appointment date and time
        const [nextAppt] = await dbPool.execute(
            `SELECT DATE_FORMAT(appointment_date, "%Y-%m-%d") as date, appointment_time as time FROM appointments WHERE patient_id = ? AND appointment_date >= CURRENT_DATE AND status != 'CANCELLED' ORDER BY appointment_date ASC LIMIT 1`,
            [patientId]
        );

        const nextText = nextAppt.length > 0 ? `${nextAppt[0].date} @ ${nextAppt[0].time}` : 'No record loaded';

        // 4. Fetch upcoming appointment list
        const [appts] = await dbPool.execute(
            `SELECT a.appointment_id, DATE_FORMAT(a.appointment_date, "%Y-%m-%d") AS appointment_date,
                    a.appointment_time, a.status, COALESCE(d.full_name, 'Attending Physician') as doctor_name,
                    COALESCE(d.specialization, 'General Physician') as specialization
             FROM appointments a LEFT JOIN doctors d ON a.doctor_id = d.doctor_id
             WHERE a.patient_id = ? ORDER BY a.appointment_date DESC`,
            [patientId]
        );

        return res.json({
            success: true,
            metrics: {
                nextAppointment: nextText,
                totalRecords: totalNodes,
                records_count: totalNodes,
                totalPrescriptions: totalPrescriptions,
                prescriptions_count: totalPrescriptions
            },
            appointments: appts
        });

    } catch (err) {
        return res.status(500).json({ success: false, message: 'Metrics computation failure.' });
    }
});
// ==========================================
// PATIENT MEDICAL HISTORY ROUTE (FIXED)
// ==========================================
// ============================================================
// PATIENT MEDICAL HISTORY ROUTE (RESILIENT FIELD SELECTION)
// ============================================================
// ============================================================
// 3. UNCONDITIONAL MEDICAL HISTORY FETCH
// ============================================================
app.get('/api/patients/medical-history', authenticateBearerToken, async (req, res) => {
    try {
        const userId = req.userContext?.userId || req.user?.id;
        const [pData] = await dbPool.execute('SELECT patient_id FROM patients WHERE user_id = ?', [userId]);
        if (!pData || pData.length === 0) return res.json([]);
        const patientId = pData[0].patient_id;

        // Fetch ALL completed/triaged appointments unconditionally
        const [appts] = await dbPool.execute(`
            SELECT a.appointment_id, DATE_FORMAT(a.appointment_date, "%Y-%m-%d") AS appointment_date,
                   COALESCE(d.full_name, 'Attending Physician') as doctor_name,
                   COALESCE(d.specialization, 'General Physician') as specialization
            FROM appointments a
            LEFT JOIN doctors d ON a.doctor_id = d.doctor_id
            WHERE a.patient_id = ? AND LOWER(TRIM(a.status)) IN ('completed', 'triaged', 'checked in', 'confirmed')
            ORDER BY a.appointment_date DESC
        `, [patientId]);

        const results = [];
        for (let appt of appts) {
            let mr = {};
            try {
                const [mrRows] = await dbPool.execute('SELECT * FROM medicalrecords WHERE appointment_id = ? LIMIT 1', [appt.appointment_id]);
                if (mrRows.length > 0) mr = mrRows[0];
            } catch (e) { }

            let pr = {};
            try {
                const [prRows] = await dbPool.execute('SELECT * FROM prescriptions WHERE appointment_id = ? LIMIT 1', [appt.appointment_id]);
                if (prRows.length > 0) pr = prRows[0];
            } catch (e) { }

            // Unconditionally push the data so the UI ALWAYS renders the block
            results.push({
                appointment_id: appt.appointment_id,
                appointment_date: appt.appointment_date,
                doctor_name: appt.doctor_name,
                specialization: appt.specialization,
                diagnosis: mr.diagnosis || '',
                clinical_notes: mr.clinical_notes || mr.treatment_notes || mr.description || mr.notes || '',
                body_temperature: mr.body_temperature || mr.temperature || '',
                bp_mmHg: mr.bp_mmHg || mr.blood_pressure || '',
                heart_rate_bpm: mr.heart_rate_bpm || mr.pulse_rate || '',
                medication_name: pr.medication_name || pr.medication || pr.drug_name || '',
                dosage: pr.dosage || '',
                instructions: pr.instructions || ''
            });
        }

        return res.json(results);
    } catch (err) {
        console.error("Medical history extraction error:", err);
        return res.json([]);
    }
});
app.post('/api/doctor/consultation/submit', authenticateBearerToken, restrictToRoles('Doctor'), async (req, res) => {
    const { appointment_id, patient_id, temperature, bp_mmHg, clinical_notes, medication, dosage, instructions } = req.body;

    if (!appointment_id || !patient_id) {
        return res.status(400).json({ success: false, message: 'Missing critical appointment identifiers.' });
    }

    const connection = await dbPool.getConnection();
    try {
        await connection.beginTransaction();

        // A. Insert Medical Record & Vitals
        await connection.execute(
            `INSERT INTO medicalrecords (appointment_id, patient_id, temperature, bp_mmHg, clinical_notes, created_at) 
             VALUES (?, ?, ?, ?, ?, NOW())`,
            [appointment_id, patient_id, temperature || 'N/A', bp_mmHg || 'N/A', clinical_notes || 'Routine Checkup']
        );

        // B. Insert Prescription Item if provided
        if (medication) {
            await connection.execute(
                `INSERT INTO prescriptions (appointment_id, patient_id, medication, dosage, instructions, created_at) 
                 VALUES (?, ?, ?, ?, ?, NOW())`,
                [appointment_id, patient_id, medication, dosage || 'As Directed', instructions || 'Take after meals']
            );
        }

        // C. Transition Appointment State to COMPLETED
        await connection.execute(
            `UPDATE appointments SET status = 'COMPLETED' WHERE appointment_id = ?`,
            [appointment_id]
        );

        // D. Trigger Real-Time Patient Notification
        await connection.execute(
            `INSERT INTO notifications (user_id, title, message, is_read, created_at)
             SELECT u.user_id, 'New Prescription & Medical Record Issued', 
                    'Your doctor has finalized your consultation and published your updated treatment chart.', 0, NOW()
             FROM patients p
             JOIN users u ON p.user_id = u.user_id
             WHERE p.patient_id = ?`,
            [patient_id]
        );

        await connection.commit();
        return res.json({ success: true, message: 'Consultation successfully finalized and published to patient portal.' });

    } catch (error) {
        await connection.rollback();
        console.error('Consultation finalization error:', error);
        return res.status(500).json({ success: false, message: 'Failed to process consultation record.' });
    } finally {
        connection.release();
    }
});

// --- CATEGORY C: DOCTOR WORKSPACE MODULE ENGINES ---

app.get('/api/doctors/queue', authenticateBearerToken, restrictToRoles('Doctor'), async (req, res) => {
    try {
        const [dData] = await dbPool.execute('SELECT doctor_id FROM doctors WHERE user_id = ?', [req.userContext.userId]);
        if (dData.length === 0) return res.json([]);

        const [queue] = await dbPool.execute(
            'SELECT a.appointment_id, a.appointment_time, a.status, a.reason_for_visit, p.full_name as patient_name, p.dob, p.gender, p.medical_history_summary FROM appointments a INNER JOIN patients p ON a.patient_id = p.patient_id WHERE a.doctor_id = ? AND a.appointment_date = CURDATE() AND a.status IN ("Confirmed", "Checked In") ORDER BY a.appointment_time ASC',
            [dData[0].doctor_id]
        );
        return res.json(queue);
    } catch (err) { return res.status(500).json({ success: false, message: 'Queue data loading pipeline error.' }); }
});

app.post('/api/doctors/appointments/:id/consultation', authenticateBearerToken, restrictToRoles('Doctor'), async (req, res) => {
    const apptId = req.params.id;
    const { diagnosis, treatment_notes, medication_name, dosage, instructions } = req.body;

    try {
        // 1. Find patient_id safely
        const [apptMeta] = await dbPool.execute('SELECT patient_id FROM appointments WHERE appointment_id = ?', [apptId]);
        if (!apptMeta.length) return res.status(404).json({ success: false, message: "Appointment missing." });
        const patientId = apptMeta[0].patient_id;

        // 2. Safe INSERT for medical records (Independent Try-Catch prevents rollbacks!)
        try {
            await dbPool.execute(
                'INSERT INTO medicalrecords (appointment_id, patient_id, diagnosis, clinical_notes, treatment_notes) VALUES (?, ?, ?, ?, ?)',
                [apptId, patientId, diagnosis, treatment_notes, treatment_notes]
            );
        } catch (e) {
            // Ultimate fallback
            await dbPool.execute(
                'INSERT INTO medicalrecords (appointment_id, diagnosis, treatment_notes) VALUES (?, ?, ?)',
                [apptId, diagnosis, treatment_notes]
            );
        }

        // 3. Safe INSERT for prescriptions
        if (medication_name && medication_name.trim() !== '') {
            try {
                await dbPool.execute(
                    'INSERT INTO prescriptions (appointment_id, patient_id, medication_name, dosage, instructions) VALUES (?, ?, ?, ?, ?)',
                    [apptId, patientId, medication_name, dosage, instructions]
                );
            } catch (e) {
                await dbPool.execute(
                    'INSERT INTO prescriptions (appointment_id, medication_name, dosage, instructions) VALUES (?, ?, ?, ?)',
                    [apptId, medication_name, dosage, instructions]
                );
            }
        }

        // 4. Update Status to COMPLETED
        await dbPool.execute('UPDATE appointments SET status = "COMPLETED" WHERE appointment_id = ?', [apptId]);

        // 5. Fire Notification to the Patient immediately!
        const [patientMeta] = await dbPool.execute('SELECT user_id FROM patients WHERE patient_id = ?', [patientId]);
        if (patientMeta.length > 0) {
            await appendNotificationNode(patientMeta[0].user_id, `Consultation complete. Diagnosis logged: "${diagnosis}". Treatment files archived.`, 'Treatment Chart Updated');
        }

        return res.json({ success: true, message: 'Consultation transaction completed.' });
    } catch (err) {
        console.error("Consultation submit error:", err);
        return res.status(500).json({ success: false, message: 'Critical failure saving notes.' });
    }
});
app.post('/api/doctor/triage', async (req, res) => {
    console.log("Processing clinical queue triage ingestion:", req.body);

    const { patient_name, blood_pressure, temperature, pulse_rate, notes } = req.body;

    if (!blood_pressure || !temperature || !pulse_rate) {
        return res.status(400).json({ success: false, message: 'All biological core metric fields are required.' });
    }

    try {
        // 1. Look up the patient identification key via full name match
        const [patientRows] = await dbPool.execute(
            'SELECT patient_id FROM patients WHERE full_name LIKE ? LIMIT 1',
            [`%${patient_name}%`]
        );

        if (patientRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Patient profile records not found.' });
        }

        const patientId = patientRows[0].patient_id;
        const structuredSummary = `[TRIAGE LOG] BP: ${blood_pressure} | Temp: ${temperature}°C | Pulse: ${pulse_rate}`;

        // 2. Fetch the patient's most recent appointment so we can link the medical record safely
        const [apptRows] = await dbPool.execute(
            'SELECT appointment_id FROM appointments WHERE patient_id = ? ORDER BY appointment_date DESC LIMIT 1',
            [patientId]
        );

        if (apptRows.length === 0) {
            return res.status(400).json({ success: false, message: 'No active appointment found for this patient to attach vitals.' });
        }

        const apptId = apptRows[0].appointment_id;

        // 3. Commit the clinical metrics to medicalrecords (Enterprise Structured Data)
        await dbPool.execute(
            'INSERT INTO medicalrecords (appointment_id, diagnosis, treatment_notes, record_date, bp_mmHg, temperature, pulse_rate) VALUES (?, ?, ?, CURDATE(), ?, ?, ?)',
            [
                apptId,
                'Triage Assessment - Pending Diagnosis',
                notes || 'Clinical vitals logged successfully.',
                blood_pressure,
                temperature,
                pulse_rate
            ]
        );

        // 4. Update status to COMPLETED (Avoids the 'TRIAGED' ENUM database crash!)
        await dbPool.execute('UPDATE appointments SET status = "COMPLETED" WHERE appointment_id = ?', [apptId]);

        return res.json({ success: true, message: 'Clinical triage updates recorded successfully.' });

    } catch (error) {
        console.error("Triage commit failed:", error.message);
        return res.status(500).json({ success: false, message: 'System failed to commit triage records.' });
    }
});
// --- CATEGORY D: ADMINISTRATIVE SCHEDULING CONTROLS ---

app.get('/api/administrative/appointments', authenticateBearerToken, restrictToRoles('Administrative Staff'), async (req, res) => {
    try {
        const [appointments] = await dbPool.execute(
            'SELECT a.appointment_id, a.appointment_date, a.appointment_time, a.status, a.reason_for_visit, p.full_name as patient_name, p.phone as patient_phone, d.full_name as doctor_name FROM appointments a INNER JOIN patients p ON a.patient_id = p.patient_id INNER JOIN doctors d ON a.doctor_id = d.doctor_id ORDER BY a.appointment_date DESC, a.appointment_time DESC'
        );
        return res.json(appointments);
    } catch (err) { return res.status(500).json({ success: false, message: 'Administrative scheduling queries trace exception.' }); }
});

app.patch('/api/appointments/:id/status', authenticateBearerToken, async (req, res) => {
    const { status } = req.body;
    const apptId = req.params.id;
    try {
        // Validation check for matching stakeholder scopes
        if (!['Administrative Staff', 'Patient'].includes(req.userContext.role)) {
            return res.status(403).json({ success: false, message: 'Privilege checking rejection.' });
        }

        await dbPool.execute('UPDATE appointments SET status = ? WHERE appointment_id = ?', [status, apptId]);

        const [apptMeta] = await dbPool.execute('SELECT patient_id FROM appointments WHERE appointment_id = ?', [apptId]);
        const [patientMeta] = await dbPool.execute('SELECT user_id FROM patients WHERE patient_id = ?', [apptMeta[0].patient_id]);
        await appendNotificationNode(patientMeta[0].user_id, `Your appointment reference #CC-0${apptId} status configuration was updated to [${status}].`);

        await emitAuditLogEvent(req.userContext.userId, `APPOINTMENT_STATUS_MUTATION_#${apptId}_TO_${status}`);
        return res.json({ success: true, message: 'State mutated successfully.' });
    } catch (err) { return res.status(500).json({ success: false, message: 'Status transformation runtime failure.' }); }
});


// --- CATEGORY E: CLINIC MANAGER OPERATIONAL METRICS ---

app.get('/api/manager/reports', authenticateBearerToken, restrictToRoles('Clinic Manager'), async (req, res) => {
    try {
        const [totalPatients] = await dbPool.execute('SELECT COUNT(patient_id) as count FROM patients');
        const [completedAppts] = await dbPool.execute('SELECT COUNT(appointment_id) as count FROM appointments WHERE status = "Completed"');
        const [cancelledAppts] = await dbPool.execute('SELECT COUNT(appointment_id) as count FROM appointments WHERE status = "Cancelled"');

        const [utilization] = await dbPool.execute(
            'SELECT d.full_name as doctor_name, COUNT(a.appointment_id) as encounter_count FROM doctors d LEFT JOIN appointments a ON d.doctor_id = a.doctor_id AND a.status = "Completed" GROUP BY d.doctor_id'
        );

        const [auditLogs] = await dbPool.execute('SELECT log_id, user_id, action_performed, ip_address, timestamp FROM auditlogs ORDER BY timestamp DESC LIMIT 30');

        return res.json({
            summary: {
                total_patients: totalPatients[0].count,
                completed_appointments: completedAppts[0].count,
                cancelled_appointments: cancelledAppts[0].count
            },
            utilization: utilization,
            auditLogs: auditLogs
        });
    } catch (err) { return res.status(500).json({ success: false, message: 'Analytics computation pipeline error mapping metric indices.' }); }
});

// Endpoint to pull complete profiles for the manager dashboard view
app.get('/api/admin/patients', async (req, res) => {
    // Added dob, address, emergency_contact_name, emergency_contact_phone, and medical_history columns
    const sqlQuery = 'SELECT patient_id, full_name, email, phone, gender, dob, address, emergency_contact, medical_history_summary FROM patients ORDER BY patient_id DESC';
    try {
        const [dataset] = await dbPool.execute(sqlQuery);
        res.json(dataset);
    } catch (error) {
        console.error('Database pull error:', error);
        return res.status(500).json({ message: 'Failed to access customer records repository.' });
    }
});

// --- CATEGORY F: USER PROFILE IDENTITY UTILITY ENDPOINTS ---

app.get('/api/profile/me', authenticateBearerToken, async (req, res) => {
    try {
        let sql = 'SELECT user_id, email, role_id FROM users WHERE user_id = ?';
        if (req.userContext.role === 'Patient') {
            sql = 'SELECT u.user_id, u.email, p.full_name, p.phone, p.address, p.emergency_contact, p.medical_history_summary, p.profile_photo_url FROM users u LEFT JOIN patients p ON u.user_id = p.user_id WHERE u.user_id = ?';
        } else if (req.userContext.role === 'Doctor') {
            sql = 'SELECT u.user_id, u.email, d.full_name, d.phone, d.specialization FROM users u INNER JOIN doctors d ON u.user_id = d.user_id WHERE u.user_id = ?';
        }

        const [rows] = await dbPool.execute(sql, [req.userContext.userId]);
        if (!rows || rows.length === 0) {
            return res.status(404).json({ success: false, message: 'User profile not found.' });
        }

        const user = rows[0];
        user.role_name = req.userContext.role;
        user.fullName = user.full_name || req.userContext.fullName || user.email.split('@')[0];
        user.full_name = user.fullName;

        return res.json({ success: true, user });
    } catch (err) {
        console.error("Profile route error:", err);
        return res.status(500).json({ success: false, message: 'Error mapping identity context components.' });
    }
});

app.put('/api/profile/update', authenticateBearerToken, async (req, res) => {
    const { full_name, phone, address } = req.body;
    try {
        if (req.userContext.role === 'Patient') {
            await dbPool.execute(
                'UPDATE patients SET full_name = ?, phone = ?, address = ? WHERE user_id = ?',
                [full_name, phone, address, req.userContext.userId]
            );
        } else if (req.userContext.role === 'Doctor') {
            await dbPool.execute(
                'UPDATE doctors SET full_name = ?, phone = ? WHERE user_id = ?',
                [full_name, phone, req.userContext.userId]
            );
        }

        const [updatedRows] = await dbPool.execute(
            req.userContext.role === 'Patient' ? 'SELECT * FROM patients WHERE user_id = ?' : 'SELECT * FROM doctors WHERE user_id = ?',
            [req.userContext.userId]
        );
        const user = updatedRows[0];
        user.role_name = req.userContext.role;

        await emitAuditLogEvent(req.userContext.userId, 'USER_PROFILE_DATA_MUTATED_SUCCESS');
        return res.json({ success: true, user });
    } catch (err) { return res.status(500).json({ success: false, message: 'Identity file mutation tracking collision.' }); }
});

app.get('/api/profile/notifications', authenticateBearerToken, async (req, res) => {
    try {
        const [rows] = await dbPool.execute('SELECT * FROM notifications WHERE user_id = ? ORDER BY notification_id DESC LIMIT 10', [req.userContext.userId]);
        return res.json({ success: true, notifications: rows || [] });
    } catch (err) {
        return res.json({ success: true, notifications: [] }); // Safe fallback
    }
});
app.delete('/api/profile/notifications/clear', authenticateBearerToken, async (req, res) => {
    try {
        await dbPool.execute('DELETE FROM notifications WHERE user_id = ?', [req.userContext.userId]);
        return res.json({ success: true, message: 'Alert blocks container flushed clean.' });
    } catch (err) { return res.status(500).json({ success: false, message: 'Flush event monitoring system fail.' }); }
});

/* --------------------------------------------------------------------------
   4. CENTRAL ERROR TRACING LAYER & APPLICATION LAUNCHER
   -------------------------------------------------------------------------- */
app.use((err, req, res, next) => {
    console.error('Unhandled engine execution exception context trace:', err.stack);
    return res.status(500).json({ success: false, message: 'Critical backend framework core trace error.' });
});

app.listen(PORT, () => {
    console.log(`CareConnect Medical Center Enterprise Backend Pipeline initialized on port ${PORT}.`);
});

app.patch('/api/admin/appointments/:id/status', async (req, res) => {
    console.log(`Admin mutating state routing request for Appointment ID: ${req.params.id} to:`, req.body);
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
        return res.status(400).json({ success: false, message: 'Status variable is required.' });
    }

    try {
        const [updateResult] = await dbPool.execute(
            'UPDATE appointments SET status = ? WHERE appointment_id = ?',
            [status, id]
        );

        if (updateResult.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'No matching appointment record found in schema.' });
        }

        return res.status(200).json({
            success: true,
            message: `Appointment state transitioned to ${status} successfully.`
        });

    } catch (error) {
        console.error('Database failure routing administrative appointment modifications:', error);
        return res.status(500).json({ success: false, message: 'Internal engine fault modifying records registry rows.' });
    }
});
app.post('/api/contact/submit', async (req, res) => {
    const { name, email, message } = req.body;

    if (!name || !email || !message) {
        return res.status(400).json({ success: false, message: 'All entry fields are required to route messages.' });
    }

    try {
        // Direct insertion into the newly constructed feedback registry
        await dbPool.execute(
            'INSERT INTO contact_inquiries (full_name, email, message) VALUES (?, ?, ?)',
            [name, email, message]
        );

        return res.status(200).json({ success: true, message: 'Message securely transmitted to administrative logs.' });
    } catch (error) {
        console.error('Contact submission execution breakdown:', error);
        return res.status(500).json({ success: false, message: 'Internal pipeline fault logging your inquiry.' });
    }
});