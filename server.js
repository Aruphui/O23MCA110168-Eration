const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const bodyParser = require("body-parser");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 8000;
const SECRET_KEY = process.env.SECRET_KEY || "supersecretkey";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "adminpass";

// Middleware
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// Initialize SQLite Database
const db = new sqlite3.Database("./db.sqlite", (err) => {
  if (err) console.error("Error opening database", err);
  console.log("Connected to SQLite database.");
});

// Create Tables
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT,
      booked_slot INTEGER
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS slots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      time_range TEXT UNIQUE,
      max_limit INTEGER DEFAULT 5,
      current_count INTEGER DEFAULT 0
    )
  `);

  const timeSlots = [];
  for (let hour = 8; hour < 16; hour++) {
    timeSlots.push(`${hour}:00 - ${hour}:30`, `${hour}:30 - ${hour + 1}:00`);
  }
  timeSlots.forEach((slot) => {
    db.run(`INSERT OR IGNORE INTO slots (time_range) VALUES (?)`, [slot]);
  });
});

// Helper to generate JWT Token
const generateToken = (user) =>
  jwt.sign({ id: user.id }, SECRET_KEY, { expiresIn: "1h" });

// Middleware to authenticate user based on JWT
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Unauthorized" });

  jwt.verify(token, SECRET_KEY, (err, decoded) => {
    if (err) return res.status(401).json({ message: "Invalid token" });
    req.userId = decoded.id;
    next();
  });
};

// Admin Login Route
app.post("/admin/login", (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    const token = generateToken({ id: "admin" });
    return res.json({ message: "Admin login successful", token });
  } else {
    return res.status(401).json({ message: "Invalid admin password" });
  }
});

// Admin Dashboard Route
app.get("/admin/dashboard", authenticate, (req, res) => {
  db.all(
    `
    SELECT users.username, slots.time_range 
    FROM users 
    JOIN slots ON users.booked_slot = slots.id
    WHERE users.booked_slot IS NOT NULL
    `,
    [],
    (err, bookings) => {
      if (err) return res.status(500).json({ message: "Database error" });
      
      res.json({ bookings });
    }
  );
});

// Register Route
app.post("/register", async (req, res) => {
  const { username, password } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);

  db.run(
    `INSERT INTO users (username, password) VALUES (?, ?)`,
    [username, hashedPassword],
    function (err) {
      if (err) return res.status(400).json({ message: "User already exists." });
      res.json({ id: this.lastID, username });
    }
  );
});

// Login Route
app.post("/login", (req, res) => {
  const { username, password } = req.body;

  db.get(`SELECT * FROM users WHERE username = ?`, [username], async (err, user) => {
    if (err || !user || !(await bcrypt.compare(password, user.password))) {
      return res.status(400).json({ message: "Invalid credentials." });
    }
    const token = generateToken(user);
    res.json({ token });
  });
});

// Get Slots or Booked Slot (Authenticated)
app.get("/slots", authenticate, (req, res) => {
  db.get(`SELECT booked_slot FROM users WHERE id = ?`, [req.userId], (err, user) => {
    if (err) return res.status(500).json({ message: "Database error." });
    if (user.booked_slot) {
      db.get(`SELECT * FROM slots WHERE id = ?`, [user.booked_slot], (err, slot) => {
        if (err) return res.status(500).json({ message: "Database error." });
        res.json({ bookedSlot: slot });
      });
    } else {
      db.all(`SELECT * FROM slots`, [], (err, slots) => {
        if (err) return res.status(500).json({ message: "Error fetching slots." });
        res.json({ slots });
      });
    }
  });
});

// Book Slot (Authenticated)
app.post("/book", authenticate, (req, res) => {
  const { slotId } = req.body;

  db.get(`SELECT booked_slot FROM users WHERE id = ?`, [req.userId], (err, user) => {
    if (err) return res.status(500).json({ message: "Database error." });
    if (!user) return res.status(404).json({ message: "User not found." });
    if (user.booked_slot) {
      return res.status(400).json({ message: "User has already booked a slot." });
    }

    db.get(`SELECT * FROM slots WHERE id = ?`, [slotId], (err, slot) => {
      if (err) return res.status(500).json({ message: "Database error." });
      if (!slot) return res.status(404).json({ message: "Slot not found." });
      if (slot.current_count >= slot.max_limit) {
        return res.status(400).json({ message: "Slot unavailable." });
      }

      db.run(`UPDATE slots SET current_count = current_count + 1 WHERE id = ?`, [slotId]);
      db.run(`UPDATE users SET booked_slot = ? WHERE id = ?`, [slotId, req.userId]);
      res.json({ message: "Slot booked successfully." });
    });
  });
});

// Start Server
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
