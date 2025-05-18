
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const path = require("path");
const bodyParser = require("body-parser");
const { Connection, Request, TYPES } = require('tedious');
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 8000;
const SECRET_KEY = process.env.SECRET_KEY || "supersecretkey";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "adminpass";

// Azure SQL Database Connection Configuration
const config = {
  server: 'eration.database.windows.net', // must be a string
  authentication: {
    type: 'default',
    options: {
      userName: 'arup@eration', // must be a string, include @server for Azure SQL
      password: 'Alexasiri699@' // must be a string, but don't expose passwords like this in code
    }
  },
  options: {
    database: 'eration', // must be the exact name of your database
    encrypt: true,
    trustServerCertificate: process.env.NODE_ENV !== 'production'
  }
};


// Middleware
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// Database connection and query utility
const executeQuery = (query, params = []) => {
  return new Promise((resolve, reject) => {
    const connection = new Connection(config);
    connection.on('connect', (err) => {
      if (err) {
        console.error('Connection error:', err);
        return reject(err);
      }
      
      const request = new Request(query, (err, rowCount, rows) => {
        if (err) {
          console.error('Query error:', err);
          return reject(err);
        }
        connection.close();
      });

      // Add parameters
      params.forEach(param => {
        request.addParameter(param.name, param.type, param.value);
      });

      const results = [];
      request.on('row', columns => {
        const row = {};
        columns.forEach(column => {
          row[column.metadata.colName] = column.value;
        });
        results.push(row);
      });

      request.on('requestCompleted', () => {
        resolve(results);
      });

      connection.execSql(request);
    });

    connection.connect();
  });
};

// Initialize Database Tables
const initializeDatabase = async () => {
  try {
    // Create Users Table
    await executeQuery(`
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'users')
      CREATE TABLE users (
        id INT IDENTITY(1,1) PRIMARY KEY,
        username NVARCHAR(255) UNIQUE,
        password NVARCHAR(255),
        booked_slot INT
      )
    `);

    // Create Slots Table
    await executeQuery(`
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'slots')
      CREATE TABLE slots (
        id INT IDENTITY(1,1) PRIMARY KEY,
        time_range NVARCHAR(255) UNIQUE,
        max_limit INT DEFAULT 5,
        current_count INT DEFAULT 0
      )
    `);

    // Insert Initial Time Slots
    const timeSlots = [];
    for (let hour = 8; hour < 16; hour++) {
      timeSlots.push(`${hour}:00 - ${hour}:30`, `${hour}:30 - ${hour + 1}:00`);
    }

    for (const slot of timeSlots) {
      await executeQuery(`
        IF NOT EXISTS (SELECT * FROM slots WHERE time_range = @timeRange)
        INSERT INTO slots (time_range) VALUES (@timeRange)
      `, [
        { name: 'timeRange', type: TYPES.NVarChar, value: slot }
      ]);
    }

    console.log('Database initialized successfully');
  } catch (err) {
    console.error('Failed to initialize database:', err);
  }
};

// Initialize database when application starts
initializeDatabase();

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
app.get("/admin/dashboard", authenticate, async (req, res) => {
  try {
    const bookings = await executeQuery(`
      SELECT u.username, s.time_range 
      FROM users u
      JOIN slots s ON u.booked_slot = s.id
      WHERE u.booked_slot IS NOT NULL
    `);
    res.json({ bookings });
  } catch (err) {
    res.status(500).json({ message: "Database error" });
  }
});

// Register Route
app.post("/register", async (req, res) => {
  const { username, password } = req.body;
  
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    
    await executeQuery(`
      INSERT INTO users (username, password) VALUES (@username, @password)
    `, [
      { name: 'username', type: TYPES.NVarChar, value: username },
      { name: 'password', type: TYPES.NVarChar, value: hashedPassword }
    ]);
    
    const users = await executeQuery(`
      SELECT * FROM users WHERE username = @username
    `, [
      { name: 'username', type: TYPES.NVarChar, value: username }
    ]);
    
    res.json({ id: users[0].id, username });
  } catch (err) {
    res.status(400).json({ message: "User already exists or database error" });
  }
});

// Login Route
app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  try {
    const users = await executeQuery(`
      SELECT * FROM users WHERE username = @username
    `, [
      { name: 'username', type: TYPES.NVarChar, value: username }
    ]);

    if (users.length === 0 || !(await bcrypt.compare(password, users[0].password))) {
      return res.status(400).json({ message: "Invalid credentials." });
    }

    const token = generateToken(users[0]);
    res.json({ token });
  } catch (err) {
    res.status(500).json({ message: "Database error" });
  }
});

// Get Slots or Booked Slot (Authenticated)
app.get("/slots", authenticate, async (req, res) => {
  try {
    const users = await executeQuery(`
      SELECT booked_slot FROM users WHERE id = @userId
    `, [
      { name: 'userId', type: TYPES.Int, value: req.userId }
    ]);

    if (users.length === 0) {
      return res.status(404).json({ message: "User not found." });
    }

    const user = users[0];
    if (user.booked_slot) {
      const slots = await executeQuery(`
        SELECT * FROM slots WHERE id = @slotId
      `, [
        { name: 'slotId', type: TYPES.Int, value: user.booked_slot }
      ]);
      res.json({ bookedSlot: slots[0] });
    } else {
      const slots = await executeQuery("SELECT * FROM slots");
      res.json({ slots });
    }
  } catch (err) {
    res.status(500).json({ message: "Database error" });
  }
});

// Book Slot (Authenticated)
app.post("/book", authenticate, async (req, res) => {
  const { slotId } = req.body;

  try {
    // Check if user has already booked
    const users = await executeQuery(`
      SELECT booked_slot FROM users WHERE id = @userId
    `, [
      { name: 'userId', type: TYPES.Int, value: req.userId }
    ]);

    if (users.length === 0) {
      return res.status(404).json({ message: "User not found." });
    }

    const user = users[0];
    if (user.booked_slot) {
      return res.status(400).json({ message: "User has already booked a slot." });
    }

    // Check if slot exists and has availability
    const slots = await executeQuery(`
      SELECT * FROM slots WHERE id = @slotId
    `, [
      { name: 'slotId', type: TYPES.Int, value: slotId }
    ]);

    if (slots.length === 0) {
      return res.status(404).json({ message: "Slot not found." });
    }

    const slot = slots[0];
    if (slot.current_count >= slot.max_limit) {
      return res.status(400).json({ message: "Slot unavailable." });
    }

    // Update slot count
    await executeQuery(`
      UPDATE slots SET current_count = current_count + 1 WHERE id = @slotId
    `, [
      { name: 'slotId', type: TYPES.Int, value: slotId }
    ]);

    // Assign slot to user
    await executeQuery(`
      UPDATE users SET booked_slot = @slotId WHERE id = @userId
    `, [
      { name: 'slotId', type: TYPES.Int, value: slotId },
      { name: 'userId', type: TYPES.Int, value: req.userId }
    ]);

    res.json({ message: "Slot booked successfully." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Database error" });
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// Start Server
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));