
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const db = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

const uploadsFolder = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadsFolder)) {
    fs.mkdirSync(uploadsFolder, { recursive: true });
}

// EMAIL CONFIGURATION
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_APP_PASSWORD
    }
});

// Generate six-digit verification codes
function generateCode() {
    return crypto.randomInt(100000, 1000000).toString();
}

// Send verification email
async function sendVerificationEmail(email, code) {
    await transporter.sendMail({
        from: `"HouseHunting.com" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: "Verify your HouseHunting.com account",
        html: `
            <h2>Welcome to HouseHunting.com!</h2>
            <p>Thank you for registering.</p>
            <p>Your email verification code is:</p>
            <h1>${code}</h1>
            <p>This code expires in 10 minutes.</p>
            <p>If you did not create this account, ignore this email.</p>
        `
    });
}

// Send password reset email
async function sendPasswordResetEmail(email, code) {
    await transporter.sendMail({
        from: `"HouseHunting.com" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: "HouseHunting.com Password Reset",
        html: `
            <h2>Password Reset</h2>
            <p>Your password reset code is:</p>
            <h1>${code}</h1>
            <p>This code expires in 10 minutes.</p>
            <p>If you did not request a password reset, ignore this email.</p>
        `
    });
}

// IMAGE UPLOAD SETTINGS
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsFolder);
    },
    filename: (req, file, cb) => {
        const extension = path.extname(file.originalname).toLowerCase();
        const filename = `${Date.now()}-${Math.round(Math.random() * 1000000)}${extension}`;
        cb(null, filename);
    }
});

const upload = multer({
    storage,
    limits: {
        fileSize: 5 * 1024 * 1024
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith("image/")) {
            cb(null, true);
        } else {
            cb(new Error("Only image files are allowed."));
        }
    }
});

// AUTHENTICATION MIDDLEWARE
function authenticateToken(req, res, next) {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
        return res.status(401).json({
            message: "Please log in first."
        });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({
                message: "Invalid or expired login session."
            });
        }

        req.user = user;
        next();
    });
}
// ADMIN-ONLY SECURITY
function requireAdmin(req, res, next) {
    if (req.user.role !== "admin") {
        return res.status(403).json({
            message: "Access denied. Admin only."
        });
    }

    next();
}
// ADMIN: VIEW PENDING LANDLORDS AND AGENTS
app.get(
    "/api/admin/pending-accounts",
    authenticateToken,
    requireAdmin,
    async (req, res) => {
        try {
            const [accounts] = await db.query(
                `SELECT user_id, name, email, phone, role,
                        approval_status, payment_status, created_at
                 FROM users
                 WHERE role IN ('agent', 'landlord')
                 AND approval_status = 'pending'
                 ORDER BY created_at ASC`
            );

            res.json(accounts);
        } catch (error) {
            console.error("Admin pending accounts error:", error);
            res.status(500).json({
                message: "Unable to load pending accounts."
            });
        }
    }
);

// ADMIN: APPROVE OR REJECT AN ACCOUNT
app.put(
    "/api/admin/accounts/:id/approval",
    authenticateToken,
    requireAdmin,
    async (req, res) => {
        try {
            const { decision, paymentVerified } = req.body;
            const userId = req.params.id;

            if (!["approve", "reject"].includes(decision)) {
                return res.status(400).json({
                    message: "Choose approve or reject."
                });
            }

            if (decision === "approve" && paymentVerified !== true) {
                return res.status(400).json({
                    message: "Confirm the M-Pesa payment before approving."
                });
            }

            const [accounts] = await db.query(
                `SELECT user_id FROM users
                 WHERE user_id = ?
                 AND role IN ('agent', 'landlord')`,
                [userId]
            );

            if (accounts.length === 0) {
                return res.status(404).json({
                    message: "Landlord or agent account not found."
                });
            }

            const approvalStatus =
                decision === "approve" ? "approved" : "rejected";

            const paymentStatus =
                decision === "approve" ? "verified" : "rejected";

            await db.query(
                `UPDATE users
                 SET approval_status = ?, payment_status = ?
                 WHERE user_id = ?`,
                [approvalStatus, paymentStatus, userId]
            );

            res.json({
                message: decision === "approve"
                    ? "Account approved successfully."
                    : "Account rejected successfully."
            });

        } catch (error) {
            console.error("Admin approval error:", error);
            res.status(500).json({
                message: "Unable to update account approval."
            });
        }
    }
);

// HOME ROUTE
app.get("/", (req, res) => {
    res.send("House Hunting Backend is Running!");
});

// REGISTER
app.post("/api/register", async (req, res) => {
    try {
        const name = req.body.name || req.body.fullName;
        const email = req.body.email?.trim().toLowerCase();
        const phone = req.body.phone;
        const password = req.body.password;
        const role = req.body.role || req.body.accountType || "tenant";

        if (!name || !email || !password) {
            return res.status(400).json({
                message: "Name, email and password are required."
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                message: "Password must contain at least 8 characters."
            });
        }

        if (!["tenant", "agent", "landlord"].includes(role)) {
            return res.status(400).json({
                message: "Invalid account type."
            });
        }

        const [existingUsers] = await db.query(
            "SELECT user_id FROM users WHERE email = ?",
            [email]
        );

        if (existingUsers.length > 0) {
            return res.status(409).json({
                message: "This email is already registered."
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const verificationCode = generateCode();

        const approvalStatus = role === "tenant"
            ? "approved"
            : "pending";

        const paymentStatus = role === "tenant"
            ? "not_required"
            : "pending";

        const [result] = await db.query(
            `INSERT INTO users
            (name, email, phone, password, role,
             email_verified, verification_code,
             verification_expires, approval_status, payment_status)
            VALUES (?, ?, ?, ?, ?, 0, ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE), ?, ?)`,
            [
                name,
                email,
                phone || null,
                hashedPassword,
                role,
                verificationCode,
                approvalStatus,
                paymentStatus
            ]
        );

        try {
            await sendVerificationEmail(email, verificationCode);
        } catch (emailError) {
            console.error("Email sending error:", emailError);

            return res.status(201).json({
                message: "Account created, but verification email could not be sent. Please use the resend verification option.",
                userId: result.insertId
            });
        }

        res.status(201).json({
            message: "Registration successful. Please check your email for your verification code.",
            userId: result.insertId,
            requiresEmailVerification: true,
            accountStatus: approvalStatus
        });

    } catch (error) {
        console.error("Registration error:", error);

        res.status(500).json({
            message: "Registration failed."
        });
    }
});

// VERIFY EMAIL
app.post("/api/verify-email", async (req, res) => {
    try {
        const email = req.body.email?.trim().toLowerCase();
        const code = req.body.code?.trim();

        if (!email || !code) {
            return res.status(400).json({
                message: "Email and verification code are required."
            });
        }

        const [users] = await db.query(
            `SELECT user_id FROM users
             WHERE email = ?
             AND verification_code = ?
             AND verification_expires > NOW()
             AND email_verified = 0`,
            [email, code]
        );

        if (users.length === 0) {
            return res.status(400).json({
                message: "Invalid or expired verification code."
            });
        }

        await db.query(
            `UPDATE users
             SET email_verified = 1,
                 verification_code = NULL,
                 verification_expires = NULL
             WHERE user_id = ?`,
            [users[0].user_id]
        );

        res.json({
            message: "Email verified successfully. You can now log in if your account has been approved."
        });

    } catch (error) {
        console.error("Email verification error:", error);

        res.status(500).json({
            message: "Email verification failed."
        });
    }
});

// RESEND VERIFICATION EMAIL
app.post("/api/resend-verification", async (req, res) => {
    try {
        const email = req.body.email?.trim().toLowerCase();

        if (!email) {
            return res.status(400).json({
                message: "Email is required."
            });
        }

        const [users] = await db.query(
            "SELECT user_id, email_verified FROM users WHERE email = ?",
            [email]
        );

        if (users.length === 0) {
            return res.status(404).json({
                message: "Account not found."
            });
        }

        if (users[0].email_verified) {
            return res.json({
                message: "Your email is already verified."
            });
        }

        const code = generateCode();

        await db.query(
            `UPDATE users
             SET verification_code = ?,
                 verification_expires = DATE_ADD(NOW(), INTERVAL 10 MINUTE)
             WHERE user_id = ?`,
            [code, users[0].user_id]
        );

        await sendVerificationEmail(email, code);

        res.json({
            message: "A new verification code has been sent to your email."
        });

    } catch (error) {
        console.error("Resend verification error:", error);

        res.status(500).json({
            message: "Unable to resend verification email."
        });
    }
});

// LOGIN
app.post("/api/login", async (req, res) => {
    try {
        const email = req.body.email?.trim().toLowerCase();
        const password = req.body.password;

        if (!email || !password) {
            return res.status(400).json({
                message: "Email and password are required."
            });
        }

        const [users] = await db.query(
            "SELECT * FROM users WHERE email = ?",
            [email]
        );

        if (users.length === 0) {
            return res.status(401).json({
                message: "Invalid email or password."
            });
        }

        const user = users[0];

        const passwordMatches = await bcrypt.compare(
            password,
            user.password
        );

        if (!passwordMatches) {
            return res.status(401).json({
                message: "Invalid email or password."
            });
        }

        if (!user.email_verified) {
            return res.status(403).json({
                message: "Please verify your email before logging in.",
                requiresEmailVerification: true
            });
        }

        if (user.approval_status !== "approved") {
            return res.status(403).json({
                message: "Your account is awaiting payment verification and approval.",
                accountStatus: user.approval_status,
                paymentStatus: user.payment_status
            });
        }

        const token = jwt.sign(
            {
                user_id: user.user_id,
                name: user.name,
                email: user.email,
                role: user.role
            },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        res.json({
            message: "Login successful.",
            token,
            user: {
                user_id: user.user_id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                role: user.role
            }
        });

    } catch (error) {
        console.error("Login error:", error);

        res.status(500).json({
            message: "Login failed."
        });
    }
});

// FORGOT PASSWORD
app.post("/api/forgot-password", async (req, res) => {
    try {
        const email = req.body.email?.trim().toLowerCase();

        if (!email) {
            return res.status(400).json({
                message: "Email is required."
            });
        }

        const [users] = await db.query(
            "SELECT user_id FROM users WHERE email = ?",
            [email]
        );

        if (users.length === 0) {
            return res.json({
                message: "If the account exists, a password reset code will be sent."
            });
        }

        const code = generateCode();

        await db.query(
            `UPDATE users
             SET reset_code = ?,
                 reset_expires = DATE_ADD(NOW(), INTERVAL 10 MINUTE)
             WHERE user_id = ?`,
            [code, users[0].user_id]
        );

        await sendPasswordResetEmail(email, code);

        res.json({
            message: "Password reset code sent to your email."
        });

    } catch (error) {
        console.error("Forgot password error:", error);

        res.status(500).json({
            message: "Unable to send password reset email."
        });
    }
});

// RESET PASSWORD
app.post("/api/reset-password", async (req, res) => {
    try {
        const email = req.body.email?.trim().toLowerCase();
        const code = req.body.code?.trim();
        const newPassword = req.body.newPassword;

        if (!email || !code || !newPassword) {
            return res.status(400).json({
                message: "Email, reset code and new password are required."
            });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({
                message: "New password must contain at least 8 characters."
            });
        }

        const [users] = await db.query(
            `SELECT user_id FROM users
             WHERE email = ?
             AND reset_code = ?
             AND reset_expires > NOW()`,
            [email, code]
        );

        if (users.length === 0) {
            return res.status(400).json({
                message: "Invalid or expired password reset code."
            });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await db.query(
            `UPDATE users
             SET password = ?,
                 reset_code = NULL,
                 reset_expires = NULL
             WHERE user_id = ?`,
            [hashedPassword, users[0].user_id]
        );

        res.json({
            message: "Password changed successfully. You can now log in."
        });

    } catch (error) {
        console.error("Reset password error:", error);

        res.status(500).json({
            message: "Password reset failed."
        });
    }
});

// GET ALL HOUSES
app.get("/api/houses", async (req, res) => {
    try {
        const [houses] = await db.query(
            "SELECT * FROM houses ORDER BY created_at DESC"
        );

        const formattedHouses = houses.map(house => ({
            ...house,
            interior_images: house.interior_images
                ? JSON.parse(house.interior_images)
                : []
        }));

        res.json(formattedHouses);

    } catch (error) {
        console.error("Get houses error:", error);

        res.status(500).json({
            message: "Unable to load houses."
        });
    }
});

// GET ONE HOUSE
app.get("/api/houses/:id", async (req, res) => {
    try {
        const [houses] = await db.query(
            "SELECT * FROM houses WHERE house_id = ?",
            [req.params.id]
        );

        if (houses.length === 0) {
            return res.status(404).json({
                message: "House not found."
            });
        }

        const house = houses[0];

        house.interior_images = house.interior_images
            ? JSON.parse(house.interior_images)
            : [];

        res.json(house);

    } catch (error) {
        console.error("Get house error:", error);

        res.status(500).json({
            message: "Unable to load house details."
        });
    }
});

// ADD HOUSE - ONLY AGENTS AND LANDLORDS
app.post(
    "/api/houses",
    authenticateToken,
    upload.fields([
        { name: "image", maxCount: 1 },
        { name: "interiorImages", maxCount: 6 }
    ]),
    async (req, res) => {
        try {
            if (!["agent", "landlord"].includes(req.user.role)) {
                return res.status(403).json({
                    message: "Only agents and landlords can add houses."
                });
            }

            const {
                name,
                location,
                house_type,
                bedrooms,
                price,
                latitude,
                longitude,
                amenities,
                availability
            } = req.body;

            if (!name || !location || !price) {
                return res.status(400).json({
                    message: "House name, location and price are required."
                });
            }

            const exteriorImage = req.files?.image?.[0]
                ? `/uploads/${req.files.image[0].filename}`
                : null;

            const interiorImages = (
                req.files?.interiorImages || []
            ).map(file => `/uploads/${file.filename}`);

            const [result] = await db.query(
                `INSERT INTO houses
                (user_id, name, image, interior_images, location, house_type,
                 bedrooms, price, latitude, longitude, amenities, availability)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    req.user.user_id,
                    name,
                    exteriorImage,
                    JSON.stringify(interiorImages),
                    location,
                    house_type || null,
                    bedrooms ? Number(bedrooms) : null,
                    Number(price),
                    latitude || null,
                    longitude || null,
                    amenities || null,
                    availability || "Available"
                ]
            );

            res.status(201).json({
                message: "House added successfully.",
                houseId: result.insertId
            });

        } catch (error) {
            console.error("Add house error:", error);

            res.status(500).json({
                message: "Unable to add house."
            });
        }
    }
);

// SUBMIT A VIEWING REQUEST
app.post("/api/viewing-requests", authenticateToken, async (req, res) => {
    try {
        const {
            house_id,
            visitor_name,
            name,
            phone,
            email,
            preferred_date,
            preferred_time,
            message
        } = req.body;

        const visitorName = visitor_name || name;

        if (!house_id || !visitorName || !phone || !preferred_date) {
            return res.status(400).json({
                message: "House, name, phone and preferred date are required."
            });
        }

        const [houses] = await db.query(
            "SELECT house_id FROM houses WHERE house_id = ?",
            [house_id]
        );

        if (houses.length === 0) {
            return res.status(404).json({
                message: "House not found."
            });
        }

        const [result] = await db.query(
            `INSERT INTO viewing_requests
            (user_id, house_id, visitor_name, phone, email,
             preferred_date, preferred_time, message)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                req.user.user_id,
                house_id,
                visitorName,
                phone,
                email || null,
                preferred_date,
                preferred_time || null,
                message || null
            ]
        );

        res.status(201).json({
            message: "Viewing request submitted successfully.",
            requestId: result.insertId
        });

    } catch (error) {
        console.error("Viewing request error:", error);

        res.status(500).json({
            message: "Unable to submit viewing request."
        });
    }
});

// VIEWING REQUESTS BELONGING TO LOGGED-IN USER
app.get("/api/my-viewing-requests", authenticateToken, async (req, res) => {
    try {
        const [requests] = await db.query(
            `SELECT vr.*, h.name AS house_name
             FROM viewing_requests vr
             JOIN houses h ON vr.house_id = h.house_id
             WHERE vr.user_id = ?
             ORDER BY vr.created_at DESC`,
            [req.user.user_id]
        );

        res.json(requests);

    } catch (error) {
        console.error("Viewing requests error:", error);

        res.status(500).json({
            message: "Unable to load your viewing requests."
        });
    }
});

// HANDLE UPLOAD AND OTHER ERRORS
app.use((error, req, res, next) => {
    console.error("Server error:", error.message);

    if (error instanceof multer.MulterError) {
        return res.status(400).json({
            message: "Image upload problem. Each image must be 5MB or smaller."
        });
    }

    res.status(400).json({
        message: error.message || "Something went wrong."
    });
});

// START SERVER
app.listen(PORT, () => {
    console.log(
        `House Hunting Backend is running on http://localhost:${PORT}`
    );
});
