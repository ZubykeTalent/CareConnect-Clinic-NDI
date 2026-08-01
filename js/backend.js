/* ==========================================================================
   CARECONNECT ENTERPRISE CENTRAL BACKEND CORE SYSTEM BluePrint
   TECHNOLOGY STACK: NODE.JS | EXPRESS.JS | MYSQL2 POOLS | JWT RBAC SECURITY
   ========================================================================== */

const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { body, validationResult } = require('express-validator');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'CARECONNECT_SECURE_COMPLIANCE_TOKEN_CLUSTER_2026';

// Establish Local Sub-Directories Framework Repositories for Upload Chains
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

/* --------------------------------------------------------------------------
   1. GLOBAL SECURITY AND ROUTING ENGINE INNERWARE REGISTER
   -------------------------------------------------------------------------- */
app.use(helmet());
app.use(cors({ origin: '*' })); // Enforces broad local development mapping boundaries
app.use(express.json());
app.use(morgan('dev'));
app.use('/uploads', express.static(uploadsDir));

// Connect to Local MySQL Pool Container utilizing XAMPP standard defaults
const dbPool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'careconnect',
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10
});

// Configure Multer Engine Instances for Profiling Image Persistences
const storageConfig = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => cb(null, `avatar_${Date.now()}${path.extname(file.originalname)}`)
});
const uploadEngine = multer({ storage: storageConfig });

/* --------------------------------------------------------------------------
   2. SYSTEM SECURITY PRIVILEGES VALIDATION PIPELINE PIPES (MIDDLEWARE)
   -------------------------------------------------------------------------- */
async function authenticateBearerToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ success: false, message: 'Authorization cryptographic missing.' });
    }

    try {
        const decryptedPayload = jwt.verify(token, JWT_SECRET);

        // Confirm Session validity criteria inside database structures
        const [session] = await dbPool.execute(
            'SELECT session_id FROM Sessions WHERE user_id = ? AND token = ? AND expires_at > NOW()',
            [decryptedPayload.userId, token]
        );

        if (session.length === 0) {
            return res.status(401).json({ success: false, message: 'Session block invalidated or expired.' });
        }

        req.userContext = decryptedPayload;
        next();
    } catch (err) {
        return res.status(403).json({ success: false, message: 'Token token verification failure.' });
    }
}

function restrictToRoles(...allowedRoles) {
    return (req, res, next) => {
        if (!req.userContext || !allowedRoles.includes(req.userContext.role)) {
            return res.status(403).json({ success: false, message: 'RBAC Authorization Violation. Privileges matching failed.' });
        }
        next();
    };
}

async function emitAuditLogEvent(userId, action, ipAddress = '127.0.0.1') {
    try {
        await dbPool.execute(
            'INSERT INTO AuditLogs (user_id, action_performed, ip_address) VALUES (?, ?, ?)',
            [userId, action, ipAddress]
        );
        await dbPool.execute(
            'INSERT INTO ActivityLogs (user_id, action, timestamp) VALUES (?, ?, NOW())',
            [userId, action]
        );
    } catch (err) { console.error('Audit monitoring component exception:', err); }
}

async function appendNotificationNode(userId, message) {
    try {
        await dbPool.execute(
            'INSERT INTO Notifications (user_id, message) VALUES (?, ?)',
            [userId, message]
        );
    } catch (err) { console.error('Notification node injection failure:', err); }
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
        const [duplicateEmail] = await dbConnection.execute('SELECT user_id FROM Users WHERE email = ?', [email]);
        if (duplicateEmail.length > 0) {
            throw new Error('Identity conflict: Email registry intersection.');
        }

        const [duplicatePhone] = await dbConnection.execute('SELECT patient_id FROM Patients WHERE phone = ?', [phone]);
        if (duplicatePhone.length > 0) {
            throw new Error('Identity conflict: Phone matching node collision.');
        }

        const passwordHash = await bcrypt.hash(password, 12);

        // Core Users insert mapping Patient Role
        const [userResult] = await dbConnection.execute(
            'INSERT INTO Users (email, password_hash, role_id) VALUES (?, ?, (SELECT role_id FROM Roles WHERE role_name = "Patient"))',
            [email, passwordHash]
        );
        const generatedUserId = userResult.insertId;

        // Core Patients profile table linking
        await dbConnection.execute(
            'INSERT INTO Patients (user_id, full_name, dob, gender, phone, email, address, emergency_contact, profile_photo_url, medical_history_summary) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const [users] = await dbPool.execute(
            'SELECT u.user_id, u.email, u.password_hash, r.role_name FROM Users u INNER JOIN Roles r ON u.role_id = r.role_id WHERE u.email = ?',
            [email]
        );

        if (users.length === 0) {
            return res.status(401).json({ success: false, message: 'Cryptographic handshake rejected. Identity unknown.' });
        }

        const user = users[0];
        // --- TEMPORARY DIAGNOSTIC LOGS ---
        console.log("=== CARECONNECT LOGIN DEBUG ===");
        console.log("1. Email incoming from front-end:", email);
        console.log("2. Password incoming from front-end:", `[${password}]`);
        console.log("3. Hash pulled from database:", user.password_hash);
        console.log("4. Length of database hash string:", user.password_hash.length);
        console.log("===============================");
        const verified = await bcrypt.compare(password, user.password_hash);
        if (!verified) {
            return res.status(401).json({ success: false, message: 'Cryptographic authentication code mismatch.' });
        }

        // Gather Profile-Specific Hydrated naming variables based on active context
        let personalName = 'System Executive Node';
        if (user.role_name === 'Patient') {
            const [p] = await dbPool.execute('SELECT full_name FROM Patients WHERE user_id = ?', [user.user_id]);
            if (p.length > 0) personalName = p[0].full_name;
        } else if (user.role_name === 'Doctor') {
            const [d] = await dbPool.execute('SELECT full_name FROM Doctors WHERE user_id = ?', [user.user_id]);
            if (d.length > 0) personalName = d[0].full_name;
        }

        const sessionToken = jwt.sign(
            { userId: user.user_id, email: user.email, role: user.role_name, name: personalName },
            JWT_SECRET,
            { expiresIn: '8h' }
        );

        // Session block tracking mapping compliance constraints
        await dbPool.execute(
            'INSERT INTO Sessions (user_id, token, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 8 HOUR))',
            [user.user_id, sessionToken]
        );

        await emitAuditLogEvent(user.user_id, 'USER_SESSION_ESTABLISHED');
        return res.json({
            success: true,
            token: sessionToken,
            user: { user_id: user.user_id, email: user.email, role_name: user.role_name, full_name: personalName }
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Internal critical engine fault routing login.' });
    }
});

app.post('/api/auth/forgot-password', async (req, res) => {
    const { email } = req.body;
    try {
        const [users] = await dbPool.execute('SELECT user_id FROM Users WHERE email = ?', [email]);
        if (users.length === 0) {
            return res.status(404).json({ success: false, message: 'Email coordinates missing across directories.' });
        }

        const transientToken = `RST-${Math.floor(100000 + Math.random() * 900000)}`;
        await dbPool.execute(
            'INSERT INTO PasswordResetTokens (user_id, token, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 1 HOUR))',
            [users[0].user_id, transientToken]
        );

        return res.json({ success: true, message: 'Reset block calculated.', token: transientToken });
    } catch (err) { return res.status(500).json({ success: false, message: 'Processing resetting fault.' }); }
});


// --- CATEGORY B: PATIENT PORTAL INTERACTION CHANNELS ---

app.get('/api/patients/departments', async (req, res) => {
    try {
        const [depts] = await dbPool.execute('SELECT * FROM Departments');
        return res.json(depts);
    } catch (err) { return res.status(500).json({ success: false, message: 'Failure auditing departments structural schema.' }); }
});

app.get('/api/patients/doctors', async (req, res) => {
    try {
        const [docs] = await dbPool.execute('SELECT doctor_id, full_name, specialization, qualification, department_id FROM Doctors');
        return res.json(docs);
    } catch (err) { return res.status(500).json({ success: false, message: 'Failure processing clinical rosters.' }); }
});

app.get('/api/patients/departments/:id/doctors', async (req, res) => {
    try {
        const [docs] = await dbPool.execute('SELECT doctor_id, full_name, specialization FROM Doctors WHERE department_id = ?', [req.params.id]);
        return res.json(docs);
    } catch (err) { return res.status(500).json({ success: false, message: 'Specialty lookup indexing exception.' }); }
});

app.get('/api/patients/doctors/:id/schedules', async (req, res) => {
    try {
        const [sched] = await dbPool.execute('SELECT schedule_id, day_of_week, start_time, end_time FROM Schedules WHERE doctor_id = ? AND is_available = TRUE', [req.params.id]);
        return res.json(sched);
    } catch (err) { return res.status(500).json({ success: false, message: 'Working grids search collision.' }); }
});

app.post('/api/appointments/book', authenticateBearerToken, restrictToRoles('Patient'), async (req, res) => {
    const { doctor_id, schedule_id, appointment_date, reason_for_visit } = req.body;

    try {
        const [patientData] = await dbPool.execute('SELECT patient_id FROM Patients WHERE user_id = ?', [req.userContext.userId]);
        const patientId = patientData[0].patient_id;

        // Concurrency mapping validation: double booking blocker rule enforcement
        const [collisionCheck] = await dbPool.execute(
            'SELECT appointment_id FROM Appointments WHERE doctor_id = ? AND appointment_date = ? AND schedule_id = ? AND status NOT IN ("Cancelled")',
            [doctor_id, appointment_date, schedule_id]
        );

        if (collisionCheck.length > 0) {
            return res.status(409).json({ success: false, message: 'Schedules allocation conflict: The targeted physician block is fully committed for this date coordinate.' });
        }

        const [scheduleBlock] = await dbPool.execute('SELECT start_time FROM Schedules WHERE schedule_id = ?', [schedule_id]);
        const appointmentTime = scheduleBlock[0].start_time;

        await dbPool.execute(
            'INSERT INTO Appointments (patient_id, doctor_id, schedule_id, appointment_date, appointment_time, status, reason_for_visit) VALUES (?, ?, ?, ?, ?, "Pending", ?)',
            [patientId, doctor_id, schedule_id, appointment_date, appointmentTime, reason_for_visit]
        );

        await appendNotificationNode(req.userContext.userId, `New booking logged for ${appointment_date}. Awaiting management authorization validation.`);
        return res.status(201).json({ success: true, message: 'Appointment processing initialized.' });
    } catch (err) { return res.status(500).json({ success: false, message: err.message || 'Booking submission execution failure.' }); }
});

app.get('/api/patients/dashboard-metrics', authenticateBearerToken, restrictToRoles('Patient'), async (req, res) => {
    try {
        const [pData] = await dbPool.execute('SELECT patient_id FROM Patients WHERE user_id = ?', [req.userContext.userId]);
        const patientId = pData[0].patient_id;

        const [recordsCount] = await dbPool.execute('SELECT COUNT(record_id) as total FROM MedicalRecords mr INNER JOIN Appointments a ON mr.appointment_id = a.appointment_id WHERE a.patient_id = ?', [patientId]);
        const [prescCount] = await dbPool.execute('SELECT COUNT(prescription_id) as total FROM Prescriptions p INNER JOIN Appointments a ON p.appointment_id = a.appointment_id WHERE a.patient_id = ?', [patientId]);


        const [upcoming] = await dbPool.execute(
            'SELECT a.appointment_id, DATE_FORMAT(a.appointment_date, "%Y-%m-%d") AS appointment_date, a.appointment_time, a.status, d.full_name as doctor_name, d.specialization FROM Appointments a INNER JOIN Doctors d ON a.doctor_id = d.doctor_id WHERE a.patient_id = ? AND a.status IN ("Pending","Confirmed","Checked In") ORDER BY a.appointment_date ASC, a.appointment_time ASC',
            [patientId]
        );

        return res.json({
            metrics: { records_count: recordsCount[0].total, prescriptions_count: prescCount[0].total },
            appointments: upcoming
        });
    } catch (err) { return res.status(500).json({ success: false, message: 'Metrics computation extraction failure.' }); }
});

app.get('/api/patients/medical-history', authenticateBearerToken, restrictToRoles('Patient'), async (req, res) => {
    try {
        const [pData] = await dbPool.execute('SELECT patient_id FROM Patients WHERE user_id = ?', [req.userContext.userId]);
        const [records] = await dbPool.execute(
            'SELECT mr.record_id, mr.diagnosis, mr.treatment_notes, mr.record_date, p.medication_name, p.dosage, p.instructions FROM MedicalRecords mr INNER JOIN Appointments a ON mr.appointment_id = a.appointment_id LEFT JOIN Prescriptions p ON a.appointment_id = p.appointment_id WHERE a.patient_id = ? ORDER BY mr.record_date DESC',
            [pData[0].patient_id]
        );
        return res.json(records);
    } catch (err) { return res.status(500).json({ success: false, message: 'EMR download routing mapping exception.' }); }
});


// --- CATEGORY C: DOCTOR WORKSPACE MODULE ENGINES ---

app.get('/api/doctors/queue', authenticateBearerToken, restrictToRoles('Doctor'), async (req, res) => {
    try {
        const [dData] = await dbPool.execute('SELECT doctor_id FROM Doctors WHERE user_id = ?', [req.userContext.userId]);
        if (dData.length === 0) return res.json([]);

        const [queue] = await dbPool.execute(
            'SELECT a.appointment_id, a.appointment_time, a.status, a.reason_for_visit, p.full_name as patient_name, p.dob, p.gender, p.medical_history_summary FROM Appointments a INNER JOIN Patients p ON a.patient_id = p.patient_id WHERE a.doctor_id = ? AND a.appointment_date = CURDATE() AND a.status IN ("Confirmed", "Checked In") ORDER BY a.appointment_time ASC',
            [dData[0].doctor_id]
        );
        return res.json(queue);
    } catch (err) { return res.status(500).json({ success: false, message: 'Queue data loading pipeline error.' }); }
});

app.post('/api/doctors/appointments/:id/consultation', authenticateBearerToken, restrictToRoles('Doctor'), async (req, res) => {
    const apptId = req.params.id;
    const { diagnosis, treatment_notes, medication_name, dosage, instructions } = req.body;

    const dbConnection = await dbPool.getConnection();
    try {
        await dbConnection.beginTransaction();

        // Write EMR row node
        await dbConnection.execute(
            'INSERT INTO MedicalRecords (appointment_id, diagnosis, treatment_notes, record_date) VALUES (?, ?, ?, CURDATE())',
            [apptId, diagnosis, treatment_notes]
        );

        // Map prescription structural entry items if passed by physician logic
        if (medication_name && medication_name.trim() !== '') {
            await dbConnection.execute(
                'INSERT INTO Prescriptions (appointment_id, medication_name, dosage, instructions, prescribed_date) VALUES (?, ?, ?, ?, CURDATE())',
                [apptId, medication_name, dosage, instructions]
            );
        }

        // Mutate status block container parameters down to Completed tier
        await dbConnection.execute('UPDATE Appointments SET status = "Completed" WHERE appointment_id = ?', [apptId]);

        // Send confirmation trigger alerting the outpatient node
        const [apptMeta] = await dbConnection.execute('SELECT patient_id FROM Appointments WHERE appointment_id = ?', [apptId]);
        const [patientMeta] = await dbConnection.execute('SELECT user_id FROM Patients WHERE patient_id = ?', [apptMeta[0].patient_id]);
        await appendNotificationNode(patientMeta[0].user_id, `Consultation session complete. Diagnosis logged: "${diagnosis}". Treatment files archived.`);

        await dbConnection.commit();
        await emitAuditLogEvent(req.userContext.userId, `CLINICAL_ENCOUNTER_CLOSED_APPT_#${apptId}`);
        return res.json({ success: true, message: 'Consultation transaction completed.' });
    } catch (err) {
        await dbConnection.rollback();
        return res.status(500).json({ success: false, message: err.message || 'Critical failure handling clinical data nodes transaction commit.' });
    } finally {
        dbConnection.release();
    }
});


// --- CATEGORY D: ADMINISTRATIVE SCHEDULING CONTROLS ---

app.get('/api/administrative/appointments', authenticateBearerToken, restrictToRoles('Administrative Staff'), async (req, res) => {
    try {
        const [appointments] = await dbPool.execute(
            'SELECT a.appointment_id, a.appointment_date, a.appointment_time, a.status, a.reason_for_visit, p.full_name as patient_name, p.phone as patient_phone, d.full_name as doctor_name FROM Appointments a INNER JOIN Patients p ON a.patient_id = p.patient_id INNER JOIN Doctors d ON a.doctor_id = d.doctor_id ORDER BY a.appointment_date DESC, a.appointment_time DESC'
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

        await dbPool.execute('UPDATE Appointments SET status = ? WHERE appointment_id = ?', [status, apptId]);

        const [apptMeta] = await dbPool.execute('SELECT patient_id FROM Appointments WHERE appointment_id = ?', [apptId]);
        const [patientMeta] = await dbPool.execute('SELECT user_id FROM Patients WHERE patient_id = ?', [apptMeta[0].patient_id]);
        await appendNotificationNode(patientMeta[0].user_id, `Your appointment reference #CC-0${apptId} status configuration was updated to [${status}].`);

        await emitAuditLogEvent(req.userContext.userId, `APPOINTMENT_STATUS_MUTATION_#${apptId}_TO_${status}`);
        return res.json({ success: true, message: 'State mutated successfully.' });
    } catch (err) { return res.status(500).json({ success: false, message: 'Status transformation runtime failure.' }); }
});


// --- CATEGORY E: CLINIC MANAGER OPERATIONAL METRICS ---

app.get('/api/manager/reports', authenticateBearerToken, restrictToRoles('Clinic Manager'), async (req, res) => {
    try {
        const [totalPatients] = await dbPool.execute('SELECT COUNT(patient_id) as count FROM Patients');
        const [completedAppts] = await dbPool.execute('SELECT COUNT(appointment_id) as count FROM Appointments WHERE status = "Completed"');
        const [cancelledAppts] = await dbPool.execute('SELECT COUNT(appointment_id) as count FROM Appointments WHERE status = "Cancelled"');

        const [utilization] = await dbPool.execute(
            'SELECT d.full_name as doctor_name, COUNT(a.appointment_id) as encounter_count FROM Doctors d LEFT JOIN Appointments a ON d.doctor_id = a.doctor_id AND a.status = "Completed" GROUP BY d.doctor_id'
        );

        const [auditLogs] = await dbPool.execute('SELECT log_id, user_id, action_performed, ip_address, timestamp FROM AuditLogs ORDER BY timestamp DESC LIMIT 30');

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


// --- CATEGORY F: USER PROFILE IDENTITY UTILITY ENDPOINTS ---

app.get('/api/profile/me', authenticateBearerToken, async (req, res) => {
    try {
        let sql = 'SELECT user_id, email, role_id FROM Users WHERE user_id = ?';
        if (req.userContext.role === 'Patient') {
            sql = 'SELECT u.user_id, u.email, p.full_name, p.phone, p.address, p.medical_history_summary, p.profile_photo_url FROM Users u INNER JOIN Patients p ON u.user_id = p.user_id WHERE u.user_id = ?';
        } else if (req.userContext.role === 'Doctor') {
            sql = 'SELECT u.user_id, u.email, d.full_name, d.phone, d.specialization FROM Users u INNER JOIN Doctors d ON u.user_id = d.user_id WHERE u.user_id = ?';
        }

        const [rows] = await dbPool.execute(sql, [req.userContext.userId]);
        const user = rows[0];
        user.role_name = req.userContext.role;

        return res.json({ success: true, user });
    } catch (err) { return res.status(500).json({ success: false, message: 'Error mapping identity context components.' }); }
});

app.put('/api/profile/update', authenticateBearerToken, async (req, res) => {
    const { full_name, phone, address } = req.body;
    try {
        if (req.userContext.role === 'Patient') {
            await dbPool.execute(
                'UPDATE Patients SET full_name = ?, phone = ?, address = ? WHERE user_id = ?',
                [full_name, phone, address, req.userContext.userId]
            );
        } else if (req.userContext.role === 'Doctor') {
            await dbPool.execute(
                'UPDATE Doctors SET full_name = ?, phone = ? WHERE user_id = ?',
                [full_name, phone, req.userContext.userId]
            );
        }

        const [updatedRows] = await dbPool.execute(
            req.userContext.role === 'Patient' ? 'SELECT * FROM Patients WHERE user_id = ?' : 'SELECT * FROM Doctors WHERE user_id = ?',
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
        const [rows] = await dbPool.execute('SELECT * FROM Notifications WHERE user_id = ? ORDER BY created_at DESC', [req.userContext.userId]);
        return res.json(rows);
    } catch (err) { return res.status(500).json({ success: false, message: 'Alerts extraction fail.' }); }
});
// Root route to verify the deployment is working
app.get('/', (req, res) => {
    res.send('🚀 CareConnect Backend Server is Live and Connected to the Cloud Database!');
});

app.delete('/api/profile/notifications/clear', authenticateBearerToken, async (req, res) => {
    try {
        await dbPool.execute('DELETE FROM Notifications WHERE user_id = ?', [req.userContext.userId]);
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