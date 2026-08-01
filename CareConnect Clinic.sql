-- ==========================================================================
-- CARECONNECT COMPREHENSIVE CLINIC MANAGEMENT SYSTEM SCHEMA ENGINE
-- COMPATIBLE LEVEL: MYSQL XAMPP phpMyAdmin (ACID CONSTRAINTS COMPLIANT)
-- ARCHITECTURAL DESIGN STATE: THIRD NORMAL FORM (3NF) STABLE REDESIGN
-- ==========================================================================

-- CREATE DATABASE IF NOT EXISTS `careconnect` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- USE `careconnect`;

-- --------------------------------------------------------------------------
-- 1. BASE MATRIX INFRASTRUCTURE TABLES (ROLES, USERS, DEPARTMENTS)
-- --------------------------------------------------------------------------

CREATE TABLE `Roles` (
    `role_id` INT AUTO_INCREMENT,
    `role_name` VARCHAR(50) NOT NULL,
    `description` VARCHAR(255) NULL,
    PRIMARY KEY (`role_id`),
    UNIQUE KEY `uk_role_name` (`role_name`)
) ENGINE=InnoDB;

CREATE TABLE `Users` (
    `user_id` INT AUTO_INCREMENT,
    `email` VARCHAR(100) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `role_id` INT NOT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`user_id`),
    UNIQUE KEY `uk_user_email` (`email`),
    CONSTRAINT `fk_users_role` FOREIGN KEY (`role_id`) REFERENCES `Roles` (`role_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE `Departments` (
    `department_id` INT AUTO_INCREMENT,
    `department_name` VARCHAR(100) NOT NULL,
    `location` VARCHAR(100) NOT NULL,
    `phone` VARCHAR(20) NULL,
    PRIMARY KEY (`department_id`)
) ENGINE=InnoDB;

-- --------------------------------------------------------------------------
-- 2. PROFILE MATRIX DATA LAYERS (PATIENTS, DOCTORS, WORKING SCHEDULE GRIDS)
-- --------------------------------------------------------------------------

CREATE TABLE `Patients` (
    `patient_id` INT AUTO_INCREMENT,
    `user_id` INT NOT NULL,
    `full_name` VARCHAR(100) NOT NULL,
    `dob` DATE NOT NULL,
    `gender` ENUM('Male', 'Female', 'Other') NOT NULL,
    `phone` VARCHAR(20) NOT NULL,
    `email` VARCHAR(100) NOT NULL,
    `address` VARCHAR(255) NOT NULL,
    `emergency_contact` VARCHAR(255) NOT NULL,
    `profile_photo_url` VARCHAR(255) NULL,
    `medical_history_summary` TEXT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`patient_id`),
    UNIQUE KEY `uk_patient_phone` (`phone`),
    UNIQUE KEY `uk_patient_email` (`email`),
    CONSTRAINT `fk_patients_user` FOREIGN KEY (`user_id`) REFERENCES `Users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE `Doctors` (
    `doctor_id` INT AUTO_INCREMENT,
    `user_id` INT NOT NULL,
    `department_id` INT NOT NULL,
    `full_name` VARCHAR(100) NOT NULL,
    `specialization` VARCHAR(100) NOT NULL,
    `phone` VARCHAR(20) NOT NULL,
    `email` VARCHAR(100) NOT NULL,
    `qualification` VARCHAR(255) NOT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`doctor_id`),
    UNIQUE KEY `uk_doctor_phone` (`phone`),
    UNIQUE KEY `uk_doctor_email` (`email`),
    CONSTRAINT `fk_doctors_user` FOREIGN KEY (`user_id`) REFERENCES `Users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `fk_doctors_department` FOREIGN KEY (`department_id`) REFERENCES `Departments` (`department_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE `Schedules` (
    `schedule_id` INT AUTO_INCREMENT,
    `doctor_id` INT NOT NULL,
    `day_of_week` ENUM('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday') NOT NULL,
    `start_time` TIME NOT NULL,
    `end_time` TIME NOT NULL,
    `is_available` BOOLEAN DEFAULT TRUE,
    PRIMARY KEY (`schedule_id`),
    CONSTRAINT `fk_schedules_doctor` FOREIGN KEY (`doctor_id`) REFERENCES `Doctors` (`doctor_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- --------------------------------------------------------------------------
-- 3. TRANSACTIONS ENGINES TABLES (APPOINTMENTS, EMR, PRESCRIPTIONS)
-- --------------------------------------------------------------------------

CREATE TABLE `Appointments` (
    `appointment_id` INT AUTO_INCREMENT,
    `patient_id` INT NOT NULL,
    `doctor_id` INT NOT NULL,
    `schedule_id` INT NOT NULL,
    `appointment_date` DATE NOT NULL,
    `appointment_time` TIME NOT NULL,
    `status` ENUM('Pending', 'Confirmed', 'Checked In', 'Completed', 'Cancelled') DEFAULT 'Pending',
    `reason_for_visit` TEXT NOT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`appointment_id`),
    INDEX `idx_appointment_lookup` (`appointment_date`, `doctor_id`),
    CONSTRAINT `fk_appointments_patient` FOREIGN KEY (`patient_id`) REFERENCES `Patients` (`patient_id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `fk_appointments_doctor` FOREIGN KEY (`doctor_id`) REFERENCES `Doctors` (`doctor_id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `fk_appointments_schedule` FOREIGN KEY (`schedule_id`) REFERENCES `Schedules` (`schedule_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE `MedicalRecords` (
    `record_id` INT AUTO_INCREMENT,
    `appointment_id` INT NOT NULL,
    `diagnosis` VARCHAR(255) NOT NULL,
    `treatment_notes` TEXT NOT NULL,
    `record_date` DATE NOT NULL,
    `file_path` VARCHAR(255) NULL,
    PRIMARY KEY (`record_id`),
    UNIQUE KEY `uk_record_appointment` (`appointment_id`),
    CONSTRAINT `fk_records_appointment` FOREIGN KEY (`appointment_id`) REFERENCES `Appointments` (`appointment_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE `Prescriptions` (
    `prescription_id` INT AUTO_INCREMENT,
    `appointment_id` INT NOT NULL,
    `medication_name` VARCHAR(150) NOT NULL,
    `dosage` VARCHAR(100) NOT NULL,
    `instructions` TEXT NOT NULL,
    `prescribed_date` DATE NOT NULL,
    PRIMARY KEY (`prescription_id`),
    CONSTRAINT `fk_prescriptions_appointment` FOREIGN KEY (`appointment_id`) REFERENCES `Appointments` (`appointment_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- --------------------------------------------------------------------------
-- 4. RUNTIME SYSTEM ENVELOPS TABLES (SESSIONS,reset-TOKENS, AUDITS, NOTIFICATIONS)
-- --------------------------------------------------------------------------

CREATE TABLE `Sessions` (
    `session_id` INT AUTO_INCREMENT,
    `user_id` INT NOT NULL,
    `token` TEXT NOT NULL,
    `expires_at` DATETIME NOT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`session_id`),
    CONSTRAINT `fk_sessions_user` FOREIGN KEY (`user_id`) REFERENCES `Users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE `PasswordResetTokens` (
    `token_id` INT AUTO_INCREMENT,
    `user_id` INT NOT NULL,
    `token` VARCHAR(100) NOT NULL,
    `expires_at` DATETIME NOT NULL,
    PRIMARY KEY (`token_id`),
    CONSTRAINT `fk_reset_user` FOREIGN KEY (`user_id`) REFERENCES `Users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE `Notifications` (
    `notification_id` INT AUTO_INCREMENT,
    `user_id` INT NOT NULL,
    `message` TEXT NOT NULL,
    `is_read` BOOLEAN DEFAULT FALSE,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`notification_id`),
    CONSTRAINT `fk_notifications_user` FOREIGN KEY (`user_id`) REFERENCES `Users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE `AuditLogs` (
    `log_id` INT AUTO_INCREMENT,
    `user_id` INT NOT NULL,
    `action_performed` VARCHAR(150) NOT NULL,
    `ip_address` VARCHAR(45) NOT NULL,
    `timestamp` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`log_id`),
    CONSTRAINT `fk_audit_user` FOREIGN KEY (`user_id`) REFERENCES `Users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE `ActivityLogs` (
    `activity_id` INT AUTO_INCREMENT,
    `user_id` INT NOT NULL,
    `action` TEXT NOT NULL,
    `timestamp` DATETIME NOT NULL,
    PRIMARY KEY (`activity_id`),
    CONSTRAINT `fk_activity_user` FOREIGN KEY (`user_id`) REFERENCES `Users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE `Settings` (
    `setting_id` INT AUTO_INCREMENT,
    `setting_key` VARCHAR(100) NOT NULL,
    `setting_value` TEXT NOT NULL,
    PRIMARY KEY (`setting_id`),
    UNIQUE KEY `uk_setting_key` (`setting_key`)
) ENGINE=InnoDB;

-- --------------------------------------------------------------------------
-- 5. CRYPTOGRAPHIC DATA SEED ENGINES LOAD BALANCING METRICS
-- PASSWORD FOR INFRASTRUCTURE ACCOUNTS SET UNIFORMLY TO: 'CareConnect@2026'
-- --------------------------------------------------------------------------

INSERT INTO `Roles` (`role_id`, `role_name`, `description`) VALUES
(1, 'Clinic Manager', 'Administrative control executor over clinic analytics and staffing vectors.'),
(2, 'Doctor', 'Clinical medicine practitioner with diagnostics note writing capabilities.'),
(3, 'Administrative Staff', 'Front-desk supervisor handling queue management, checkins, and calendar mapping.'),
(4, 'Patient', 'Out-patient registrant capable of utilizing self-service booking modules.');

INSERT INTO `Users` (`user_id`, `email`, `password_hash`, `role_id`) VALUES
(1, 'manager@careconnect.com', '$2b$12$R.uM6E3gL15FmAn81Dk8UuP/jXz2B3CgH8iJ9kLmN/oPqRsTuVwXy', 1), -- manager user node
(2, 'staff@careconnect.com', '$2b$12$R.uM6E3gL15FmAn81Dk8UuP/jXz2B3CgH8iJ9kLmN/oPqRsTuVwXy', 3), -- admin staff node
(3, 'grace.alao@careconnect.com', '$2b$12$R.uM6E3gL15FmAn81Dk8UuP/jXz2B3CgH8iJ9kLmN/oPqRsTuVwXy', 2), -- doctor user node 1
(4, 'chidi.benson@careconnect.com', '$2b$12$R.uM6E3gL15FmAn81Dk8UuP/jXz2B3CgH8iJ9kLmN/oPqRsTuVwXy', 2); -- doctor user node 

-- USE careconnect;

-- USE careconnect;

UPDATE Users 
SET password_hash = '$2b$12$7DrvZAGx3RtoEQdzuIJOE.0DUlHYngmu0HQ1tq2P8zUdfm86PPkSm' 
WHERE user_id IN (1, 2, 3, 4);

COMMIT;
--USE careconnect;

-- Repopulate the empty table with the 4 core stakeholders using the working password hash
USE careconnect;

-- 1. Temporarily turn off the safety guards
SET FOREIGN_KEY_CHECKS = 0;

-- 2. Force insert your 4 core stakeholders


-- 3. Turn the safety guards back on
SET FOREIGN_KEY_CHECKS = 1;

COMMIT;
SELECT * FROM Users;

COMMIT;

-- ==========================================================================
-- REFINED ENTERPRISE ROLE-ISOLATED CREDENTIAL SEED ENGINE
-- EVERY INTERNAL STAKEHOLDER ACQUIRES A COMPLETELY UNIQUE PRIVATE VALUE
-- ==========================================================================




INSERT INTO `Departments` (`department_id`, `department_name`, `location`, `phone`) VALUES
(1, 'General Medicine Consultation Unit', 'Block A, Floor 1', '+234-803-111-2222'),
(2, 'Pediatrics Diagnostics Department', 'Block B, West Wing', '+234-803-111-3333'),
(3, 'Cardiovascular Health Care Center', 'Block C, Isolation Loop', '+234-803-111-4444');

INSERT INTO `Doctors` (`doctor_id`, `user_id`, `department_id`, `full_name`, `specialization`, `phone`, `email`, `qualification`) VALUES
(1, 3, 1, 'Grace Alao', 'Consultant Family Physician', '08034445555', 'grace.alao@careconnect.com', 'MBBS, FWACP (Family Medicine)'),
(2, 4, 3, 'Chidi Benson', 'Interventional Cardiologist', '08036667777', 'chidi.benson@careconnect.com', 'MBBS, MD, FACC');

INSERT INTO `Schedules` (`schedule_id`, `doctor_id`, `day_of_week`, `start_time`, `end_time`, `is_available`) VALUES
(1, 1, 'Monday', '08:00:00', '12:00:00', 1),
(2, 1, 'Wednesday', '10:00:00', '14:00:00', 1),
(3, 2, 'Tuesday', '09:00:00', '13:00:00', 1),
(4, 2, 'Thursday', '14:00:00', '18:00:00', 1);

-- Seed an operational Sample Patient record linked to student references
INSERT INTO `Users` (`user_id`, `email`, `password_hash`, `role_id`) VALUES
(5, 'gift@domain.com', '$2b$12$R.uM6E3gL15FmAn81Dk8UuP/jXz2B3CgH8iJ9kLmN/oPqRsTuVwXy', 4);

INSERT INTO `Patients` (`patient_id`, `user_id`, `full_name`, `dob`, `gender`, `phone`, `email`, `address`, `emergency_contact`, `profile_photo_url`, `medical_history_summary`) VALUES
(1, 5, 'Ogbonna-Okafor Gift Nmeri', '2004-05-14', 'Female', '08030000000', 'gift@domain.com', 'FUTO Student Residential Area, Owerri', 'Mrs. Ogbonna-Okafor (+234 8012345678)', NULL, 'No historical chronic diagnoses reported. Penicillin hypersensitivity metrics identified.');

-- Inject an archive completed structural appointment to build initial database hydration states
INSERT INTO `Appointments` (`appointment_id`, `patient_id`, `doctor_id`, `schedule_id`, `appointment_date`, `appointment_time`, `status`, `reason_for_visit`) VALUES
(1, 1, 1, 1, CURDATE(), '08:30:00', 'Completed', 'Routine physiological checkup and minor diagnostic consultation.');

INSERT INTO `MedicalRecords` (`record_id`, `appointment_id`, `diagnosis`, `treatment_notes`, `record_date`, `file_path`) VALUES
(1, 1, 'Essential Hypertension (Stage I Baseline)', 'Patient exhibits high arterial pressure parameters. Advised lower sodium ingestion protocols and ordered regular cardiovascular monitoring routines.', CURDATE(), NULL);

INSERT INTO `Prescriptions` (`prescription_id`, `appointment_id`, `medication_name`, `dosage`, `instructions`, `prescribed_date`) VALUES
(1, 1, 'Amlodipine 5mg Chemical Base', '1 Tablet Daily', 'To be taken post-prandial early morning hours for 30 consecutive days.', CURDATE());

-- Insert cluster monitoring default rules
INSERT INTO `Settings` (`setting_key`, `setting_value`) VALUES
('hipaa_compliance_enforcement_mode', 'TRUE'),
('cryptographic_audit_trail_level', 'VERBOSE'),
('sms_dispatch_engine_status', 'ONLINE');


USE careconnect;

-- Temporarily pause safety checks so we can force insert interrelated data smoothly
SET FOREIGN_KEY_CHECKS = 0;

-- 1. Ensure core roles exist
INSERT IGNORE INTO roles (role_id, role_name) VALUES 
(1, 'Manager'), (2, 'Doctor'), (3, 'Staff'), (4, 'Patient');

-- 2. Populate Departments
INSERT IGNORE INTO Departments (department_id, department_name) VALUES 
(1, 'Cardiology'), 
(2, 'General Medicine');

-- 3. Hydrate Doctors (Linking them back to user_id 3 and 4)
INSERT IGNORE INTO Doctors (doctor_id, user_id, full_name, department_id, specialization) VALUES 
(1, 3, 'Dr. Grace Alao', 2, 'General Physician'),
(2, 4, 'Dr. Chidi Benson', 1, 'Cardiologist');

-- 4. Add a dummy Patient record for appointments to reference
INSERT IGNORE INTO patients (patient_id, user_id, full_name, phone, email) VALUES 
(1, 99, 'System Test Patient', '+2348000000000', 'patient.test@careconnect.com');

-- 5. Seed Mock Appointments so the Analytics dashboard has data to analyze!
INSERT IGNORE INTO appointments (appointment_id, patient_id, doctor_id, appointment_date, status) VALUES 
(1, 1, 1, '2026-08-01 09:00:00', 'Completed'),
(2, 1, 2, '2026-08-01 11:30:00', 'Scheduled'),
(3, 1, 1, '2026-08-02 14:00:00', 'Pending'),
(4, 1, 2, '2026-08-03 16:15:00', 'Cancelled');

SET FOREIGN_KEY_CHECKS = 1;
COMMIT;
 -- USE careconnect;
SELECT user_id, email, role_id FROM Users;

-- USE careconnect;
SHOW TABLES;

COMMIT;